<template>
  <el-dialog v-model="visible" title="批量催办" width="500px" destroy-on-close>
    <div class="remind-body">
      <div class="section-label">对以下 {{ taskIds.length }} 个任务发送催办通知：</div>

      <el-form :model="form" label-width="80px" class="mt-3">
        <el-form-item label="催办内容" required>
          <el-input v-model="form.content" type="textarea" :rows="4"
            placeholder="请各部门加快办理进度，按时完成..." />
        </el-form-item>
        <el-form-item label="催办人">
          <el-input v-model="form.remindedBy" placeholder="催办人姓名" />
        </el-form-item>
      </el-form>
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="doRemind" :loading="sending">发送催办 ({{ taskIds.length }})</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useSupervisionStore } from '@/stores/supervision';
import { useAuthStore } from '@/stores/auth';
import { ElMessage } from 'element-plus';

const props = defineProps<{ taskIds: string[] }>();
const emit = defineEmits<{ done: [] }>();

const supervisionStore = useSupervisionStore();
const authStore = useAuthStore();
const visible = ref(false);
const sending = ref(false);
const form = reactive({ content: '', remindedBy: authStore.user?.name || '' });

function open() { visible.value = true; }

async function doRemind() {
  if (!form.content.trim()) return ElMessage.error('催办内容不能为空');
  sending.value = true;
  try {
    await supervisionStore.sendBatchReminders(props.taskIds, form.content, form.remindedBy);
    ElMessage.success(`已对 ${props.taskIds.length} 个任务发送催办`);
    visible.value = false;
    emit('done');
  } finally {
    sending.value = false;
  }
}

defineExpose({ open });
</script>

<style scoped>
.remind-body { padding: 10px; }
.section-label { font-size: 15px; color: #333; }
.mt-3 { margin-top: 15px; }
</style>
