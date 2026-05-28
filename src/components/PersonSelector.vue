<template>
  <div class="person-selector">
    <el-input
      v-model="searchText"
      placeholder="搜索人员姓名..."
      clearable
      size="default"
      class="mb-2"
    />
    <div class="selector-body">
      <div class="tree-pane">
        <el-tree
          :data="treeData"
          :props="{ children: 'children', label: 'label' }"
          node-key="id"
          highlight-current
          @node-click="onDeptClick"
          :expand-on-click-node="true"
        />
      </div>
      <div class="list-pane">
        <div v-if="!currentDeptId" class="empty-hint">请选择左侧部门</div>
        <el-table
          v-else
          :data="filteredPersonnel"
          size="small"
          max-height="320"
          highlight-current-row
          @row-click="onSelect"
        >
          <el-table-column prop="name" label="姓名" width="90" />
          <el-table-column prop="position" label="职务" />
          <el-table-column width="60" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.is_dept_head" size="small" type="warning">负责人</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
    <div v-if="modelValue" class="selected-info">
      <el-tag closable @close="$emit('update:modelValue', '')">
        已选: {{ selectedName }}
      </el-tag>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { usePersonnelStore } from '@/stores/personnel';
import { buildOrgTree } from '@/utils/treeUtils';
import type { Personnel } from '@/types';

const props = defineProps<{
  modelValue: string;
  deptId?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const personnelStore = usePersonnelStore();
const searchText = ref('');
const currentDeptId = ref(props.deptId || '');

const treeData = computed(() => buildOrgTree(personnelStore.allPersonnel));

const deptPersonnel = computed(() => {
  if (!currentDeptId.value) return [];
  return personnelStore.fetchByDept(currentDeptId.value);
});

const filteredPersonnel = computed(() => {
  if (!searchText.value) return deptPersonnel.value;
  const q = searchText.value.toLowerCase();
  return deptPersonnel.value.filter(
    p => p.name.includes(q) || p.position.includes(q),
  );
});

const selectedName = computed(() => {
  const p = personnelStore.allPersonnel.find(p => p.name === props.modelValue);
  return p ? `${p.name} - ${p.position}` : props.modelValue;
});

function onDeptClick(node: any) {
  if (node.data) {
    currentDeptId.value = node.data.dept_id;
  } else {
    currentDeptId.value = node.id;
  }
}

function onSelect(row: Personnel) {
  emit('update:modelValue', row.name);
}

onMounted(async () => {
  await personnelStore.initPersonnelIfEmpty();
  await personnelStore.fetchAllPersonnel();
});
</script>

<style scoped>
.person-selector {
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 10px;
}
.selector-body {
  display: flex;
  gap: 10px;
  min-height: 200px;
}
.tree-pane {
  width: 45%;
  max-height: 350px;
  overflow-y: auto;
  border-right: 1px solid #eee;
  padding-right: 5px;
}
.list-pane {
  flex: 1;
  max-height: 350px;
  overflow-y: auto;
}
.empty-hint {
  color: #999;
  text-align: center;
  padding-top: 40px;
}
.selected-info {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #eee;
}
.mb-2 {
  margin-bottom: 8px;
}
</style>
