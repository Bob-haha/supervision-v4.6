<template>
  <el-card class="workbench-card" shadow="never">
    <template #header>
      <span class="zone-title">个人工作台</span>
    </template>

    <el-tabs v-model="activeTab" type="card">
      <el-tab-pane label="待办任务" name="pending">
        <TaskListView :tasks="pendingTasks" :columns="['title', 'tags', 'stage', 'deadline', 'summary']" mode="personal" @row-click="goToTask" />
        <el-empty v-if="!pendingTasks.length" description="暂无待办任务" :image-size="60" />
      </el-tab-pane>

      <el-tab-pane label="关注任务" name="starred">
        <TaskListView :tasks="starredTasks" :columns="['title', 'tags', 'stage', 'deadline']" mode="personal" @row-click="goToTask" />
        <el-empty v-if="!starredTasks.length" description="暂无关注任务" :image-size="60" />
      </el-tab-pane>

      <el-tab-pane label="我发起的" name="created">
        <div class="batch-bar" v-if="createdTasks.length">
          <el-button size="small" type="primary" plain :disabled="!selectedIds.length" @click="batchVisible = true">批量送阅 ({{ selectedIds.length }})</el-button>
        </div>
        <TaskListView :tasks="createdTasks" :columns="['title', 'status', 'deadline', 'progress']" mode="personal" selectable @row-click="goToTask" @selection-change="s => selectedIds = s" />
        <el-empty v-if="!createdTasks.length" description="暂无发起任务" :image-size="60" />
      </el-tab-pane>

      <el-tab-pane label="送阅任务" name="shared">
        <TaskListView :tasks="sharedTasks" :columns="['title', 'from', 'deadline']" mode="personal" @row-click="goToTask" />
        <el-empty v-if="!sharedTasks.length" description="暂无送阅任务" :image-size="60" />
      </el-tab-pane>

      <el-tab-pane label="我的提取任务" name="extract">
        <div class="batch-bar" v-if="extractTasks.length">
          <el-button size="small" type="primary">一键登录全部</el-button>
          <el-button size="small" type="warning" plain>批量手动提取</el-button>
        </div>
        <div v-if="extractTasks.length" class="extract-list">
          <div v-for="t in extractTasks" :key="t.id" class="extract-item" @click="goToTask(t)">
            <span class="status-dot" :class="t.extractionConfig?.lastExtractionStatus === 'success' ? 'green' : 'yellow'"></span>
            <div class="extract-info">
              <div class="extract-title">{{ t.title }}</div>
              <div class="extract-meta">{{ t.extractionConfig?.targetUrl }} | 最近提取: {{ formatTime(t.extractionConfig?.lastExtractionTime) }}</div>
            </div>
            <div class="extract-actions" @click.stop>
              <el-button size="small">一键登录</el-button>
              <el-button size="small" type="primary">手动提取</el-button>
            </div>
          </div>
        </div>
        <el-empty v-if="!extractTasks.length" description="暂无提取任务" :image-size="60" />
      </el-tab-pane>
    </el-tabs>

    <!-- 批量送阅人员选择 -->
    <el-dialog v-model="batchVisible" title="选择送阅人员" width="500px">
      <PersonSelector v-model="shareTargets" />
      <template #footer>
        <el-button @click="batchVisible = false">取消</el-button>
        <el-button type="primary" @click="doBatchShare">确认送阅</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useTaskStore } from '@/stores/task'
import { useAuthStore } from '@/stores/auth'
import type { SupervisionTask } from '@/types'
import TaskListView from './TaskListView.vue'
import PersonSelector from '@/components/PersonSelector.vue'
import { ElMessage } from 'element-plus'

const router = useRouter()
const taskStore = useTaskStore()
const authStore = useAuthStore()

const activeTab = ref('pending')
const selectedIds = ref<string[]>([])
const batchVisible = ref(false)
const shareTargets = ref<string[]>([])

const currentPeerId = computed(() => authStore.user?.id || '')

const pendingTasks = computed(() =>
  taskStore.tasks.filter(t => {
    const matrix = t.responsibleMatrix
    const allEntries = [...(matrix?.primary || []), ...(matrix?.cooperative || [])]
    return allEntries.some(e => e.personnelId === currentPeerId.value) && (t.status === 'pending' || t.status === 'in_progress')
  })
)

const starredTasks = computed(() =>
  taskStore.tasks.filter(t => (t.starredBy || []).includes(currentPeerId.value))
)

const createdTasks = computed(() =>
  taskStore.tasks.filter(t => t.createdBy === currentPeerId.value)
)

const sharedTasks = computed(() =>
  taskStore.tasks.filter(t => (t.sharedWith || []).includes(currentPeerId.value))
)

const extractTasks = computed(() =>
  taskStore.tasks.filter(t => t.extractionConfig && t.extractionConfig.executorId === currentPeerId.value)
)

function goToTask(task: SupervisionTask) { router.push(`/task/${task.id}`) }

async function doBatchShare() {
  if (!shareTargets.value.length || !selectedIds.value.length) return
  await taskStore.batchShare(selectedIds.value, shareTargets.value)
  ElMessage.success(`已成功送阅给 ${shareTargets.value.length} 人`)
  batchVisible.value = false
  selectedIds.value = []
  shareTargets.value = []
}

function formatTime(ts?: string) { return ts ? new Date(ts).toLocaleString('zh-CN') : '-' }
</script>

<style scoped>
.workbench-card { margin-bottom: 0; }
.zone-title { font-weight: 700; font-size: 16px; color: var(--text-primary); }
.batch-bar { display: flex; gap: 8px; margin-bottom: 10px; padding: 8px 12px; background: #fafaf7; border-radius: 4px; }
.extract-item { display: flex; align-items: flex-start; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--border-light); cursor: pointer; }
.extract-item:hover { background: #fafaf7; }
.extract-info { flex: 1; min-width: 0; }
.extract-title { font-weight: 600; font-size: 14px; }
.extract-meta { font-size: 12px; color: var(--text-secondary); }
.extract-actions { display: flex; gap: 4px; flex-shrink: 0; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; flex-shrink: 0; }
.status-dot.green { background: var(--color-success, #52C41A); }
.status-dot.yellow { background: var(--color-warning, #FAAD14); }
</style>
