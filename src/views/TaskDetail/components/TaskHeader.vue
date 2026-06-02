<template>
  <el-card shadow="never" class="task-header-card">
    <div class="header-top">
      <div class="header-left">
        <el-button size="small" @click="$emit('go-back')">
          <el-icon><ArrowLeft /></el-icon> 返回
        </el-button>
        <template v-if="task.parentTaskId">
          <span class="breadcrumb">← 所属父任务</span>
        </template>
      </div>
      <div class="header-right">
        <el-button size="small" :type="isStarred ? 'warning' : ''" @click="toggleStar">{{ isStarred ? '★' : '☆' }} 关注</el-button>
        <el-button size="small" @click="shareVisible = true">送阅</el-button>
        <el-button v-if="canArchive" size="small" type="info" @click="archiveTask">归档</el-button>
      </div>
    </div>

    <!-- 标题 -->
    <div class="title-row">
      <h2 class="task-title">
        <span v-if="!editingTitle" @dblclick="startEditTitle">{{ task.title }}</span>
        <el-input v-else v-model="editTitle" size="default" @blur="saveTitle" @keydown.enter="saveTitle" ref="titleInput" style="max-width: 500px" />
      </h2>
      <div class="title-tags">
        <el-tag size="small" :type="priorityType">{{ priorityText }}</el-tag>
        <el-tag size="small" :type="statusTagType">{{ statusText }}</el-tag>
        <el-tag size="small" :type="deadlineType">
          {{ task.deadline || '无限期' }}
        </el-tag>
      </div>
    </div>

    <!-- 描述 -->
    <div class="task-desc" v-if="task.description">
      <strong>描述：</strong>{{ task.description }}
    </div>

    <!-- 送阅模态 -->
    <el-dialog v-model="shareVisible" title="送阅" width="400px">
      <PersonSelector v-model="shareTargets" />
      <template #footer>
        <el-button @click="shareVisible = false">取消</el-button>
        <el-button type="primary" @click="doShare">确定</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { SupervisionTask } from '@/types'
import { useTaskStore } from '@/stores/task'
import { useAuthStore } from '@/stores/auth'
import { useDashboardStore } from '@/stores/dashboard'
import PersonSelector from '@/components/PersonSelector.vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const props = defineProps<{ task: SupervisionTask }>()
const emit = defineEmits<{ 'update:task': [p: Partial<SupervisionTask>]; 'go-back': [] }>()

const taskStore = useTaskStore()
const authStore = useAuthStore()
const dashStore = useDashboardStore()

const peerId = computed(() => authStore.user?.id || '')

const editingTitle = ref(false)
const editTitle = ref('')
const shareVisible = ref(false)
const shareTargets = ref<string[]>([])

const isStarred = computed(() => (props.task.starredBy || []).includes(peerId.value))
const canEdit = computed(() => props.task.createdBy === peerId.value)
const canArchive = computed(() => canEdit.value && props.task.status === 'completed')

const priorityType = computed(() => props.task.priority === 'leadership_attention' ? 'danger' : props.task.priority === 'urgent' ? 'warning' : '')
const priorityText = computed(() => ({ normal: '普通', urgent: '紧急', leadership_attention: '领导关注' }[props.task.priority]))
const statusTagType = computed(() => props.task.status === 'completed' ? 'success' : props.task.status === 'archived' ? 'info' : '')
const statusText = computed(() => ({ pending: '待处理', in_progress: '进行中', completed: '已完成', archived: '已归档' }[props.task.status]))
const deadlineType = computed(() => {
  const s = dashStore.getDeadlineStatus(props.task.deadline)
  return s === 'overdue' ? 'danger' : s === 'nearing' ? 'warning' : 'success'
})

async function toggleStar() {
  await taskStore.toggleStar(props.task.id, peerId.value)
  emit('update:task', {})
}

function startEditTitle() {
  if (!canEdit.value) return
  editTitle.value = props.task.title
  editingTitle.value = true
}

function saveTitle() {
  editingTitle.value = false
  if (editTitle.value.trim() && editTitle.value !== props.task.title) {
    emit('update:task', { title: editTitle.value.trim() })
  }
}

async function archiveTask() {
  await ElMessageBox.confirm('确定要将此任务归档吗？', '确认归档', { type: 'warning' })
  emit('update:task', { status: 'archived' })
  ElMessage.success('任务已归档')
}

async function doShare() {
  if (!shareTargets.value.length) return
  await taskStore.shareTo(props.task.id, shareTargets.value)
  ElMessage.success(`已送阅给 ${shareTargets.value.length} 人`)
  shareVisible.value = false; shareTargets.value = []
}
</script>

<style scoped>
.task-header-card { margin-bottom: 0; }
.header-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.header-left, .header-right { display: flex; align-items: center; gap: 8px; }
.breadcrumb { font-size: 13px; color: var(--text-secondary); }
.title-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.task-title { font-size: 20px; font-weight: 700; margin: 0; cursor: default; }
.title-tags { display: flex; gap: 4px; }
.task-desc { padding: 10px; background: #fafaf7; border-radius: 4px; margin-top: 10px; font-size: 14px; }
</style>
