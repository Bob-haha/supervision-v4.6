<template>
  <div class="desktop-container">
    <div class="desk-header">
      <span class="desk-title">角色权限管理</span>
    </div>
    <el-card shadow="never" class="modern-card">
      <el-table :data="roles" stripe size="default" style="width:100%">
        <el-table-column prop="label" label="角色名称" width="180" />
        <el-table-column label="可创建任务" width="120" align="center">
          <template #default="{ row }"><el-tag :type="row.canCreate ? 'success' : 'info'" size="small">{{ row.canCreate ? '是' : '否' }}</el-tag></template>
        </el-table-column>
        <el-table-column label="可批示" width="100" align="center">
          <template #default="{ row }"><el-tag :type="row.canComment ? 'success' : 'info'" size="small">{{ row.canComment ? '是' : '否' }}</el-tag></template>
        </el-table-column>
        <el-table-column label="可督办" width="100" align="center">
          <template #default="{ row }"><el-tag :type="row.canSupervise ? 'success' : 'info'" size="small">{{ row.canSupervise ? '是' : '否' }}</el-tag></template>
        </el-table-column>
        <el-table-column label="数据范围" min-width="200">
          <template #default="{ row }"><span class="text-gray">{{ row.dataScope }}</span></template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
const roles = [
  { label: '统筹管理员', canCreate: true, canComment: true, canSupervise: true, dataScope: '全关区' },
  { label: '关领导', canCreate: false, canComment: true, canSupervise: true, dataScope: '全关区' },
  { label: '科室负责人', canCreate: true, canComment: false, canSupervise: false, dataScope: '本科室' },
  { label: '科室关员', canCreate: false, canComment: false, canSupervise: false, dataScope: '本人相关' },
];
</script>

<style scoped>
.desktop-container { padding: 10px; }
.desk-header { padding: 10px 5px; border-bottom: 1px solid var(--border-color); margin-bottom: 20px; }
.desk-title { font-weight: 700; color: var(--color-primary); border-left: 4px solid var(--color-primary-light); padding-left: 14px; font-size: var(--font-size-xl); }
.modern-card { border-radius: var(--radius-md); border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); }
:deep(.modern-card .el-card__body) { padding: 0; }
.text-gray { color: var(--text-tertiary); }
</style>
