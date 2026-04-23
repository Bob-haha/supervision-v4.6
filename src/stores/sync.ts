import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useSyncStore = defineStore('sync', () => {
  const isOnline = ref(false);
  const peerCount = ref(0);

  // 更新在线状态
  function updateStatus(online: boolean, count: number) {
    isOnline.value = online;
    peerCount.value = count;
  }

  return { isOnline, peerCount, updateStatus };
});