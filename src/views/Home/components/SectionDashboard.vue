<template>
  <el-card class="dashboard-zone" shadow="never">
    <template #header>
      <div class="zone-header">
        <span class="zone-title">科级业务态势</span>
        <el-button size="small" type="warning" plain @click="metricConfigVisible = true">配置指标</el-button>
      </div>
    </template>

    <MetricCards :metrics="sectionMetrics" :tasks="deptTasks" level="section_level" @drill-down="openDrillDown" />

    <SectionFocusBar :tasks="deptTasks" @click-task="goToTask" />

    <BrowserTabs v-model="activeTabId" :tabs="tabs" @update:tabs="saveTabs" />

    <div class="toolbar">
      <el-button size="small" @click="columnVisible = true">列选</el-button>
    </div>
    <TaskListView :tasks="filteredTasks" :columns="activeTab?.config.columns" mode="section" @row-click="goToTask" />

    <MetricConfigModal v-model:visible="metricConfigVisible" level="section" />
    <DrillDownModal v-model:visible="drillVisible" :metric-name="drillMetric?.name || ''" :tasks="drillTasks" @row-click="goToTask" />
    <ColumnSelectModal v-model:visible="columnVisible" :columns="activeTab?.config.columns || []" @update:columns="updateColumns" />
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useTaskStore } from '@/stores/task'
import { useAuthStore } from '@/stores/auth'
import { useDashboardStore } from '@/stores/dashboard'
import { useConfigStore } from '@/stores/config'
import type { SupervisionTask, MetricDefinition, DashboardTab } from '@/types'
import MetricCards from './MetricCards.vue'
import BrowserTabs from './BrowserTabs.vue'
import TaskListView from './TaskListView.vue'
import SectionFocusBar from './SectionFocusBar.vue'
import MetricConfigModal from './MetricConfigModal.vue'
import DrillDownModal from './DrillDownModal.vue'
import ColumnSelectModal from './ColumnSelectModal.vue'

const router = useRouter()
const taskStore = useTaskStore()
const authStore = useAuthStore()
const dashStore = useDashboardStore()
const configStore = useConfigStore()

const sectionMetrics = computed(() => configStore.metricDefinitions.filter(m => m.level === 'section_level'))

const deptId = computed(() => authStore.user?.deptId || '')
const deptTasks = computed(() => {
  return taskStore.tasks.filter(t => {
    const matrix = t.responsibleMatrix
    const allDepts = [...(matrix?.primary || []), ...(matrix?.cooperative || [])]
    return allDepts.some(d => d.departmentId === deptId.value)
  })
})

const activeTabId = ref('sec-all')
const tabs = ref<DashboardTab[]>([
  { id: 'sec-all', label: '全部', type: 'section_task_list', config: { columns: ['title', 'taskType', 'department', 'deadline', 'progress'], filters: {}, sortBy: { field: 'deadline', order: 'asc' }, isDefault: true } },
  { id: 'sec-focus', label: '科长关注', type: 'section_task_list', config: { columns: ['title', 'taskType', 'department', 'deadline', 'progress'], filters: {}, sortBy: { field: 'deadline', order: 'asc' }, isDefault: false } },
  { id: 'sec-delay', label: '临期/逾期', type: 'section_task_list', config: { columns: ['title', 'taskType', 'department', 'deadline', 'progress'], filters: {}, sortBy: { field: 'deadline', order: 'asc' }, isDefault: false } },
])

const activeTab = computed(() => tabs.value.find(t => t.id === activeTabId.value))

const metricConfigVisible = ref(false)
const columnVisible = ref(false)
const drillVisible = ref(false)
const drillMetric = ref<MetricDefinition | null>(null)
const drillTasks = ref<SupervisionTask[]>([])

const filteredTasks = computed(() => {
  let list = [...deptTasks.value]
  if (activeTabId.value === 'sec-focus') list = list.filter(t => t.priority === 'leadership_attention')
  if (activeTabId.value === 'sec-delay') {
    list = list.filter(t => ['overdue', 'nearing'].includes(dashStore.getDeadlineStatus(t.deadline)))
  }
  return list
})

function goToTask(task: SupervisionTask) { router.push(`/task/${task.id}`) }

function openDrillDown(metric: MetricDefinition) {
  drillMetric.value = metric
  const result = dashStore.computeMetricValue(metric, deptTasks.value)
  drillTasks.value = deptTasks.value.filter(t => result.taskIds.includes(t.id))
  drillVisible.value = true
}

function saveTabs(newTabs: DashboardTab[]) { tabs.value = newTabs }
function updateColumns(cols: string[]) {
  const tab = tabs.value.find(t => t.id === activeTabId.value)
  if (tab) { tab.config.columns = cols; saveTabs([...tabs.value]) }
}
</script>

<style scoped>
.dashboard-zone { margin-bottom: 0; }
.zone-header { display: flex; justify-content: space-between; align-items: center; }
.zone-title { font-weight: 700; font-size: 16px; color: var(--text-primary); }
.toolbar { display: flex; gap: 8px; margin: 10px 0; }
</style>
