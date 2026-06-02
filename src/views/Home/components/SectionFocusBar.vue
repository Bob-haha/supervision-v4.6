<template>
  <div v-if="focusTasks.length" class="section-focus-bar">
    <strong>科长关注置顶</strong>
    <div v-for="t in focusTasks" :key="t.id" class="focus-item" @click="$emit('click-task', t)">
      <span class="focus-author">{{ getStarredBy(t) }}</span>
      <span class="focus-time">关注</span>
      <div class="focus-content">{{ t.title }}
        <el-tag size="small" :type="status(t) === 'nearing' ? 'warning' : 'danger'" v-if="status(t) !== 'normal'">
          {{ status(t) === 'nearing' ? '临期' : '逾期' }}
        </el-tag>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { SupervisionTask } from '@/types'
import { useDashboardStore } from '@/stores/dashboard'

const props = defineProps<{ tasks: SupervisionTask[] }>()
defineEmits<{ 'click-task': [task: SupervisionTask] }>()

const dashStore = useDashboardStore()

const focusTasks = computed(() =>
  props.tasks.filter(t => t.priority === 'leadership_attention' && t.status !== 'completed')
)

function getStarredBy(task: SupervisionTask): string {
  return (task.starredBy || []).join(', ') || '科领导'
}

function status(task: SupervisionTask) { return dashStore.getDeadlineStatus(task.deadline) }
</script>

<style scoped>
.section-focus-bar { background: #f8fdf5; border: 1px solid #b8d8a0; border-radius: 4px; padding: 12px 14px; margin: 12px 0; }
.focus-item { margin-top: 6px; padding: 6px 0; border-top: 1px dashed #b8d8a0; cursor: pointer; }
.focus-item:hover { background: #fcfff8; }
.focus-author { font-weight: 600; font-size: 13px; }
.focus-time { font-size: 11px; color: var(--text-muted); margin-left: 8px; }
.focus-content { margin-top: 3px; font-size: 13px; }
</style>
