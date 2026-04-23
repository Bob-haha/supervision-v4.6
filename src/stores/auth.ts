import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { UserInfo } from '@/types';

export const useAuthStore = defineStore('auth', () => {
  // 当前用户信息
  const user = ref<UserInfo | null>(null);
  
  // 核心权限计算
  const isAdmin = computed(() => user.value?.role === 'ADMIN');
  const isLeader = computed(() => user.value?.role === 'LEADER');
  const isStaff = computed(() => user.value?.role === 'STAFF');

  // 从本地加载身份
  function loadFromStorage() {
    const data = localStorage.getItem('supervision_user_v2');
    if (data) {
      user.value = JSON.parse(data);
    }
  }

  // 保存身份
  function setUser(info: UserInfo) {
    user.value = info;
    localStorage.setItem('supervision_user_v2', JSON.stringify(info));
  }

  // 切换身份/退出
  function logout() {
    user.value = null;
    localStorage.removeItem('supervision_user_v2');
  }

  return {
    user,
    isAdmin,
    isLeader,
    isStaff,
    loadFromStorage,
    setUser,
    logout
  };
});