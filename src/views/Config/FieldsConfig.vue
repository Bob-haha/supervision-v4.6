<template>
  <div class="config-page">
    <el-card shadow="never">
      <template #header>
        <div class="page-header"><h2>系统字段库</h2><el-button type="primary" size="small" @click="openEditor()">+ 新建字段</el-button></div>
      </template>
      <el-table :data="fields" stripe size="small">
        <el-table-column prop="name" label="字段名" width="140" />
        <el-table-column label="类型" width="80">
          <template #default="{ row }">{{ row.fieldType || row.type }}</template>
        </el-table-column>
        <el-table-column prop="unit" label="单位" width="80" />
        <el-table-column label="可聚合" width="80" align="center">
          <template #default="{ row }">{{ row.isAggregatable ? '✅' : '-' }}</template>
        </el-table-column>
        <el-table-column label="建议级别" width="100">
          <template #default="{ row }">{{ row.suggestedLevel === 'customs_level' ? '关级' : row.suggestedLevel === 'section_level' ? '科级' : '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <el-button size="small" @click="openEditor(row)">编辑</el-button>
            <el-button v-if="!row.isSystem" size="small" type="danger" @click="doDelete(row.id)">删除</el-button>
            <el-tag v-else size="small" type="info">内置</el-tag>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!fields.length" description="暂无字段，请添加" :image-size="60" />
    </el-card>

    <el-dialog v-model="visible" :title="editingId ? '编辑字段' : '新建字段'" width="480px">
      <el-form label-width="100px" size="small">
        <el-form-item label="字段名" required>
          <el-input v-model="editForm.name" placeholder="如：预算金额" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="editForm.type" style="width:100%">
            <el-option label="文本" value="text" /><el-option label="数字" value="number" />
            <el-option label="日期" value="date" /><el-option label="下拉选项" value="select" />
          </el-select>
        </el-form-item>
        <el-form-item label="单位">
          <el-input v-model="editForm.unit" placeholder="如：万元、台" />
        </el-form-item>
        <el-form-item label="可聚合">
          <el-switch v-model="editForm.isAggregatable" />
        </el-form-item>
        <el-form-item label="建议级别">
          <el-select v-model="editForm.suggestedLevel" style="width:100%" clearable>
            <el-option label="关级" value="customs_level" /><el-option label="科级" value="section_level" />
          </el-select>
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
import { ref, reactive, onMounted } from 'vue'
import { DatabaseManager } from '@/core/database/DatabaseManager'
import { ElMessage, ElMessageBox } from 'element-plus'
import { v4 as uuidv4 } from 'uuid'

const db = DatabaseManager.getInstance()
const fields = ref<any[]>([])
const visible = ref(false)
const editingId = ref('')

const editForm = reactive({
  name: '', type: 'text', unit: '',
  isAggregatable: false, suggestedLevel: '' as string,
})

function openEditor(f?: any) {
  if (f) {
    editingId.value = f.id
    editForm.name = f.name
    editForm.type = f.fieldType || f.type || 'text'
    editForm.unit = f.unit || ''
    editForm.isAggregatable = !!f.isAggregatable
    editForm.suggestedLevel = f.suggestedLevel || ''
  } else {
    editingId.value = ''
    editForm.name = ''; editForm.type = 'text'; editForm.unit = ''
    editForm.isAggregatable = false; editForm.suggestedLevel = ''
  }
  visible.value = true
}

async function doSave() {
  if (!editForm.name.trim()) { ElMessage.warning('请输入字段名'); return }
  try {
    if (editingId.value) {
      db.execute(
        'UPDATE system_fields SET name=?, fieldType=?, unit=?, isAggregatable=?, suggestedLevel=? WHERE id=?',
        [editForm.name.trim(), editForm.type, editForm.unit || null, editForm.isAggregatable ? 1 : 0, editForm.suggestedLevel || null, editingId.value],
      )
    } else {
      db.execute(
        'INSERT INTO system_fields (id, name, fieldType, unit, isAggregatable, suggestedLevel, isSystem) VALUES (?,?,?,?,?,?,?)',
        [uuidv4(), editForm.name.trim(), editForm.type, editForm.unit || null, editForm.isAggregatable ? 1 : 0, editForm.suggestedLevel || null, 0],
      )
    }
    await db.persist()
    ElMessage.success('保存成功')
    visible.value = false
    await loadData()
  } catch (e: any) { ElMessage.error('保存失败: ' + (e.message || '')) }
}

async function doDelete(id: string) {
  await ElMessageBox.confirm('确定删除此字段？', '确认', { type: 'warning' })
  db.execute('DELETE FROM system_fields WHERE id=?', [id])
  await db.persist()
  ElMessage.success('已删除')
  await loadData()
}

async function loadData() {
  fields.value = db.query<any>('SELECT * FROM system_fields ORDER BY isSystem DESC, id ASC')
}

onMounted(loadData)
</script>

<style scoped>
.config-page { max-width: 1200px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; }
.page-header h2 { margin: 0; font-size: 18px; }
</style>
