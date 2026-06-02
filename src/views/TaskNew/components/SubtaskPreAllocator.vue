<template>
  <div class="subtask-allocator">
    <div v-for="(item, i) in modelValue" :key="i" class="allocator-row">
      <el-input v-model="item.title" placeholder="子任务标题" style="width: 240px" size="small" />
      <el-input v-model="item.assignee" placeholder="负责人" style="width: 140px" size="small" />
      <el-input v-model="item.description" placeholder="描述（可选）" style="width: 200px" size="small" />
      <el-button size="small" type="danger" @click="remove(i)">删除</el-button>
    </div>
    <el-button size="small" @click="add">+ 添加子任务</el-button>
    <div class="allocator-hint" v-if="!modelValue.length">可用于预分配子任务，创建主任务后自动生成</div>
  </div>
</template>

<script setup lang="ts">
interface SubtaskDraft { title: string; assignee: string; description: string }

const props = defineProps<{ modelValue: SubtaskDraft[] }>()
const emit = defineEmits<{ 'update:modelValue': [v: SubtaskDraft[]] }>()

function add() {
  emit('update:modelValue', [...props.modelValue, { title: '', assignee: '', description: '' }])
}
function remove(i: number) {
  emit('update:modelValue', props.modelValue.filter((_, idx) => idx !== i))
}
</script>

<style scoped>
.allocator-row { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
.allocator-hint { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
</style>
