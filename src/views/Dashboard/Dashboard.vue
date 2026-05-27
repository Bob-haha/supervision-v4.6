<template>
  <div class="dashboard-v3">
    <!-- 第一部分：核心指标区 (5 KPI cards) -->
    <section class="dash-section">
      <div class="section-label">核心指标</div>
      <GuanquStatsCards />
    </section>

    <!-- 第二部分 + 第三部分：个人工作台 + 领导批示专区 -->
    <section class="dash-section">
      <el-row :gutter="20">
        <el-col :span="14">
          <div class="section-label">个人工作台</div>
          <PersonalWorkspace />
        </el-col>
        <el-col :span="10">
          <div class="section-label">领导批示专区</div>
          <LeaderInstructionPanel />
        </el-col>
      </el-row>
    </section>

    <!-- 第四部分：科级态势 -->
    <section class="dash-section">
      <div class="section-label">科级态势</div>
      <DeptStatsGrid />
    </section>

    <!-- 第五部分：趋势分析 (左:折线图 + 右:环形图) -->
    <section class="dash-section">
      <div class="section-label">趋势分析</div>
      <el-row :gutter="20">
        <el-col :span="14">
          <el-card shadow="never" class="v3-card" header="近30天任务趋势">
            <div ref="trendChartRef" class="chart-box"></div>
          </el-card>
        </el-col>
        <el-col :span="10">
          <el-card shadow="never" class="v3-card" header="任务类型分布">
            <div ref="categoryChartRef" class="chart-box"></div>
          </el-card>
        </el-col>
      </el-row>
    </section>

    <!-- 第六部分：最新任务列表 -->
    <section class="dash-section">
      <div class="section-label">最新任务</div>
      <el-card shadow="never" class="v3-card">
        <el-table :data="latestTasks" stripe size="default" style="width:100%"
          :header-cell-style="{ background: '#FAFAFA', color: '#4E5969', fontWeight: '600', fontSize: '13px', borderBottom: '2px solid #E5E6EB' }">
          <el-table-column label="类型" width="80" align="center">
            <template #default="{ row }">
              <el-tag size="small" effect="plain" :type="levelType(row.level)">{{ levelLabel(row.level) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="title" label="任务标题" min-width="220" show-overflow-tooltip />
          <el-table-column label="承办单位" width="160">
            <template #default="{ row }">
              <span class="dept-tag">{{ getDeptLabel(row) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="责任人" width="100">
            <template #default="{ row }">{{ row.handler_name || '-' }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90" align="center">
            <template #default="{ row }">
              <el-tag :type="statusTagType(row)" size="small" effect="light">{{ statusLabel(row) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="时限" width="110" sortable>
            <template #default="{ row }">
              <span :class="{ 'text-danger': isOverdue(row) }">{{ row.deadline || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="发布时间" width="110">
            <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right">
            <template #default>
              <el-button link type="primary" size="small">查看</el-button>
              <el-button link type="warning" size="small">督办</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!latestTasks.length" description="暂无任务数据" :image-size="60" />
      </el-card>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, nextTick } from 'vue';
import * as echarts from 'echarts';
import { useTaskStore } from '@/stores/task';
import { usePersonnelStore } from '@/stores/personnel';
import { DEPT_MAP } from '@/constants';
import GuanquStatsCards from './components/GuanquStatsCards.vue';
import DeptStatsGrid from './components/DeptStatsGrid.vue';
import PersonalWorkspace from './components/PersonalWorkspace.vue';
import LeaderInstructionPanel from './components/LeaderInstructionPanel.vue';

const taskStore = useTaskStore();
const personnelStore = usePersonnelStore();
const trendChartRef = ref();
const categoryChartRef = ref();

const latestTasks = computed(() => (taskStore.tasks || []).slice(0, 15));

function getDeptLabel(t: any) {
  const o = t.owner_dept_ids || [];
  return o.length ? (DEPT_MAP[o[0]] || o[0]) : '统筹';
}

function levelType(l: number) { return l === 1 ? '' : l === 2 ? 'warning' : 'info'; }
function levelLabel(l: number) { return l === 1 ? '年度' : l === 2 ? '阶段' : '科室'; }

function isOverdue(t: any) {
  if (t.status === 'COMPLETED') return false;
  const now = new Date().toISOString().split('T')[0];
  return t.deadline && t.deadline < now;
}

function statusTagType(t: any) {
  if (t.status === 'COMPLETED') return 'success';
  if (isOverdue(t)) return 'danger';
  return '';
}

function statusLabel(t: any) {
  if (t.status === 'COMPLETED') return '已完成';
  if (isOverdue(t)) return '超期';
  return '办理中';
}

function formatDate(s: string) { return s ? s.substring(0, 10) : ''; }

function initCharts() {
  if (!trendChartRef.value || !categoryChartRef.value) return;

  // 近30天趋势折线图
  const trendChart = echarts.init(trendChartRef.value);
  const days: string[] = [];
  const created: number[] = [];
  const completed: number[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    days.push(ds.substring(5));
    created.push(taskStore.tasks.filter(t => t.created_at?.substring(0, 10) === ds).length);
    completed.push(taskStore.tasks.filter(t => t.status === 'COMPLETED' && t.created_at?.substring(0, 10) === ds).length);
  }

  trendChart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['新增任务', '办结任务'], bottom: 0, textStyle: { color: '#86909C' } },
    grid: { top: 16, left: 0, right: 16, bottom: 32, containLabel: true },
    xAxis: { type: 'category', data: days, axisLine: { lineStyle: { color: '#E5E6EB' } }, axisLabel: { color: '#86909C', fontSize: 11, interval: 6 } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#F2F3F5' } }, axisLabel: { color: '#86909C' } },
    series: [
      {
        name: '新增任务', type: 'line', smooth: true, symbol: 'none', data: created,
        itemStyle: { color: '#165DFF' }, lineStyle: { width: 2.5 },
      },
      {
        name: '办结任务', type: 'line', smooth: true, symbol: 'none', data: completed,
        itemStyle: { color: '#52C41A' }, lineStyle: { width: 2.5 },
      },
    ],
  });

  // 任务类型环形图
  const categoryChart = echarts.init(categoryChartRef.value);
  const typeCounts: Record<string, number> = {};
  taskStore.tasks.forEach(t => {
    const key = t.task_type || '常规';
    typeCounts[key] = (typeCounts[key] || 0) + 1;
  });
  const pieColors = ['#165DFF', '#52C41A', '#FAAD14', '#FF4D4F', '#722ED1', '#0FC6C2', '#F5319D'];

  categoryChart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} 件 ({d}%)' },
    color: pieColors,
    series: [{
      type: 'pie',
      radius: ['48%', '76%'],
      center: ['50%', '52%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 5, borderColor: '#fff', borderWidth: 3 },
      label: { show: true, position: 'outside', formatter: '{b}\n{d}%', fontSize: 11, color: '#4E5969' },
      emphasis: { label: { fontSize: 15, fontWeight: 'bold' } },
      data: Object.entries(typeCounts).map(([name, value]) => ({ name, value })),
    }],
  });

  window.addEventListener('resize', () => { trendChart.resize(); categoryChart.resize(); });
}

onMounted(async () => {
  await personnelStore.initPersonnelIfEmpty();
  await taskStore.fetchTasks();
  nextTick(() => initCharts());
});
</script>

<style scoped>
.dashboard-v3 {
  padding: 4px 0;
  max-width: 1600px;
  margin: 0 auto;
}

.dash-section {
  margin-bottom: 20px;
}

.section-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 12px;
  padding-left: 4px;
  letter-spacing: 0.5px;
}

.v3-card {
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  transition: box-shadow var(--transition-fast);
}
.v3-card:hover {
  box-shadow: var(--shadow-md);
}

:deep(.v3-card .el-card__header) {
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-light);
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.3px;
}

:deep(.v3-card .el-card__body) {
  padding: 16px 20px;
}

.chart-box {
  height: 300px;
  width: 100%;
}

.dept-tag {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.text-danger {
  color: var(--color-danger);
}

:deep(.el-table) {
  font-size: var(--font-size-md);
  border-radius: var(--radius-md);
}

:deep(.el-table .el-table__row) {
  height: 48px;
}

:deep(.el-table .el-table__row:hover) {
  background: #F7F8FA;
}
</style>
