<template>
  <div class="process-panel">
    <!-- 无流程：挂载 -->
    <div v-if="!processNodes.length" class="empty-state">
      <el-empty description="未挂载流程模板" :image-size="60" />
      <el-button type="primary" size="small" @click="showPicker = true">挂载流程模板</el-button>
    </div>

    <!-- 有流程：展示环节进度 -->
    <div v-else>
      <div class="panel-header flex-between">
        <span class="section-subtitle">流程进度</span>
        <el-button size="small" icon="Plus" @click="showAddDialog = true">添加环节</el-button>
      </div>

      <div class="node-timeline">
        <div
          v-for="(node, idx) in processNodes"
          :key="node.id"
          class="node-item"
          :class="'node-' + node.status.toLowerCase()"
        >
          <div class="node-indicator">
            <el-icon v-if="node.status === 'COMPLETED'" class="done"><CircleCheck /></el-icon>
            <el-icon v-else-if="node.status === 'IN_PROGRESS'" class="progress"><Loading /></el-icon>
            <span v-else class="dot"></span>
            <div v-if="idx < processNodes.length - 1" class="connector"></div>
          </div>
          <div class="node-info">
            <div class="node-name">
              <span class="order">{{ idx + 1 }}</span>
              {{ node.node_name }}
              <el-tag size="small" :type="statusType(node.status)" class="ml-1">
                {{ statusLabel(node.status) }}
              </el-tag>
            </div>
            <div v-if="node.node_description" class="node-desc">{{ node.node_description }}</div>
            <div v-if="node.completed_at" class="node-time">完成于: {{ formatDate(node.completed_at) }}</div>
            <div class="node-actions mt-1">
              <el-button
                v-if="node.status !== 'COMPLETED'"
                link size="small" type="success"
                @click="completeNode(node.id)"
              >标记完成</el-button>
              <el-button link size="small" type="danger" @click="deleteNode(node.id)">删除</el-button>
            </div>
          </div>
        </div>
      </div>

      <el-button
        type="primary" plain size="small" class="mt-3"
        icon="FolderAdd"
        @click="saveAsTemplate"
      >保存为流程模板</el-button>
    </div>

    <!-- 模板选择器 -->
    <el-dialog v-model="showPicker" title="选择流程模板" width="500px" destroy-on-close>
      <el-radio-group v-model="selectedTemplateId" class="template-list">
        <el-radio
          v-for="tpl in processStore.templates"
          :key="tpl.id"
          :value="tpl.id"
          border
          class="template-radio"
        >{{ tpl.name }} <span class="text-gray">{{ tpl.description }}</span></el-radio>
      </el-radio-group>
      <el-empty v-if="!processStore.templates.length" description="暂无模板，请先创建" :image-size="60" />
      <template #footer>
        <el-button @click="showPicker = false">取消</el-button>
        <el-button type="primary" @click="doApply" :disabled="!selectedTemplateId">确认挂载</el-button>
      </template>
    </el-dialog>

    <!-- 添加环节对话框 -->
    <el-dialog v-model="showAddDialog" title="添加流程环节" width="450px" destroy-on-close>
      <el-form :model="newNode" label-width="80px">
        <el-form-item label="环节名称" required>
          <el-input v-model="newNode.node_name" />
        </el-form-item>
        <el-form-item label="环节说明">
          <el-input v-model="newNode.node_description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" @click="doAddNode">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, reactive } from 'vue';
import { useProcessStore } from '@/stores/process';
import { CircleCheck, Loading } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';

const props = defineProps<{ taskId: string }>();
const processStore = useProcessStore();
const processNodes = ref<any[]>([]);
const showPicker = ref(false);
const showAddDialog = ref(false);
const selectedTemplateId = ref('');
const newNode = reactive({ node_name: '', node_description: '' });

function statusType(s: string) {
  const map: Record<string, string> = { COMPLETED: 'success', IN_PROGRESS: '', PENDING: 'info' };
  return map[s] || 'info';
}

