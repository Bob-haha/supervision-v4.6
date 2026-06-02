<template>
  <div class="inspector-page">
    <div class="inspector-layout">
      <!-- 左侧筛选面板 -->
      <div class="filter-panel">
        <el-card shadow="never">
          <template #header><strong>筛选条件</strong></template>
          <el-form size="small" label-width="70px">
            <el-form-item label="任务类型">
              <el-select v-model="filter.taskTypeId" placeholder="全部" clearable style="width:100%">
                <el-option v-for="t in taskTypes" :key="t.id" :label="t.name" :value="t.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="主办部门">
              <el-select v-model="filter.ownerDeptId" placeholder="全部" clearable filterable style="width:100%">
                <el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="状态">
              <el-select v-model="filter.status" placeholder="全部" clearable style="width:100%">
                <el-option label="待处理" value="pending" />
                <el-option label="进行中" value="in_progress" />
                <el-option label="已完成" value="completed" />
              </el-select>
            </el-form-item>
            <el-form-item label="优先级">
              <el-select v-model="filter.priority" placeholder="全部" clearable style="width:100%">
                <el-option label="普通" value="normal" />
                <el-option label="紧急" value="urgent" />
                <el-option label="领导关注" value="leadership_attention" />
              </el-select>
            </el-form-item>
            <el-form-item label="关键词">
              <el-input v-model="filter.keyword" placeholder="搜索标题" clearable />
            </el-form-item>
            <el-form-item label="截止时间">
              <el-date-picker v-model="deadlineRange" type="daterange" range-separator="至" start-placeholder="开始" end-placeholder="结束" value-format="YYYY-MM-DD" style="width:100%" />
            </el-form-item>
            <el-button type="primary" size="small" style="width:100%" @click="search">应用筛选</el-button>
          </el-form>
        </el-card>
      </div>

      <!-- 中间结果列表 -->
      <div class="result-panel">
        <el-card shadow="never">
          <template #header>
            <div class="result-header">
              <strong>结果列表 ({{ resultTasks.length }}条)</strong>
              <el-button size="small" type="warning" plain @click="exportExcel">导出报表</el-button>
            </div>
          </template>
          <el-table :data="resultTasks" stripe size="small" @row-click="goToTask" :header-cell-style="{ background: '#FAFAFA', fontWeight: 600 }">
            <el-table-column width="40" align="center">
              <template #default="{ row }">
                <span class="status-dot" :class="deadlineStatus(row)"></span>
              </template>
            </el-table-column>
            <el-table-column prop="title" label="任务标题" min-width="180" show-overflow-tooltip />
            <el-table-column label="主办部门" width="120">
              <template #default="{ row }">{{ getDept(row) }}</template>
            </el-table-column>
            <el-table-column label="未办结部门" width="120">
              <template #default="{ row }">{{ uncompletedDepts(row).join(', ') || '-' }}</template>
            </el-table-column>
            <el-table-column label="当前环节" width="90">
              <template #default="{ row }">{{ currentStage(row) }}</template>
            </el-table-column>
            <el-table-column prop="deadline" label="截止日期" width="100" />
            <el-table-column label="操作" width="120">
              <template #default="{ row }">
                <el-button size="small" @click.stop="goToTask(row)">详情</el-button>
                <el-button size="small" type="warning" @click.stop="openUrge(row)">催办</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </div>

      <!-- 右侧统计 -->
      <div class="summary-panel">
        <el-card shadow="never">
          <template #header><strong>汇总统计</strong></template>
          <div class="stat-item">任务总数: <strong>{{ store.summary.totalCount }}</strong></div>
          <div class="stat-item">已办结: <strong>{{ store.summary.completedCount }}</strong> ({{ store.summary.completionRate }}%)</div>
          <div class="stat-item text-danger">逾期: <strong>{{ store.summary.overdueCount }}</strong> ({{ store.summary.overdueRate }}%)</div>
          <div class="stat-item">平均办理时长: <strong>{{ store.summary.avgProcessingDays }}天</strong></div>
          <el-divider />
          <div class="stat-item">
            <el-select v-model="groupBy" size="small" placeholder="分组统计" style="width:100%">
              <el-option label="按部门" value="dept" />
              <el-option label="按任务类型" value="type" />
            </el-select>
          </div>
        </el-card>
      </div>
    </div>

    <!-- 催办模态 -->
    <el-dialog v-model="urgeVisible" title="催办" width="450px">
      <el-form-item label="催办留言">
        <el-input v-model="urgeContent" type="textarea" :rows="3" placeholder="输入催办内容..." />
      </el-form-item>
      <div class="urge-targets">
        <span>默认通知：未完成反馈的责任人</span>
      </div>
      <template #footer>
        <el-button @click="urgeVisible = false">取消</el-button>
        <el-button type="primary" @click="doUrge">确认催办</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useInspectorStore } from '@/stores/inspector'
