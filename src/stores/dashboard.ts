import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { SupervisionTask, MetricDefinition, UserDashboardConfig, MetricConfig } from '@/types'
import { DatabaseManager } from '@/core/database/DatabaseManager'

export const useDashboardStore = defineStore('dashboard', () => {
  const dbManager = DatabaseManager.getInstance()

  // 安全解析 JSON
  function safeJSON<T = any>(str: any, def: T): T {
    if (!str) return def
    if (typeof str !== 'string') return str as unknown as T
    try { return JSON.parse(str) } catch { return def }
  }

  // ===== 指标聚合计算 =====
  function computeMetricValue(metric: MetricDefinition, allTasks: SupervisionTask[]): { value: number; taskIds: string[] } {
    const config = metric.config
    let filtered: SupervisionTask[] = []

    if (config.mode === 'specific') {
      const ids = config.specificTaskIds || []
      filtered = allTasks.filter(t => ids.includes(t.id) && t.status !== 'archived')
    } else {
      filtered = allTasks.filter(t => t.status !== 'archived')
      if (config.taskTypeIds && config.taskTypeIds.length > 0) {
        filtered = filtered.filter(t => config.taskTypeIds!.includes(t.taskTypeId || ''))
      }
      if (config.filterTags && config.filterTags.length > 0) {
        filtered = filtered.filter(t => (t.tags || []).some(tag => config.filterTags!.includes(tag)))
      }
      if (config.timeRange?.start) {
        filtered = filtered.filter(t => t.createdAt >= config.timeRange!.start)
      }
      if (config.timeRange?.end) {
        filtered = filtered.filter(t => t.createdAt <= config.timeRange!.end)
      }
    }

    const taskIds = filtered.map(t => t.id)

    if (config.fieldId === '__task_count__') {
      return { value: filtered.length, taskIds }
    }

    let value = 0
    const values: number[] = []

    for (const task of filtered) {
      const rows = safeJSON(task.dataSheetRows, []) as any[]
      for (const row of rows) {
        const val = row.data?.[config.fieldId]
        if (val !== undefined && val !== null) {
          const num = Number(val)
          if (!isNaN(num)) values.push(num)
        }
      }
    }

    switch (config.aggFunc) {
      case 'SUM': value = values.reduce((a, b) => a + b, 0); break
      case 'AVG': value = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0; break
      case 'MAX': value = values.length > 0 ? Math.max(...values) : 0; break
      case 'MIN': value = values.length > 0 ? Math.min(...values) : 0; break
      case 'COUNT': value = values.length; break
    }

    return { value, taskIds }
  }

  function formatMetricValue(value: number): string {
    if (value >= 100000000) return (value / 100000000).toFixed(1) + '亿'
    if (value >= 10000) return (value / 10000).toFixed(0) + '万'
    return value.toLocaleString('zh-CN')
  }

  // ===== 领导批示置顶 =====
  function getRecentLeaderComments(tasks: SupervisionTask[], days: number = 7) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    const cutoffStr = cutoff.toISOString()

    const comments: Array<{
      taskId: string
      taskTitle: string
      currentStage: string
      content: string
      actorName: string
      timestamp: string
    }> = []

    for (const task of tasks) {
      const log = task.activityLog || []
      for (const entry of log) {
        if (entry.type === 'leader_comment' && entry.timestamp >= cutoffStr) {
          comments.push({
            taskId: task.id,
            taskTitle: task.title,
            currentStage: task.stagesSnapshot?.[task.currentStageIndex || 0]?.name || '',
            content: entry.content.length > 50 ? entry.content.substring(0, 50) + '...' : entry.content,
            actorName: entry.actorPeerId,
            timestamp: entry.timestamp,
          })
        }
      }
    }

    return comments.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  }

  // ===== 逾期/临期判断 =====
  function getDeadlineStatus(deadline?: string): 'overdue' | 'nearing' | 'normal' {
    if (!deadline) return 'normal'
    const now = new Date()
    const dl = new Date(deadline)
    if (dl < now) return 'overdue'
    const diffDays = Math.ceil((dl.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays <= 7) return 'nearing'
    return 'normal'
  }

  return {
    computeMetricValue, formatMetricValue,
    getRecentLeaderComments,
    getDeadlineStatus,
  }
})
