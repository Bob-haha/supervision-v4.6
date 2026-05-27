<template>
  <el-card shadow="never" class="v3-card">
    <el-table :data="deptStats" stripe size="default" style="width:100%"
      :header-cell-style="headerStyle">
      <el-table-column min-width="160">
        <template #header>
          <span>科室</span>
        </template>
        <template #default="{ row }">
          <div class="dept-cell">
            <span class="dept-dot" :class="'load-' + row.loadLevel.toLowerCase()"></span>
            <span>{{ row.deptName }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="任务数" width="90" align="center" sortable>
        <template #default="{ row }">
          <span class="task-num">{{ row.taskCount }}</span>
        </template>
      </el-table-column>
      <el-table-column label="办结率" width="150" align="center" sortable :sort-method="(a:any,b:any) => a.completionRate - b.completionRate">
        <template #default="{ row }">
          <div class="rate-cell">
            <el-progress
              :percentage="Math.round(row.completionRate * 100)"
              :stroke-width="7"
              :color="row.completionRate > 0.7 ? '#52C41A' : row.completionRate > 0.4 ? '#FAAD14' : '#FF4D4F'"
            />
          </div>
        </template>
      </el-table-column>
      <el-table-column label="超期" width="80" align="center" sortable>
        <template #default="{ row }">
          <span v-if="row.overdueCount > 0" class="overdue-num">{{ row.overdueCount }}</span>
          <span v-else class="zero-num">0</span>
        </template>
      </el-table-column>
      <el-table-column label="负载" width="85" align="center">
        <template #default="{ row }">
          <el-tag
            :type="loadTagType(row.loadLevel)"
            size="small"
            effect="light"
            round
          >{{ loadLabel(row.loadLevel) }}</el-tag>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useStatisticsStore } from '@/stores/statistics';
import type { DeptStats } from '@/types';

const statisticsStore = useStatisticsStore();
const deptStats = computed(() => statisticsStore.getDepartmentStats());

const headerStyle = {
  background: '#FAFAFA',
  color: '#4E5969',
  fontWeight: '600',
  fontSize: '13px',
  borderBottom: '2px solid #E5E6EB',
};

function loadTagType(level: DeptStats['loadLevel']) {
  const map = { HIGH: 'danger', MEDIUM: 'warning', LOW: 'success' } as const;
  return map[level] || 'info';
}

function loadLabel(level: DeptStats['loadLevel']) {
  const map = { HIGH: '高', MEDIUM: '中', LOW: '低' } as const;
  return map[level];
}
</script>

<style scoped>
.v3-card {
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
}
:deep(.v3-card .el-card__body) {
  padding: 0;
}

:deep(.el-table) {
  border-radius: var(--radius-md);
  font-size: var(--font-size-md);
}

:deep(.el-table .el-table__row) {
  height: 46px;
}

:deep(.el-table .el-table__row:hover > td) {
  background: #F7F8FA !important;
}

.dept-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dept-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dept-dot.load-low { background: #52C41A; }
.dept-dot.load-medium { background: #FAAD14; }
.dept-dot.load-high { background: #FF4D4F; }

.task-num {
  font-weight: 600;
  color: var(--text-primary);
}

.rate-cell {
  display: flex;
  align-items: center;
}

.overdue-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  border-radius: 11px;
  background: var(--color-danger-bg);
  color: var(--color-danger);
  font-weight: 600;
  font-size: 12px;
}
.zero-num { color: var(--text-disabled); }
</style>