import type { InspectorFilter } from '@/stores/inspector'
import { useConfigStore } from '@/stores/config'
import { useDepartmentStore } from '@/stores/department'
import { useDashboardStore } from '@/stores/dashboard'
import { useTaskStore } from '@/stores/task'
import { useAuthStore } from '@/stores/auth'
import type { SupervisionTask } from '@/types'
import { DEPT_MAP } from '@/constants'
import { ElMessage } from 'element-plus'

const router = useRouter()
const store = useInspectorStore()
const configStore = useConfigStore()
const deptStore = useDepartmentStore()
const dashStore = useDashboardStore()
const taskStore = useTaskStore()
const authStore = useAuthStore()

const filter = reactive<InspectorFilter>({})
const deadlineRange = ref<[string, string] | null>(null)
const groupBy = ref('dept')
const urgeVisible = ref(false)
const urgeTask = ref<SupervisionTask | null>(null)
const urgeContent = ref('')

const taskTypes = computed(() => configStore.taskTypes)
const departments = computed(() => deptStore.departments)
const resultTasks = computed(() => store.resultTasks)

function deadlineStatus(t: SupervisionTask) { return dashStore.getDeadlineStatus(t.deadline) }
function currentStage(t: SupervisionTask) {
  const s = t.stagesSnapshot; const i = t.currentStageIndex ?? 0
  return s && i >= 0 && i < s.length ? s[i].name : '-'
}
function getDept(t: SupervisionTask) {
  const m = t.responsibleMatrix?.primary
  return m?.[0] ? (DEPT_MAP[m[0].departmentId] || m[0].departmentId) : '-'
}
function uncompletedDepts(t: SupervisionTask) { return store.getUncompletedDepts(t).map(id => DEPT_MAP[id] || id) }

function search() {
  if (deadlineRange.value) {
    filter.deadlineStart = deadlineRange.value[0]
    filter.deadlineEnd = deadlineRange.value[1]
  } else {
    filter.deadlineStart = undefined
    filter.deadlineEnd = undefined
  }
  store.applyFilter(filter)
}

function goToTask(t: SupervisionTask) { router.push(`/task/${t.id}`) }

function openUrge(t: SupervisionTask) {
  urgeTask.value = t
  urgeContent.value = ''
  urgeVisible.value = true
}

async function doUrge() {
  if (!urgeTask.value) return
  await taskStore.addActivityLog(urgeTask.value.id, {
    type: 'urge',
    content: urgeContent.value || '请尽快处理任务',
    timestamp: new Date().toISOString(),
    actorPeerId: authStore.user?.id || '',
  })
  ElMessage.success('催办已发送')
  urgeVisible.value = false
  search()
}

function exportExcel() {
  ElMessage.info('Excel 导出功能将通过 xlsx 库实现')
}

onMounted(async () => {
  await configStore.fetchTaskTypes()
  await deptStore.fetchDepartments()
  await taskStore.fetchTasks()
  store.applyFilter()
})
</script>

<style scoped>
.inspector-page { max-width: 1600px; margin: 0 auto; }
.inspector-layout { display: grid; grid-template-columns: 240px 1fr 240px; gap: 12px; }
.filter-panel, .result-panel, .summary-panel { min-width: 0; }
.result-header { display: flex; justify-content: space-between; align-items: center; }
.stat-item { padding: 4px 0; font-size: 14px; }
.text-danger { color: #F5222D; }
.status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
.status-dot.overdue { background: #F5222D; }
.status-dot.nearing { background: #FAAD14; }
.status-dot.normal { background: #52C41A; }
.urge-targets { font-size: 12px; color: var(--text-muted); margin-top: 6px; }
@media (max-width: 1200px) {
  .inspector-layout { grid-template-columns: 1fr 1fr; }
  .summary-panel { grid-column: span 2; }
}
@media (max-width: 768px) {
  .inspector-layout { grid-template-columns: 1fr; }
  .summary-panel { grid-column: span 1; }
}
</style>
