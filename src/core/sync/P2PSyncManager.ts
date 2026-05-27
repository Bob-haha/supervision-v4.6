import { DatabaseManager } from '@/core/database/DatabaseManager';
import { useSyncStore } from '@/stores/sync';
import { SyncFramework } from './SyncFramework';
import { eventBus } from '@/utils/eventBus';
import { SmartCleanupManager } from './SmartCleanupManager';
import { SyncModelAdapter } from './SyncModelAdapter';
import { FileManagerStub } from './FileManagerStub';
import { generateClientId, base64ToArrayBuffer } from '@/utils';
import { io, type Socket } from 'socket.io-client';

interface FileChunkStorage {
  fileId: string;
  chunks: (ArrayBuffer | null)[];
  received: number;
}

export interface SyncOperation {
  id: string;
  client_id: string;
  table_name: string;
  record_id: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  operation_data: any;
  operation_timestamp: number;
  version: number;
}

interface PeerConnection {
  peerId: string;
  connection: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  isConnected: boolean;
  lastActivity: number;
  role: 'initiator' | 'responder';
}

export class P2PSyncManager {
  private static instance: P2PSyncManager;
  private db: DatabaseManager;
  private syncStore: ReturnType<typeof useSyncStore>;
  private syncFramework: SyncFramework | null = null;
  cleanupManager: SmartCleanupManager;
  private isInitialized: boolean = false;
  private fileChunks: Map<string, FileChunkStorage> = new Map();

  private socket: Socket | null = null;
  private clientId: string = '';

  private peerConnections: Map<string, PeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private reconnectAttempts: number = 0;

  private pendingOperations: string[] = [];
  private isProcessingRecords: boolean = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly OPERATION_LOG_RETENTION_DAYS = 30;
  private isOnline: boolean = false;
  private readonly BATCH_SIZE: number = 50;
  private syncRetryAttempts: Map<string, number> = new Map();
  private readonly MAX_RETRY_ATTEMPTS: number = 3;

  private modelsRegistered: boolean = false;
  private events: Map<string, Function[]> = new Map();

  constructor() {
    this.db = DatabaseManager.getInstance();
    this.syncStore = useSyncStore();
    this.clientId = generateClientId();
    this.isOnline = navigator.onLine;
    this.cleanupManager = SmartCleanupManager.getInstance();
    this.setupEventListeners();
    console.log('🔄 P2PSyncManager 构造函数完成');
  }

  getSyncFramework(): SyncFramework {
    if (!this.syncFramework) {
      throw new Error('SyncFramework not initialized. Call initialize() first.');
    }
    return this.syncFramework;
  }

  static getInstance(): P2PSyncManager {
    if (!P2PSyncManager.instance) {
      P2PSyncManager.instance = new P2PSyncManager();
    }
    return P2PSyncManager.instance;
  }

