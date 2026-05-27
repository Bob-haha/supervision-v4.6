<template>
  <div class="analysis-charts">
    <!-- 办结分析 -->
    <template v-if="type === 'completion'">
      <el-row :gutter="20">
        <el-col :span="24">
          <el-card header="月度办结趋势" shadow="never">
            <div ref="trendChartRef" class="chart-box"></div>
          </el-card>
        </el-col>
      </el-row>
    </template>

    <!-- 超期分析 -->
    <template v-if="type === 'overdue'">
      <el-row :gutter="20">
        <el-col :span="24">
          <el-card header="各科室超期任务分布" shadow="never">
            <div ref="overdueChartRef" class="chart-box"></div>
          </el-card>
        </el-col>
      </el-row>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue';
import * as echarts from 'echarts';
import { useSupervisionStore } from '@/stores/supervision';
import { DEPT_MAP } from '@/constants';

const props = defineProps<{ type: 'completion' | 'overdue'; data?: any }>();
const supervisionStore = useSupervisionStore();
const trendChartRef = ref();
const overdueChartRef = ref();

function initCompletionChart() {
  if (!trendChartRef.value) return;
  const trend = supervisionStore.getCompletionTrend(6);
  const chart = echarts.init(trendChartRef.value);
  chart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['新建任务', '办结任务'] },
    xAxis: { type: 'category', data: trend.map(t => t.month) },
    yAxis: { type: 'value', minInterval: 1 },
    series: [
      { name: '新建任务', type: 'line', data: trend.map(t => t.created), smooth: true, color: '#409eff' },
      { name: '办结任务', type: 'line', data: trend.map(t => t.completed), smooth: true, color: '#67c23a' },
    ],
  });
  window.addEventListener('resize', () => chart.resize());
}

function initOverdueChart() {
  if (!overdueChartRef.value) return;
  const data = supervisionStore.getOverdueByDept();
  const chart = echarts.init(overdueChartRef.value);
  chart.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: {
      type: 'category',
      data: data.map(d => DEPT_MAP[d.deptId] || d.deptId),
      axisLabel: { rotate: 40, fontSize: 11, formatter: (v: string) => v.length > 6 ? v.slice(0, 6) + '...' : v },
    },
    yAxis: { type: 'value', minInterval: 1 },
    series: [{
      name: '超期数', type: 'bar', data: data.map(d => d.count),
      itemStyle: { color: '#f56c6c', borderRadius: [4, 4, 0, 0] },
    }],
    grid: { bottom: '25%', containLabel: true },
  });
  window.addEventListener('resize', () => chart.resize());
}

onMounted(() => {
  nextTick(() => {
    if (props.type === 'completion') initCompletionChart();
    else initOverdueChart();
  });
});

watch(() => props.type, () => {
  nextTick(() => {
    if (props.type === 'completion') initCompletionChart();
    else initOverdueChart();
  });
});
</script>

<style scoped>
.chart-box { height: 380px; width: 100%; }
</style>
