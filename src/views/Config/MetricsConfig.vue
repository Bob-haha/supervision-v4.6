<template>
  <div class="config-page">
    <el-card shadow="never">
      <template #header>
        <div class="page-header"><h2>态势指标配置</h2><el-button type="primary" size="small" @click="openEditor()">+ 新增指标</el-button></div>
      </template>
      <el-table :data="metrics" stripe size="small">
        <el-table-column prop="name" label="指标名称" width="160" />
        <el-table-column label="级别" width="80">
          <template #default="{ row }">{{ row.level === 'customs_level' ? '关级' : '科级' }}</template>
        </el-table-column>
        <el-table-column label="筛选模式" width="100">
          <template #default="{ row }">{{ getConfig(row).mode === 'specific' ? '指定任务' : '条件筛选' }}</template>
        </el-table-column>
        <el-table-column label="聚合函数" width="100">
          <template #default="{ row }">{{ getConfig(row).aggFunc || '-' }}</template>
        </el-table-column>
        <el-table-column prop="visibility" label="可见角色" width="100" />
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <el-button size="small" @click="openEditor(row)">编辑</el-button>
            <el-button v-if="!row.isSystem" size="small" type="danger" @click="doDelete(row.id)">删除</el-button>
            <el-tag v-else size="small" type="info">内置</el-tag>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!metrics.length" description="暂无指标" :image-size="60" />
    </el-card>

    <el-dialog v-model="visible" :title="editingId ? '编辑指标' : '新增指标'" width="580px">
      <el-form label-width="100px" size="small">
        <el-form-item label="指标名称" required>
          <el-input v-model="editForm.name" placeholder="如：涉及企业数" />
        </el-form-item>
        <el-form-item label="级别">
          <el-radio-group v-model="editForm.level">
            <el-radio value="customs_level">关级</el-radio>
            <el-radio value="section_level">科级</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="筛选模式">
          <el-radio-group v-model="editForm.mode" @change="onModeChange">
            <el-radio value="filter">按条件筛选</el-radio>
            <el-radio value="specific">指定具体任务</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="聚合字段">
          <el-select v-model="editForm.fieldId" style="width:100%">
            <el-option label="📊 任务计数 (__task_count__)" value="__task_count__" />
            <el-option v-for="f in aggFields" :key="f.id" :label="`${f.name} (${f.fieldType || f.type})`" :value="f.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="聚合函数">
          <el-select v-model="editForm.aggFunc" style="width:100%">
            <el-option label="SUM - 求和" value="SUM" />
            <el-option label="COUNT - 计数" value="COUNT" />
            <el-option label="AVG - 平均" value="AVG" />
            <el-option label="MAX - 最大值" value="MAX" />
            <el-option label="MIN - 最小值" value="MIN" />
          </el-select>
        </el-form-item>
        <el-form-item label="可见角色">
          <el-select v-model="editForm.visibility" style="width:100%">
            <el-option label="全部" value="all" /><el-option label="关领导" value="role:leader" />
            <el-option label="督办员" value="role:inspector" />
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
const metrics = ref<any[]>([])
const aggFields = ref<any[]>([])
const visible = ref(false)
const editingId = ref('')

const editForm = reactive({
  name: '', level: 'customs_level', mode: 'filter',
  fieldId: '__task_count__', aggFunc: 'COUNT', visibility: 'all',
})

function getConfig(row: any) {
  if (!row.config) return {}
  return typeof row.config === 'string' ? JSON.parse(row.config) : row.config
}

function onModeChange() { /* 切换模式 */ }

function openEditor(m?: any) {
  if (m) {
    editingId.value = m.id
    editForm.name = m.name; editForm.level = m.level; editForm.visibility = m.visibility || 'all'
    const cfg = getConfig(m)
    editForm.mode = cfg.mode || 'filter'
    editForm.fieldId = cfg.fieldId || '__task_count__'
    editForm.aggFunc = cfg.aggFunc || 'COUNT'
  } else {
    editingId.value = ''
    editForm.name = ''; editForm.level = 'customs_level'; editForm.mode = 'filter'
    editForm.fieldId = '__task_count__'; editForm.aggFunc = 'COUNT'; editForm.visibility = 'all'
  }
  visible.value = true
}

async function doSave() {
  if (!editForm.name.trim()) { ElMessage.warning('请输入指标名称'); return }
  const config = JSON.stringify({
    mode: editForm.mode, fieldId: editForm.fieldId, aggFunc: editForm.aggFunc,
    taskTypeIds: editForm.mode === 'filter' ? [] : undefined,
    specificTaskIds: editForm.mode === 'specific' ? [] : undefined,
  })
  try {
    if (editingId.value) {
      db.execute(
        'UPDATE metric_definitions SET name=?, level=?, config=?, visibility=? WHERE id=?',
        [editForm.name.trim(), editForm.level, config, editForm.visibility, editingId.value],
      )
    } else {
      db.execute(
        'INSERT INTO metric_definitions (id, name, level, isRecommended, config, visibility, isSystem, sortOrder) VALUES (?,?,?,?,?,?,?,?)',
        [uuidv4(), editForm.name.trim(), editForm.level, 0, config, editForm.visibility, 0, metrics.value.length + 1],
      )
    }
    await db.persist()
    ElMessage.success('保存成功')
    visible.value = false
    await loadData()
  } catch (e: any) { ElMessage.error('保存失败: ' + (e.message || '')) }
}

async function doDelete(id: string) {
  await ElMessageBox.confirm('确定删除此指标？', '确认', { type: 'warning' })
  db.execute('DELETE FROM metric_definitions WHERE id=?', [id])
  await db.persist()
  ElMessage.success('已删除')
  await loadData()
}

async function loadData() {
  metrics.value = db.query<any>('SELECT * FROM metric_definitions ORDER BY sortOrder ASC')
  aggFields.value = db.query<any>('SELECT * FROM system_fields WHERE isAggregatable=1')
}

onMounted(loadData)
</script>

<style scoped>
.config-page { max-width: 1200px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; }
.page-header h2 { margin: 0; font-size: 18px; }
</style>
