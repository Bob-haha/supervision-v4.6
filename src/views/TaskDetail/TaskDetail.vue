<template>
  <div class="task-detail-page" v-loading="loading">
    <template v-if="task">
      <!-- 区域一：任务头栏 -->
      <TaskHeader :task="task" @update:task="updateTask" @go-back="router.back()" />

      <el-row :gutter="16" style="margin-top:16px">
        <el-col :span="16">
          <!-- 区域二：责任矩阵 -->
          <ResponsibilityMatrix :task="task" @update="updateTask" />

          <!-- 区域三：环节流程 -->
          <StageFlow :task="task" @progress="handleProgress" />

          <!-- 区域四：子任务区域 -->
          <SubtaskSection :task="task" @update="updateTask" />

          <!-- 区域六：数据明细区 -->
          <DataSheet :task="task" @update="updateTask" />
        </el-col>

        <el-col :span="8">
          <!-- 区域五：动态与批示区 -->
          <ActivityFeed :task="task" @add-activity="addActivity" @add-comment="addComment" />
        </el-col>
      </el-row>
    </template>

    <!-- 无权限/不存在 -->
    <el-empty v-if="!loading && !task" description="任务不存在或无权访问" :image-size="80">
      <el-button type="primary" @click="router.push('/home')">返回首页</el-button>
    </el-empty>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTaskStore } from '@/stores/task'
import { useAuthStore } from '@/stores/auth'
import type { SupervisionTask, ActivityLogEntry } from '@/types'
import { v4 as uuidv4 } from 'uuid'
import TaskHeader from './components/TaskHeader.vue'
import ResponsibilityMatrix from './components/ResponsibilityMatrix.vue'
import StageFlow from './components/StageFlow.vue'
import SubtaskSection from './components/SubtaskSection.vue'
import ActivityFeed from './components/ActivityFeed.vue'
import DataSheet from './components/DataSheet.vue'

const route = useRoute()
const router = useRouter()
const taskStore = useTaskStore()
const authStore = useAuthStore()

const loading = ref(true)
const task = ref<SupervisionTask | null>(null)
const currentPeerId = computed(() => authStore.user?.id || '')

onMounted(async () => {
  const id = route.params.id as string
  if (id) {
    task.value = await taskStore.fetchTaskById(id)
    // 权限检查
    if (task.value) {
      const isAdmin = authStore.user?.role === 'ADMIN' || authStore.user?.role === 'LEADER'
      const peers = [...(task.value.authorizedPeers || []), ...(task.value.sharedWith || [])]
      const isCreator = task.value.createdBy === currentPeerId.value
      const isInPeers = peers.includes(currentPeerId.value)
      const isLegacyTask = (!task.value.authorizedPeers || task.value.authorizedPeers.length === 0) && !task.value.createdBy
      // 管理员/领导可访问所有任务，旧任务（无权限数据）允许所有人访问
      if (!isAdmin && !isCreator && !isInPeers && !isLegacyTask) {
        task.value = null
      }
    }
  }
  loading.value = false
})

async function updateTask(payload: Partial<SupervisionTask>) {
  if (!task.value) return
  await taskStore.updateTask(task.value.id, payload)
  task.value = await taskStore.fetchTaskById(task.value.id)
}

async function handleProgress(nextStageIndex: number, optionLabel: string) {
  if (!task.value) return
  await taskStore.progressStage(task.value.id, nextStageIndex, optionLabel, currentPeerId.value)
  task.value = await taskStore.fetchTaskById(task.value.id)
}

async function addActivity(entry: Omit<ActivityLogEntry, 'id'>) {
  if (!task.value) return
  await taskStore.addActivityLog(task.value.id, { ...entry, id: uuidv4() })
  task.value = await taskStore.fetchTaskById(task.value.id)
}

async function addComment(content: string) {
  if (!task.value) return
  await taskStore.addActivityLog(task.value.id, {
    type: 'leader_comment', content,
    timestamp: new Date().toISOString(), actorPeerId: currentPeerId.value,
  })
  task.value = await taskStore.fetchTaskById(task.value.id)
}
</script>

<style scoped>
.task-detail-page { max-width: 1400px; margin: 0 auto; }
</style>
