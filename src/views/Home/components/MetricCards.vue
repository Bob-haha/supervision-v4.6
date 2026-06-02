<template>
  <div class="metric-cards-grid">
    <div
      v-for="m in displayMetrics"
      :key="m.id"
      class="metric-card"
      @click="$emit('drill-down', m)"
    >
      <div class="metric-label">{{ m.name }}</div>
      <div class="metric-value">{{ getValue(m) }}</div>
      <div class="metric-sub" v-if="getSub(m)">{{ getSub(m) }}</div>
    </div>
    <el-empty v-if="!displayMetrics.length" description="暂无指标数据" :image-size="40" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { SupervisionTask, MetricDefinition } from '@/types'
import { useDashboardStore } from '@/stores/dashboard'

const props = defineProps<{
  metrics: MetricDefinition[]
  tasks: SupervisionTask[]
  level: string
}>()

defineEmits<{ 'drill-down': [metric: MetricDefinition] }>()

const dashStore = useDashboardStore()

const displayMetrics = computed(() => props.metrics.filter(m => m.level === props.level))

function getValue(metric: MetricDefinition) {
  try {
    const result = dashStore.computeMetricValue(metric, props.tasks)
    return dashStore.formatMetricValue(result.value)
  } catch { return '--' }
}

function getSub(metric: MetricDefinition): string {
  try {
    const result = dashStore.computeMetricValue(metric, props.tasks)
    return `${result.taskIds.length} 个任务`
  } catch { return '' }
}
</script>

<style scoped>
.metric-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}
.metric-card {
  background: #fafaf7;
  border: 1px solid var(--border-light);
  border-radius: 4px;
  padding: 14px 16px;
  cursor: pointer;
  transition: all 0.2s;
}
.metric-card:hover {
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  border-color: var(--border-color);
}
.metric-label { font-size: 13px; color: var(--text-secondary); margin-bottom: 4px; }
.metric-value { font-size: 28px; font-weight: 700; color: var(--text-primary); }
.metric-sub { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
</style>