  private setupEventListeners(): void {
    window.addEventListener('online', () => this.handleNetworkOnline());
    window.addEventListener('offline', () => this.handleNetworkOffline());

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.isOnline) {
        this.syncOfflineOperations();
      }
    });
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('⏭️ P2PSyncManager 已经初始化，跳过重复初始化');
      if (this.isOnline && (!this.socket || !this.socket.connected)) {
        console.log('🔄 重新连接信令服务器...');
        await this.connectToSignalingServer();
      }
      return;
    }

    try {
      console.log('🚀 启动P2P同步服务...');
      this.isOnline = navigator.onLine;
      await this.db.init();

      if (!this.syncFramework) {
        this.syncFramework = new SyncFramework(this.db, this.clientId);
        this.syncFramework.initialize();
      }

      if (!this.modelsRegistered) {
        this.registerAllModels();
        this.modelsRegistered = true;
      }

      this.cleanupManager.setSyncManager(this);
      await this.cleanupManager.initialize();

      if (this.isOnline) {
        await this.connectToSignalingServer();
      } else {
        console.log('🌐 当前离线模式，等待网络恢复');
      }

      this.isInitialized = true;
      console.log('✅ P2PSyncManager 初始化完成');
    } catch (error) {
      console.error('❌ P2P同步初始化失败:', error);
      this.scheduleReconnect();
    }
  }

  private registerAllModels(): void {
    if (!this.syncFramework) return;

    const tables = ['tasks', 'feedbacks', 'leader_comments'];
    for (const tableName of tables) {
      const adapter = new SyncModelAdapter(tableName, this.db);
      this.syncFramework.registerModel(tableName, adapter);
    }

    console.log('✅ 所有业务Model实例已注册到同步框架');
  }

  private getSignalingUrl(): string {
    try {
      const saved = localStorage.getItem('signaling-config');
      if (saved) {
        const config = JSON.parse(saved);
        return `http://${config.host || window.location.hostname}:${config.port || 3030}`;
      }
    } catch { /* ignore */ }
    const hostname = window.location.hostname || 'localhost';
    return `http://${hostname}:3030`;
  }

  private connectToSignalingServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        return resolve();
      }

      const signalingUrl = this.getSignalingUrl();
      console.log(`🔗 连接信令服务器: ${signalingUrl}`);

      this.socket = io(signalingUrl, {
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 5,
      });

      const timeout = setTimeout(() => {
        reject(new Error('连接超时'));
      }, 5000);

      this.socket.on('connect', () => {
        clearTimeout(timeout);
        console.log('✅ 信令服务器连接成功');
        this.reconnectAttempts = 0;
        this.syncStore.setConnectionStatus('connected');

        // 加入房间
        this.socket!.emit('join', 'supervision-room');
        resolve();
      });

      this.socket.on('signal', (data: { from: string; signal: any }) => {
        this.handleSocketSignal(data);
      });

      this.socket.on('user-joined', (userId: string) => {
        if (userId !== this.socket?.id) {
          this.handleUserJoined({ clientId: userId });
        }
      });

      this.socket.on('user-left', (userId: string) => {
        this.handleUserLeft({ clientId: userId });
      });

      this.socket.on('disconnect', () => {
        clearTimeout(timeout);
        console.log('🔌 信令连接关闭');
        this.syncStore.setConnectionStatus('disconnected');
        this.cleanupPeerConnections();
        this.scheduleReconnect();
      });

      this.socket.on('connect_error', (error: Error) => {
        clearTimeout(timeout);
        console.error('❌ 信令服务器错误:', error);
        reject(error);
      });
    });
  }

  private handleSocketSignal(data: { from: string; signal: any }): void {
    const peerId = data.from;
    let peer = this.peerConnections.get(peerId);
    if (!peer) {
      peer = this.createPeerConnectionAsResponderSilent(peerId);
    }

    const { signal } = data;
    try {
      if (signal.type) {
        peer.connection.setRemoteDescription(new RTCSessionDescription(signal)).then(() => {
          if (signal.type === 'offer') {
            peer.connection.createAnswer().then((answer) => {
              peer.connection.setLocalDescription(answer).then(() => {
                this.sendSignalingMessage({ to: peerId, signal: answer });
              });
            });
          }
        });
      } else if (signal.candidate) {
        peer.connection.addIceCandidate(new RTCIceCandidate(signal));
      }
    } catch (e) {
      console.error('WebRTC 信号解析异常:', e);
    }
  }

  private createPeerConnectionAsResponderSilent(peerId: string): PeerConnection {
    const configuration: RTCConfiguration = { iceServers: [] };
    const peerConnection = new RTCPeerConnection(configuration);

    const peerConn: PeerConnection = {
      peerId,
      connection: peerConnection,
      dataChannel: null,
      isConnected: false,
      lastActivity: Date.now(),
      role: 'responder',
    };

    this.peerConnections.set(peerId, peerConn);
    this.syncStore.updatePeerStatus(peerId, 'connecting');

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignalingMessage({ to: peerId, signal: event.candidate });
      }
    };

    peerConnection.ondatachannel = (event) => {
      const dataChannel = event.channel;
      peerConn.dataChannel = dataChannel;
      this.setupDataChannel(peerConn);
    };

    this.setupPeerConnectionEvents(peerConn);
    return peerConn;
  }

  // ===== 连接角色协商 =====

  private shouldInitiateConnection(peerId: string): boolean {
    return this.clientId < peerId;
  }

  private initiateConnection(peerId: string): void {
    if (this.peerConnections.has(peerId)) {
      console.log(`✅ 已存在与 ${peerId} 的连接`);
      return;
    }

    if (this.shouldInitiateConnection(peerId)) {
      console.log(`🎯 ${this.clientId} 将发起与 ${peerId} 的连接`);
      this.createPeerConnectionAsInitiator(peerId);
    } else {
      console.log(`⏳ ${this.clientId} 将等待 ${peerId} 发起连接`);
    }
  }

  private async createPeerConnectionAsInitiator(peerId: string): Promise<void> {
    try {
      const configuration: RTCConfiguration = { iceServers: [] };
      const peerConnection = new RTCPeerConnection(configuration);
      const dataChannel = peerConnection.createDataChannel('sync-data', { ordered: true });

      const peerConn: PeerConnection = {
        peerId,
        connection: peerConnection,
        dataChannel,
        isConnected: false,
        lastActivity: Date.now(),
        role: 'initiator',
      };

      this.peerConnections.set(peerId, peerConn);
      this.syncStore.updatePeerStatus(peerId, 'connecting');

      this.setupDataChannel(peerConn);
      this.setupPeerConnectionEvents(peerConn);

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      this.sendSignalingMessage({ to: peerId, signal: offer });
    } catch (error) {
      console.error(`❌ 发起连接失败: ${peerId}`, error);
      this.syncStore.updatePeerStatus(peerId, 'error');
      this.closePeerConnection(peerId);
    }
  }

  private setupDataChannel(peerConn: PeerConnection): void {
    if (!peerConn.dataChannel) return;

    const dc = peerConn.dataChannel;

    dc.onopen = () => {
      console.log(`✅ 数据通道已打开: ${peerConn.peerId}`);
      peerConn.isConnected = true;
      peerConn.lastActivity = Date.now();
      this.syncStore.updatePeerStatus(peerConn.peerId, 'connected');
      this.dataChannels.set(peerConn.peerId, dc);
      this.requestMissedOperations(peerConn.peerId);
      this.syncOfflineOperations();
    };

    dc.onmessage = (event) => {
      try {
        peerConn.lastActivity = Date.now();
        const message = JSON.parse(event.data);
        this.handleDataChannelMessage(peerConn.peerId, message);
      } catch (error) {
        console.error('❌ 处理数据通道消息失败:', error);
      }
    };

    dc.onclose = () => {
      console.log(`🔌 数据通道关闭: ${peerConn.peerId}`);
      peerConn.isConnected = false;
      this.dataChannels.delete(peerConn.peerId);
      this.syncStore.updatePeerStatus(peerConn.peerId, 'disconnected');
    };

    dc.onerror = (error) => {
      console.error(`❌ 数据通道错误: ${peerConn.peerId}`, error);
    };
  }

  private setupPeerConnectionEvents(peerConn: PeerConnection): void {
    const pc = peerConn.connection;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignalingMessage({ to: peerConn.peerId, signal: event.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log(`🔗 ${peerConn.peerId} 连接状态: ${state}`);

      switch (state) {
        case 'connected':
          peerConn.isConnected = true;
          this.syncStore.updatePeerStatus(peerConn.peerId, 'connected');
          break;
        case 'disconnected':
          peerConn.isConnected = false;
          this.syncStore.updatePeerStatus(peerConn.peerId, 'disconnected');
          break;
        case 'failed':
          peerConn.isConnected = false;
          this.syncStore.updatePeerStatus(peerConn.peerId, 'error');
          this.scheduleReconnectToPeer(peerConn.peerId);
          break;
        case 'closed':
          this.closePeerConnection(peerConn.peerId);
          break;
      }
    };

    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState;
      if (iceState === 'failed') {
        console.warn(`❌ ${peerConn.peerId} ICE连接失败`);
        this.scheduleReconnectToPeer(peerConn.peerId);
      }
    };
  }

  // ===== 文件传输 =====

  private async handleFileContentRequest(peerId: string, message: any): Promise<void> {
    const { fileId, requestId } = message;
    console.log(`📨 收到文件内容请求: ${fileId} 来自 ${peerId}`);

    try {
      const fm = FileManagerStub.getInstance();
      await fm.requestFileContentSync(fileId, peerId);
      this.sendDataToPeer(peerId, { type: 'file-error', fileId, requestId, error: 'File sync not supported' });
    } catch (error) {
      console.error('处理文件内容请求失败:', error);
    }
  }

  private async handleFileChunk(_peerId: string, message: any): Promise<void> {
    const { fileId, requestId, chunkIndex, totalChunks, data } = message;

    if (!this.fileChunks.has(requestId)) {
      this.fileChunks.set(requestId, { fileId, chunks: new Array(totalChunks), received: 0 });
    }

    const fileData = this.fileChunks.get(requestId)!;
    fileData.chunks[chunkIndex] = base64ToArrayBuffer(data);
    fileData.received++;

    if (fileData.received === totalChunks) {
      try {
        const totalLength = fileData.chunks.reduce((sum, chunk) => sum + (chunk?.byteLength || 0), 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of fileData.chunks) {
          if (chunk) {
            result.set(new Uint8Array(chunk), offset);
            offset += chunk.byteLength;
          }
        }
        const fm = FileManagerStub.getInstance();
        const blob = new Blob([result.buffer]);
        const file = new File([blob], fileId);
        await fm.storeFileInIndexedDB(`sync-${requestId}`, file);
        console.log(`✅ 文件重建完成: ${fileId}`);
      } catch (e) {
        console.error('文件重建失败:', e);
      }
      this.fileChunks.delete(requestId);
    }
  }

  // ===== 消息处理 =====

  private handleDataChannelMessage(peerId: string, message: any): void {
    console.log(`📨 收到数据通道消息来自 ${peerId}:`, message.type);

    try {
      switch (message.type) {
        case 'sync-operation':
          this.handleIncomingOperation(message.operation);
          break;
        case 'sync-request':
          this.handleSyncRequest(peerId, message);
          break;
        case 'sync-operations-batch':
          this.handleSyncOperationsBatch(peerId, message);
          break;
        case 'ping':
          this.sendDataToPeer(peerId, { type: 'pong', timestamp: Date.now() });
          break;
        case 'pong':
          break;
        case 'file-request':
          this.handleFileContentRequest(peerId, message);
          break;
        case 'file-chunk':
          this.handleFileChunk(peerId, message);
          break;
        case 'file-complete':
          console.log(`✅ 文件传输完成: ${message.fileId}`);
          break;
        case 'file-error':
          console.error(`❌ 文件传输错误: ${message.fileId}`, message.error);
          break;
        case 'connection-test':
          this.sendDataToPeer(peerId, { type: 'connection-test-response', testId: message.testId, timestamp: Date.now() });
          break;
        default:
          console.warn(`❓ 未知数据通道消息类型: ${message.type}`);
      }
    } catch (error) {
      console.error(`❌ 处理数据通道消息失败 (${peerId}):`, error);
    }
  }

  private async handleSyncOperationsBatch(peerId: string, message: any): Promise<void> {
    const { operations, batch_index, total_batches } = message;
    console.log(`📦 收到批量操作来自 ${peerId}: 批次 ${batch_index + 1}/${total_batches}, 操作数量: ${operations.length}`);

    try {
      const results = await this.getSyncFramework().applySyncOperationsBatch(operations);
      const successCount = results.filter(Boolean).length;
      console.log(`✅ 批量操作处理完成: ${peerId}, 成功: ${successCount}`);
    } catch (error) {
      console.error(`❌ 处理批量操作失败 (${peerId}):`, error);
    }
  }

  // ===== 同步操作 =====

  private async handleIncomingOperation(operation: SyncOperation): Promise<void> {
    if (operation.client_id === this.clientId) {
      return;
    }

    console.log(`🔄 处理来自 ${operation.client_id} 的操作:`, {
      table: operation.table_name,
      operation: operation.operation,
      recordId: operation.record_id,
    });

    try {
      if (this.db.isOperationProcessed(operation.id)) {
        return;
      }

      const success = await this.getSyncFramework().applySyncOperation(operation);

      if (success) {
        this.db.updateSyncOperationStatus(operation.id, 'synced');
        this.syncStore.incrementRecordsReceived();
        this.emitStoreUpdateEvent(operation);
        console.log(`✅ 同步操作应用成功: ${operation.id}`);
      }
    } catch (error) {
      console.error('❌ 应用同步操作失败:', error);
    }
  }

  private emitStoreUpdateEvent(operation: SyncOperation): void {
    const event = {
      table: operation.table_name,
      operation: operation.operation,
      recordId: operation.record_id,
      data: operation.operation_data?.new_data,
    };

    eventBus.emit('store-update', event);
    eventBus.emit(`store-update:${operation.table_name}`, event);
  }

  private requestMissedOperations(peerId: string): void {
    const lastSyncTime = this.getLastSyncTime();
    console.log(`📡 向 ${peerId} 请求错过的操作，自从: ${new Date(lastSyncTime).toLocaleString()}`);
    this.sendDataToPeer(peerId, { type: 'sync-request', since_timestamp: lastSyncTime });
  }

  private async handleSyncRequest(peerId: string, message: any): Promise<void> {
    const { since_timestamp } = message;
    console.log(`📥 处理来自 ${peerId} 的同步请求，自从: ${new Date(since_timestamp).toLocaleString()}`);

    const missedOperations = await this.getOperationsSince(since_timestamp);
    console.log(`📤 发送 ${missedOperations.length} 个错过的操作到 ${peerId}`);

    const batchSize = 50;
    for (let i = 0; i < missedOperations.length; i += batchSize) {
      const batch = missedOperations.slice(i, i + batchSize);
      this.sendDataToPeer(peerId, {
        type: 'sync-operations-batch',
        operations: batch,
        batch_index: i / batchSize,
        total_batches: Math.ceil(missedOperations.length / batchSize),
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  async recordChange(
    tableName: string,
    recordId: string,
    operation: 'INSERT' | 'UPDATE' | 'DELETE',
    oldData?: any,
    newData?: any,
  ): Promise<void> {
    const operationId = await this.getSyncFramework().recordChange(
      tableName, recordId, operation, oldData, newData,
    );

    if (operationId) {
      this.pendingOperations.push(operationId);
      this.syncStore.incrementRecordsSent();

      if (this.isOnline && this.dataChannels.size > 0) {
        this.processPendingOperations();
      } else {
        console.log(`📝 记录离线操作: ${tableName} ${operation} ${recordId}`);
      }
    }
  }

  async processPendingOperations(): Promise<void> {
    if (this.isProcessingRecords || this.pendingOperations.length === 0) return;

    this.isProcessingRecords = true;

    try {
      const connectedPeers = Array.from(this.dataChannels.keys());
      console.log(`📤 准备同步 ${this.pendingOperations.length} 条操作到 ${connectedPeers.length} 个对等节点`);

      if (connectedPeers.length === 0) {
        console.log('⏳ 没有已连接的对等节点，暂缓同步');
        return;
      }

      const operations = await this.getOperationsByIds(this.pendingOperations);

      for (const operation of operations) {
        for (const peerId of connectedPeers) {
          this.sendDataToPeer(peerId, { type: 'sync-operation', operation });
        }
        this.db.updateSyncOperationStatus(operation.id, 'synced');
      }

      this.pendingOperations = [];
      console.log('✅ 所有待同步操作已发送');
    } catch (error) {
      console.error('❌ 处理待同步操作失败:', error);
    } finally {
      this.isProcessingRecords = false;
    }
  }

  sendDataToPeer(peerId: string, data: any): boolean {
    const dataChannel = this.dataChannels.get(peerId);

    if (!dataChannel || dataChannel.readyState !== 'open') {
      console.warn(`⚠️ 数据通道不可用: ${peerId}`);
      return false;
    }

    try {
      dataChannel.send(JSON.stringify(data));
      return true;
    } catch (error) {
      console.error(`❌ 发送数据到 ${peerId} 失败:`, error);
      return false;
    }
  }

  // ===== 网络管理 =====

  private handleNetworkOnline(): void {
    console.log('🌐 网络恢复');
    this.isOnline = true;
    this.syncStore.setNetworkStatus(true);
    setTimeout(() => this.syncOfflineOperations(), 1000);
    this.initialize().catch(console.error);
  }

  private handleNetworkOffline(): void {
    console.log('🌐 网络断开');
    this.isOnline = false;
    this.syncStore.setNetworkStatus(false);
    this.syncStore.setConnectionStatus('disconnected');
  }

  private async syncOfflineOperations(): Promise<void> {
    if (!this.isOnline) return;

    try {
      console.log('🔄 开始同步离线期间的操作...');
      const pendingOps = await this.getSyncFramework().getPendingSyncOperations();

      if (pendingOps.length === 0) return;

      console.log(`📦 发现 ${pendingOps.length} 个待同步的离线操作`);
      await this.sendOperationsBatch(pendingOps);
      console.log('✅ 离线操作同步完成');
    } catch (error) {
      console.error('❌ 同步离线操作失败:', error);
    }
  }

  private async sendOperationsBatch(operations: any[]): Promise<void> {
    const connectedPeers = Array.from(this.dataChannels.keys());
    if (connectedPeers.length === 0) return;

    for (let i = 0; i < operations.length; i += this.BATCH_SIZE) {
      const batch = operations.slice(i, i + this.BATCH_SIZE);
      const batchIndex = Math.floor(i / this.BATCH_SIZE);
      const totalBatches = Math.ceil(operations.length / this.BATCH_SIZE);

      for (const peerId of connectedPeers) {
        await this.sendOperationsToPeer(peerId, batch, batchIndex, totalBatches);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  private async sendOperationsToPeer(
    peerId: string, operations: any[], batchIndex: number, totalBatches: number,
  ): Promise<void> {
    try {
      const success = this.sendDataToPeer(peerId, {
        type: 'sync-operations-batch',
        operations,
        batch_index: batchIndex,
        total_batches: totalBatches,
        is_offline_sync: true,
      });

      if (success && batchIndex === totalBatches - 1) {
        const operationIds = operations.map((op) => op.id);
        await this.getSyncFramework().markOperationsAsSynced(operationIds);
      } else if (!success) {
        this.retryOperations(operations, peerId);
      }
    } catch (error) {
      console.error(`❌ 发送操作到 ${peerId} 失败:`, error);
      this.retryOperations(operations, peerId);
    }
  }

  private retryOperations(operations: any[], peerId: string): void {
    for (const operation of operations) {
      const attempt = this.syncRetryAttempts.get(operation.id) || 0;

      if (attempt < this.MAX_RETRY_ATTEMPTS) {
        this.syncRetryAttempts.set(operation.id, attempt + 1);
        console.log(`🔄 计划重试操作 ${operation.id} (尝试 ${attempt + 1}/${this.MAX_RETRY_ATTEMPTS})`);

        setTimeout(() => {
          if (this.dataChannels.has(peerId)) {
            this.sendDataToPeer(peerId, { type: 'sync-operation', operation, is_retry: true });
          }
        }, 3000 * (attempt + 1));
      } else {
        console.error(`❌ 操作 ${operation.id} 达到最大重试次数，停止重试`);
        this.syncRetryAttempts.delete(operation.id);
      }
    }
  }

  // ===== 信令消息 =====

  private sendSignalingMessage(message: any): void {
    if (this.socket?.connected) {
      this.socket.emit('signal', message);
    }
  }

  // ===== 连接管理 =====

  private handleUserJoined(message: { clientId: string }): void {
    console.log(`🆕 新用户加入: ${message.clientId}`);
    this.syncStore.addPeer(message.clientId);
    this.initiateConnection(message.clientId);
  }

  private handleUserLeft(message: { clientId: string }): void {
    console.log(`👋 用户离开: ${message.clientId}`);
    this.syncStore.removePeer(message.clientId);
    this.closePeerConnection(message.clientId);
  }

  private scheduleReconnectToPeer(peerId: string): void {
    setTimeout(() => {
      if (this.socket?.connected) {
        console.log(`🔄 重新连接到 ${peerId}`);
        this.initiateConnection(peerId);
      }
    }, 5000);
  }

  private closePeerConnection(peerId: string): void {
    const peerConn = this.peerConnections.get(peerId);
    if (peerConn) {
      console.log(`🗑️ 关闭连接: ${peerId}`);
      if (peerConn.dataChannel) peerConn.dataChannel.close();
      if (peerConn.connection) peerConn.connection.close();
      this.peerConnections.delete(peerId);
      this.dataChannels.delete(peerId);
    }
    this.syncStore.removePeer(peerId);
  }

  private cleanupPeerConnections(): void {
    this.peerConnections.forEach((peerConn) => {
      this.closePeerConnection(peerConn.peerId);
    });
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    const delay = Math.min(5000 * Math.pow(2, this.reconnectAttempts - 1), 40000);
    console.log(`🔄 ${delay}ms后重连 (第${this.reconnectAttempts}次)`);

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    this.reconnectTimer = setTimeout(async () => {
      console.log('🔄 执行重连...');
      try {
        if (this.isOnline) {
          await this.connectToSignalingServer();
          console.log('✅ 信令服务器重连成功');
          this.reconnectAttempts = 0;
        }
      } catch {
        console.error('❌ 重连失败');
        this.scheduleReconnect();
      }
    }, delay);
  }

  // ===== 数据查询 =====

  private getOperationsSince(timestamp: number): Promise<SyncOperation[]> {
    const logs = this.db.getOperationsSince(timestamp);
    const result = logs.map((log: any) => ({
      id: log.id,
      client_id: log.client_id,
      table_name: log.table_name,
      record_id: log.record_id,
      operation: log.operation,
      operation_data: typeof log.operation_data === 'string' ? JSON.parse(log.operation_data) : log.operation_data,
      operation_timestamp: log.operation_timestamp,
      version: 1,
    }));
    return Promise.resolve(result);
  }

  private async getOperationsByIds(operationIds: string[]): Promise<SyncOperation[]> {
    if (operationIds.length === 0) return [];

    try {
      const placeholders = operationIds.map(() => '?').join(',');
      const sql = `SELECT * FROM sync_operation_logs WHERE id IN (${placeholders})`;
      const logs = this.db.query(sql, operationIds);

      return logs.map((log: any) => ({
        id: log.id,
        client_id: log.client_id,
        table_name: log.table_name,
        record_id: log.record_id,
        operation: log.operation,
        operation_data: typeof log.operation_data === 'string' ? JSON.parse(log.operation_data) : log.operation_data,
        operation_timestamp: log.operation_timestamp,
        version: 1,
      }));
    } catch (error) {
      console.error('根据ID获取操作失败:', error);
      return [];
    }
  }

  private getLastSyncTime(): number {
    const lastSync = localStorage.getItem('last-sync-time');
    return lastSync ? parseInt(lastSync) : Date.now() - 24 * 60 * 60 * 1000;
  }

  // ===== 公共方法 =====

  async broadcastMessage(message: any): Promise<void> {
    const connectedPeers = Array.from(this.dataChannels.keys());
    for (const peerId of connectedPeers) {
      try { this.sendDataToPeer(peerId, message); } catch { /* ignore */ }
    }
  }

  async sendMessageToClient(clientId: string, message: any): Promise<void> {
    this.sendDataToPeer(clientId, message);
  }

  getClientId(): string {
    return this.clientId;
  }

  getSyncStats(): any {
    return {
      clientId: this.clientId,
      connectedPeers: Array.from(this.peerConnections.values()).filter((p) => p.isConnected).length,
      totalPeers: this.peerConnections.size,
      pendingOperations: this.pendingOperations.length,
      isOnline: this.isOnline,
      roomId: 'supervision-room',
      syncFramework: this.syncFramework?.getSyncStats(),
      cleanup: this.cleanupManager.getCleanupStatus(),
      isInitialized: this.isInitialized,
    };
  }

  getConnectionStats(): any {
    const connectedPeers = Array.from(this.peerConnections.values()).filter((p) => p.isConnected).length;
    return {
      clientId: this.clientId,
      connectedPeers,
      totalPeers: this.peerConnections.size,
      pendingOperations: this.pendingOperations.length,
    };
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.cleanupPeerConnections();
    this.syncStore.setConnectionStatus('disconnected');
  }

  debugConnections(): void {
    console.group('🔍 P2P连接调试');
    console.log('客户端ID:', this.clientId);
    console.log('信令状态:', this.socket?.connected);

    this.peerConnections.forEach((peerConn, peerId) => {
      console.group(`对等节点: ${peerId}`);
      console.log('连接状态:', peerConn.connection.connectionState);
      console.log('ICE状态:', peerConn.connection.iceConnectionState);
      console.log('数据通道:', peerConn.dataChannel?.readyState);
      console.log('是否连接:', peerConn.isConnected);
      console.log('连接角色:', peerConn.role);
      console.groupEnd();
    });
    console.groupEnd();
  }

  async testDataChannelConnection(peerId: string): Promise<boolean> {
    const dc = this.dataChannels.get(peerId);
    if (!dc || dc.readyState !== 'open') return false;

    const testId = `test_${Date.now()}`;
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), 5000);
      const handler = (msg: any) => {
        if (msg.type === 'connection-test-response' && msg.testId === testId) {
          clearTimeout(timeout);
          resolve(true);
        }
      };
      this.on('connection-test-response', handler);
      this.sendDataToPeer(peerId, { type: 'connection-test', testId, timestamp: Date.now(), clientId: this.clientId });
    });
  }

  async cleanupOperationLogs(): Promise<void> {
    try {
      this.db.cleanupExpiredOperationLogs(this.OPERATION_LOG_RETENTION_DAYS);
      console.log('🧹 清理过期的操作日志完成');
    } catch (error) {
      console.error('清理操作日志失败:', error);
    }
  }

  // 事件系统
  on(event: string, listener: Function): void {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)!.push(listener);
  }

  off(event: string, listener: Function): void {
    this.events.get(event)?.filter((l) => l !== listener);
  }

}
