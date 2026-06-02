<template>
  <div class="person-selector">
    <el-input v-model="searchText" placeholder="搜索人员姓名..." clearable size="default" class="mb-2" />
    <div class="selector-body">
      <div class="tree-pane">
        <el-tree :data="treeData" :props="{ children: 'children', label: 'label' }" node-key="id" highlight-current @node-click="onDeptClick" :expand-on-click-node="true" />
      </div>
      <div class="list-pane">
        <div v-if="!currentDeptId" class="empty-hint">请选择左侧部门</div>
        <el-checkbox-group v-else :model-value="multiModel" @update:model-value="onMultiChange">
          <div v-for="p in filteredPersonnel" :key="p.id" class="person-check-item">
            <el-checkbox :label="p.id">
              {{ p.name }} <span class="pos-text">{{ p.position }}</span>
            </el-checkbox>
            <el-tag v-if="p.is_dept_head" size="small" type="warning">负责人</el-tag>
          </div>
        </el-checkbox-group>
        <el-empty v-if="currentDeptId && !filteredPersonnel.length" description="该部门无人员" :image-size="40" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { usePersonnelStore } from '@/stores/personnel'
import { buildOrgTree } from '@/utils/treeUtils'
import type { Personnel } from '@/types'

const props = defineProps<{
  modelValue: string | string[]
  deptId?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | string[]]
}>()

const personnelStore = usePersonnelStore()
const searchText = ref('')
const currentDeptId = ref(props.deptId || '')

const isMulti = computed(() => Array.isArray(props.modelValue))
const multiModel = computed(() => isMulti.value ? props.modelValue as string[] : [])
const singleModel = computed(() => isMulti.value ? '' : props.modelValue as string)

const treeData = computed(() => buildOrgTree(personnelStore.allPersonnel))

const deptPersonnel = computed(() => {
  if (!currentDeptId.value) return []
  return personnelStore.fetchByDept(currentDeptId.value)
})

const filteredPersonnel = computed(() => {
  if (!searchText.value) return deptPersonnel.value
  const q = searchText.value.toLowerCase()
  return deptPersonnel.value.filter(p => p.name.includes(q) || p.position.includes(q))
})

function onDeptClick(node: any) {
  currentDeptId.value = node.data?.dept_id || node.id
}

function onMultiChange(vals: string[]) {
  emit('update:modelValue', vals)
}

onMounted(async () => {
  await personnelStore.initPersonnelIfEmpty()
  await personnelStore.fetchAllPersonnel()
})
</script>

<style scoped>
.person-selector { border: 1px solid #dcdfe6; border-radius: 4px; padding: 10px; }
.selector-body { display: flex; gap: 10px; min-height: 200px; }
.tree-pane { width: 50%; max-height: 350px; overflow-y: auto; border-right: 1px solid #eee; padding-right: 5px; }
.list-pane { flex: 1; max-height: 350px; overflow-y: auto; }
.empty-hint { color: #999; text-align: center; padding-top: 40px; }
.mb-2 { margin-bottom: 8px; }
.person-check-item { padding: 4px 0; display: flex; align-items: center; gap: 6px; }
.pos-text { font-size: 12px; color: var(--text-muted); }
</style>
