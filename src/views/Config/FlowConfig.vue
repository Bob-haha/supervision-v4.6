<template>
  <div class="config-page">
    <el-card shadow="never">
      <template #header>
        <div class="page-header"><h2>流程配置</h2><el-button type="primary" size="small" @click="openEditor()">+ 新建流程</el-button></div>
      </template>
      <el-table :data="templates" stripe size="small">
        <el-table-column prop="name" label="流程名称" min-width="180" />
        <el-table-column label="环节数" width="100">
          <template #default="{ row }">{{ (row.stages || []).length }}</template>
        </el-table-column>
        <el-table-column label="可见范围" width="100">
          <template #default="{ row }">{{ row.isPublic || row.isPublic === undefined ? '全关' : '科室' }}</template>
        </el-table-column>
        <el-table-column label="创建时间" width="140">
          <template #default="{ row }">{{ (row.created_at || '').substring(0, 10) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <el-button size="small" @click="openEditor(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="doDelete(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!templates.length" description="暂无流程模板" :image-size="60" />
    </el-card>

    <!-- 编辑对话框 -->
    <el-dialog v-model="visible" :title="editingId ? '编辑流程' : '新建流程'" width="700px" @opened="initStages">
      <el-form label-width="100px" size="small">
        <el-form-item label="流程名称" required>
          <el-input v-model="editForm.name" placeholder="例如：年度重点任务流程" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="editForm.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="可见范围">
          <el-radio-group v-model="editForm.isPublic">
            <el-radio :value="true">全关可见</el-radio>
            <el-radio :value="false">仅本科室</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-divider>环节定义</el-divider>
        <div v-for="(stage, i) in editForm.stages" :key="i" class="stage-row">
          <span class="stage-num">{{ i + 1 }}.</span>
          <el-input v-model="stage.name" placeholder="环节名称" size="small" style="width:180px" />
          <el-input v-model="stage.description" placeholder="环节描述" size="small" style="width:200px" />
          <el-button size="small" type="danger" @click="editForm.stages.splice(i, 1)" :disabled="editForm.stages.length <= 2">删除</el-button>
        </div>
        <el-button size="small" @click="editForm.stages.push({ name: '', description: '' })" style="margin-top:8px">+ 添加环节</el-button>
        <div v-if="editForm.stages.length < 2" class="hint-text">至少需要 2 个环节</div>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="doSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useProcessStore } from '@/stores/process'
import { ElMessage, ElMessageBox } from 'element-plus'

const processStore = useProcessStore()
const templates = ref<any[]>([])
const visible = ref(false)
const editingId = ref('')

interface StageDraft { name: string; description: string }
const editForm = reactive({
  name: '', description: '', isPublic: true,
  stages: [] as StageDraft[],
})

function openEditor(t?: any) {
  if (t) {
    editingId.value = t.id
    editForm.name = t.name
    editForm.description = t.description || ''
    editForm.isPublic = t.isPublic !== false
    editForm.stages = (t.stages || []).map((s: any) => ({
      name: s.name || s.node_name || '',
      description: s.description || s.node_description || '',
    }))
  } else {
    editingId.value = ''
    editForm.name = ''
    editForm.description = ''
    editForm.isPublic = true
    editForm.stages = [{ name: '开始', description: '' }, { name: '完成', description: '' }]
  }
  visible.value = true
}

function initStages() {
  if (editForm.stages.length < 2) {
    editForm.stages = [{ name: '开始', description: '' }, { name: '完成', description: '' }]
  }
}

async function doSave() {
  if (!editForm.name.trim()) { ElMessage.warning('请输入流程名称'); return }
  const validStages = editForm.stages.filter(s => s.name.trim())
  if (validStages.length < 2) { ElMessage.warning('至少需要 2 个环节'); return }

  const stagesData = validStages.map((s, i) => ({
    stageIndex: i, name: s.name.trim(), description: s.description.trim(), options: [],
  }))

  try {
    if (editingId.value) {
      await processStore.updateTemplate(editingId.value, {
        name: editForm.name.trim(), description: editForm.description.trim(),
        scope: editForm.isPublic ? 'all' : 'dept', stages: stagesData,
      })
    } else {
      await processStore.createTemplate({
        name: editForm.name.trim(), description: editForm.description.trim(),
        scope: editForm.isPublic ? 'all' : 'dept', stages: stagesData,
      })
    }
    ElMessage.success('保存成功')
    visible.value = false
    await loadData()
  } catch (e: any) { ElMessage.error('保存失败: ' + (e.message || '')) }
}

async function doDelete(id: string) {
  await ElMessageBox.confirm('确定删除此流程模板？', '确认', { type: 'warning' })
  await processStore.deleteTemplate(id)
  ElMessage.success('已删除')
  await loadData()
}

async function loadData() {
  await processStore.fetchTemplates()
  templates.value = processStore.templates
}

onMounted(loadData)
</script>

<style scoped>
.config-page { max-width: 1200px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; }
.page-header h2 { margin: 0; font-size: 18px; }
.stage-row { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
.stage-num { font-weight: 600; min-width: 24px; }
.hint-text { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
</style>
