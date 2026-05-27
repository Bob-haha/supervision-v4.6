<template>
  <div class="desktop-container">
    <div class="desk-header">
      <span class="desk-title">流程模板库</span>
      <el-button type="primary" icon="Plus" @click="goCreate">新建模板</el-button>
    </div>

    <div class="template-grid mt-3">
      <el-card v-for="tpl in processStore.templates" :key="tpl.id" shadow="hover" class="template-card">
        <template #header>
          <div class="card-header">
            <span class="tpl-name">{{ tpl.name }}</span>
            <el-tag size="small">{{ tpl.scope || '通用' }}</el-tag>
          </div>
        </template>
        <p class="tpl-desc">{{ tpl.description || '暂无描述' }}</p>
        <div class="tpl-meta">
          <span class="text-gray">环节数: {{ getNodeCount(tpl.id) }}</span>
          <span class="text-gray">{{ formatDate(tpl.created_at) }}</span>
        </div>
        <div class="tpl-actions mt-2">
          <el-button size="small" type="primary" link @click="goEdit(tpl.id)">编辑</el-button>
          <el-button size="small" type="warning" link @click="applyToTask(tpl.id)">应用到任务</el-button>
          <el-button size="small" type="danger" link @click="handleDelete(tpl.id)">删除</el-button>
        </div>
      </el-card>
      <el-empty v-if="!processStore.templates.length" description="暂无流程模板，点击上方按钮新建" :image-size="80" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useProcessStore } from '@/stores/process';
import { useTaskStore } from '@/stores/task';
import { ElMessageBox, ElMessage } from 'element-plus';

const router = useRouter();
const processStore = useProcessStore();
const taskStore = useTaskStore();

function goCreate() { router.push('/process/template/new'); }
function goEdit(id: string) { router.push(`/process/template/${id}`); }

function getNodeCount(tplId: string): number {
  return processStore.getTemplateNodes(tplId).length;
}

function formatDate(s: string) { return s ? s.substring(0, 10) : ''; }

async function applyToTask(tplId: string) {
  const activeTasks = taskStore.tasks.filter(t => t.status !== 'COMPLETED');
  if (!activeTasks.length) {
    ElMessage.warning('暂无进行中的任务');
    return;
  }

  const { value: taskId } = await ElMessageBox.prompt('请选择目标任务ID（可在任务列表中查看）', '挂载流程模板', {
    inputType: 'text',
    inputPlaceholder: '请输入任务ID',
  }).catch(() => ({ value: '' }));

  if (!taskId) return;
  await processStore.applyTemplateToTask(tplId, taskId);
  ElMessage.success('流程已挂载到任务');
}

async function handleDelete(id: string) {
  try {
    await ElMessageBox.confirm('删除模板将同时删除其所有环节定义，确定继续？', '删除确认', { type: 'error' });
    await processStore.deleteTemplate(id);
    ElMessage.success('模板已删除');
  } catch { /* 取消 */ }
}

onMounted(async () => {
  await taskStore.fetchTasks();
  await processStore.fetchTemplates();
});
</script>

<style scoped>
.desktop-container { padding: 10px; }
.desk-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 5px; border-bottom: 1px solid #ddd; margin-bottom: 15px;
}
.desk-title { font-weight: bold; color: #0d2a61; border-left: 5px solid #0d2a61; padding-left: 12px; font-size: 18px; }
.template-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
.template-card { border-radius: 6px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.tpl-name { font-size: 16px; font-weight: bold; color: #0d2a61; }
.tpl-desc { color: #666; font-size: 14px; line-height: 1.5; min-height: 40px; }
.tpl-meta { display: flex; gap: 20px; margin-top: 8px; }
.tpl-actions { display: flex; gap: 8px; }
.mt-2 { margin-top: 10px; }
.mt-3 { margin-top: 15px; }
.text-gray { color: #999; font-size: 13px; }
</style>
