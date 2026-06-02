<template>
  <div class="task-new-page">
    <el-card shadow="never">
      <template #header><h2 style="margin:0">新建任务</h2></template>

      <el-form :model="form" label-width="100px" size="default" @submit.prevent="handleSubmit">
        <!-- 基础信息 -->
        <el-form-item label="任务标题" required>
          <el-input v-model="form.title" maxlength="100" placeholder="请输入任务标题" />
        </el-form-item>

        <el-form-item label="任务描述">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="任务详细描述" />
        </el-form-item>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="任务类型">
              <el-select v-model="form.taskTypeGroupId" placeholder="一级分类" style="width:100%" @change="onGroupChange">
                <el-option v-for="g in taskTypeGroups" :key="g.id" :label="g.name" :value="g.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label-width="0">
              <el-select v-model="form.taskTypeId" placeholder="二级类型" style="width:100%" @change="onTypeChange">
                <el-option v-for="t in subTypes" :key="t.id" :label="t.name" :value="t.id" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="截止日期">
              <el-date-picker v-model="form.deadline" type="date" placeholder="选择日期" value-format="YYYY-MM-DD" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="优先级">
              <el-radio-group v-model="form.priority">
                <el-radio value="normal">普通</el-radio>
                <el-radio value="urgent">紧急</el-radio>
                <el-radio value="leadership_attention">领导关注</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
        </el-row>

        <!-- 标签 -->
        <el-form-item label="标签">
          <el-select v-model="form.tags" multiple placeholder="选择标签" style="width:100%">
            <el-option v-for="t in allTags" :key="t.id" :label="t.name" :value="t.id" />
          </el-select>
        </el-form-item>

        <!-- 主办/协办 -->
        <el-form-item label="主办部门" required>
          <el-select v-model="primaryDeptId" placeholder="选择主办部门" style="width:100%" @change="addPrimaryDept">
            <el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.responsibleMatrix.primary.length" label="已选主办">
          <el-tag v-for="(p, i) in form.responsibleMatrix.primary" :key="i" closable @close="form.responsibleMatrix.primary.splice(i, 1)" class="mr-2">
            {{ getDeptName(p.departmentId) }}
          </el-tag>
        </el-form-item>

        <el-form-item label="协办部门">
          <el-select v-model="coDeptId" placeholder="选择协办部门" style="width:100%" @change="addCoDept">
            <el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.responsibleMatrix.cooperative.length" label="已选协办">
          <el-tag v-for="(c, i) in form.responsibleMatrix.cooperative" :key="i" closable @close="form.responsibleMatrix.cooperative.splice(i, 1)" class="mr-2" type="info">
            {{ getDeptName(c.departmentId) }}
          </el-tag>
        </el-form-item>

        <!-- 流程模板 -->
        <el-form-item label="流程模板">
          <el-select v-model="form.flowTemplateId" placeholder="选择流程模板" clearable style="width:100%" @change="onFlowSelect">
            <el-option v-for="ft in flowTemplates" :key="ft.id" :label="ft.name" :value="ft.id" />
          </el-select>
        </el-form-item>

        <!-- 流程预览 -->
        <div v-if="previewStages.length" class="flow-preview">
          <div class="steps">
            <span v-for="(s, i) in previewStages" :key="i" class="step-tag">{{ s.name }}</span>
          </div>
        </div>

        <!-- 明细模板 -->
        <el-form-item label="明细模板">
          <el-select v-model="form.dataSheetTemplateId" placeholder="选择明细模板" clearable style="width:100%">
            <el-option v-for="ds in dataSheetTemplates" :key="ds.id" :label="ds.name" :value="ds.id" />
          </el-select>
        </el-form-item>

        <!-- 子任务预分配 -->
        <el-collapse>
          <el-collapse-item title="子任务预分配">
            <div v-for="(st, i) in subtasks" :key="i" class="subtask-row">
              <el-input v-model="st.title" placeholder="子任务标题" style="width: 200px" />
              <el-input v-model="st.assignee" placeholder="负责人" style="width: 120px" class="ml-2" />
              <el-button size="small" type="danger" @click="subtasks.splice(i, 1)">删除</el-button>
            </div>
            <el-button size="small" @click="subtasks.push({ title: '', assignee: '' })">+ 添加子任务</el-button>
          </el-collapse-item>
        </el-collapse>

        <!-- 提取配置 -->
        <el-collapse>
          <el-collapse-item title="外部数据提取配置">
            <el-form-item label="目标URL">
              <el-input v-model="extractionUrl" placeholder="https://..." />
            </el-form-item>
            <el-form-item label="执行人">
              <el-input v-model="extractionExecutor" placeholder="指定执行人" />
            </el-form-item>
          </el-collapse-item>
        </el-collapse>

        <div class="form-actions">
          <el-button @click="$router.back()">取消</el-button>
          <el-button type="primary" :loading="submitting" @click="handleSubmit">创建任务</el-button>
        </div>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTaskStore } from '@/stores/task'
import { useAuthStore } from '@/stores/auth'
import { useConfigStore } from '@/stores/config'
import { useDepartmentStore } from '@/stores/department'
import { useProcessStore } from '@/stores/process'
import { ElMessage } from 'element-plus'
import { v4 as uuidv4 } from 'uuid'
import type { ResponsibleMatrix } from '@/types'
import { DEPT_MAP } from '@/constants'

