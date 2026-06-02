<template>
  <el-card shadow="never" class="matrix-card">
    <template #header><span class="section-title">责任矩阵</span></template>
    <div class="matrix-body">
      <div class="matrix-section">
        <el-tag type="primary" size="small">主办</el-tag>
        <div v-for="(entry, i) in task.responsibleMatrix?.primary" :key="i" class="matrix-entry">
          <span class="entry-dept">{{ getDeptName(entry.departmentId) }}</span>
          <span v-if="entry.personnelId" class="entry-person">- {{ getPersonName(entry.personnelId) }}</span>
          <span v-else class="entry-unassigned">(待分派)</span>
          <el-tag size="small" :type="entry.feedbackStatus === 'confirmed' ? 'success' : 'warning'">
            {{ entry.feedbackStatus === 'confirmed' ? '已确认' : '待反馈' }}
          </el-tag>
        </div>
      </div>
      <div class="matrix-section">
        <el-tag type="info" size="small">协办</el-tag>
        <div v-for="(entry, i) in task.responsibleMatrix?.cooperative" :key="i" class="matrix-entry">
          <span class="entry-dept">{{ getDeptName(entry.departmentId) }}</span>
          <span v-if="entry.personnelId" class="entry-person">- {{ getPersonName(entry.personnelId) }}</span>
          <span v-else class="entry-unassigned">(待分派)</span>
        </div>
        <div v-if="!task.responsibleMatrix?.cooperative?.length" class="no-entry">无协办部门</div>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import type { SupervisionTask } from '@/types'
import { DEPT_MAP } from '@/constants'
import { usePersonnelStore } from '@/stores/personnel'
import { computed } from 'vue'

const props = defineProps<{ task: SupervisionTask }>()
defineEmits<{ update: [p: Partial<SupervisionTask>] }>()

const personnelStore = usePersonnelStore()

function getDeptName(deptId: string) { return DEPT_MAP[deptId] || deptId }
function getPersonName(pid: string) {
  const p = personnelStore.allPersonnel.find(x => x.id === pid)
  return p?.name || pid
}
</script>

<style scoped>
.matrix-card { margin-bottom: 14px; }
.section-title { font-weight: 600; font-size: 14px; }
.matrix-body { display: flex; gap: 24px; }
.matrix-section { flex: 1; }
.matrix-entry { display: flex; align-items: center; gap: 6px; padding: 6px 0; border-bottom: 1px solid #f0f0f0; }
.entry-dept { font-weight: 600; font-size: 13px; }
.entry-person { font-size: 13px; color: var(--text-secondary); }
.entry-unassigned { font-size: 12px; color: var(--text-muted); font-style: italic; }
.no-entry { font-size: 13px; color: var(--text-muted); padding: 6px 0; }
</style>
