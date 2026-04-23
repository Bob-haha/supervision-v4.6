import { io, Socket } from "socket.io-client";
import { DatabaseManager } from "../database/DatabaseManager";
import { useSyncStore } from "@/stores/sync";

// 定义同步回调类型
type OnDataSyncCallback = () => void;

export class P2PManager {
  private socket: Socket;
  private peers: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private dbManager = DatabaseManager.getInstance();
  private onDataSync: OnDataSyncCallback | null = null;

  constructor() {
    // 1. 初始化信令连接
    // 生产环境下自动识别当前网页的主机地址，端口固定为 3030
    const signalingUrl = `http://${window.location.hostname}:3030`;
    this.socket = io(signalingUrl, { 
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5
    });

    this.initSocket();
  }

  /**
   * 绑定 UI 刷新回调 (通常在 App.vue 中调用)
   */
  public setOnDataSync(cb: OnDataSyncCallback) {
    this.onDataSync = cb;
  }

  /**
   * 更新全局同步状态到 Pinia Store
   */
  private updateGlobalStatus() {
    const syncStore = useSyncStore();
    // 统计目前真正处于打通状态（open）的 P2P 频道
    const activePeers = Array.from(this.dataChannels.values())
      .filter(dc => dc.readyState === 'open').length;
    
    syncStore.updateStatus(this.socket.connected, activePeers);
  }

  private initSocket() {
    this.socket.on("connect", () => {
      console.log("✅ 已连接到信令服务器");
      this.socket.emit("join", "supervision-room");
      this.updateGlobalStatus();
    });

    this.socket.on("disconnect", () => {
      console.warn("❌ 与信令服务器断开");
      this.updateGlobalStatus();
    });

    // 发现新同事加入房间
    this.socket.on("user-joined", (userId: string) => {
      console.log("👥 发现新同事加入:", userId);
      this.createPeer(userId, true);
    });

    // 收到同事离开信号
    this.socket.on("user-left", (userId: string) => {
      console.log("🏃 同事已离线:", userId);
      this.destroyPeer(userId);
    });

    // 核心握手信号处理
    this.socket.on("signal", async (data: { from: string; signal: any }) => {
      let peer = this.peers.get(data.from);
      if (!peer) peer = this.createPeer(data.from, false);

      const { signal } = data;
      try {
        if (signal.type) {
          await peer.setRemoteDescription(new RTCSessionDescription(signal));
          if (signal.type === "offer") {
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            this.socket.emit("signal", { to: data.from, signal: answer });
          }
        } else if (signal.candidate) {
          await peer.addIceCandidate(new RTCIceCandidate(signal));
        }
      } catch (e) {
        console.error("WebRTC 信号解析异常:", e);
      }
    });
  }

  private createPeer(userId: string, isInitiator: boolean) {
    // 幂等处理：如果已有连接则先销毁
    if (this.peers.has(userId)) this.destroyPeer(userId);

    const peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    this.peers.set(userId, peer);

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit("signal", { to: userId, signal: event.candidate });
      }
    };

    peer.onconnectionstatechange = () => {
      console.log(`与 ${userId} 的物理连接状态: ${peer.connectionState}`);
      if (['failed', 'closed', 'disconnected'].includes(peer.connectionState)) {
        this.destroyPeer(userId);
      }
    };

    if (isInitiator) {
      const dc = peer.createDataChannel("sync-channel");
      this.setupDataChannel(dc, userId);
      peer.createOffer().then(offer => {
        peer.setLocalDescription(offer);
        this.socket.emit("signal", { to: userId, signal: offer });
      });
    } else {
      peer.ondatachannel = (event) => {
        this.setupDataChannel(event.channel, userId);
      };
    }
    return peer;
  }

  private setupDataChannel(dc: RTCDataChannel, userId: string) {
    this.dataChannels.set(userId, dc);

    dc.onopen = () => {
      console.log(`🚀 与 ${userId} 的数据传输通道已就绪`);
      this.updateGlobalStatus();

      // 【策略】：只有当本地完全没有数据（新用户）时，才自动请求全量库
      // 防止老用户之间频繁互发全量包
      if (!this.dbManager.hasData()) {
        console.log("检测到本地库为空，自动发起全量同步请求...");
        dc.send(JSON.stringify({ type: "REQ_FULL_DB" }));
      }
    };

    dc.onclose = () => {
      this.updateGlobalStatus();
    };

    dc.onmessage = async (event) => {
      // 1. 处理文本指令 (增量SQL或请求)
      if (typeof event.data === "string") {
        try {
          const msg = JSON.parse(event.data);
          
          // 增量 SQL 同步
          if (msg.type === "SQL") {
            console.log("📥 收到增量同步 SQL");
            // 执行 SQL 时务必带上 isRemote = true
            this.dbManager.execute(msg.sql, msg.params, true); 
            this.dbManager.persist();
            if (this.onDataSync) this.onDataSync();
          } 
          
          // 全量请求响应
          else if (msg.type === "REQ_FULL_DB") {
            console.log("📤 收到同事的全量库请求，正在导出...");
            const binary = this.dbManager.export();
            // 发送 ArrayBuffer
            dc.send(binary.buffer as ArrayBuffer);
          }
        } catch (e) {
          console.error("解析同步数据包失败:", e);
        }
      } 
      // 2. 处理全量二进制数据库文件
      else if (event.data instanceof ArrayBuffer) {
        console.log("📦 收到全量数据库镜像，正在载入本地...");
        await this.dbManager.importDatabase(new Uint8Array(event.data));
        // 导入后触发 UI 刷新
        if (this.onDataSync) this.onDataSync();
      }
    };
  }

  /**
   * 广播本地的 SQL 变更给所有在线同事
   */
  public broadcastSQL(sql: string, params: any[]) {
    const payload = JSON.stringify({ type: "SQL", sql, params });
    this.dataChannels.forEach((dc, userId) => {
      if (dc.readyState === "open") {
        dc.send(payload);
      } else {
        console.warn(`跳过离线节点 ${userId}`);
      }
    });
  }

  /**
   * 【手动触发】向全网请求最新全量库
   */
  public requestFullSync() {
    console.log("📢 正在发起全网强制对账...");
    const payload = JSON.stringify({ type: "REQ_FULL_DB" });
    this.dataChannels.forEach(dc => {
      if (dc.readyState === "open") dc.send(payload);
    });
  }

  /**
   * 销毁指定连接
   */
  private destroyPeer(userId: string) {
    const peer = this.peers.get(userId);
    if (peer) peer.close();
    this.peers.delete(userId);
    this.dataChannels.delete(userId);
    this.updateGlobalStatus();
  }

  /**
   * 彻底关闭所有连接 (用于退出系统)
   */
  public destroyAll() {
    this.dataChannels.forEach(dc => dc.close());
    this.peers.forEach(peer => peer.close());
    this.peers.clear();
    this.dataChannels.clear();
    this.socket.disconnect();
    this.updateGlobalStatus();
  }
}