const router = useRouter()
const taskStore = useTaskStore()
const authStore = useAuthStore()
const configStore = useConfigStore()
const deptStore = useDepartmentStore()
const processStore = useProcessStore()

const submitting = ref(false)
const primaryDeptId = ref('')
const coDeptId = ref('')
const extractionUrl = ref('')
const extractionExecutor = ref('')
const subtasks = ref<Array<{ title: string; assignee: string }>>([])

const form = reactive({
  title: '',
  description: '',
  taskTypeGroupId: '',
  taskTypeId: '',
  deadline: '',
  priority: 'normal' as 'normal' | 'urgent' | 'leadership_attention',
  tags: [] as string[],
  responsibleMatrix: { primary: [], cooperative: [] } as ResponsibleMatrix,
  flowTemplateId: '',
  dataSheetTemplateId: '',
})

const taskTypeGroups = computed(() => configStore.taskTypeGroups)
const subTypes = computed(() => configStore.getTaskTypesByGroup(form.taskTypeGroupId))
const allTags = computed(() => configStore.tags)
const departments = computed(() => deptStore.departments)
const flowTemplates = computed(() => processStore.templates)
const dataSheetTemplates = computed(() => configStore.dataSheetTemplates)
const previewStages = ref<any[]>([])

function getDeptName(id: string) { return DEPT_MAP[id] || id }

function addPrimaryDept(id: string) {
  if (id && !form.responsibleMatrix.primary.find(p => p.departmentId === id)) {
    form.responsibleMatrix.primary.push({ departmentId: id, personnelId: null, role: 'main' })
  }
  primaryDeptId.value = ''
}

function addCoDept(id: string) {
  if (id && !form.responsibleMatrix.cooperative.find(c => c.departmentId === id)) {
    form.responsibleMatrix.cooperative.push({ departmentId: id, personnelId: null, role: 'assist' })
  }
  coDeptId.value = ''
}

function onGroupChange() { form.taskTypeId = '' }
function onTypeChange() {
  const type = configStore.taskTypes.find(t => t.id === form.taskTypeId)
  if (type?.defaultFlowTemplateId) {
    form.flowTemplateId = type.defaultFlowTemplateId
    onFlowSelect(type.defaultFlowTemplateId)
  }
  if (type?.defaultDataSheetTemplateId) form.dataSheetTemplateId = type.defaultDataSheetTemplateId
}

function onFlowSelect(templateId: string) {
  const nodes = processStore.getTemplateNodes(templateId)
  previewStages.value = nodes
}

async function handleSubmit() {
  if (!form.title.trim()) { ElMessage.warning('请输入任务标题'); return }
  if (!form.responsibleMatrix.primary.length) { ElMessage.warning('请选择主办部门'); return }

  submitting.value = true
  try {
    const peerId = authStore.user?.id || ''
    const authorizedPeers = [peerId]
    const childIds: string[] = []

    // 创建子任务
    for (const st of subtasks.value.filter(s => s.title.trim())) {
      const childId = uuidv4()
      childIds.push(childId)
      authorizedPeers.push(childId)
    }

    const taskId = await taskStore.createTask({
      title: form.title,
      description: form.description,
      taskTypeGroupId: form.taskTypeGroupId || undefined,
      taskTypeId: form.taskTypeId || undefined,
      status: 'pending',
      priority: form.priority,
      deadline: form.deadline || undefined,
      tags: form.tags,
      responsibleMatrix: form.responsibleMatrix,
      flowTemplateId: form.flowTemplateId || undefined,
      stagesSnapshot: previewStages.value.length ? previewStages.value.map((s: any, i: number) => ({
        stageIndex: i,
        name: s.node_name || s.name || '',
        options: [],
      })) : undefined,
      currentStageIndex: 0,
      dataSheetTemplateId: form.dataSheetTemplateId || undefined,
      authorizedPeers,
      childTaskIds: childIds,
      createdBy: peerId,
      extractionConfig: extractionUrl.value ? {
        enabled: true,
        executorId: extractionExecutor.value || peerId,
        targetUrl: extractionUrl.value,
        domMappings: [],
        schedule: { mode: 'manual' },
      } : undefined,
      activityLog: [{
        id: uuidv4(),
        type: 'system',
        content: '任务已创建',
        timestamp: new Date().toISOString(),
        actorPeerId: peerId,
      }],
    })

    ElMessage.success('任务创建成功')
    router.push(`/task/${taskId}`)
  } catch (e) {
    ElMessage.error('任务创建失败，请重试')
    console.error(e)
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  await configStore.fetchTaskTypeGroups()
  await configStore.fetchTaskTypes()
  await configStore.fetchTags()
  await configStore.fetchDataSheetTemplates()
  await deptStore.fetchDepartments()
  await processStore.fetchTemplates()
})
</script>

<style scoped>
.task-new-page { max-width: 900px; margin: 0 auto; }
.form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border-light); }
.flow-preview { margin-bottom: 16px; padding: 10px; background: #fafaf7; border-radius: 4px; }
.steps { display: flex; gap: 6px; flex-wrap: wrap; }
.step-tag { padding: 4px 10px; background: #e3edf5; border-radius: 3px; font-size: 13px; }
.subtask-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.ml-2 { margin-left: 8px; }
.mr-2 { margin-right: 8px; }
</style>