function statusLabel(s: string) {
  const map: Record<string, string> = { COMPLETED: '已完成', IN_PROGRESS: '进行中', PENDING: '待办理' };
  return map[s] || s;
}

function formatDate(s: string) { return s ? s.substring(0, 10) : ''; }

async function loadNodes() {
  processNodes.value = processStore.getTaskProcessNodes(props.taskId);
}

async function completeNode(nodeId: string) {
  await processStore.updateTaskNodeStatus(nodeId, 'COMPLETED');
  await loadNodes();
  ElMessage.success('环节已标记完成');
}

async function deleteNode(nodeId: string) {
  try {
    await ElMessageBox.confirm('确定删除该流程环节？', '删除确认', { type: 'warning' });
    await processStore.deleteTaskProcessNode(nodeId);
    await loadNodes();
    ElMessage.success('环节已删除');
  } catch { /* 取消 */ }
}

async function doApply() {
  if (!selectedTemplateId.value) return;
  await processStore.applyTemplateToTask(selectedTemplateId.value, props.taskId);
  showPicker.value = false;
  await loadNodes();
  ElMessage.success('流程模板已挂载');
}

async function doAddNode() {
  if (!newNode.node_name.trim()) return ElMessage.error('环节名称不能为空');
  await processStore.addTaskProcessNode(props.taskId, {
    node_name: newNode.node_name,
    node_description: newNode.node_description,
    node_type: 'TASK',
  });
  newNode.node_name = '';
  newNode.node_description = '';
  showAddDialog.value = false;
  await loadNodes();
  ElMessage.success('环节已添加');
}

async function saveAsTemplate() {
  try {
    const { value: name } = await ElMessageBox.prompt('请输入模板名称', '保存为流程模板');
    if (!name) return;
    await processStore.saveTaskFlowAsTemplate(props.taskId, {
      name,
      description: '',
      scope: '任务派生',
    });
    ElMessage.success('已保存为流程模板');
  } catch { /* 取消 */ }
}

onMounted(async () => {
  await processStore.fetchTemplates();
  await loadNodes();
});

watch(() => props.taskId, () => { loadNodes(); });
</script>

<style scoped>
.process-panel { padding: 10px 0; }
.empty-state { text-align: center; padding: 20px 0; }
.panel-header { margin-bottom: 15px; }
.section-subtitle { font-weight: bold; font-size: 15px; color: #0d2a61; }
.flex-between { display: flex; justify-content: space-between; align-items: center; }

.node-timeline { padding-left: 5px; }
.node-item { display: flex; gap: 12px; padding-bottom: 20px; position: relative; }
.node-indicator { display: flex; flex-direction: column; align-items: center; width: 24px; flex-shrink: 0; }
.node-indicator .done { color: #67c23a; font-size: 20px; }
.node-indicator .progress { color: #409eff; font-size: 20px; animation: spin 2s linear infinite; }
.node-indicator .dot { width: 12px; height: 12px; border-radius: 50%; background: #ccc; }
.connector { width: 2px; flex: 1; background: #ddd; margin-top: 4px; min-height: 24px; }

.node-info { flex: 1; padding-bottom: 5px; }
.node-name { font-size: 15px; font-weight: bold; color: #333; }
.node-name .order { display: inline-block; width: 20px; height: 20px; background: #409eff; color: #fff; border-radius: 50%; text-align: center; line-height: 20px; font-size: 12px; margin-right: 6px; }
.node-desc { font-size: 13px; color: #888; margin-top: 4px; }
.node-time { font-size: 12px; color: #67c23a; margin-top: 4px; }
.node-actions { display: flex; gap: 8px; }

.template-list { display: flex; flex-direction: column; gap: 10px; }
.template-radio { width: 100%; padding: 12px !important; margin-right: 0 !important; }

.ml-1 { margin-left: 8px; }
.mt-1 { margin-top: 6px; }
.mt-3 { margin-top: 15px; }
.text-gray { color: #999; font-size: 13px; }

@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>
