import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';
export type PeerStatus = 'connected' | 'disconnected' | 'connecting' | 'error' | 'waiting';

export const useSyncStore = defineStore('sync', () => {
  // 网络状态
  const isOnline = ref(false);

  // 连接状态
  const connectionStatus = ref<ConnectionStatus>('disconnected');
  const isConnected = computed(() => connectionStatus.value === 'connected');

  // 房间信息
  const roomId = ref<string>('');
  const members = ref<string[]>([]);

  // 对等节点
  const peers = ref<Map<string, PeerStatus>>(new Map());
  const peerCount = computed(() => peers.value.size);

  // 同步计数
  const recordsReceived = ref(0);
  const recordsSent = ref(0);
  const pendingOperations = ref(0);

  // 统计
  const stats = ref({
    syncSpeed: 0,
    lastSyncTime: 0,
    totalSynced: 0,
  });

  // ===== 兼容旧接口 =====
  function updateStatus(online: boolean, _count: number) {
    isOnline.value = online;
    connectionStatus.value = online ? 'connected' : 'disconnected';
  }

  // ===== 新接口 =====
  function setConnectionStatus(status: ConnectionStatus) {
    connectionStatus.value = status;
  }

  function setNetworkStatus(online: boolean) {
    isOnline.value = online;
  }

  function setRoomInfo(id: string, memberList: string[]) {
    roomId.value = id;
    members.value = memberList;
  }

  function addPeer(peerId: string) {
    const newMap = new Map(peers.value);
    newMap.set(peerId, 'connected');
    peers.value = newMap;
  }

  function removePeer(peerId: string) {
    const newMap = new Map(peers.value);
    newMap.delete(peerId);
    peers.value = newMap;
  }

  function updatePeerStatus(peerId: string, status: PeerStatus) {
    const newMap = new Map(peers.value);
    newMap.set(peerId, status);
    peers.value = newMap;
  }

  function incrementRecordsReceived() {
    recordsReceived.value++;
    stats.value.totalSynced++;
    stats.value.lastSyncTime = Date.now();
  }

  function incrementRecordsSent() {
    recordsSent.value++;
    stats.value.lastSyncTime = Date.now();
  }

  function setPendingOperations(count: number) {
    pendingOperations.value = count;
  }

  return {
    isOnline,
    connectionStatus,
    isConnected,
    roomId,
    members,
    peers,
    peerCount,
    recordsReceived,
    recordsSent,
    pendingOperations,
    stats,
    updateStatus,
    setConnectionStatus,
    setNetworkStatus,
    setRoomInfo,
    addPeer,
    removePeer,
    updatePeerStatus,
    incrementRecordsReceived,
    incrementRecordsSent,
    setPendingOperations,
  };
});
