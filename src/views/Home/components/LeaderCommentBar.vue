<template>
  <div v-if="comments.length" class="leader-comment-bar">
    <strong>领导批示置顶（近7天）</strong>
    <div v-for="c in comments" :key="c.taskId + c.timestamp" class="comment-item" @click="$emit('click-task', { id: c.taskId } as any)">
      <span class="comment-author">{{ c.actorName }}</span>
      <span class="comment-time">{{ formatDate(c.timestamp) }}</span>
      <div class="comment-content">"{{ c.content }}" — {{ c.taskTitle }} · {{ c.currentStage }}</div>
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
const comments = computed(() => dashStore.getRecentLeaderComments(props.tasks, 7))

function formatDate(ts: string) { return ts ? new Date(ts).toLocaleDateString('zh-CN') : '' }
</script>

<style scoped>
.leader-comment-bar { background: #fffdf5; border: 1px solid #e8d88e; border-radius: 4px; padding: 12px 14px; margin: 12px 0; }
.comment-item { margin-top: 6px; padding: 6px 0; border-top: 1px dashed #e8d88e; cursor: pointer; }
.comment-item:hover { background: #fffef0; }
.comment-author { font-weight: 600; color: var(--text-primary); font-size: 13px; }
.comment-time { font-size: 11px; color: var(--text-muted); margin-left: 8px; }
.comment-content { margin-top: 3px; font-size: 13px; color: var(--text-regular); }
</style>
