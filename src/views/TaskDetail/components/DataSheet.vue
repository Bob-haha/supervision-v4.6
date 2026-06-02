<template>
  <el-card shadow="never" class="datasheet-card">
    <template #header>
      <div class="header-row">
        <span class="section-title">数据明细区</span>
        <el-button size="small" @click="addRow">+ 新增行</el-button>
      </div>
    </template>

    <el-table v-if="hasData" :data="rows" stripe size="small" style="width:100%">
      <el-table-column
        v-for="col in columns"
        :key="col.key"
        :label="col.label"
        :prop="col.key"
        min-width="120"
      >
        <template #default="{ row, $index }">
          <template v-if="editingIndex === $index">
            <el-input v-model="editRowData[col.key]" size="small" />
          </template>
          <template v-else>
            {{ row.data?.[col.key] || '-' }}
          </template>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140">
        <template #default="{ row, $index }">
          <template v-if="editingIndex === $index">
            <el-button size="small" type="success" @click="saveEdit">保存</el-button>
            <el-button size="small" @click="cancelEdit">取消</el-button>
          </template>
          <template v-else>
            <el-button v-if="canEditRow(row)" size="small" @click="startEdit($index, row)">编辑</el-button>
            <el-button v-if="canEditRow(row)" size="small" type="danger" @click="deleteRow($index)">删除</el-button>
            <span v-if="!canEditRow(row)" class="readonly-text">只读</span>
          </template>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="!hasData" description="暂无明细数据，请添加" :image-size="40" />
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import type { SupervisionTask, DataSheetRow } from '@/types'
import { useAuthStore } from '@/stores/auth'
import { v4 as uuidv4 } from 'uuid'

const props = defineProps<{ task: SupervisionTask }>()
const emit = defineEmits<{ update: [p: Partial<SupervisionTask>] }>()

const authStore = useAuthStore()
const peerId = computed(() => authStore.user?.id || '')

const editingIndex = ref(-1)
const editRowData = reactive<Record<string, any>>({})
const newRowMode = ref(false)

const rows = computed<DataSheetRow[]>(() => props.task.dataSheetRows || [])

const columns = computed(() => {
  const fields = props.task.dataSheetFields
  if (fields && fields.length) {
    return fields.map(f => ({ key: f.fieldId, label: f.fieldId, required: f.required }))
  }
  // 尝试从 system_fields 读取
  return [{ key: 'value', label: '数值' }, { key: 'remark', label: '备注' }]
})

const hasData = computed(() => rows.value.length > 0 || newRowMode.value)

function canEditRow(row: DataSheetRow): boolean {
  return row.creatorId === peerId.value
}

function addRow() {
  editingIndex.value = -1
  newRowMode.value = true
  columns.value.forEach(c => { editRowData[c.key] = '' })
  saveNewRow()
}

function startEdit(index: number, row: DataSheetRow) {
  editingIndex.value = index
  Object.assign(editRowData, row.data || {})
}

function cancelEdit() {
  editingIndex.value = -1
  newRowMode.value = false
}

async function saveEdit() {
  if (editingIndex.value >= 0 && editingIndex.value < rows.value.length) {
    const updated = [...rows.value]
    updated[editingIndex.value] = { ...updated[editingIndex.value], data: { ...editRowData }, updatedAt: new Date().toISOString() }
    emit('update', { dataSheetRows: updated })
  }
  editingIndex.value = -1
}

async function saveNewRow() {
  const newRow: DataSheetRow = {
    rowId: uuidv4(),
    data: { ...editRowData },
    creatorId: peerId.value,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  emit('update', { dataSheetRows: [...rows.value, newRow] })
  newRowMode.value = false
  Object.keys(editRowData).forEach(k => delete editRowData[k])
}

async function deleteRow(index: number) {
  const updated = rows.value.filter((_, i) => i !== index)
  emit('update', { dataSheetRows: updated })
}
</script>

<style scoped>
.datasheet-card { margin-bottom: 14px; }
.section-title { font-weight: 600; font-size: 14px; }
.header-row { display: flex; justify-content: space-between; align-items: center; }
.readonly-text { font-size: 12px; color: var(--text-muted); }
</style>
