<template>
  <div class="my-tasks-page">
    <el-card shadow="never">
      <template #header><h2 style="margin:0">我的任务</h2></template>

      <!-- 标签页筛选 -->
      <el-tabs v-model="activeTab" @tab-change="onTabChange">
        <el-tab-pane label="全部任务" name="all" />
        <el-tab-pane label="待办任务" name="pending" />
        <el-tab-pane label="我发起的" name="created" />
        <el-tab-pane label="关注任务" name="starred" />
        <el-tab-pane label="送阅任务" name="shared" />
        <el-tab-pane label="我协办的" name="cooperative" />
      </el-tabs>

      <!-- 搜索与操作栏 -->
      <div class="toolbar">
        <el-input v-model="searchKeyword" placeholder="搜索任务..." clearable style="width: 240px" @input="onSearch" />
        <div class="toolbar-right">
          <el-button size="small" @click="filterVisible = true">高级筛选</el-button>
          <el-button v-if="selectedIds.length" size="small" type="primary" plain @click="batchShareVisible = true">批量送阅 ({{ selectedIds.length }})</el-button>
        </div>
      </div>

      <!-- 任务列表 -->
      <el-table
        :data="displayTasks"
        stripe
        size="small"
        @row-click="goToTask"
        @selection-change="onSelection"
        :header-cell-style="{ background: '#FAFAFA', fontWeight: 600 }"
      >
        <el-table-column type="selection" width="40" />
        <el-table-column width="40" align="center">
          <template #default="{ row }">
            <span class="status-dot" :class="deadlineStatus(row)"></span>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="任务标题" min-width="220" show-overflow-tooltip />
        <el-table-column label="来源" width="80">
          <template #default="{ row }">{{ row.source?.type || '手动' }}</template>
        </el-table-column>
        <el-table-column label="环节" width="100">
          <template #default="{ row }">{{ currentStage(row) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="statusType(row)" size="small">{{ statusText(row) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="deadline" label="截止日期" width="110" sortable />
      </el-table>

      <el-empty v-if="!displayTasks.length" :description="emptyText" :image-size="60" />
    </el-card>

    <!-- 高级筛选 -->
    <el-dialog v-model="filterVisible" title="高级筛选" width="500px">
      <el-form label-width="80px" size="small">
        <el-form-item label="状态">
          <el-select v-model="advFilter.status" multiple placeholder="全部" clearable style="width:100%">
            <el-option label="待处理" value="pending" />
            <el-option label="进行中" value="in_progress" />
            <el-option label="已完成" value="completed" />
          </el-select>
        </el-form-item>
        <el-form-item label="关键词">
          <el-input v-model="advFilter.keyword" placeholder="搜索标题" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="filterVisible = false">关闭</el-button>
        <el-button type="primary" @click="applyAdvFilter">应用</el-button>
      </template>
    </el-dialog>

    <!-- 批量送阅 -->
    <el-dialog v-model="batchShareVisible" title="选择送阅人员" width="500px">
      <PersonSelector v-model="shareTargets" />
      <template #footer>
        <el-button @click="batchShareVisible = false">取消</el-button>
        <el-button type="primary" @click="doBatchShare">确认送阅</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTaskStore } from '@/stores/task'
import { useAuthStore } from '@/stores/auth'
import { useDashboardStore } from '@/stores/dashboard'
import type { SupervisionTask } from '@/types'
import PersonSelector from '@/components/PersonSelector.vue'
import { ElMessage } from 'element-plus'

const router = useRouter()
const taskStore = useTaskStore()
const authStore = useAuthStore()
const dashStore = useDashboardStore()

const activeTab = ref('all')
const searchKeyword = ref('')
const selectedIds = ref<string[]>([])
const filterVisible = ref(false)
const batchShareVisible = ref(false)
const shareTargets = ref<string[]>([])
const advFilter = reactive({ status: [] as string[], keyword: '' })

const peerId = computed(() => authStore.user?.id || '')

