<template>
  <el-card shadow="never" class="v3-card" body-class="ws-card-body">
    <el-row :gutter="0">
      <el-col :span="6" v-for="item in items" :key="item.title">
        <div class="ws-item" @click="$router.push(item.link)">
          <div class="ws-badge" :style="{ color: item.color }">{{ item.value }}</div>
          <div class="ws-label">{{ item.title }}</div>
        </div>
      </el-col>
    </el-row>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useStatisticsStore } from '@/stores/statistics';
import { useAuthStore } from '@/stores/auth';
import { useTaskStore } from '@/stores/task';

const statisticsStore = useStatisticsStore();
const authStore = useAuthStore();
const taskStore = useTaskStore();

const items = computed(() => {
  const userId = authStore.user?.id || '';
  const deptId = authStore.user?.deptId || '';
  const stats = statisticsStore.getPersonalStats(userId, deptId);
  const watchedIds = taskStore.getWatchedTaskIds(userId);

  return [
    { title: '我的待办', value: stats.pendingCount, color: '#165DFF', link: '/host' },
    { title: '我的已办', value: stats.completedCount, color: '#52C41A', link: '/dept-completed' },
    { title: '超期预警', value: stats.overdueCount, color: '#FF4D4F', link: '/host' },
    { title: '我的关注', value: watchedIds.length || stats.watchingCount, color: '#FAAD14', link: '/my-watched' },
  ];
});
</script>

<style scoped>
.v3-card {
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  height: 100%;
}
:deep(.ws-card-body) {
  padding: 8px 12px !important;
}

.ws-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 20px 0;
  border-radius: 8px;
  transition: background var(--transition-fast);
}
.ws-item:hover {
  background: #F7F8FA;
}

.ws-badge {
  font-size: 44px;
  font-weight: 700;
  font-family: 'DIN', -apple-system, sans-serif;
  line-height: 1;
}

.ws-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  letter-spacing: 0.3px;
}
</style>
