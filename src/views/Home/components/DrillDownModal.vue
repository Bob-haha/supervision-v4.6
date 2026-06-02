<template>
  <el-dialog :model-value="visible" :title="`${metricName} - 构成明细`" width="700px" @update:model-value="$emit('update:visible', $event)">
    <div class="summary-info">任务总数：<strong>{{ tasks.length }}</strong> 个</div>
    <el-table :data="tasks" size="small" stripe @row-click="(row: any) => $emit('row-click', row)">
      <el-table-column prop="title" label="任务标题" min-width="200" show-overflow-tooltip />
      <el-table-column label="部门" width="120">
        <template #default="{ row }">{{ getDept(row) }}</template>
      </el-table-column>
      <el-table-column label="当前环节" width="100">
        <template #default="{ row }">{{ getStage(row) }}</template>
      </el-table-column>
      <el-table-column prop="deadline" label="截止日期" width="110" />
      <el-table-column label="预警" width="70" align="center">
        <template #default="{ row }">
          <span class="status-dot" :class="status(row)"></span>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!tasks.length" description="无相关任务" :image-size="60" />
  </el-dialog>
</template>

<script setup lang="ts">
import type { SupervisionTask } from '@/types'
import { useDashboardStore } from '@/stores/dashboard'
import { DEPT_MAP } from '@/constants'

defineProps<{ visible: boolean; metricName: string; tasks: SupervisionTask[] }>()
defineEmits<{ 'update:visible': [boolean]; 'row-click': [task: SupervisionTask] }>()

const dashStore = useDashboardStore()

function getDept(t: SupervisionTask) {
  const m = t.responsibleMatrix
  return m?.primary?.[0] ? (DEPT_MAP[m.primary[0].departmentId] || m.primary[0].departmentId) : '-'
}
function getStage(t: SupervisionTask) {
  const s = t.stagesSnapshot
  const i = t.currentStageIndex ?? 0
  return s && i >= 0 && i < s.length ? s[i].name : '-'
}
function status(t: SupervisionTask) { return dashStore.getDeadlineStatus(t.deadline) }
</script>

<style scoped>
.summary-info { margin-bottom: 12px; padding: 8px 12px; background: #fafaf7; border-radius: 4px; font-size: 14px; }
.status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
.status-dot.overdue { background: #F5222D; }
.status-dot.nearing { background: #FAAD14; }
.status-dot.normal { background: #52C41A; }
</style>
