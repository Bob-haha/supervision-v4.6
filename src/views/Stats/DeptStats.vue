<template>
  <div class="desktop-container">
    <div class="desk-header">
      <span class="desk-title">科室数据看板</span>
    </div>
    <el-card shadow="never" class="modern-card">
      <DeptStatsGrid />
    </el-card>
    <el-row :gutter="20" class="mt-4">
      <el-col :span="12">
        <el-card shadow="never" class="modern-card" header="科室办结率对比">
          <div ref="chartRef" class="chart-box"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never" class="modern-card" header="科室超期率对比">
          <div ref="overdueChartRef" class="chart-box"></div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import * as echarts from 'echarts';
import { useStatisticsStore } from '@/stores/statistics';
import { DEPT_MAP } from '@/constants';
import DeptStatsGrid from '@/views/Dashboard/components/DeptStatsGrid.vue';

const statisticsStore = useStatisticsStore();
const chartRef = ref();
const overdueChartRef = ref();

onMounted(() => nextTick(() => {
  const deptStats = statisticsStore.getDepartmentStats();
  if (chartRef.value) {
    const c = echarts.init(chartRef.value);
    c.setOption({
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: deptStats.map(d => DEPT_MAP[d.deptId] || d.deptId), axisLabel: { rotate: 40, fontSize: 11 } },
      yAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
      series: [{
        type: 'bar', data: deptStats.map(d => Math.round(d.completionRate * 100)),
        itemStyle: { color: '#52C41A', borderRadius: [6, 6, 0, 0] },
        barWidth: '50%',
      }],
      grid: { bottom: '25%', containLabel: true },
    });
  }
  if (overdueChartRef.value) {
    const c = echarts.init(overdueChartRef.value);
    c.setOption({
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: deptStats.map(d => DEPT_MAP[d.deptId] || d.deptId), axisLabel: { rotate: 40, fontSize: 11 } },
      yAxis: { type: 'value', minInterval: 1 },
      series: [{
        type: 'bar', data: deptStats.map(d => d.overdueCount),
        itemStyle: { color: '#FF4D4F', borderRadius: [6, 6, 0, 0] },
        barWidth: '50%',
      }],
      grid: { bottom: '25%', containLabel: true },
    });
  }
}));
</script>

<style scoped>
.desktop-container { padding: 10px; }
.desk-header { padding: 10px 5px; border-bottom: 1px solid var(--border-color); margin-bottom: 20px; }
.desk-title { font-weight: 700; color: var(--color-primary); border-left: 4px solid var(--color-primary-light); padding-left: 14px; font-size: var(--font-size-xl); }
.modern-card { border-radius: var(--radius-md); border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); }
:deep(.modern-card .el-card__header) { padding: 14px 20px; border-bottom: 1px solid var(--border-light); font-size: var(--font-size-lg); font-weight: 600; color: var(--text-primary); }
:deep(.modern-card .el-card__body) { padding: 20px; }
.chart-box { height: 340px; width: 100%; }
.mt-4 { margin-top: 20px; }
</style>
