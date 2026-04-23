<template>
  <el-drawer
    v-model="visible"
    :title="'督办详情：' + (task?.title || '')"
    size="45%"
    destroy-on-close
    @closed="handleClosed"
  >
    <div v-if="task" class="drawer-content">
      <!-- 1. 状态条与办结动作 -->
      <div class="drawer-status-bar">
        <el-tag :type="realtimeStatus === 'COMPLETED' ? 'success' : 'warning'" effect="dark">
          {{ STATUS_MAP[realtimeStatus] }}
        </el-tag>
        
        <!-- 权限：管理员、领导或办公室(dept_02)可办结 -->
        <el-button 
          v-if="task.status !== 'COMPLETED' && (authStore.user?.role !== 'STAFF' || authStore.user?.deptId === 'dept_02')" 
          type="success" size="small" icon="CircleCheck" @click="handleComplete"
        >
          确认办结并销号
        </el-button>
      </div>

      <!-- 2. 基本信息与分科要求 -->
      <el-descriptions :column="1" border class="mt-4">
        <el-descriptions-item label="办结时限">
          <span :class="{ 'text-danger': realtimeStatus === 'OVERDUE' }">
            {{ task.deadline || '未设置' }}
          </span>
        </el-descriptions-item>
        
        <!-- 核心修复：分科室详细要求展示 -->
        <el-descriptions-item label="分科详细要求">
          <template v-if="Object.keys(allReqs).length > 0">
            <div v-for="(req, dId) in allReqs" :key="dId" class="req-display-item">
              <el-tag size="small" :type="isOwner(String(dId)) ? 'danger' : 'info'">
                {{ DEPT_MAP[dId] || dId }} {{ isOwner(String(dId)) ? '(主办)' : '(协办)' }}
              </el-tag>
              <div class="req-text">{{ req || '执行公共要求事项' }}</div>
            </div>
          </template>
          <div v-else class="text-gray">暂无分科具体要求，执行公共要求。</div>
        </el-descriptions-item>

        <el-descriptions-item label="事项描述/公共要求">
          <div class="content-box">{{ task.content || '暂无详细描述' }}</div>
        </el-descriptions-item>
      </el-descriptions>

      <!-- 3. 办理留痕时间轴 -->
      <div class="timeline-section">
        <div class="section-title">办理全过程留痕</div>
        <el-timeline v-if="timeline.length">
          <el-timeline-item 
            v-for="item in timeline" :key="item.id" 
            :timestamp="formatDate(item.time)" 
            :color="item.type === 'comment' ? '#722ed1' : '#52c41a'"
          >
            <el-card shadow="never" class="timeline-card">
              <div class="card-header">
                <span :class="item.type" style="font-weight: bold">
                  {{ item.type === 'comment' ? '领导批示' : '进展汇报' }}：{{ item.name }}
                </span>
              </div>
              <p class="card-body">{{ item.content }}</p>
              
              <!-- 附件区 -->
              <div v-if="item.files && item.files.length > 0" class="card-attachments">
                <div class="attach-list">
                  <el-link v-for="(file, fIdx) in item.files" :key="fIdx" 
                    :type="isImage(file.name) ? 'primary' : 'success'"
                    :href="file.data" :download="file.name" 
                    :icon="isImage(file.name) ? 'Picture' : 'Document'"
                    class="mr-2"
                  >
                    {{ file.name }}
                  </el-link>
                </div>
              </div>
            </el-card>
          </el-timeline-item>
        </el-timeline>
        <el-empty v-else description="暂无记录，请在下方提交进展或批示" :image-size="80" />
      </div>

      <!-- 4. 底部录入区 -->
      <div class="input-section" v-if="authStore.user">
        <el-divider />
        <el-input 
          v-model="inputContent" 
          type="textarea" 
          :rows="3" 
          :placeholder="authStore.user.role === 'STAFF' ? '汇报当前办理进展情况...' : '录入领导指示、批示内容...'" 
        />
        
        <div class="flex-between mt-2">
          <el-upload 
            action="#" 
            multiple 
            :auto-upload="false" 
            :on-change="onFileChange" 
            :file-list="tempFileList"
          >
            <el-button size="small" icon="Upload">附件证明</el-button>
          </el-upload>
          
          <div class="btn-group">
            <el-button 
              v-if="authStore.user.role !== 'STAFF'" 
              type="primary" 
              @click="doSubmit('comment')"
            >发布批示</el-button>
            <el-button 
              v-else-if="isRelatedStaff" 
              type="success" 
              @click="doSubmit('feedback')"
            >提交进展</el-button>
          </div>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { DEPT_MAP, STATUS_MAP } from '@/constants';
import { formatDate, safeParse } from '@/utils';
import { useTaskStore } from '@/stores/task';
import { useAuthStore } from '@/stores/auth';

const taskStore = useTaskStore();
const authStore = useAuthStore();

// --- 状态变量 ---
const visible = ref(false);
const task = ref<any>(null);
const timeline = ref<any[]>([]);
const inputContent = ref('');
const tempFileList = ref<any[]>([]);

// --- 计算属性 ---

// 1. 实时状态
const realtimeStatus = computed(() => {
  if (!task.value) return 'PENDING';
  if (task.value.status === 'COMPLETED') return 'COMPLETED';
  const now = new Date().toISOString().split('T')[0];
  return (task.value.deadline && task.value.deadline < now) ? 'OVERDUE' : 'PENDING';
});

