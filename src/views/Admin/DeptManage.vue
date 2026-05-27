<template>
  <div class="desktop-container">
    <div class="desk-header">
      <span class="desk-title">部门管理</span>
    </div>
    <el-card shadow="never" class="modern-card">
      <el-table :data="depts" stripe size="default" style="width:100%">
        <el-table-column prop="name" label="部门名称" min-width="220" />
        <el-table-column prop="head" label="负责人" width="120" />
        <el-table-column label="任务数" width="100" align="center">
          <template #default="{ row }">
            <span class="task-count">{{ row.taskCount }}</span>
          </template>
        </el-table-column>
        <el-table-column label="负载" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.loadLevel === 'HIGH' ? 'danger' : row.loadLevel === 'MEDIUM' ? 'warning' : 'success'" size="small" effect="plain">
              {{ row.loadLevel === 'HIGH' ? '高' : row.loadLevel === 'MEDIUM' ? '中' : '低' }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { DEPT_MAP, DEPT_HEAD_MAP } from '@/constants';
import { useStatisticsStore } from '@/stores/statistics';

const statisticsStore = useStatisticsStore();

const depts = computed(() => {
  const stats = statisticsStore.getDepartmentStats();
  return Object.entries(DEPT_MAP).map(([id, name]) => {
    const ds = stats.find(s => s.deptId === id);
    return {
      id, name,
      head: DEPT_HEAD_MAP[id] || '-',
      taskCount: ds?.taskCount || 0,
      loadLevel: ds?.loadLevel || 'LOW',
    };
  });
});
</script>

<style scoped>
.desktop-container { padding: 10px; }
.desk-header { padding: 10px 5px; border-bottom: 1px solid var(--border-color); margin-bottom: 20px; }
.desk-title { font-weight: 700; color: var(--color-primary); border-left: 4px solid var(--color-primary-light); padding-left: 14px; font-size: var(--font-size-xl); }
.modern-card { border-radius: var(--radius-md); border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); }
:deep(.modern-card .el-card__body) { padding: 0; }
.task-count { font-weight: 600; color: var(--color-primary); }
</style>
