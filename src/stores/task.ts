import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { SupervisionTask, ActivityLogEntry, ResponsibleMatrix, DataSheetRow, StageSnapshot } from '@/types'
import { DatabaseManager } from '@/core/database/DatabaseManager'
import { v4 as uuidv4 } from 'uuid'
import { eventBus } from '@/utils/eventBus'

export const useTaskStore = defineStore('task', () => {
  const tasks = ref<SupervisionTask[]>([])
  const currentTask = ref<SupervisionTask | null>(null)
  const dbManager = DatabaseManager.getInstance()

  // ===== 工具函数 =====
  function safeParseJSON<T = any>(str: any, defaultVal: T): T {
    if (!str) return defaultVal
    if (typeof str !== 'string') return str as unknown as T
    try { return JSON.parse(str) } catch { return defaultVal }
  }

  function mapTask(raw: any): SupervisionTask {
    return {
      ...raw,
      responsibleMatrix: safeParseJSON(raw.responsibleMatrix, { primary: [], cooperative: [] }) as ResponsibleMatrix,
      stagesSnapshot: safeParseJSON(raw.stagesSnapshot, null) as StageSnapshot[] | undefined,
      dataSheetFields: safeParseJSON(raw.dataSheetFields, null),
      dataSheetRows: safeParseJSON(raw.dataSheetRows, null) as DataSheetRow[] | undefined,
      aggregationRules: safeParseJSON(raw.aggregationRules, null),
      snapshots: safeParseJSON(raw.snapshots, null),
      extractionConfig: safeParseJSON(raw.extractionConfig, null),
      authorizedPeers: safeParseJSON(raw.authorizedPeers, []),
      sharedWith: safeParseJSON(raw.sharedWith, []),
      starredBy: safeParseJSON(raw.starredBy, []),
      activityLog: safeParseJSON(raw.activityLog, []),
      tags: safeParseJSON(raw.tags, []),
      childTaskIds: safeParseJSON(raw.childTaskIds, []),
      owner_dept_ids: safeParseJSON(raw.owner_dept_ids, []),
      co_dept_ids: safeParseJSON(raw.co_dept_ids, []),
      confirmedFeedback: safeParseJSON(raw.confirmedFeedback, null),
      source: safeParseJSON(raw.source, null),
    }
  }

  // ===== CRUD =====
  async function fetchTasks() {
    const raw = dbManager.query<any>('SELECT * FROM tasks WHERE is_history = 0 ORDER BY updatedAt DESC, created_at DESC')
    tasks.value = raw.map(mapTask)
  }

  async function fetchTaskById(id: string): Promise<SupervisionTask | null> {
    const results = dbManager.query<any>('SELECT * FROM tasks WHERE id = ?', [id])
    if (results.length === 0) return null
    currentTask.value = mapTask(results[0])
    return currentTask.value
  }

  // V3.0 创建任务
  async function createTask(payload: Partial<SupervisionTask> & { title: string }): Promise<string> {
    const id = uuidv4()
    const now = new Date().toISOString()
    const sql = `INSERT INTO tasks (
      id, title, description, taskTypeGroupId, taskTypeId, status, priority,
      deadline, tags, source, responsibleMatrix,
      flowTemplateId, stagesSnapshot, currentStageIndex,
      dataSheetTemplateId, dataSheetFields, dataSheetRows,
      childAggregationMode, aggregationRules,
      extractionConfig, authorizedPeers, sharedWith,
      createdBy, created_at, updatedAt,
      starredBy, activityLog, parent_id, childTaskIds,
      owner_dept_ids, co_dept_ids, task_type, level
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

    dbManager.execute(sql, [
      id,
      payload.title || '',
      payload.description || '',
      payload.taskTypeGroupId || null,
      payload.taskTypeId || null,
      payload.status || 'pending',
      payload.priority || 'normal',
      payload.deadline || null,
      JSON.stringify(payload.tags || []),
      JSON.stringify(payload.source || { type: 'manual' }),
      JSON.stringify(payload.responsibleMatrix || { primary: [], cooperative: [] }),
      payload.flowTemplateId || null,
      JSON.stringify(payload.stagesSnapshot || null),
      payload.currentStageIndex ?? 0,
      payload.dataSheetTemplateId || null,
      JSON.stringify(payload.dataSheetFields || null),
      JSON.stringify(payload.dataSheetRows || []),
      payload.childAggregationMode || 'none',
      JSON.stringify(payload.aggregationRules || null),
      JSON.stringify(payload.extractionConfig || null),
      JSON.stringify(payload.authorizedPeers || []),
      JSON.stringify(payload.sharedWith || []),
      payload.createdBy || '',
      now,
      now,
      JSON.stringify(payload.starredBy || []),
      JSON.stringify(payload.activityLog || []),
      payload.parentTaskId || null,
      JSON.stringify(payload.childTaskIds || []),
      JSON.stringify([]),
      JSON.stringify([]),
      '',
      1,
    ])

    // 创建子任务关系
    if (payload.childTaskIds && payload.childTaskIds.length > 0) {
      for (const childId of payload.childTaskIds) {
        if (typeof childId === 'string' && childId) {
          dbManager.execute(
            `INSERT OR REPLACE INTO task_relations (id, parentTaskId, childTaskId, relationType, aggregationMode, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), id, childId, 'parent_child', payload.childAggregationMode || 'none', now],
          )
        }
      }
    }

    await dbManager.persist()
    await fetchTasks()
    eventBus.emit('task-updated', {})
    return id
  }

  async function updateTask(id: string, payload: Partial<SupervisionTask>) {
    const existing = dbManager.query<any>('SELECT * FROM tasks WHERE id = ?', [id])
    if (existing.length === 0) return

    const now = new Date().toISOString()
    const fields: string[] = []
    const values: any[] = []

    const setField = (col: string, val: any, serialize = false) => {
      fields.push(`${col} = ?`)
      values.push(serialize ? JSON.stringify(val) : val)
    }

    if (payload.title !== undefined) setField('title', payload.title)
    if (payload.description !== undefined) setField('description', payload.description)
    if (payload.taskTypeGroupId !== undefined) setField('taskTypeGroupId', payload.taskTypeGroupId)
    if (payload.taskTypeId !== undefined) setField('taskTypeId', payload.taskTypeId)
    if (payload.status !== undefined) setField('status', payload.status)
    if (payload.priority !== undefined) setField('priority', payload.priority)
    if (payload.deadline !== undefined) setField('deadline', payload.deadline)
    if (payload.tags !== undefined) setField('tags', payload.tags, true)
    if (payload.source !== undefined) setField('source', payload.source, true)
    if (payload.responsibleMatrix !== undefined) setField('responsibleMatrix', payload.responsibleMatrix, true)
    if (payload.stagesSnapshot !== undefined) setField('stagesSnapshot', payload.stagesSnapshot, true)
    if (payload.currentStageIndex !== undefined) setField('currentStageIndex', payload.currentStageIndex)
    if (payload.confirmedFeedback !== undefined) setField('confirmedFeedback', payload.confirmedFeedback, true)
    if (payload.dataSheetTemplateId !== undefined) setField('dataSheetTemplateId', payload.dataSheetTemplateId)
    if (payload.dataSheetFields !== undefined) setField('dataSheetFields', payload.dataSheetFields, true)
    if (payload.dataSheetRows !== undefined) setField('dataSheetRows', payload.dataSheetRows, true)
    if (payload.childAggregationMode !== undefined) setField('childAggregationMode', payload.childAggregationMode)
    if (payload.aggregationRules !== undefined) setField('aggregationRules', payload.aggregationRules, true)
    if (payload.extractionConfig !== undefined) setField('extractionConfig', payload.extractionConfig, true)
    if (payload.authorizedPeers !== undefined) setField('authorizedPeers', payload.authorizedPeers, true)
    if (payload.sharedWith !== undefined) setField('sharedWith', payload.sharedWith, true)
    if (payload.starredBy !== undefined) setField('starredBy', payload.starredBy, true)
    if (payload.activityLog !== undefined) setField('activityLog', payload.activityLog, true)
    if (payload.childTaskIds !== undefined) setField('childTaskIds', payload.childTaskIds, true)

    setField('updatedAt', now)

    if (fields.length > 0) {
      values.push(id)
      dbManager.execute(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`, values)
      await dbManager.persist()
    }

    if (currentTask.value?.id === id) {
      currentTask.value = mapTask(dbManager.query<any>('SELECT * FROM tasks WHERE id = ?', [id])[0])
    }
    await fetchTasks()
    eventBus.emit('task-updated', { taskId: id })
  }

  async function deleteTask(id: string) {
    dbManager.execute('DELETE FROM feedbacks WHERE task_id = ?', [id])
    dbManager.execute('DELETE FROM leader_comments WHERE task_id = ?', [id])
    dbManager.execute('DELETE FROM task_relations WHERE parentTaskId = ? OR childTaskId = ?', [id, id])
    dbManager.execute('DELETE FROM task_collaborators WHERE task_id = ?', [id])
    dbManager.execute('DELETE FROM task_process_nodes WHERE task_id = ?', [id])
    dbManager.execute('DELETE FROM tasks WHERE id = ?', [id])
    await dbManager.persist()
    await fetchTasks()
    eventBus.emit('task-updated', {})
  }

  // ===== 关注管理 =====
  async function toggleStar(taskId: string, peerId: string) {
    const task = dbManager.query<any>('SELECT starredBy FROM tasks WHERE id = ?', [taskId])
    if (!task[0]) return
    const starred: string[] = safeParseJSON(task[0].starredBy, [])
    const idx = starred.indexOf(peerId)
    if (idx >= 0) starred.splice(idx, 1)
    else starred.push(peerId)
    await updateTask(taskId, { starredBy: starred })
  }

  function isStarred(taskId: string, peerId: string): boolean {
    const task = tasks.value.find(t => t.id === taskId)
    return task ? (task.starredBy || []).includes(peerId) : false
  }

  // ===== 动态管理 =====
  async function addActivityLog(taskId: string, entry: Omit<ActivityLogEntry, 'id'>) {
    const task = dbManager.query<any>('SELECT activityLog FROM tasks WHERE id = ?', [taskId])
    if (!task[0]) return
    const log: ActivityLogEntry[] = safeParseJSON(task[0].activityLog, [])
    log.push({ ...entry, id: uuidv4() })
    await updateTask(taskId, { activityLog: log })
  }

  function getActivityLog(taskId: string): ActivityLogEntry[] {
    const task = dbManager.query<any>('SELECT activityLog FROM tasks WHERE id = ?', [taskId])
    return task[0] ? safeParseJSON(task[0].activityLog, []) : []
  }

  // ===== 送阅 =====
  async function shareTo(taskId: string, peerIds: string[]) {
    const task = dbManager.query<any>('SELECT sharedWith FROM tasks WHERE id = ?', [taskId])
    if (!task[0]) return
    const shared: string[] = safeParseJSON(task[0].sharedWith, [])
    for (const pid of peerIds) {
      if (!shared.includes(pid)) shared.push(pid)
    }
    await updateTask(taskId, { sharedWith: shared })
  }

  async function batchShare(taskIds: string[], peerIds: string[]) {
    for (const tid of taskIds) {
      await shareTo(tid, peerIds)
    }
  }

  // ===== 环节推进 =====
  async function progressStage(taskId: string, nextStageIndex: number, optionLabel: string, actorPeerId: string) {
    const task = dbManager.query<any>('SELECT * FROM tasks WHERE id = ?', [taskId])
    if (!task[0]) return

    const updates: Partial<SupervisionTask> = {
      currentStageIndex: nextStageIndex,
    }

    // 自动流转状态
    if (task[0].status === 'pending') {
      updates.status = 'in_progress'
    }

    const stages: StageSnapshot[] = Array.isArray(safeParseJSON(task[0].stagesSnapshot, [])) ? safeParseJSON(task[0].stagesSnapshot, []) : []
    if (nextStageIndex >= (stages.length || 0)) {
      updates.status = 'completed'
    }

    // 添加流转记录
    const log: ActivityLogEntry[] = safeParseJSON(task[0].activityLog, [])
    log.push({
      id: uuidv4(),
      type: 'stage_progress',
      content: `环节推进: ${optionLabel}`,
      timestamp: new Date().toISOString(),
      actorPeerId,
      metadata: { oldStageIndex: task[0].currentStageIndex || 0, newStageIndex: nextStageIndex },
    })
    updates.activityLog = log

    await updateTask(taskId, updates)
  }

  // ===== 数据明细 =====
  async function addDataRow(taskId: string, row: DataSheetRow) {
    const task = dbManager.query<any>('SELECT dataSheetRows FROM tasks WHERE id = ?', [taskId])
    if (!task[0]) return
    const rows: DataSheetRow[] = safeParseJSON(task[0].dataSheetRows, [])
    rows.push(row)
    await updateTask(taskId, { dataSheetRows: rows })
  }

  async function updateDataRow(taskId: string, rowId: string, data: Record<string, any>, peerId: string) {
    const task = dbManager.query<any>('SELECT dataSheetRows FROM tasks WHERE id = ?', [taskId])
    if (!task[0]) return
    const rows: DataSheetRow[] = safeParseJSON(task[0].dataSheetRows, [])
    const idx = rows.findIndex(r => r.rowId === rowId)
    if (idx >= 0 && rows[idx].creatorId === peerId) {
      rows[idx].data = data
      rows[idx].updatedAt = new Date().toISOString()
      await updateTask(taskId, { dataSheetRows: rows })
    }
  }

  async function deleteDataRow(taskId: string, rowId: string, peerId: string) {
    const task = dbManager.query<any>('SELECT dataSheetRows FROM tasks WHERE id = ?', [taskId])
    if (!task[0]) return
    const rows: DataSheetRow[] = safeParseJSON(task[0].dataSheetRows, [])
    const filtered = rows.filter(r => !(r.rowId === rowId && r.creatorId === peerId))
    if (filtered.length !== rows.length) {
      await updateTask(taskId, { dataSheetRows: filtered })
    }
  }

  // ===== 子任务 =====
  function getSubtasks(parentId: string): SupervisionTask[] {
    const raw = dbManager.query<any>('SELECT * FROM tasks WHERE parent_id = ? AND is_history = 0 ORDER BY created_at ASC', [parentId])
    return raw.map(mapTask)
  }

  function getSubtaskSummary(parentId: string) {
    const subs = getSubtasks(parentId)
    const now = new Date().toISOString().split('T')[0]
    const completed = subs.filter(s => s.status === 'completed').length
    const overdue = subs.filter(s => s.status !== 'completed' && s.deadline && s.deadline < now).length
    return { total: subs.length, completed, inProgress: subs.length - completed, overdue }
  }

  // ===== 兼容旧接口 =====
  async function addFeedback(data: any) {
    const sql = `INSERT OR REPLACE INTO feedbacks (id, task_id, dept_id, content, feedback_person, attachments, feedback_time) VALUES (?, ?, ?, ?, ?, ?, ?)`
    dbManager.execute(sql, [uuidv4(), data.taskId, data.deptId, data.content, data.person, JSON.stringify(data.attachments || []), new Date().toISOString()])
    await dbManager.persist()
  }

  async function addLeaderComment(data: any) {
    const sql = `INSERT OR REPLACE INTO leader_comments (id, task_id, leader_name, content, attachments, created_at, highlighted) VALUES (?, ?, ?, ?, ?, ?, ?)`
    dbManager.execute(sql, [uuidv4(), data.taskId, data.leaderName, data.content, JSON.stringify(data.attachments || []), new Date().toISOString(), 1])
    await dbManager.persist()
    eventBus.emit('leader-comment-added', data)
  }

  function getTaskFeedbacks(taskId: string) {
    return dbManager.query('SELECT * FROM feedbacks WHERE task_id = ? ORDER BY feedback_time DESC', [taskId])
  }

  function getTaskComments(taskId: string) {
    return dbManager.query('SELECT * FROM leader_comments WHERE task_id = ? ORDER BY created_at DESC', [taskId])
  }

  function getGlobalLatestLogs() {
    const sql = `SELECT 'feedback' as type, content, feedback_time as time, feedback_person as person, task_id FROM feedbacks UNION SELECT 'comment' as type, content, created_at as time, leader_name as person, task_id FROM leader_comments ORDER BY time DESC LIMIT 5`
    return dbManager.query(sql).map((log: any) => {
      const task = tasks.value.find(t => t.id === log.task_id)
      return { ...log, taskTitle: task ? task.title : '未知任务' }
    })
  }

  function getDeptStats() {
    const stats: Record<string, number> = {}
    tasks.value.forEach(t => {
      t.authorizedPeers?.forEach(() => { /* iterate */ })
    })
    return Object.entries(stats).map(([id, count]) => ({ id, count }))
  }

  function getOverdueCount() {
    const now = new Date().toISOString().split('T')[0]
    return tasks.value.filter(t => t.status !== 'completed' && t.deadline && t.deadline < now).length
  }

  async function completeTask(id: string) {
    await updateTask(id, { status: 'completed' })
  }

  // ===== 关注 (task_watches 兼容) =====
  async function addWatch(taskId: string, userId: string) {
    dbManager.execute('INSERT OR REPLACE INTO task_watches (id, task_id, user_id) VALUES (?, ?, ?)', [uuidv4(), taskId, userId])
    await dbManager.persist()
  }

  async function removeWatch(taskId: string, userId: string) {
    dbManager.execute('DELETE FROM task_watches WHERE task_id = ? AND user_id = ?', [taskId, userId])
    await dbManager.persist()
  }

  function getWatchedTaskIds(userId: string): string[] {
    return dbManager.query<{ task_id: string }>('SELECT task_id FROM task_watches WHERE user_id = ?', [userId]).map(r => r.task_id)
  }

  return {
    tasks, currentTask,
    fetchTasks, fetchTaskById, createTask, updateTask, deleteTask,
    toggleStar, isStarred,
    addActivityLog, getActivityLog,
    shareTo, batchShare,
    progressStage,
    addDataRow, updateDataRow, deleteDataRow,
    getSubtasks, getSubtaskSummary,
    addFeedback, addLeaderComment, getTaskFeedbacks, getTaskComments,
    getGlobalLatestLogs, getDeptStats, getOverdueCount, completeTask,
    addWatch, removeWatch, getWatchedTaskIds,
  }
})
