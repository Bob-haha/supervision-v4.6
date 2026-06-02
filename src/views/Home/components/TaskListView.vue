<template>
  <div class="task-list-view">
    <el-table
      :data="displayTasks"
      stripe
      size="small"
      style="width: 100%"
      @row-click="(row: any) => $emit('row-click', row)"
      :header-cell-style="{ background: '#FAFAFA', fontWeight: 600, fontSize: '13px' }"
      @selection-change="onSelectionChange"
    >
      <el-table-column v-if="selectable" type="selection" width="40" />
      <el-table-column width="40" align="center">
        <template #default="{ row }">
          <span class="status-indicator" :class="getRowStatus(row)"></span>
        </template>
      </el-table-column>
      <el-table-column v-if="showCol('title')" prop="title" label="任务标题" min-width="200" show-overflow-tooltip />
      <el-table-column v-if="showCol('taskType')" label="类型" width="90">
        <template #default="{ row }">
          <el-tag size="small" type="info">{{ row.task_type || '-' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column v-if="showCol('tags')" label="标签" width="120">
        <template #default="{ row }">
          <el-tag v-for="t in (row.tags || []).slice(0, 2)" :key="t" size="small" class="mr-1">{{ t }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column v-if="showCol('department')" label="部门" width="120">
        <template #default="{ row }">
          {{ getDeptLabel(row) }}
        </template>
      </el-table-column>
      <el-table-column v-if="showCol('deadline')" prop="deadline" label="截止日期" width="110" sortable>
        <template #default="{ row }">
          <span :class="{ 'text-overdue': getRowStatus(row) === 'overdue', 'text-nearing': getRowStatus(row) === 'nearing' }">
            {{ row.deadline || '-' }}
          </span>
        </template>
      </el-table-column>
      <el-table-column v-if="showCol('progress')" label="当前环节" width="110">
        <template #default="{ row }">
          {{ getCurrentStage(row) }}
        </template>
      </el-table-column>
      <el-table-column v-if="showCol('status')" label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row)" size="small">{{ statusLabel(row) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column v-if="showCol('stage')" label="当前环节" width="100">
        <template #default="{ row }">{{ getCurrentStage(row) }}</template>
      </el-table-column>
      <el-table-column v-if="showCol('summary')" label="最新动态" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">
          {{ (row.activityLog || []).slice(-1)[0]?.content || '-' }}
        </template>
      </el-table-column>
      <el-table-column v-if="showCol('from')" label="来源" width="80">
        <template #default="{ row }">{{ row.createdBy || '-' }}</template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { SupervisionTask } from '@/types'
import { useDashboardStore } from '@/stores/dashboard'
import { DEPT_MAP } from '@/constants'

const props = defineProps<{
  tasks: SupervisionTask[]
  columns?: string[]
  mode?: string
  selectable?: boolean
}>()

defineEmits<{
  'row-click': [task: SupervisionTask]
  'selection-change': [ids: string[]]
}>()

const dashStore = useDashboardStore()

const showCol = (col: string) => !props.columns || props.columns.length === 0 || props.columns.includes(col)

const displayTasks = computed(() => {
  if (!props.columns?.includes('sortBy')) return props.tasks
  return [...props.tasks].sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''))
})

function getRowStatus(task: SupervisionTask) {
  if (task.status === 'completed') return 'completed'
  return dashStore.getDeadlineStatus(task.deadline)
}

function getCurrentStage(task: SupervisionTask): string {
  const stages = task.stagesSnapshot
  const idx = task.currentStageIndex ?? 0
  if (stages && idx >= 0 && idx < stages.length) return stages[idx].name
  return '-'
}

function getDeptLabel(task: SupervisionTask): string {
  const m = task.responsibleMatrix
  if (m?.primary?.length) return DEPT_MAP[m.primary[0].departmentId] || m.primary[0].departmentId
  return '-'
}

function statusTagType(task: SupervisionTask) {
  if (task.status === 'completed') return 'success'
  if (getRowStatus(task) === 'overdue') return 'danger'
  return ''
}

function statusLabel(task: SupervisionTask) {
  if (task.status === 'completed') return '已完成'
  if (task.status === 'archived') return '已归档'
  if (getRowStatus(task) === 'overdue') return '逾期'
  return '进行中'
}

function onSelectionChange(selection: any[]) {
  // handled via emit
}
</script>

<style scoped>
.task-list-view { margin-top: 4px; }
.status-indicator { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #52C41A; }
.status-indicator.overdue { background: #F5222D; }
.status-indicator.nearing { background: #FAAD14; }
.status-indicator.completed { background: #52C41A; }
.text-overdue { color: #F5222D; font-weight: 600; }
.text-nearing { color: #FAAD14; font-weight: 600; }
.mr-1 { margin-right: 4px; }
</style>