// 2. 核心修复：解析并合并所有科室要求
const allReqs = computed(() => {
  if (!task.value) return {};
  const ownerReqs = safeParse(task.value.dept_requirements, {});
  const coReqs = safeParse(task.value.co_dept_requirements, {});
  
  // 合并后，过滤掉完全没有写内容的项
  const combined = { ...ownerReqs, ...coReqs };
  const filtered: any = {};
  Object.keys(combined).forEach(key => {
    if (combined[key]) filtered[key] = combined[key];
  });
  return filtered;
});

// 3. 判定当前用户是否为该任务的相关承办人
const isRelatedStaff = computed(() => {
  const myId = authStore.user?.deptId;
  if (!myId || !task.value) return false;
  return (task.value.owner_dept_ids || []).includes(myId) || 
         (task.value.co_dept_ids || []).includes(myId);
});

// --- 方法 ---

const isOwner = (id: string) => task.value?.owner_dept_ids?.includes(id);

const open = async (targetTask: any) => {
  task.value = targetTask;
  await loadTimeline();
  visible.value = true;
};

// 加载合并的时间轴
const loadTimeline = async () => {
  if (!task.value) return;
  
  // 获取进展数据
  const fs = taskStore.getTaskFeedbacks(task.value.id).map(i => ({ 
    ...i, 
    type: 'feedback', 
    time: i.feedback_time, 
    name: DEPT_MAP[i.dept_id] || i.dept_id,
    files: safeParse(i.attachments, []) 
  }));
  
  // 获取批示数据
  const cs = taskStore.getTaskComments(task.value.id).map(i => ({ 
    ...i, 
    type: 'comment', 
    time: i.created_at, 
    name: i.leader_name,
    files: safeParse(i.attachments, []) 
  }));
  
  // 合并并按时间倒序排列
  timeline.value = [...fs, ...cs].sort((a, b) => 
    new Date(b.time).getTime() - new Date(a.time).getTime()
  );
};

const onFileChange = (file: any) => {
  const reader = new FileReader();
  reader.readAsDataURL(file.raw);
  reader.onload = () => {
    tempFileList.value.push({ name: file.name, data: reader.result });
  };
};

const doSubmit = async (type: 'comment' | 'feedback') => {
  if (!inputContent.value.trim()) return ElMessage.warning('内容不能为空');
  if (!authStore.user) return;
  
  try {
    const commonData = {
      taskId: task.value.id,
      content: inputContent.value,
      attachments: tempFileList.value 
    };

    if (type === 'comment') {
      await taskStore.addLeaderComment({ 
        ...commonData, 
        leaderName: authStore.user.name 
      });
    } else {
      await taskStore.addFeedback({ 
        ...commonData, 
        deptId: authStore.user.deptId, 
        person: authStore.user.name 
      });
    }
    
    inputContent.value = '';
    tempFileList.value = [];
    ElMessage.success('提交成功');
    await loadTimeline(); // 刷新时间轴
  } catch (e) {
    ElMessage.error('保存失败');
  }
};

const handleComplete = () => {
  ElMessageBox.confirm('确认该督办事项已完全办结吗？办结后将正式归档。', '办结确认', {
    confirmButtonText: '确定办结',
    cancelButtonText: '取消',
    type: 'success'
  }).then(async () => {
    await taskStore.completeTask(task.value.id);
    visible.value = false;
    // 触发 Store 刷新，通知 index.vue 更新列表
    await taskStore.fetchTasks();
    ElMessage.success('事项已成功办结');
  });
};

const isImage = (name: string) => /\.(jpg|jpeg|png|gif|webp)$/i.test(name);
const handleClosed = () => { task.value = null; timeline.value = []; };

defineExpose({ open });
</script>

<style scoped>
@import "../style.css";

/* 抽屉内部专用 */
.drawer-content {
    padding: 0 30px 30px;
}

.drawer-status-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px 0;
    margin-bottom: 20px;
    border-bottom: 1px solid #ebeef5;
}

/* 字体加大补丁 */
:deep(.el-descriptions__label) {
    font-size: 16px;
    font-weight: bold;
    width: 120px;
}

:deep(.el-descriptions__content) {
    font-size: 16px;
}

.content-box {
    background: #f9f9f9;
    padding: 20px;
    border-radius: 6px;
    line-height: 1.8;
    color: #444;
    font-size: 17px;
    white-space: pre-wrap;
}

/* 分科要求 */
.req-display-item {
    background: #fff7e6;
    padding: 12px 15px;
    border-radius: 6px;
    margin-bottom: 10px;
    border-left: 5px solid #ffa940;
}

.req-text {
    margin-top: 8px;
    font-size: 15px;
    color: #555;
}

/* 时间轴 */
.timeline-section {
    margin-top: 40px;
}

.section-title {
    font-size: 18px;
    font-weight: bold;
    color: #0d2a61;
    margin-bottom: 20px;
    border-bottom: 2px solid #eee;
    padding-bottom: 10px;
}

.timeline-card {
    background-color: #fdfdfd;
    border: 1px solid #eef2f8;
}

.card-header {
    font-size: 16px;
    font-weight: bold;
    margin-bottom: 10px;
    color: #333;
}

.card-body {
    font-size: 16px;
    line-height: 1.6;
    color: #444;
}

/* 附件栏 */
.card-attachments {
    margin-top: 15px;
    padding: 12px;
    background: #f8faff;
    border-radius: 4px;
}

.attach-list {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
}

.input-section {
    margin-top: 30px;
}

/* 全局工具类 */
.mb-4 { margin-bottom: 20px; }
.mt-2 { margin-top: 10px; }
.flex-between { display: flex; justify-content: space-between; align-items: flex-start; }
.text-right { text-align: right; }
</style>