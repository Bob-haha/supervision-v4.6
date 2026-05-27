<template>
  <div class="org-tree-panel">
    <el-tree
      :data="treeData"
      :props="{ label: 'label' }"
      node-key="id"
      show-checkbox
      check-strictly
      :default-checked-keys="modelValue"
      @check="onCheck"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { buildDeptTree } from '@/utils/treeUtils';

const props = defineProps<{
  modelValue: string[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string[]];
}>();

const treeData = computed(() => buildDeptTree());

function onCheck(_node: any, data: { checkedKeys: string[] }) {
  emit('update:modelValue', data.checkedKeys);
}
</script>

<style scoped>
.org-tree-panel {
  max-height: 400px;
  overflow-y: auto;
  padding: 5px;
}
</style>
