<template>
  <div class="desktop-container">
    <div class="desk-header">
      <span class="desk-title">历史办结归档事项</span>
    </div>

    <div class="task-list-card">
      <div class="doc-list">
        <!-- 列表头 -->
        <div class="doc-item list-header">
          <span class="doc-tag-head">类型</span>
          <span class="doc-sender-head">承办科室</span>
          <span class="doc-title-head">督办事项标题</span>
          <span class="doc-status-head">最终状态</span>
          <span class="doc-time-head">归档时间</span>
          <span class="doc-actions-head">操作</span>
        </div>

        <!-- 历史条目 -->
        <div v-for="task in historyTasks" :key="task.id" class="doc-item archived" @click="viewDetail(task)">
          <span class="doc-tag archived-tag">归档</span>
          <span class="doc-sender">{{ getDeptLabel(task.owner_dept_ids, task.co_dept_ids) }}</span>
          <span class="doc-title">{{ task.title }}</span>
          <span class="doc-status COMPLETED">已办结</span>
          <span class="doc-time">{{ formatDate(task.created_at) }}</span>
          
          <div class="doc-actions" @click.stop>
             <el-button link type="primary" @click="viewDetail(task)">详情</el-button>
             <el-button link type="danger" @click="handleDelete(task.id)">删除</el-button>
          </div>
        </div>
        
        <el-empty v-if="!historyTasks.length" description="暂无已归档的历史记录" />
      </div>
    </div>

    <!-- 历史任务详情抽屉 -->
    <el-drawer v-model="drawerVisible" :title="'历史详情：' + currentTask?.title" size="45%" destroy-on-close>
      <div v-if="currentTask" class="drawer-content">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="事项标题">{{ currentTask.title }}</el-descriptions-item>
          <el-descriptions-item label="主办单位">
             <el-tag v-for="id in currentTask.owner_dept_ids" :key="id" type="danger" size="small" style="margin:2px">{{ deptMap[id] }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="办结日期">{{ formatDate(currentTask.created_at) }}</el-descriptions-item>
          <el-descriptions-item label="历史要求">{{ currentTask.content || '未填写' }}</el-descriptions-item>
        </el-descriptions>

        <!-- 历史进展留痕 -->
        <div class="timeline-section">
          <div class="section-title">全过程办理留痕记录</div>
          <el-timeline v-if="combinedTimeline.length">
            <el-timeline-item 
              v-for="item in combinedTimeline" :key="item.id" 
              :timestamp="item.time" :color="item.type === 'comment' ? '#722ed1' : '#52c41a'"
            >
              <el-card shadow="never" class="timeline-card">
                <div class="card-header">{{ item.type === 'comment' ? '领导批示' : '进展汇报' }}：{{ item.name }}</div>
                <p class="card-body">{{ item.content }}</p>
              </el-card>
            </el-timeline-item>
          </el-timeline>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useTaskStore } from '@/stores/task';
import { ElMessage, ElMessageBox } from 'element-plus';

const taskStore = useTaskStore();

// --- 状态变量 ---
const drawerVisible = ref(false);
const currentTask = ref<any>(null);
const combinedTimeline = ref<any[]>([]);

const deptMap: any = {
  'dept_01': '第八派驻纪检组', 'dept_02': '办公室', 'dept_03': '人事政工科', 'dept_04': '综合保障科',
  'dept_05': '综合业务一科', 'dept_06': '综合业务二科', 'dept_07': '查验一科', 'dept_08': '查验二科',
  'dept_09': '查验三科', 'dept_10': '监控管理科', 'dept_11': '物流监控科', 'dept_12': '船舶清关科',
  'dept_13': '船舶检查科', 'dept_14': '验估一科', 'dept_15': '验估二科', 'dept_16': '验估三科', 'dept_17': '跨境贸易便利化科'
};

// 过滤已办结任务
const historyTasks = computed(() => {
  return (taskStore.tasks || []).filter(t => t.status === 'COMPLETED' || t.is_history === 1);
});

const viewDetail = async (task: any) => {
  currentTask.value = task;
  // 加载进展与批示并合并排序
  const fs = taskStore.getTaskFeedbacks(task.id).map(i => ({ ...i, type: 'feedback', time: i.feedback_time, name: deptMap[i.dept_id] }));
  const cs = taskStore.getTaskComments(task.id).map(i => ({ ...i, type: 'comment', time: i.created_at, name: i.leader_name }));
  combinedTimeline.value = [...fs, ...cs].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  drawerVisible.value = true;
};

const handleDelete = (id: string) => {
  ElMessageBox.confirm('确定要永久删除该历史任务及其所有相关记录吗？此操作不可撤销。', '删除警告', {
    type: 'error',
    confirmButtonText: '确定删除',
    confirmButtonClass: 'el-button--danger'
  }).then(async () => {
    await taskStore.deleteTask(id);
    ElMessage.success('历史记录已彻底清理');
  });
};

const getDeptLabel = (o: any[], c: any[]) => {
  let l = (o && o.length) ? deptMap[o[0]] : '统筹处';
  if (o && o.length > 1) l += '等';
  if (c && c.length) l += '(协)';
  return l;
};

const formatDate = (s: string) => s ? s.substring(0, 10) : '';

onMounted(() => taskStore.fetchTasks());
</script>

<style scoped>
/* 同步 TaskView 的样式确保视觉一致 */
.desktop-container { padding: 10px; }
.desk-header { padding: 10px 5px; border-bottom: 1px solid #ddd; margin-bottom: 15px; }
.desk-title { font-weight: bold; color: #0d2a61; border-left: 5px solid #0d2a61; padding-left: 12px; font-size: 18px; }
.task-list-card { background: #fff; border: 1px solid #ddd; border-radius: 4px; min-height: 600px; }
.doc-item { display: flex; align-items: center; padding: 15px 20px; border-bottom: 1px solid #f0f0f0; cursor: pointer; }
.doc-item:hover { background-color: #f5f8ff; }
.list-header { background-color: #f8f9fa; font-weight: bold; color: #666; font-size: 14px; cursor: default; }

/* 严格对齐的宽度 */

.doc-tag-head, .archived-tag { width: 40px; margin-right: 20px; text-align: center; font-size: 12px; border: 1px solid #909399; color: #909399; }
.doc-sender-head, .doc-sender { width: 160px; font-size: 14px; color: #666; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.doc-title-head, .doc-title { flex: 1; font-size: 15px; color: #333; }
.doc-status-head, .doc-status { width: 100px; text-align: center; color: #67c23a; }
.doc-time-head, .doc-time { width: 150px; text-align: right; color: #999; font-size: 13px; }
.doc-actions-head, .doc-actions { width: 140px; text-align: right; }

.timeline-section { margin-top: 30px; padding: 20px; }
.section-title { font-weight: bold; margin-bottom: 15px; color: #0d2a61; border-bottom: 1px solid #eee; padding-bottom: 8px; }
.timeline-card { background: #fdfdfd; padding: 10px; }
.card-header { font-weight: bold; font-size: 13px; margin-bottom: 5px; }
.card-body { font-size: 14px; color: #444; margin: 0; }
</style>