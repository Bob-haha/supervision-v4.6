<template>
  <el-card shadow="never" class="subtask-card">
    <template #header>
      <div class="header-row">
        <span class="section-title">子任务 ({{ subtasks.length }})</span>
        <div class="header-actions">
          <el-button size="small" @click="createVisible = true">+ 创建子任务</el-button>
          <el-button size="small" @click="linkVisible = true">🔗 关联已有任务</el-button>
        </div>
      </div>
    </template>

    <div v-if="subtasks.length">
      <div v-for="st in subtasks" :key="st.id" class="subtask-row" @click="$router.push(`/task/${st.id}`)">
        <span class="st-title">{{ st.title }}</span>
        <span class="st-meta">
          {{ getDept(st) }} | {{ st.status }}
          <el-tag size="small" :type="deadlineType(st)">{{ st.deadline || '-' }}</el-tag>
        </span>
      </div>
    </div>
    <el-empty v-else description="暂无子任务" :image-size="40" />

    <div v-if="summary.total" class="subtask-summary">
      总计 {{ summary.total }} 个，已完成 {{ summary.completed }}，逾期 {{ summary.overdue }}
    </div>

    <!-- 创建子任务 (复用 SubtaskPreAllocator) -->
    <el-dialog v-model="createVisible" title="创建子任务" width="600px">
      <div v-for="(draft, i) in drafts" :key="i" class="draft-row">
        <el-input v-model="draft.title" placeholder="子任务标题" style="width:200px" />
        <el-input v-model="draft.assignee" placeholder="负责人" style="width:120px" />
        <el-button size="small" type="danger" @click="drafts.splice(i,1)">删除</el-button>
      </div>
      <el-button size="small" @click="drafts.push({title:'',assignee:''})" style="margin-top:6px">+ 添加</el-button>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" @click="createSubtasks">确认创建</el-button>
      </template>
    </el-dialog>

    <!-- 关联已有任务 -->
    <el-dialog v-model="linkVisible" title="关联已有任务" width="500px">
      <el-select v-model="linkTaskId" placeholder="搜索并选择任务" filterable style="width:100%">
        <el-option v-for="t in availableTasks" :key="t.id" :label="t.title" :value="t.id" />
      </el-select>
      <el-form-item label="汇总模式" style="margin-top:12px">
        <el-select v-model="linkMode" style="width:100%">
          <el-option label="不汇总" value="none" />
          <el-option label="同构汇总" value="homogeneous" />
          <el-option label="异构汇总" value="heterogeneous" />
        </el-select>
      </el-form-item>
      <template #footer>
        <el-button @click="linkVisible = false">取消</el-button>
        <el-button type="primary" @click="linkTask">确认关联</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { SupervisionTask } from '@/types'
import { useTaskStore } from '@/stores/task'
import { useDashboardStore } from '@/stores/dashboard'
import { DEPT_MAP } from '@/constants'
import { ElMessage } from 'element-plus'

const props = defineProps<{ task: SupervisionTask }>()
const emit = defineEmits<{ update: [p: Partial<SupervisionTask>] }>()

const taskStore = useTaskStore()
const dashStore = useDashboardStore()

const createVisible = ref(false)
const linkVisible = ref(false)
const linkTaskId = ref('')
const linkMode = ref('none')
const drafts = ref<Array<{ title: string; assignee: string }>>([])

const subtasks = computed(() => taskStore.getSubtasks(props.task.id))
const summary = computed(() => taskStore.getSubtaskSummary(props.task.id))
const availableTasks = computed(() => taskStore.tasks.filter(t => t.id !== props.task.id && !t.parentTaskId))

function getDept(t: SupervisionTask) {
  return t.responsibleMatrix?.primary?.[0] ? (DEPT_MAP[t.responsibleMatrix.primary[0].departmentId] || '') : ''
}
function deadlineType(t: SupervisionTask) {
  const s = dashStore.getDeadlineStatus(t.deadline)
  return s === 'overdue' ? 'danger' : s === 'nearing' ? 'warning' : ''
}

async function createSubtasks() {
  for (const d of drafts.value.filter(d => d.title.trim())) {
    const childId = await taskStore.createTask({
      title: d.title,
      parentTaskId: props.task.id,
      responsibleMatrix: { primary: [], cooperative: [] },
      createdBy: props.task.createdBy,
    })
    // 建立关系
    emit('update', {})
  }
  drafts.value = []
  createVisible.value = false
  ElMessage.success('子任务创建成功')
}

async function linkTask() {
  if (!linkTaskId.value) return
  // 更新被关联任务的 parentTaskId
  await taskStore.updateTask(linkTaskId.value, { parentTaskId: props.task.id })
  emit('update', {})
  linkVisible.value = false
  linkTaskId.value = ''
  ElMessage.success('任务已关联')
}
</script>

<style scoped>
.subtask-card { margin-bottom: 14px; }
.section-title { font-weight: 600; font-size: 14px; }
.header-row { display: flex; justify-content: space-between; align-items: center; }
.header-actions { display: flex; gap: 6px; }
.subtask-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f0f0f0; cursor: pointer; }
.subtask-row:hover { background: #fafaf7; }
.st-title { font-weight: 600; font-size: 14px; }
.st-meta { font-size: 12px; color: var(--text-secondary); display: flex; gap: 8px; align-items: center; }
.subtask-summary { margin-top: 8px; padding: 6px 10px; background: #fafaf7; border-radius: 3px; font-size: 13px; }
.draft-row { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
</style>
