<template>
  <div class="config-page">
    <el-card shadow="never">
      <template #header>
        <div class="page-header"><h2>明细模板配置</h2><el-button type="primary" size="small" @click="openEditor()">+ 新建模板</el-button></div>
      </template>
      <el-table :data="templates" stripe size="small">
        <el-table-column prop="name" label="模板名称" min-width="180" />
        <el-table-column label="字段数" width="100">
          <template #default="{ row }">{{ getFieldCount(row) }}</template>
        </el-table-column>
        <el-table-column label="创建时间" width="140">
          <template #default="{ row }">{{ (row.createdAt || '').substring(0, 10) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <el-button size="small" @click="openEditor(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="doDelete(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!templates.length" description="暂无模板" :image-size="60" />
    </el-card>

    <el-dialog v-model="visible" :title="editingId ? '编辑模板' : '新建模板'" width="500px">
      <el-form label-width="100px" size="small">
        <el-form-item label="模板名称" required>
          <el-input v-model="editName" placeholder="如：采购任务明细表" />
        </el-form-item>
        <el-form-item label="选择字段">
          <el-checkbox-group v-model="editFields">
            <div v-for="f in systemFields" :key="f.id" class="field-check">
              <el-checkbox :label="f.id">{{ f.name }} <span class="field-type">({{ f.fieldType || f.type }})</span></el-checkbox>
            </div>
          </el-checkbox-group>
          <el-empty v-if="!systemFields.length" description="请先在字段管理中创建字段" :image-size="40" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="doSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { DatabaseManager } from '@/core/database/DatabaseManager'
import { ElMessage, ElMessageBox } from 'element-plus'
import { v4 as uuidv4 } from 'uuid'

const db = DatabaseManager.getInstance()
const templates = ref<any[]>([])
const systemFields = ref<any[]>([])
const visible = ref(false)
const editingId = ref('')
const editName = ref('')
const editFields = ref<string[]>([])

function getFieldCount(t: any) {
  const f = safeJSON(t.fields, [])
  return f.length
}

function safeJSON(s: any, def: any) {
  if (!s) return def
  if (typeof s !== 'string') return s
  try { return JSON.parse(s) } catch { return def }
}

function openEditor(t?: any) {
  if (t) {
    editingId.value = t.id
    editName.value = t.name
    editFields.value = safeJSON(t.fields, []).map((f: any) => f.fieldId || f)
  } else {
    editingId.value = ''
    editName.value = ''
    editFields.value = []
  }
  visible.value = true
}

async function doSave() {
  if (!editName.value.trim()) { ElMessage.warning('请输入模板名称'); return }
  const fieldsData = editFields.value.map((fid, i) => ({ fieldId: fid, required: false, order: i }))
  try {
    if (editingId.value) {
      db.execute(
        'UPDATE data_sheet_templates SET name=?, fields=? WHERE id=?',
        [editName.value.trim(), JSON.stringify(fieldsData), editingId.value],
      )
    } else {
      db.execute(
        'INSERT INTO data_sheet_templates (id, name, fields, createdAt) VALUES (?,?,?,?)',
        [uuidv4(), editName.value.trim(), JSON.stringify(fieldsData), new Date().toISOString()],
      )
    }
    await db.persist()
    ElMessage.success('保存成功')
    visible.value = false
    await loadData()
  } catch (e: any) { ElMessage.error('保存失败: ' + (e.message || '')) }
}

async function doDelete(id: string) {
  await ElMessageBox.confirm('确定删除此模板？', '确认', { type: 'warning' })
  db.execute('DELETE FROM data_sheet_templates WHERE id=?', [id])
  await db.persist()
  ElMessage.success('已删除')
  await loadData()
}

async function loadData() {
  templates.value = db.query<any>('SELECT * FROM data_sheet_templates ORDER BY createdAt DESC')
  systemFields.value = db.query<any>('SELECT * FROM system_fields ORDER BY id ASC')
}

onMounted(loadData)
</script>

<style scoped>
.config-page { max-width: 1200px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; }
.page-header h2 { margin: 0; font-size: 18px; }
.field-check { padding: 3px 0; }
.field-type { font-size: 11px; color: var(--text-muted); }
</style>
