<template>
  <el-row :gutter="16">
    <el-col :span="4" v-for="card in cards" :key="card.title" class="kpi-col">
      <div class="kpi-card" @click="$router.push(card.link)">
        <div class="kpi-top">
          <div class="kpi-icon" :style="{ background: card.color + '12', color: card.color }">
            <el-icon size="20"><component :is="card.icon" /></el-icon>
          </div>
          <div class="kpi-label">{{ card.title }}</div>
        </div>
        <div class="kpi-value">
          <span class="kpi-number">{{ card.formatted }}</span>
          <span class="kpi-unit">{{ card.unit }}</span>
        </div>
        <div class="kpi-bottom">
          <span class="kpi-trend" :class="card.trendUp ? 'up' : 'down'">
            <el-icon size="12"><component :is="card.trendUp ? 'CaretTop' : 'CaretBottom'" /></el-icon>
            {{ card.subText }}
          </span>
        </div>
      </div>
    </el-col>
  </el-row>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useStatisticsStore } from '@/stores/statistics';
import { useTaskStore } from '@/stores/task';

const statisticsStore = useStatisticsStore();
const taskStore = useTaskStore();

const cards = computed(() => {
  const stats = statisticsStore.getGuanquStats();
  const all = taskStore.tasks || [];
  const now = new Date().toISOString().split('T')[0];
  const active = all.filter(t => t.status !== 'COMPLETED').length;
  const overdueCnt = all.filter(t => t.status !== 'COMPLETED' && t.deadline && t.deadline < now).length;

  return [
    {
      title: '任务总数', formatted: String(stats.totalCount), unit: '件',
      icon: 'Document', color: '#165DFF', trendUp: true,
      subText: `在办 ${active} 件`, link: '/tasks',
    },
    {
      title: '办结率', formatted: (stats.completionRate * 100).toFixed(1), unit: '%',
      icon: 'CircleCheckFilled', color: '#52C41A', trendUp: stats.completionRate > 0.5,
      subText: stats.completionRate > 0.6 ? '表现良好' : '需要提升', link: '/dept-completed',
    },
    {
      title: '超期率', formatted: (stats.overdueRate * 100).toFixed(1), unit: '%',
      icon: 'WarningFilled', color: '#FF4D4F', trendUp: stats.overdueRate < 0.1,
      subText: overdueCnt > 0 ? `${overdueCnt} 件超期` : '暂无超期', link: '/supervision',
    },
    {
      title: '重点任务', formatted: String(stats.keyTaskCount), unit: '件',
      icon: 'StarFilled', color: '#FAAD14', trendUp: stats.keyTaskCount > 0,
      subText: '重点督办', link: '/tasks',
    },
    {
      title: '领导批示', formatted: String(stats.leaderInstructionCount), unit: '条',
      icon: 'EditPen', color: '#722ED1', trendUp: stats.leaderInstructionCount > 0,
      subText: '最新批示', link: '/dashboard',
    },
  ];
});
</script>

<style scoped>
.kpi-card {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  padding: 16px 18px 14px;
  cursor: pointer;
  transition: all var(--transition-normal);
  height: 120px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.kpi-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-card-hover);
  border-color: #C9CDD4;
}

.kpi-top {
  display: flex;
  align-items: center;
  gap: 10px;
}

.kpi-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.kpi-label {
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
  letter-spacing: 0.3px;
}

.kpi-value {
  display: flex;
  align-items: baseline;
  gap: 3px;
  margin: 4px 0 2px;
}

.kpi-number {
  font-size: 30px;
  font-weight: 700;
  color: var(--text-primary);
  font-family: 'DIN', -apple-system, sans-serif;
  line-height: 1;
}

.kpi-unit {
  font-size: 13px;
  color: var(--text-tertiary);
  font-weight: 400;
}

.kpi-bottom {
  padding-top: 2px;
}

.kpi-trend {
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.kpi-trend.up { color: var(--color-success); }
.kpi-trend.down { color: var(--color-danger); }
</style>
