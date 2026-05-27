import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { SupervisionFilter, SupervisionReminder } from '@/types';
import { DatabaseManager } from '@/core/database/DatabaseManager';
import { v4 as uuidv4 } from 'uuid';

export const useSupervisionStore = defineStore('supervision', () => {
  const reminders = ref<SupervisionReminder[]>([]);
  const dbManager = DatabaseManager.getInstance();

  /** 按条件筛选任务 */
  function getFilteredTasks(filter: Partial<SupervisionFilter>): any[] {
    const conditions: string[] = ["is_history = 0"];
    const params: any[] = [];

    if (filter.deptIds && filter.deptIds.length > 0) {
      const deptClauses = filter.deptIds.map(() => "(owner_dept_ids LIKE ? OR co_dept_ids LIKE ?)");
      conditions.push(`(${deptClauses.join(' OR ')})`);
      for (const id of filter.deptIds) {
        params.push(`%"${id}"%`, `%"${id}"%`);
      }
    }

    if (filter.source) {
      conditions.push('source = ?');
      params.push(filter.source);
    }

    if (filter.tags && filter.tags.length > 0) {
      const tagClauses = filter.tags.map(() => 'tags LIKE ?');
      conditions.push(`(${tagClauses.join(' OR ')})`);
      for (const tag of filter.tags) {
        params.push(`%${tag}%`);
      }
    }

    if (filter.status) {
      const now = new Date().toISOString().split('T')[0];
      if (filter.status === 'OVERDUE') {
        conditions.push("status != 'COMPLETED' AND deadline < ?");
        params.push(now);
      } else {
        conditions.push('status = ?');
        params.push(filter.status);
      }
    }

    if (filter.dateRange && filter.dateRange.length === 2) {
      conditions.push('created_at >= ? AND created_at <= ?');
      params.push(filter.dateRange[0], filter.dateRange[1]);
    }

    if (filter.handlerName) {
      conditions.push('handler_name LIKE ?');
      params.push(`%${filter.handlerName}%`);
    }

    const sql = `SELECT * FROM tasks WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`;
    return dbManager.query(sql, params).map(t => ({
      ...t,
      owner_dept_ids: JSON.parse(t.owner_dept_ids || '[]'),
      co_dept_ids: JSON.parse(t.co_dept_ids || '[]'),
      tags: safeParseJSON(t.tags, []),
    }));
  }

  /** 批量催办 */
  async function sendBatchReminders(taskIds: string[], content: string, remindedBy: string) {
    for (const taskId of taskIds) {
      dbManager.execute(
        'INSERT INTO supervision_reminders (id, task_id, reminded_by, remind_content) VALUES (?, ?, ?, ?)',
        [uuidv4(), taskId, remindedBy, content],
      );
    }
    await dbManager.persist();
  }

  /** 获取催办历史 */
  function getRemindHistory(taskId: string): SupervisionReminder[] {
    return dbManager.query<SupervisionReminder>(
      'SELECT * FROM supervision_reminders WHERE task_id = ? ORDER BY reminded_at DESC',
      [taskId],
    );
  }

  /** 办结分析 — 按月份统计 */
  function getCompletionTrend(months: number = 6): Array<{ month: string; completed: number; created: number }> {
    const results: Array<{ month: string; completed: number; created: number }> = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const monthStart = `${year}-${month}-01`;
      const nextMonth = new Date(year, d.getMonth() + 1, 1);
      const monthEnd = nextMonth.toISOString().split('T')[0];

      const completed = dbManager.query<{ count: number }>(
        "SELECT count(*) as count FROM tasks WHERE status = 'COMPLETED' AND created_at >= ? AND created_at < ?",
        [monthStart, monthEnd],
      );
      const created = dbManager.query<{ count: number }>(
        'SELECT count(*) as count FROM tasks WHERE created_at >= ? AND created_at < ?',
        [monthStart, monthEnd],
      );

      results.push({
        month: `${year}-${month}`,
        completed: completed[0]?.count || 0,
        created: created[0]?.count || 0,
      });
    }

    return results;
  }

  /** 超期分析 — 按科室统计 */
  function getOverdueByDept(): Array<{ deptId: string; count: number }> {
    const allTasks = dbManager.query<{ owner_dept_ids: string; status: string; deadline: string }>(
      'SELECT owner_dept_ids, status, deadline FROM tasks WHERE is_history = 0',
    );
    const now = new Date().toISOString().split('T')[0];
    const deptMap = new Map<string, number>();

    for (const t of allTasks) {
      if (t.status === 'COMPLETED' || !t.deadline || t.deadline >= now) continue;
      const deptIds = safeParseJSON(t.owner_dept_ids, []);
      for (const id of deptIds) {
        deptMap.set(id, (deptMap.get(id) || 0) + 1);
      }
    }

    return Array.from(deptMap.entries()).map(([deptId, count]) => ({ deptId, count }));
  }

  return {
    reminders,
    getFilteredTasks, sendBatchReminders, getRemindHistory,
    getCompletionTrend, getOverdueByDept,
  };
});

function safeParseJSON(str: any, defaultVal: any): any {
  if (!str) return defaultVal;
  if (typeof str !== 'string') return str;
  try { return JSON.parse(str); } catch { return defaultVal; }
}
