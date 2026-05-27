<template>
  <div class="collaboration-panel">
    <!-- 直接分派 -->
    <div class="section">
      <div class="section-header flex-between">
        <span class="section-subtitle">直接分派协作人</span>
        <el-button size="small" icon="Plus" @click="showAddCollab = true">添加协作人</el-button>
      </div>

      <div v-if="!collabList.length" class="text-gray text-center py-2">暂无协作人</div>
      <div v-for="c in collabList" :key="c.id" class="collab-item">
        <div class="collab-info">
          <span class="collab-name">{{ c.person_name }}</span>
          <span class="collab-dept">{{ DEPT_MAP[c.dept_id] || c.dept_id }}</span>
          <el-tag size="small" :type="c.status === 'COMPLETED' ? 'success' : 'info'">
            {{ c.status === 'COMPLETED' ? '已反馈' : '待反馈' }}
          </el-tag>
        </div>
        <div v-if="c.feedback" class="collab-feedback">{{ c.feedback }}</div>
        <div class="collab-actions mt-1">
          <el-button link size="small" type="danger" @click="removeCollab(c.id)">移除</el-button>
        </div>
      </div>
    </div>

    <!-- 添加协作人对话框 -->
    <el-dialog v-model="showAddCollab" title="添加协作人" width="500px" destroy-on-close>
      <PersonSelector v-model="selectedPerson" />
      <template #footer>
        <el-button @click="showAddCollab = false">取消</el-button>
        <el-button type="primary" @click="doAddCollab" :disabled="!selectedPerson">确认添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useCollaborationStore } from '@/stores/collaboration';
import { useAuthStore } from '@/stores/auth';
import { DEPT_MAP } from '@/constants';
import PersonSelector from '@/components/PersonSelector.vue';
import { ElMessage } from 'element-plus';

const props = defineProps<{ taskId: string }>();
const collaborationStore = useCollaborationStore();
const authStore = useAuthStore();
const collabList = ref<any[]>([]);
const showAddCollab = ref(false);
const selectedPerson = ref('');

async function loadCollaborators() {
  collabList.value = collaborationStore.getTaskCollaborators(props.taskId);
}

async function doAddCollab() {
  if (!selectedPerson.value) return;
  // 从 personnel store 获取部门
  const deptId = authStore.user?.deptId || '';
  await collaborationStore.addCollaborator(props.taskId, {
    deptId,
    personName: selectedPerson.value,
    assignedBy: authStore.user?.name || '',
  });
  selectedPerson.value = '';
  showAddCollab.value = false;
  await loadCollaborators();
  ElMessage.success('协作人已添加');
}

async function removeCollab(id: string) {
  await collaborationStore.removeCollaborator(id, props.taskId);
  await loadCollaborators();
  ElMessage.success('协作人已移除');
}

onMounted(() => loadCollaborators());
</script>

<style scoped>
.collaboration-panel { padding: 10px 0; }
.section { margin-bottom: 20px; }
.section-header { margin-bottom: 10px; }
.section-subtitle { font-weight: bold; font-size: 15px; color: #0d2a61; }
.flex-between { display: flex; justify-content: space-between; align-items: center; }

.collab-item {
  padding: 10px; border: 1px solid #ebeef5; border-radius: 6px; margin-bottom: 8px;
  background: #fdfdfd;
}
.collab-info { display: flex; align-items: center; gap: 10px; }
.collab-name { font-weight: bold; color: #333; }
.collab-dept { font-size: 13px; color: #888; }
.collab-feedback { margin-top: 6px; padding: 8px; background: #f5f7fa; border-radius: 4px; font-size: 13px; color: #555; }
.collab-actions { display: flex; gap: 8px; }

.mt-1 { margin-top: 6px; }
.text-gray { color: #999; }
.text-center { text-align: center; }
.py-2 { padding: 16px 0; }
</style>
