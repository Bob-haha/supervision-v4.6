<template>
  <div class="desktop-container">
    <div class="desk-header">
      <span class="desk-title">关区数据看板</span>
    </div>
    <GuanquStatsCards />
    <el-row :gutter="20" class="mt-4">
      <el-col :span="16">
        <el-card shadow="never" class="modern-card" header="关区任务趋势 (近6个月)">
          <div ref="trendRef" class="chart-box"></div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="never" class="modern-card" header="关区态势概览">
          <div class="overview-list">
            <div v-for="item in overviewItems" :key="item.label" class="overview-item">
              <span class="ov-label">{{ item.label }}</span>
              <span class="ov-value" :style="{ color: item.color }">{{ item.value }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import * as echarts from 'echarts';
import { useStatisticsStore } from '@/stores/statistics';
import { useTaskStore } from '@/stores/task';
import GuanquStatsCards from '@/views/Dashboard/components/GuanquStatsCards.vue';

const statisticsStore = useStatisticsStore();
const taskStore = useTaskStore();
const trendRef = ref();

const overviewItems = ref<any[]>([]);

onMounted(async () => {
  await taskStore.fetchTasks();
  const stats = statisticsStore.getGuanquStats();
  const all = taskStore.tasks;
  const now = new Date().toISOString().split('T')[0];
  const activeCount = all.filter(t => t.status !== 'COMPLETED').length;
  const deptStats = statisticsStore.getDepartmentStats();
  const highLoadDepts = deptStats.filter(d => d.loadLevel === 'HIGH').length;

  overviewItems.value = [
    { label: '任务总数', value: `${stats.totalCount} 件`, color: '#0B2A6B' },
    { label: '在办任务', value: `${activeCount} 件`, color: '#165DFF' },
    { label: '办结率', value: `${(stats.completionRate * 100).toFixed(1)}%`, color: '#52C41A' },
    { label: '超期率', value: `${(stats.overdueRate * 100).toFixed(1)}%`, color: '#FF4D4F' },
    { label: '重点任务', value: `${stats.keyTaskCount} 件`, color: '#FAAD14' },
    { label: '领导批示', value: `${stats.leaderInstructionCount} 条`, color: '#722ED1' },
    { label: '高负载科室', value: `${highLoadDepts} 个`, color: '#FF4D4F' },
    { label: '活跃科室', value: `${deptStats.filter(d => d.taskCount > 0).length} 个`, color: '#165DFF' },
  ];

  nextTick(() => {
    if (!trendRef.value) return;
    const months: string[] = [];
    const counts: number[] = [];
    const now2 = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now2.getFullYear(), now2.getMonth() - i, 1);
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push(m);
      counts.push(all.filter(t => t.created_at?.substring(0, 7) === m).length);
    }
    const c = echarts.init(trendRef.value);
    c.setOption({
      tooltip: { trigger: 'axis' },
      grid: { top: 20, left: 10, right: 20, bottom: 20, containLabel: true },
      xAxis: { type: 'category', data: months },
      yAxis: { type: 'value', minInterval: 1 },
      series: [{
        type: 'line', data: counts, smooth: true, symbol: 'circle', symbolSize: 10,
        itemStyle: { color: '#165DFF' },
        lineStyle: { width: 3 },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(22,93,255,0.25)' }, { offset: 1, color: 'rgba(22,93,255,0.02)' },
        ])},
      }],
    });
  });
});
</script>

<style scoped>
.desktop-container { padding: 10px; }
.desk-header { padding: 10px 5px; border-bottom: 1px solid var(--border-color); margin-bottom: 20px; }
.desk-title { font-weight: 700; color: var(--color-primary); border-left: 4px solid var(--color-primary-light); padding-left: 14px; font-size: var(--font-size-xl); }
.modern-card { border-radius: var(--radius-md); border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); }
:deep(.modern-card .el-card__header) { padding: 14px 20px; border-bottom: 1px solid var(--border-light); font-size: var(--font-size-lg); font-weight: 600; color: var(--text-primary); }
:deep(.modern-card .el-card__body) { padding: 20px; }
.chart-box { height: 380px; width: 100%; }
.mt-4 { margin-top: 20px; }
.overview-list { display: flex; flex-direction: column; gap: 0; }
.overview-item { display: flex; justify-content: space-between; align-items: center; padding: 14px 0; border-bottom: 1px solid var(--border-light); }
.overview-item:last-child { border-bottom: none; }
.ov-label { font-size: var(--font-size-md); color: var(--text-secondary); }
.ov-value { font-size: var(--font-size-xl); font-weight: 700; }
</style>
