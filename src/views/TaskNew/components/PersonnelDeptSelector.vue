<template>
  <div class="personnel-dept-selector">
    <div class="selector-row">
      <el-select :model-value="selectedDept" placeholder="选择部门" filterable style="width: 200px" @update:model-value="onDeptSelect">
        <el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" />
      </el-select>
      <el-select :model-value="selectedPerson" placeholder="选择人员（可选）" filterable clearable style="width: 180px; margin-left: 8px" @update:model-value="onPersonSelect">
        <el-option v-for="p in deptPersonnel" :key="p.id" :label="p.name" :value="p.id" />
      </el-select>
      <el-button size="small" type="primary" style="margin-left: 8px" @click="addEntry" :disabled="!selectedDept">添加</el-button>
    </div>
    <div class="selected-entries" v-if="modelValue.length">
      <el-tag v-for="(entry, i) in modelValue" :key="i" closable @close="removeEntry(i)" class="entry-tag">
        {{ getDeptName(entry.departmentId) }}
        <template v-if="entry.personnelId"> - {{ getPersonName(entry.personnelId) }}</template>
      </el-tag>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { ResponsibleEntry } from '@/types'
import { useDepartmentStore } from '@/stores/department'
import { usePersonnelStore } from '@/stores/personnel'
import { DEPT_MAP } from '@/constants'

const props = defineProps<{ modelValue: ResponsibleEntry[] }>()
const emit = defineEmits<{ 'update:modelValue': [v: ResponsibleEntry[]] }>()

const deptStore = useDepartmentStore()
const personnelStore = usePersonnelStore()

const selectedDept = ref('')
const selectedPerson = ref('')

const departments = computed(() => deptStore.departments)
const deptPersonnel = computed(() => personnelStore.fetchByDept(selectedDept.value))

function getDeptName(id: string) { return DEPT_MAP[id] || id }
function getPersonName(id: string) {
  return personnelStore.allPersonnel.find(p => p.id === id)?.name || id
}

function onDeptSelect(v: string) { selectedDept.value = v; selectedPerson.value = '' }
function onPersonSelect(v: string) { selectedPerson.value = v || '' }

function addEntry() {
  if (!selectedDept.value) return
  const newEntries = [...props.modelValue, {
    departmentId: selectedDept.value,
    personnelId: selectedPerson.value || null,
    role: props.modelValue.length ? 'assist' as const : 'main' as const,
  }]
  emit('update:modelValue', newEntries)
  selectedDept.value = ''
  selectedPerson.value = ''
}

function removeEntry(index: number) {
  const newEntries = props.modelValue.filter((_, i) => i !== index)
  emit('update:modelValue', newEntries)
}
</script>

<style scoped>
.selector-row { display: flex; align-items: center; }
.selected-entries { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.entry-tag { margin-bottom: 4px; }
</style>
