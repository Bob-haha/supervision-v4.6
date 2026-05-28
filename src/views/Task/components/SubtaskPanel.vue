<template>
  <div class="subtask-panel">
    <!-- 汇总条 -->
    <div class="summary-bar">
      <div class="summary-item">
        <span class="summary-num">{{ summary.total }}</span>
        <span class="summary-label">总计</span>
      </div>
      <div class="summary-item completed">
        <span class="summary-num">{{ summary.completed }}</span>
        <span class="summary-label">已完成</span>
      </div>
      <div class="summary-item in-progress">
        <span class="summary-num">{{ summary.inProgress }}</span>
        <span class="summary-label">进行中</span>
      </div>
      <div class="summary-item overdue">
        <span class="summary-num">{{ summary.overdue }}</span>
        <span class="summary-label">超期</span>
      </div>
    </div>

    <div class="section-header flex-between mt-3">
      <span class="section-subtitle">子任务列表</span>
      <el-button size="small" icon="Plus" @click="showCreate = true">新增子任务</el-button>
    </div>

    <div v-if="!subtasks.length" class="text-gray text-center py-2">暂无子任务</div>
    <el-table v-else :data="subtasks" size="small" max-height="300" @row-click="viewSubtask">
      <el-table-column prop="title" label="标题" min-width="160" />
      <el-table-column label="主办部门" width="140">
        <template #default="{ row }">
          {{ DEPT_MAP[row.owner_dept_ids[0]] || '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="deadline" label="时限" width="110" />
      <el-table-column label="状态" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row)" size="small">{{ STATUS_MAP[getRealStatus(row)] }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="进度" width="100">
        <template #default="{ row }">
          <el-progress :percentage="row.progress || 0" :stroke-width="6" />
        </template>
      </el-table-column>
      <el-table-column width="60" align="center">
        <template #default="{ row }">
          <el-button link type="danger" size="small" icon="Delete" @click.stop="handleDelete(row.id)" />
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useTaskStore } from '@/stores/task';
import { DEPT_MAP, STATUS_MAP } from '@/constants';
import { ElMessage, ElMessageBox } from 'element-plus';

const props = defineProps<{ taskId: string }>();
const emit = defineEmits<{ createSubtask: [parentId: string] }>();
const taskStore = useTaskStore();
const showCreate = ref(false);

const subtasks = computed(() => taskStore.getSubtasks(props.taskId));
const summary = computed(() => taskStore.getSubtaskSummary(props.taskId));

function getRealStatus(t: any): string {
  if (t.status === 'COMPLETED') return 'COMPLETED';
  const now = new Date().toISOString().split('T')[0];
  if (t.deadline && t.deadline < now) return 'OVERDUE';
  return 'PENDING';
}

function getStatusType(t: any) {
  const s = getRealStatus(t);
  if (s === 'COMPLETED') return 'success';
  if (s === 'OVERDUE') return 'danger';
  return '';
}

function viewSubtask(_task: any) {
  emit('createSubtask', props.taskId);
}

async function handleDelete(id: string) {
  try {
    await ElMessageBox.confirm('确定删除该子任务？', '删除确认', { type: 'warning' });
    await taskStore.deleteTask(id);
    ElMessage.success('子任务已删除');
  } catch { /* 取消 */ }
}

onMounted(() => taskStore.fetchTasks());
</script>

<style scoped>
.subtask-panel { padding: 10px 0; }
.summary-bar { display: flex; gap: 16px; margin-bottom: 15px; }
.summary-item {
  flex: 1; text-align: center; padding: 12px; border-radius: 8px;
  background: #f4f7fa; border: 1px solid #ebeef5;
}
.summary-item.completed { border-color: #67c23a; background: #f0f9eb; }
.summary-item.in-progress { border-color: #409eff; background: #ecf5ff; }
.summary-item.overdue { border-color: #f56c6c; background: #fef0f0; }
.summary-num { font-size: 24px; font-weight: bold; display: block; color: #0d2a61; }
.summary-label { font-size: 12px; color: #888; margin-top: 2px; }
.section-header { margin-bottom: 10px; }
.section-subtitle { font-weight: bold; font-size: 15px; color: #0d2a61; }
.flex-between { display: flex; justify-content: space-between; align-items: center; }
.mt-3 { margin-top: 15px; }
.text-gray { color: #999; }
.text-center { text-align: center; }
.py-2 { padding: 16px 0; }
</style>
