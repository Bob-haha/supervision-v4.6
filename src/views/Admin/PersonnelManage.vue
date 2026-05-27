<template>
  <div class="desktop-container">
    <div class="desk-header">
      <span class="desk-title">人员管理</span>
      <el-button type="primary" icon="Plus">新增人员</el-button>
    </div>
    <el-card shadow="never" class="modern-card">
      <el-table :data="personnel" stripe size="default" style="width:100%">
        <el-table-column prop="name" label="姓名" width="120" />
        <el-table-column label="所属科室" min-width="180">
          <template #default="{ row }">{{ DEPT_MAP[row.dept_id] || row.dept_id }}</template>
        </el-table-column>
        <el-table-column prop="position" label="职务" min-width="150" />
        <el-table-column label="是否负责人" width="100" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.is_dept_head" type="warning" size="small">负责人</el-tag>
            <span v-else class="text-gray">-</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { usePersonnelStore } from '@/stores/personnel';
import { DEPT_MAP } from '@/constants';

const personnelStore = usePersonnelStore();
const personnel = ref<any[]>([]);

onMounted(async () => {
  await personnelStore.initPersonnelIfEmpty();
  await personnelStore.fetchAllPersonnel();
  personnel.value = personnelStore.allPersonnel;
});
</script>

<style scoped>
.desktop-container { padding: 10px; }
.desk-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 5px; border-bottom: 1px solid var(--border-color); margin-bottom: 20px; }
.desk-title { font-weight: 700; color: var(--color-primary); border-left: 4px solid var(--color-primary-light); padding-left: 14px; font-size: var(--font-size-xl); }
.modern-card { border-radius: var(--radius-md); border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); }
:deep(.modern-card .el-card__body) { padding: 0; }
.text-gray { color: var(--text-tertiary); }
</style>
