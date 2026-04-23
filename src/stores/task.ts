import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { SupervisionTask} from '@/types'; 
import { DatabaseManager } from '@/core/database/DatabaseManager';
import { v4 as uuidv4 } from 'uuid';

export const useTaskStore = defineStore('task', () => {
  const tasks = ref<SupervisionTask[]>([]);
  const dbManager = DatabaseManager.getInstance();

  // --- 1. 查 (Read) ---
  async function fetchTasks() {
    const raw = dbManager.query<any>("SELECT * FROM tasks ORDER BY created_at DESC");
    tasks.value = raw.map(t => ({
      ...t,
      owner_dept_ids: JSON.parse(t.owner_dept_ids || '[]'),
      co_dept_ids: JSON.parse(t.co_dept_ids || '[]')
    }));
  }

  // src/stores/task.ts

// --- 修改创建逻辑 ---
// src/stores/task.ts

async function createTask(payload: any) {
  const id = uuidv4();
  // 【关键修改点】：增加 OR REPLACE
  const sql = `
    INSERT OR REPLACE INTO tasks (
      id, parent_id, level, title, content, task_type, priority, 
      owner_dept_ids, co_dept_ids, dept_requirements, co_dept_requirements,
      deadline, status, progress, is_history, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  const params = [
    id,
    payload.parentId ?? null,
    payload.level ?? 1,
    payload.title ?? '',
    payload.content ?? '',
    '常规',
    payload.priority ?? 'MEDIUM',
    JSON.stringify(payload.owner_dept_ids || []),
    JSON.stringify(payload.co_dept_ids || []),
    payload.dept_requirements ?? '{}',
    payload.co_dept_requirements ?? '{}',
    payload.deadline ?? null,
    'PENDING',
    0,
    0,
    new Date().toISOString()
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
      status = ?
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
  const sql = `INSERT OR REPLACE INTO leader_comments (id, task_id, leader_name, content, attachments, created_at) VALUES (?, ?, ?, ?, ?, ?)`;
    const params = [uuidv4(), data.taskId, data.leaderName, data.content, JSON.stringify(data.attachments), new Date().toISOString()];
    dbManager.execute(sql, params);
    await dbManager.persist();
  }

  function getTaskFeedbacks(taskId: string) {
    return dbManager.query("SELECT * FROM feedbacks WHERE task_id = ? ORDER BY feedback_time DESC", [taskId]);
  }

  function getTaskComments(taskId: string) {
    return dbManager.query("SELECT * FROM leader_comments WHERE task_id = ? ORDER BY created_at DESC", [taskId]);
  }

  return { tasks, fetchTasks, createTask, updateTask, deleteTask, addFeedback, addLeaderComment, getTaskFeedbacks, getTaskComments,getGlobalLatestLogs, // 必须返回
    getDeptStats, getOverdueCount, completeTask };
});