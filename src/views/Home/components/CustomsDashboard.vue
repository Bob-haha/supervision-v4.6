<template>
  <el-card class="dashboard-zone" shadow="never">
    <template #header>
      <div class="zone-header">
        <span class="zone-title">关区业务态势</span>
        <el-button size="small" type="warning" plain @click="metricConfigVisible = true">配置指标</el-button>
      </div>
    </template>

    <!-- 指标卡片 -->
    <MetricCards :metrics="customsMetrics" :tasks="allTasks" level="customs_level" @drill-down="openDrillDown" />

    <!-- 领导批示置顶 -->
    <LeaderCommentBar :tasks="allTasks" @click-task="goToTask" />

    <!-- 浏览器标签页 -->
    <BrowserTabs v-model="activeTabId" :tabs="tabs" @update:tabs="saveTabs" />

    <!-- 任务列表 -->
    <div class="toolbar">
      <el-button size="small" @click="columnVisible = true">列选</el-button>
      <el-button size="small" @click="filterVisible = true">高级配置</el-button>
    </div>
    <TaskListView :tasks="filteredTasks" :columns="activeTab?.config.columns" mode="customs" @row-click="goToTask" />

    <!-- 模态框 -->
    <MetricConfigModal v-model:visible="metricConfigVisible" level="customs" />
    <DrillDownModal v-model:visible="drillVisible" :metric-name="drillMetric?.name || ''" :tasks="drillTasks" @row-click="goToTask" />
    <ColumnSelectModal v-model:visible="columnVisible" :columns="activeTab?.config.columns || []" @update:columns="updateColumns" />
    <AdvancedFilterModal v-model:visible="filterVisible" :filters="activeTab?.config.filters" :sort-by="activeTab?.config.sortBy" @apply="applyFilter" />
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useTaskStore } from '@/stores/task'
import { useDashboardStore } from '@/stores/dashboard'
import { useConfigStore } from '@/stores/config'
import type { SupervisionTask, MetricDefinition, DashboardTab } from '@/types'
import MetricCards from './MetricCards.vue'
import BrowserTabs from './BrowserTabs.vue'
import TaskListView from './TaskListView.vue'
import LeaderCommentBar from './LeaderCommentBar.vue'
import MetricConfigModal from './MetricConfigModal.vue'
import DrillDownModal from './DrillDownModal.vue'
import ColumnSelectModal from './ColumnSelectModal.vue'
import AdvancedFilterModal from './AdvancedFilterModal.vue'

const router = useRouter()
const taskStore = useTaskStore()
const dashStore = useDashboardStore()
const configStore = useConfigStore()

const allTasks = computed(() => taskStore.tasks)
const customsMetrics = computed(() => configStore.metricDefinitions.filter(m => m.level === 'customs_level'))

const activeTabId = ref('tab-all')
const tabs = ref<DashboardTab[]>([
  { id: 'tab-all', label: '全部任务', type: 'customs_task_list', config: { columns: ['title', 'taskType', 'tags', 'department', 'deadline', 'progress'], filters: {}, sortBy: { field: 'deadline', order: 'asc' }, isDefault: true } },
  { id: 'tab-annual', label: '年度重点任务', type: 'customs_task_list', config: { columns: ['title', 'taskType', 'department', 'deadline', 'progress'], filters: { taskTypeIds: [] }, sortBy: { field: 'deadline', order: 'asc' }, isDefault: false } },
  { id: 'tab-leader', label: '领导关注', type: 'customs_task_list', config: { columns: ['title', 'taskType', 'tags', 'department', 'deadline', 'progress'], filters: {}, sortBy: { field: 'deadline', order: 'asc' }, isDefault: false } },
  { id: 'tab-urgent', label: '逾期/临期', type: 'customs_task_list', config: { columns: ['title', 'taskType', 'department', 'deadline', 'progress'], filters: {}, sortBy: { field: 'deadline', order: 'asc' }, isDefault: false } },
])

const activeTab = computed(() => tabs.value.find(t => t.id === activeTabId.value))

const metricConfigVisible = ref(false)
const columnVisible = ref(false)
const filterVisible = ref(false)
const drillVisible = ref(false)
const drillMetric = ref<MetricDefinition | null>(null)
const drillTasks = ref<SupervisionTask[]>([])

const filteredTasks = computed(() => {
  const tab = activeTab.value
  if (!tab) return allTasks.value
  let list = [...allTasks.value]

  if (tab.id === 'tab-annual') {
    list = list.filter(t => t.taskTypeGroupId === 'annual' || t.task_type === '年度重点任务')
  } else if (tab.id === 'tab-leader') {
    list = list.filter(t => t.priority === 'leadership_attention')
  } else if (tab.id === 'tab-urgent') {
    list = list.filter(t => {
      const status = dashStore.getDeadlineStatus(t.deadline)
      return status === 'overdue' || status === 'nearing'
    })
  }

  return list
})

function goToTask(task: SupervisionTask) { router.push(`/task/${task.id}`) }

function openDrillDown(metric: MetricDefinition) {
  drillMetric.value = metric
  const result = dashStore.computeMetricValue(metric, allTasks.value)
  drillTasks.value = allTasks.value.filter(t => result.taskIds.includes(t.id))
  drillVisible.value = true
}

function saveTabs(newTabs: DashboardTab[]) { tabs.value = newTabs }

function updateColumns(cols: string[]) {
  const tab = tabs.value.find(t => t.id === activeTabId.value)
  if (tab) { tab.config.columns = cols; saveTabs([...tabs.value]) }
}

function applyFilter(filters: any, sortBy: any) {
  const tab = tabs.value.find(t => t.id === activeTabId.value)
  if (tab) { tab.config.filters = filters; tab.config.sortBy = sortBy; saveTabs([...tabs.value]) }
}
</script>

<style scoped>
.dashboard-zone { margin-bottom: 0; }
.zone-header { display: flex; justify-content: space-between; align-items: center; }
.zone-title { font-weight: 700; font-size: 16px; color: var(--text-primary); }
.toolbar { display: flex; gap: 8px; margin: 10px 0; }
</style>
