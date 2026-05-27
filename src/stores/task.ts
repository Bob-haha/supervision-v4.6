import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { SupervisionTask} from '@/types';
import { DatabaseManager } from '@/core/database/DatabaseManager';
import { v4 as uuidv4 } from 'uuid';
import { eventBus } from '@/utils/eventBus';

export const useTaskStore = defineStore('task', () => {
  const tasks = ref<SupervisionTask[]>([]);
  const dbManager = DatabaseManager.getInstance();

  // --- 1. 查 (Read) ---
  async function fetchTasks() {
    const raw = dbManager.query<any>("SELECT * FROM tasks ORDER BY created_at DESC");
    tasks.value = raw.map(t => ({
      ...t,
      owner_dept_ids: JSON.parse(t.owner_dept_ids || '[]'),
      co_dept_ids: JSON.parse(t.co_dept_ids || '[]'),
      tags: safeParseJSON(t.tags, []),
    }));
  }

  // src/stores/task.ts

// --- 修改创建逻辑 ---
// src/stores/task.ts

async function createTask(payload: any) {
  const id = uuidv4();
  const sql = `
    INSERT OR REPLACE INTO tasks (
      id, parent_id, level, title, content, task_type, priority,
      owner_dept_ids, co_dept_ids, dept_requirements, co_dept_requirements,
      deadline, status, progress, is_history, created_at,
      source, tags, handler_name, is_key_task
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  const params = [
    id,
    payload.parentId ?? null,
    payload.level ?? 1,
    payload.title ?? '',
    payload.content ?? '',
    payload.task_type ?? '常规',
    payload.priority ?? 'MEDIUM',
    JSON.stringify(payload.owner_dept_ids || []),
    JSON.stringify(payload.co_dept_ids || []),
    payload.dept_requirements ?? '{}',
    payload.co_dept_requirements ?? '{}',
    payload.deadline ?? null,
    'PENDING',
    0,
    0,
    new Date().toISOString(),
    payload.source ?? 'OTHER',
    JSON.stringify(payload.tags || []),
    payload.handler_name ?? '',
    payload.is_key_task ? 1 : 0,
  ];

  dbManager.execute(sql, params);
  await dbManager.persist();
  await fetchTasks();
}

// --- 修改更新逻辑 ---
async function updateTask(id: string, payload: any) {
  const sql = `
    UPDATE tasks SET
      title = ?, content = ?, deadline = ?, priority = ?,
      owner_dept_ids = ?, co_dept_ids = ?,
      dept_requirements = ?, co_dept_requirements = ?,
      status = ?, task_type = ?,
      source = ?, tags = ?, handler_name = ?, is_key_task = ?
    WHERE id = ?
  `;

  const params = [
    payload.title ?? '',
    payload.content ?? '',
    payload.deadline ?? null,
    payload.priority ?? 'MEDIUM',
    JSON.stringify(payload.owner_dept_ids || []),
    JSON.stringify(payload.co_dept_ids || []),
    payload.dept_requirements ?? '{}',
    payload.co_dept_requirements ?? '{}',
    payload.status ?? 'PENDING',
    payload.task_type ?? '常规',
    payload.source ?? 'OTHER',
    JSON.stringify(payload.tags || []),
    payload.handler_name ?? '',
    payload.is_key_task ? 1 : 0,
    id
  ];

  dbManager.execute(sql, params);
  await dbManager.persist();
  await fetchTasks();
}

  // --- 4. 删 (Delete) ---
  async function deleteTask(id: string) {
    dbManager.execute("DELETE FROM tasks WHERE id = ?", [id]);
    dbManager.execute("DELETE FROM feedbacks WHERE task_id = ?", [id]); // 联动删除进展
    dbManager.execute("DELETE FROM leader_comments WHERE task_id = ?", [id]); // 联动删除批示
    await dbManager.persist();
    await fetchTasks();
  }

  // src/stores/task.ts 增加以下方法

// 获取全系统最新的 5 条动态（合并批示和反馈）
  function getGlobalLatestLogs() {
    const sql = `
      SELECT 'feedback' as type, content, feedback_time as time, feedback_person as person, task_id 
      FROM feedbacks 
      UNION 
      SELECT 'comment' as type, content, created_at as time, leader_name as person, task_id 
      FROM leader_comments 
      ORDER BY time DESC LIMIT 5
    `;
    const logs = dbManager.query(sql);
    // 关联一下任务标题
    return logs.map(log => {
      const task = tasks.value.find(t => t.id === log.task_id);
      return { ...log, taskTitle: task ? task.title : '未知任务' };
    });
  }

  // 获取各科室承办任务数量统计（用于饼图）
  function getDeptStats() {
    const stats: Record<string, number> = {};
    tasks.value.forEach(t => {
      t.owner_dept_ids.forEach(id => {
        stats[id] = (stats[id] || 0) + 1;
      });
    });
    return Object.entries(stats).map(([id, count]) => ({ id, count }));
  }
  function getOverdueCount() {
  const now = new Date().toISOString().split('T')[0];
  return tasks.value.filter(t => 
    t.status !== 'COMPLETED' && 
    t.deadline && 
    t.deadline < now
  ).length;
}

// 2. 办结任务动作
async function completeTask(id: string) {
  const sql = `UPDATE tasks SET status = 'COMPLETED', progress = 100 WHERE id = ?`;
  dbManager.execute(sql, [id]);
  await dbManager.persist();
  await fetchTasks();
}
  // --- 5. 进展与批示逻辑 ---
  async function addFeedback(data:any) {
    const sql = `INSERT OR REPLACE INTO feedbacks (id, task_id, dept_id, content, feedback_person, attachments, feedback_time) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const params = [uuidv4(), data.taskId, data.deptId, data.content, data.person, JSON.stringify(data.attachments), new Date().toISOString()];
    dbManager.execute(sql, params);
    await dbManager.persist();
  }

  async function addLeaderComment(data: any) {
  const sql = `INSERT OR REPLACE INTO leader_comments (id, task_id, leader_name, content, attachments, created_at, highlighted) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const params = [uuidv4(), data.taskId, data.leaderName, data.content, JSON.stringify(data.attachments), new Date().toISOString(), 1];
    dbManager.execute(sql, params);
    await dbManager.persist();
    eventBus.emit('leader-comment-added', data);
  }

  function getTaskFeedbacks(taskId: string) {
    return dbManager.query("SELECT * FROM feedbacks WHERE task_id = ? ORDER BY feedback_time DESC", [taskId]);
  }

  function getTaskComments(taskId: string) {
    return dbManager.query("SELECT * FROM leader_comments WHERE task_id = ? ORDER BY created_at DESC", [taskId]);
  }

  // --- 6. 关注管理 ---
  async function addWatch(taskId: string, userId: string) {
    dbManager.execute('INSERT OR REPLACE INTO task_watches (id, task_id, user_id) VALUES (?, ?, ?)', [uuidv4(), taskId, userId]);
    await dbManager.persist();
  }

  async function removeWatch(taskId: string, userId: string) {
    dbManager.execute('DELETE FROM task_watches WHERE task_id = ? AND user_id = ?', [taskId, userId]);
    await dbManager.persist();
  }

  function getWatchedTaskIds(userId: string): string[] {
    return dbManager.query<{ task_id: string }>('SELECT task_id FROM task_watches WHERE user_id = ?', [userId]).map(r => r.task_id);
  }

  // --- 7. 子任务 ---
  function getSubtasks(parentId: string): SupervisionTask[] {
    return dbManager.query<any>("SELECT * FROM tasks WHERE parent_id = ? AND is_history = 0 ORDER BY created_at ASC", [parentId])
      .map(t => ({ ...t, owner_dept_ids: JSON.parse(t.owner_dept_ids || '[]'), co_dept_ids: JSON.parse(t.co_dept_ids || '[]'), tags: safeParseJSON(t.tags, []) }));
  }

  function getSubtaskSummary(parentId: string) {
    const subs = getSubtasks(parentId);
    const now = new Date().toISOString().split('T')[0];
    const completed = subs.filter(s => s.status === 'COMPLETED').length;
    const overdue = subs.filter(s => s.status !== 'COMPLETED' && s.deadline && s.deadline < now).length;
    return { total: subs.length, completed, inProgress: subs.length - completed, overdue };
  }

  // --- 8. 批示已阅 ---
  async function markInstructionRead(instructionId: string, userId: string) {
    dbManager.execute('INSERT OR REPLACE INTO leader_instruction_reads (id, instruction_id, user_id) VALUES (?, ?, ?)', [uuidv4(), instructionId, userId]);
    await dbManager.persist();
  }

  function getUnreadInstructionIds(userId: string): string[] {
    const all = dbManager.query<{ id: string }>('SELECT id FROM leader_comments');
    const read = dbManager.query<{ instruction_id: string }>('SELECT instruction_id FROM leader_instruction_reads WHERE user_id = ?', [userId]);
    const readIds = new Set(read.map(r => r.instruction_id));
    return all.filter(c => !readIds.has(c.id)).map(c => c.id);
  }

  function isInstructionRead(instructionId: string, userId: string): boolean {
    const r = dbManager.query<{ count: number }>('SELECT count(*) as count FROM leader_instruction_reads WHERE instruction_id = ? AND user_id = ?', [instructionId, userId]);
    return (r[0]?.count || 0) > 0;
  }

  return { tasks, fetchTasks, createTask, updateTask, deleteTask, addFeedback, addLeaderComment, getTaskFeedbacks, getTaskComments,getGlobalLatestLogs, getDeptStats, getOverdueCount, completeTask, addWatch, removeWatch, getWatchedTaskIds, getSubtasks, getSubtaskSummary, markInstructionRead, getUnreadInstructionIds, isInstructionRead };
});

function safeParseJSON(str: any, defaultVal: any): any {
  if (!str) return defaultVal;
  if (typeof str !== 'string') return str;
  try { return JSON.parse(str); } catch { return defaultVal; }
}