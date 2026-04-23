<template>
  <div class="dashboard-wrapper">
    <!-- 1. P2P 同步状态栏 -->
    <el-row :gutter="20" class="mb-4">
      <el-col :span="24">
        <el-card shadow="never" class="sync-status-bar">
          <div class="flex-between">
            <div class="status-info">
              <el-tag :type="syncStore.isOnline ? 'success' : 'info'" effect="dark">
                {{ syncStore.isOnline ? '系统在线' : '离线模式' }}
              </el-tag>
              <span class="ml-3 text-gray">当前内网同步节点: {{ syncStore.peerCount }} 个</span>
            </div>
            <div class="actions">
              <el-tooltip content="如果发现数据不全，点击从同事电脑获取最新完整账本">
                <el-button type="primary" size="small" icon="Refresh" @click="handleManualSync">
                  发起手动对账
                </el-button>
              </el-tooltip>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 2. 顶部核心指标卡片 -->
    <el-row :gutter="20">
      <el-col :span="6" v-for="card in statCards" :key="card.title">
        <el-card shadow="never" class="metric-card" :style="{ borderLeft: '6px solid ' + card.color }">
          <div class="metric-content">
            <div class="metric-info">
              <div class="label">{{ card.title }}</div>
              <div class="value">{{ card.value }}<span class="unit">件</span></div>
            </div>
            <el-icon :size="40" :style="{ color: card.color + '22' }">
              <component :is="card.icon" />
            </el-icon>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 3. 中间图表区域 -->
    <el-row :gutter="20" class="mt-4">
      <el-col :span="12">
        <el-card header="各单位承办压力对比" shadow="never">
          <div ref="deptChartRef" class="chart-box"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card header="全量事项状态分布" shadow="never">
          <div ref="statusChartRef" class="chart-box"></div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 4. 底部预警与动态 -->
    <el-row :gutter="20" class="mt-4">
      <el-col :span="10">
        <el-card header="即将逾期事项预警" shadow="never">
          <div class="warning-list">
            <div v-for="t in overdueTasks" :key="t.id" class="warning-item">
              <div class="w-info">
                <b class="w-title">{{ t.title }}</b>
                <span class="w-dept">{{ DEPT_MAP[t.owner_dept_ids[0]] || '未知科室' }}</span>
              </div>
              <el-tag type="danger" size="small">剩 {{ getDaysLeft(t.deadline) }} 天</el-tag>
            </div>
            <el-empty v-if="!overdueTasks.length" description="暂无逾期风险" :image-size="60" />
          </div>
        </el-card>
      </el-col>
      <el-col :span="14">
        <el-card header="全系统实时督办动态" shadow="never">
          <div class="timeline-container">
            <el-timeline v-if="latestLogs.length">
              <el-timeline-item
                v-for="(log, idx) in latestLogs" :key="idx"
                :timestamp="formatDate(log.time)"
                :type="log.type === 'comment' ? 'primary' : 'success'"
              >
                <span class="log-text">
                  <b>{{ log.person }}</b> 
                  在【{{ log.taskTitle }}】中{{ log.type === 'comment' ? '下达了批示' : '提交了进展汇报' }}
                </span>
              </el-timeline-item>
            </el-timeline>
            <el-empty v-else description="暂无最近动态" :image-size="60" />
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, nextTick } from 'vue';
import * as echarts from 'echarts';
import { useTaskStore } from '@/stores/task';
import { useSyncStore } from '@/stores/sync'; // 导入同步 Store
import { DEPT_MAP } from '@/constants';
import { formatDate } from '@/utils';
import { ElMessageBox, ElMessage } from 'element-plus';


const taskStore = useTaskStore();
const syncStore = useSyncStore();
const deptChartRef = ref();
const statusChartRef = ref();

// --- 基础统计数据 ---
const statCards = computed(() => {
  const all = taskStore.tasks || [];
  const now = new Date().toISOString().split('T')[0];
  return [
    { title: '总督办件', value: all.length, icon: 'Monitor', color: '#0d2a61' },
    { title: '在办事项', value: all.filter(t => t.status === 'PENDING').length, icon: 'Timer', color: '#409EFF' },
    { title: '办结销号', value: all.filter(t => t.status === 'COMPLETED').length, icon: 'CircleCheck', color: '#67c23a' },
    { title: '逾期件', value: all.filter(t => t.status !== 'COMPLETED' && t.deadline && t.deadline < now).length, icon: 'Warning', color: '#f56c6c' },
  ];
});

