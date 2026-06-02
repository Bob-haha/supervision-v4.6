<template>
  <el-card shadow="never" class="activity-card">
    <template #header><span class="section-title">动态与批示区</span></template>

    <!-- 动态时间线 -->
    <div class="timeline" v-if="log.length">
      <div v-for="entry in log" :key="entry.id" class="timeline-item">
        <div class="tl-icon" :class="entry.type">
          <component :is="iconFor(entry.type)" />
        </div>
        <div class="tl-content">
          <div class="tl-header">
            <span class="tl-actor">{{ getActorName(entry.actorPeerId) }}</span>
            <span class="tl-time">{{ formatTime(entry.timestamp) }}</span>
            <el-tag size="small" :type="tagFor(entry.type)">{{ typeLabel(entry.type) }}</el-tag>
          </div>
          <div class="tl-body">{{ entry.content }}</div>
        </div>
      </div>
    </div>
    <el-empty v-else description="暂无动态" :image-size="40" />

    <!-- 反馈输入 -->
    <div class="input-area">
      <el-input
        v-model="feedbackContent"
        type="textarea"
        :rows="2"
        placeholder="输入进展反馈..."
      />
      <div class="input-actions">
        <el-button size="small" type="primary" @click="submitFeedback" :disabled="!feedbackContent.trim()">提交反馈</el-button>
      </div>
    </div>

    <!-- 领导批示输入 -->
    <div v-if="canComment" class="input-area comment-area">
      <div class="comment-label">领导批示</div>
      <el-input
        v-model="commentContent"
        type="textarea"
        :rows="2"
        placeholder="输入批示意见..."
      />
      <div class="input-actions">
        <el-button size="small" type="danger" @click="submitComment" :disabled="!commentContent.trim()">提交批示</el-button>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { SupervisionTask, ActivityLogEntry } from '@/types'
import { useAuthStore } from '@/stores/auth'
import { usePersonnelStore } from '@/stores/personnel'

const props = defineProps<{ task: SupervisionTask }>()
const emit = defineEmits<{
  'add-activity': [entry: Omit<ActivityLogEntry, 'id'>]
  'add-comment': [content: string]
}>()

const authStore = useAuthStore()
const personnelStore = usePersonnelStore()
const user = computed(() => authStore.user)

function getActorName(peerId: string): string {
  if (!peerId) return '系统'
  const p = personnelStore.allPersonnel.find(x => x.id === peerId)
  if (p) return p.name
  // fallback: try by name match (old data)
  const byName = personnelStore.allPersonnel.find(x => x.name === peerId)
  if (byName) return byName.name
  return peerId.length > 20 ? '未知用户' : peerId
}

onMounted(async () => {
  await personnelStore.fetchAllPersonnel()
})

const feedbackContent = ref('')
const commentContent = ref('')

const log = computed(() => (props.task.activityLog || []).slice().reverse())

const canComment = computed(() => {
  if (!user.value) return false
  const pos = (authStore.userInfo as any)?.position || ''
  return pos.includes('关长') || pos.includes('副关长') || user.value.role === 'LEADER' || user.value.role === 'ADMIN'
})

function submitFeedback() {
  if (!feedbackContent.value.trim()) return
  emit('add-activity', {
    type: 'feedback',
    content: feedbackContent.value.trim(),
    timestamp: new Date().toISOString(),
    actorPeerId: user.value?.id || '',
  })
  feedbackContent.value = ''
}

function submitComment() {
  if (!commentContent.value.trim()) return
  emit('add-comment', commentContent.value.trim())
  commentContent.value = ''
}

function iconFor(type: string) {
  const icons: Record<string, string> = { stage_progress: 'Right', feedback: 'ChatDotRound', leader_comment: 'Star', system: 'Setting', urge: 'Bell', attachment: 'Paperclip' }
  return icons[type] || 'InfoFilled'
}

function tagFor(type: string) {
  const tags: Record<string, string> = { leader_comment: 'danger', urge: 'warning', feedback: 'primary', system: 'info', stage_progress: 'success' }
  return tags[type] || 'info'
}

function typeLabel(type: string) {
  const labels: Record<string, string> = { stage_progress: '环节推进', feedback: '反馈', leader_comment: '领导批示', system: '系统', urge: '催办', attachment: '附件', subtask_summary: '子任务汇总', external_notification: '外部通知', responsibility_feedback: '责任反馈' }
  return labels[type] || type
}

function formatTime(ts: string) { return ts ? new Date(ts).toLocaleString('zh-CN') : '' }
</script>

<style scoped>
.activity-card { height: fit-content; }
.section-title { font-weight: 600; font-size: 14px; }
.timeline { max-height: 500px; overflow-y: auto; }
.timeline-item { display: flex; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
.tl-icon { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0; }
.tl-icon.leader_comment { background: #fde8e8; color: #a51c30; }
.tl-icon.feedback { background: #e8f0fb; color: #4a90d9; }
.tl-icon.stage_progress { background: #e8f5e9; color: #2d6a3f; }
.tl-icon.system { background: #f0ede8; color: #8a847c; }
.tl-icon.urge { background: #fff7e6; color: #b85c00; }
.tl-content { flex: 1; min-width: 0; }
.tl-header { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
.tl-actor { font-weight: 600; font-size: 12px; }
.tl-time { font-size: 11px; color: var(--text-muted); }
.tl-body { font-size: 13px; line-height: 1.5; }
.input-area { margin-top: 12px; }
.input-actions { display: flex; justify-content: flex-end; margin-top: 6px; }
.comment-area .comment-label { font-size: 13px; font-weight: 600; margin-bottom: 4px; color: #a51c30; }
</style>
