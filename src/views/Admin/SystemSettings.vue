<template>
  <div class="desktop-container">
    <div class="desk-header">
      <span class="desk-title">系统设置</span>
    </div>
    <el-card shadow="never" class="modern-card">
      <el-form :model="form" label-width="140px" size="default">
        <el-divider content-position="left">通用设置</el-divider>
        <el-form-item label="系统名称">
          <el-input v-model="form.systemName" />
        </el-form-item>
        <el-form-item label="数据刷新间隔">
          <el-select v-model="form.refreshInterval" style="width:200px">
            <el-option label="30秒" value="30" />
            <el-option label="1分钟" value="60" />
            <el-option label="5分钟" value="300" />
          </el-select>
        </el-form-item>
        <el-divider content-position="left">P2P同步设置</el-divider>
        <el-form-item label="自动同步">
          <el-switch v-model="form.autoSync" />
        </el-form-item>
        <el-form-item label="同步端口">
          <el-input-number v-model="form.syncPort" :min="1024" :max="65535" />
        </el-form-item>
        <el-divider content-position="left">关于</el-divider>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="版本">V3.0</el-descriptions-item>
          <el-descriptions-item label="技术栈">Vue 3 + TypeScript + Element Plus + SQL.js</el-descriptions-item>
          <el-descriptions-item label="数据库">SQLite (浏览器本地存储)</el-descriptions-item>
          <el-descriptions-item label="同步方式">P2P 内网点对点同步</el-descriptions-item>
        </el-descriptions>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';

const form = reactive({
  systemName: '督办管理系统',
  refreshInterval: '60',
  autoSync: true,
  syncPort: 3000,
});
</script>

<style scoped>
.desktop-container { padding: 10px; }
.desk-header { padding: 10px 5px; border-bottom: 1px solid var(--border-color); margin-bottom: 20px; }
.desk-title { font-weight: 700; color: var(--color-primary); border-left: 4px solid var(--color-primary-light); padding-left: 14px; font-size: var(--font-size-xl); }
.modern-card { border-radius: var(--radius-md); border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); }
:deep(.modern-card .el-card__body) { padding: 24px; }
</style>
