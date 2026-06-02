<template>
  <el-dialog :model-value="visible" title="选择显示列" width="500px" @update:model-value="$emit('update:visible', $event)">
    <el-checkbox-group :model-value="localColumns" @update:model-value="onChange">
      <div v-for="col in allColumnOptions" :key="col.key" class="col-option">
        <el-checkbox :label="col.key">{{ col.label }}</el-checkbox>
      </div>
    </el-checkbox-group>
    <template #footer>
      <el-button type="primary" @click="applyColumns">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{ visible: boolean; columns: string[] }>()
const emit = defineEmits<{ 'update:visible': [boolean]; 'update:columns': [cols: string[]] }>()

const allColumnOptions = [
  { key: 'title', label: '任务标题' },
  { key: 'taskType', label: '任务类型' },
  { key: 'tags', label: '标签' },
  { key: 'department', label: '部门' },
  { key: 'deadline', label: '截止日期' },
  { key: 'progress', label: '当前环节' },
  { key: 'status', label: '状态' },
  { key: 'summary', label: '最新动态' },
]

const localColumns = ref<string[]>([])

watch(() => props.visible, (v) => {
  if (v) localColumns.value = [...(props.columns || allColumnOptions.map(c => c.key))]
})

function onChange(vals: string[]) { localColumns.value = vals }
function applyColumns() {
  emit('update:columns', localColumns.value)
  emit('update:visible', false)
}
</script>

<style scoped>
.col-option { padding: 6px 0; }
</style>