const baseTasks = computed(() => {
  const tasks = taskStore.tasks
  const isAdmin = authStore.user?.role === 'ADMIN' || authStore.user?.role === 'LEADER'

  // 判断用户是否有权访问某个任务
  function canAccess(t: any): boolean {
    if (isAdmin) return true
    // 旧任务（无权限数据），允许所有认证用户查看
    const hasNoPermissionData = (!t.authorizedPeers || t.authorizedPeers.length === 0) && !t.createdBy
    if (hasNoPermissionData) return true
    // 新权限系统
    const inPeers = (t.authorizedPeers || []).includes(peerId.value)
    const inShared = (t.sharedWith || []).includes(peerId.value)
    const isCreator = t.createdBy === peerId.value
    return inPeers || inShared || isCreator
  }

  switch (activeTab.value) {
    case 'pending':
      return tasks.filter((t: any) => {
        const m = t.responsibleMatrix
        return [...(m?.primary || []), ...(m?.cooperative || [])].some((e: any) => e.personnelId === peerId.value && (t.status === 'pending' || t.status === 'in_progress'))
      })
    case 'created': return tasks.filter((t: any) => t.createdBy === peerId.value)
    case 'starred': return tasks.filter((t: any) => (t.starredBy || []).includes(peerId.value))
    case 'shared': return tasks.filter((t: any) => (t.sharedWith || []).includes(peerId.value))
    case 'cooperative':
      return tasks.filter((t: any) => t.responsibleMatrix?.cooperative?.some((c: any) => c.personnelId === peerId.value))
    default:
      return tasks.filter(canAccess)
  }
})

const displayTasks = computed(() => {
  let list = [...baseTasks.value]
  if (searchKeyword.value) {
    const kw = searchKeyword.value.toLowerCase()
    list = list.filter(t => t.title.toLowerCase().includes(kw))
  }
  if (advFilter.status.length) {
    list = list.filter(t => advFilter.status.includes(t.status))
  }
  if (advFilter.keyword) {
    const kw = advFilter.keyword.toLowerCase()
    list = list.filter(t => t.title.toLowerCase().includes(kw))
  }
  return list
})

const emptyText = computed(() => {
  const map: Record<string, string> = { pending: '暂无待办任务', created: '暂无发起任务', starred: '暂无关注任务', shared: '暂无送阅任务', cooperative: '暂无协办任务' }
  return map[activeTab.value] || '暂无任务'
})

function deadlineStatus(t: SupervisionTask) { return dashStore.getDeadlineStatus(t.deadline) }
function currentStage(t: SupervisionTask) {
  const s = t.stagesSnapshot; const i = t.currentStageIndex ?? 0
  return s && i >= 0 && i < s.length ? s[i].name : '-'
}
function statusType(t: SupervisionTask) {
  if (t.status === 'completed') return 'success'
  if (dashStore.getDeadlineStatus(t.deadline) === 'overdue') return 'danger'
  return ''
}
function statusText(t: SupervisionTask) {
  if (t.status === 'completed') return '已完成'
  if (t.status === 'archived') return '已归档'
  if (dashStore.getDeadlineStatus(t.deadline) === 'overdue') return '逾期'
  return '进行中'
}

function goToTask(t: SupervisionTask) { router.push(`/task/${t.id}`) }
function onSelection(sel: any[]) { selectedIds.value = sel.map((s: any) => s.id) }
function onTabChange() { selectedIds.value = [] }
function onSearch() { /* computed reacts automatically */ }
function applyAdvFilter() { filterVisible.value = false }

async function doBatchShare() {
  if (!shareTargets.value.length || !selectedIds.value.length) return
  await taskStore.batchShare(selectedIds.value, shareTargets.value)
  ElMessage.success(`已成功送阅给 ${shareTargets.value.length} 人`)
  batchShareVisible.value = false; selectedIds.value = []; shareTargets.value = []
}

onMounted(async () => { await taskStore.fetchTasks() })
</script>

<style scoped>
.my-tasks-page { max-width: 1400px; margin: 0 auto; }
.toolbar { display: flex; justify-content: space-between; align-items: center; margin: 12px 0; gap: 10px; }
.toolbar-right { display: flex; gap: 8px; }
.status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
.status-dot.overdue { background: #F5222D; }
.status-dot.nearing { background: #FAAD14; }
.status-dot.normal { background: #52C41A; }
</style>
