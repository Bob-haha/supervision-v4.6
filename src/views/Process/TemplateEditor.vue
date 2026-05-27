<template>
  <div class="desktop-container">
    <div class="desk-header">
      <span class="desk-title">{{ isNew ? '新建流程模板' : '编辑流程模板' }}</span>
      <el-button icon="ArrowLeft" @click="$router.back()">返回</el-button>
    </div>

    <el-card shadow="never" class="mt-3">
      <el-form :model="form" label-width="100px" size="default">
        <el-form-item label="模板名称" required>
          <el-input v-model="form.name" placeholder="如：公文办理标准流程" />
        </el-form-item>
        <el-form-item label="模板说明">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="描述模板用途..." />
        </el-form-item>
        <el-form-item label="适用范围">
          <el-input v-model="form.scope" placeholder="如：全关通用、办公室专用" />
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 流程环节管理 -->
    <el-card shadow="never" class="mt-3" header="流程环节定义">
      <div v-if="!nodes.length" class="empty-nodes">
        <el-empty description="暂无环节，请添加" :image-size="60" />
      </div>
      <div v-for="(node, idx) in nodes" :key="node.id" class="node-card">
        <div class="node-order">{{ idx + 1 }}</div>
        <div class="node-body">
          <el-row :gutter="12">
            <el-col :span="8">
              <el-input v-model="node.node_name" placeholder="环节名称" size="small" />
            </el-col>
            <el-col :span="6">
              <el-select v-model="node.node_type" size="small" style="width:100%">
                <el-option v-for="(l, v) in NODE_TYPE_MAP" :key="v" :label="l" :value="v" />
              </el-select>
            </el-col>
            <el-col :span="8">
              <el-input v-model="node.node_description" placeholder="环节说明" size="small" />
            </el-col>
            <el-col :span="2">
              <el-button link type="danger" size="small" icon="Delete" @click="removeNode(idx)" />
            </el-col>
          </el-row>
          <div class="node-actions mt-1">
            <el-button link size="small" icon="Top" @click="moveUp(idx)" :disabled="idx === 0">上移</el-button>
            <el-button link size="small" icon="Bottom" @click="moveDown(idx)" :disabled="idx === nodes.length - 1">下移</el-button>
          </div>
        </div>
      </div>
      <el-button class="mt-3" icon="Plus" @click="addNode">添加环节</el-button>
    </el-card>

    <div class="mt-4 flex-right">
      <el-button size="large" @click="$router.back()">取消</el-button>
      <el-button type="primary" size="large" @click="doSave" :loading="saving">保存模板</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useProcessStore } from '@/stores/process';
import { NODE_TYPE_MAP } from '@/constants';
import { v4 as uuidv4 } from 'uuid';
import { ElMessage } from 'element-plus';

const route = useRoute();
const router = useRouter();
const processStore = useProcessStore();
const saving = ref(false);

const templateId = (route.params.id as string) || '';
const isNew = !templateId || templateId === 'new';

interface NodeEdit {
  id: string;
  node_name: string;
  node_description: string;
  node_type: string;
}

const form = reactive({ name: '', description: '', scope: '' });
const nodes = ref<NodeEdit[]>([]);

function addNode() {
  nodes.value.push({ id: uuidv4(), node_name: '', node_description: '', node_type: 'TASK' });
}

function removeNode(idx: number) { nodes.value.splice(idx, 1); }

function moveUp(idx: number) {
  if (idx === 0) return;
  [nodes.value[idx], nodes.value[idx - 1]] = [nodes.value[idx - 1], nodes.value[idx]];
}

function moveDown(idx: number) {
  if (idx === nodes.value.length - 1) return;
  [nodes.value[idx], nodes.value[idx + 1]] = [nodes.value[idx + 1], nodes.value[idx]];
}

async function doSave() {
  if (!form.name.trim()) return ElMessage.error('模板名称不能为空');
  saving.value = true;
  try {
    let id = templateId;
    if (isNew) {
      id = await processStore.createTemplate({ ...form });
    } else {
      await processStore.updateTemplate(templateId, { ...form });
      processStore.getTemplateNodes(templateId).forEach(n => processStore.deleteProcessNode(n.id));
    }

    for (let i = 0; i < nodes.value.length; i++) {
      const n = nodes.value[i];
      if (n.node_name.trim()) {
        await processStore.addProcessNode(id, {
          node_name: n.node_name,
          node_description: n.node_description,
          node_type: n.node_type,
        });
      }
    }
    ElMessage.success('模板已保存');
    router.push('/process/templates');
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  if (!isNew) {
    await processStore.fetchTemplates();
    const tpl = processStore.templates.find(t => t.id === templateId);
    if (tpl) {
      form.name = tpl.name;
      form.description = tpl.description;
      form.scope = tpl.scope;
      const tplNodes = processStore.getTemplateNodes(templateId);
      nodes.value = tplNodes.map(n => ({
        id: n.id,
        node_name: n.node_name,
        node_description: n.node_description,
        node_type: n.node_type,
      }));
    }
  }
});
</script>

<style scoped>
.desktop-container { padding: 10px; }
.desk-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 5px; border-bottom: 1px solid #ddd; margin-bottom: 15px;
}
.desk-title { font-weight: bold; color: #0d2a61; border-left: 5px solid #0d2a61; padding-left: 12px; font-size: 18px; }
.node-card {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 12px; margin-bottom: 10px; background: #f8faff;
  border: 1px solid #eef2f8; border-radius: 6px;
}
.node-order {
  width: 30px; height: 30px; border-radius: 50%; background: #409eff;
  color: #fff; display: flex; align-items: center; justify-content: center;
  font-weight: bold; font-size: 14px; flex-shrink: 0;
}
.node-body { flex: 1; }
.node-actions { display: flex; gap: 6px; }
.empty-nodes { padding: 20px 0; }
.mt-1 { margin-top: 6px; }
.mt-3 { margin-top: 15px; }
.mt-4 { margin-top: 20px; }
.flex-right { display: flex; justify-content: flex-end; gap: 12px; }
</style>