// --- 逾期预警逻辑 ---
const overdueTasks = computed(() => {
  const now = new Date();
  return (taskStore.tasks || []).filter(t => {
    if (t.status === 'COMPLETED' || !t.deadline) return false;
    const diff = (new Date(t.deadline).getTime() - now.getTime()) / (1000 * 3600 * 24);
    return diff >= 0 && diff <= 3; // 预警3天内
  });
});

const getDaysLeft = (deadline: string) => {
  const diff = (new Date(deadline).getTime() - new Date().getTime()) / (1000 * 3600 * 24);
  return Math.ceil(diff);
};

// 获取动态日志
const latestLogs = computed(() => {
  return typeof taskStore.getGlobalLatestLogs === 'function' ? taskStore.getGlobalLatestLogs() : [];
});

// --- P2P 手动同步逻辑 ---
const handleManualSync = () => {
  if (syncStore.peerCount === 0) {
    return ElMessage.warning("当前无在线节点，请等待同事上线后再试");
  }
  ElMessageBox.confirm('全量对账将请求同事手中的完整数据库并覆盖本地。确认执行？', '同步确认').then(() => {
    if ((window as any).p2pInstance) {
      (window as any).p2pInstance.requestFullSync();
      ElMessage.success("已发起请求");
    }
  });
};

// --- 图表初始化 ---
const initCharts = () => {
  if (!deptChartRef.value || !statusChartRef.value) return;

  // 1. 办案压力
  const deptData = taskStore.getDeptStats();
const deptChart = echarts.init(deptChartRef.value);

deptChart.setOption({
  // 调整绘图区域，增加底部留白（bottom），防止文字出界
  grid: {
    top: '10%',
    left: '3%',
    right: '4%',
    bottom: '25%', // 关键点：给底部标签留出 25% 的空间
    containLabel: true
  },
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' }
  },
  xAxis: {
    type: 'category',
    // 移除 substring(0,4)，保留更完整的名称
    data: deptData.map(i => DEPT_MAP[i.id] || i.id),
    axisLabel: {
      interval: 0,    // 关键点：强制显示所有标签，不自动隐藏
      rotate: 40,      // 旋转角度，40-45度效果最佳
      fontSize: 12,
      // 如果名字实在太长，可以使用换行或截断
      formatter: (value: string) => {
        // 如果超过6个字，进行截断加省略号
        return value.length > 6 ? value.slice(0, 6) + '...' : value;
      }
    }
  },
  yAxis: {
    type: 'value',
    minInterval: 1 // 保证纵坐标显示整数
  },
  series: [{
    name: '督办件数',
    data: deptData.map(i => i.count),
    type: 'bar',
    barWidth: '40%',
    itemStyle: {
      // 使用渐变色，提升政务视觉的高级感
      color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: '#1890ff' },
        { offset: 1, color: '#0d2a61' }
      ]),
      borderRadius: [4, 4, 0, 0] // 顶部圆角
    }
  }]
});

// 增加自适应：窗口缩放时图表自动重绘
window.addEventListener('resize', () => {
  deptChart.resize();
});

  // 2. 状态构成
  const statusChart = echarts.init(statusChartRef.value);
  statusChart.setOption({
    series: [{
      type: 'pie', radius: ['40%', '70%'],
      data: [
        { value: taskStore.tasks.filter(t => t.status === 'COMPLETED').length, name: '已办结' },
        { value: taskStore.tasks.filter(t => t.status === 'PENDING').length, name: '办理中' }
      ]
    }]
  });
};

onMounted(async () => {
  await taskStore.fetchTasks();
  nextTick(() => initCharts());
});
</script>

<style scoped>
.dashboard-wrapper { padding: 10px; }
.metric-card { border-radius: 4px; height: 100px; display: flex; align-items: center; margin-bottom: 20px; }
.metric-content { display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 0 15px; }
.metric-info .value { font-size: 28px; font-weight: bold; color: #0d2a61; }
.chart-box { height: 300px; width: 100%; }
.warning-list { height: 300px; overflow-y: auto; }
.warning-item { display: flex; justify-content: space-between; padding: 10px; border-bottom: 1px dashed #eee; }
.timeline-container { height: 300px; overflow-y: auto; }
.flex-between { display: flex; justify-content: space-between; align-items: center; }
.mb-4 { margin-bottom: 15px; }
.mt-4 { margin-top: 20px; }
.ml-3 { margin-left: 12px; }
.text-gray { color: #999; font-size: 14px; }
</style>