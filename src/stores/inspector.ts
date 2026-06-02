import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { SupervisionTask } from '@/types'
import { DatabaseManager } from '@/core/database/DatabaseManager'

export interface InspectorFilter {
  taskTypeId?: string
  source?: string
  ownerDeptId?: string
  coDeptId?: string
  status?: string
  tagIds?: string[]
  priority?: string
  keyword?: string
  deadlineStart?: string
  deadlineEnd?: string
}

export interface InspectorSummary {
  totalCount: number
  completedCount: number
  completionRate: number
  overdueCount: number
  overdueRate: number
  avgProcessingDays: number
}

export const useInspectorStore = defineStore('inspector', () => {
  const dbManager = DatabaseManager.getInstance()
  const filter = ref<InspectorFilter>({})
  const resultTasks = ref<SupervisionTask[]>([])
  const summary = ref<InspectorSummary>({
    totalCount: 0, completedCount: 0, completionRate: 0,
    overdueCount: 0, overdueRate: 0, avgProcessingDays: 0,
  })

  function safeJSON<T = any>(str: any, def: T): T {
    if (!str) return def
    if (typeof str !== 'string') return str as unknown as T
    try { return JSON.parse(str) } catch { return def }
  }

  function mapTask(raw: any): SupervisionTask {
    return {
      ...raw,
      responsibleMatrix: safeJSON(raw.responsibleMatrix, { primary: [], cooperative: [] }),
      stagesSnapshot: safeJSON(raw.stagesSnapshot, null),
      dataSheetRows: safeJSON(raw.dataSheetRows, null),
      authorizedPeers: safeJSON(raw.authorizedPeers, []),
      sharedWith: safeJSON(raw.sharedWith, []),
      starredBy: safeJSON(raw.starredBy, []),
      activityLog: safeJSON(raw.activityLog, []),
      tags: safeJSON(raw.tags, []),
      childTaskIds: safeJSON(raw.childTaskIds, []),
    }
  }

  function applyFilter(f: InspectorFilter = filter.value) {
    const raw = dbManager.query<any>('SELECT * FROM tasks WHERE is_history = 0')
    let tasks = raw.map(mapTask)

    if (f.taskTypeId) tasks = tasks.filter(t => t.taskTypeId === f.taskTypeId)
    if (f.ownerDeptId) {
      tasks = tasks.filter(t => t.responsibleMatrix?.primary?.some((p: any) => p.departmentId === f.ownerDeptId))
    }
    if (f.coDeptId) {
      tasks = tasks.filter(t => t.responsibleMatrix?.cooperative?.some((c: any) => c.departmentId === f.coDeptId))
    }
    if (f.status) tasks = tasks.filter(t => t.status === f.status)
    if (f.priority) tasks = tasks.filter(t => t.priority === f.priority)
    if (f.keyword) {
      const kw = f.keyword.toLowerCase()
      tasks = tasks.filter(t => t.title.toLowerCase().includes(kw))
    }
    if (f.tagIds && f.tagIds.length > 0) {
      tasks = tasks.filter(t => (t.tags || []).some(tag => f.tagIds!.includes(tag)))
    }
    if (f.deadlineStart) tasks = tasks.filter(t => t.deadline && t.deadline >= f.deadlineStart!)
    if (f.deadlineEnd) tasks = tasks.filter(t => t.deadline && t.deadline <= f.deadlineEnd!)

    resultTasks.value = tasks

    // 汇总统计
    const now = new Date().toISOString().split('T')[0]
    const completed = tasks.filter(t => t.status === 'completed')
    const overdue = tasks.filter(t => t.status !== 'completed' && t.deadline && t.deadline < now)

    let totalDays = 0
    let dayCount = 0
    for (const t of tasks) {
      if (t.createdAt) {
        const end = t.status === 'completed' ? t.updatedAt : now
        const start = t.createdAt.split('T')[0]
        const endDate = end.split('T')[0]
        const diff = (new Date(endDate).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24)
        if (diff >= 0) { totalDays += diff; dayCount++ }
      }
    }

    summary.value = {
      totalCount: tasks.length,
      completedCount: completed.length,
      completionRate: tasks.length > 0 ? Math.round((completed.length / tasks.length) * 1000) / 10 : 0,
      overdueCount: overdue.length,
      overdueRate: tasks.length > 0 ? Math.round((overdue.length / tasks.length) * 1000) / 10 : 0,
      avgProcessingDays: dayCount > 0 ? Math.round(totalDays / dayCount) : 0,
    }
  }

  function getUncompletedDepts(task: SupervisionTask): string[] {
    const depts: string[] = []
    const matrix = task.responsibleMatrix
    if (matrix) {
      for (const entry of [...(matrix.primary || []), ...(matrix.cooperative || [])]) {
        if (entry.feedbackStatus !== 'confirmed') {
          depts.push(entry.departmentId)
        }
      }
    }
    return depts
  }

  return { filter, resultTasks, summary, applyFilter, getUncompletedDepts }
})
