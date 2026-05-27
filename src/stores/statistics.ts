import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { GuanquStats, DeptStats, PersonalStats, TaskTypeField, TaskFieldValue } from '@/types';
import { DatabaseManager } from '@/core/database/DatabaseManager';
import { DEPT_MAP } from '@/constants';
import { v4 as uuidv4 } from 'uuid';

export const useStatisticsStore = defineStore('statistics', () => {
  const dbManager = DatabaseManager.getInstance();

  /** 关区态势 */
  function getGuanquStats(): GuanquStats {
    const totalCount = dbManager.query<{ count: number }>(
      'SELECT count(*) as count FROM tasks WHERE is_history = 0',
    )[0]?.count || 0;

    const completedCount = dbManager.query<{ count: number }>(
      "SELECT count(*) as count FROM tasks WHERE status = 'COMPLETED'",
    )[0]?.count || 0;

    const now = new Date().toISOString().split('T')[0];
    const overdueCount = dbManager.query<{ count: number }>(
      "SELECT count(*) as count FROM tasks WHERE status != 'COMPLETED' AND deadline < ? AND is_history = 0",
      [now],
    )[0]?.count || 0;

    const keyTaskCount = dbManager.query<{ count: number }>(
      'SELECT count(*) as count FROM tasks WHERE is_key_task = 1 AND is_history = 0',
    )[0]?.count || 0;

    const leaderInstructionCount = dbManager.query<{ count: number }>(
      'SELECT count(*) as count FROM leader_comments',
    )[0]?.count || 0;

    return {
      totalCount,
      completionRate: totalCount > 0 ? completedCount / totalCount : 0,
      overdueRate: totalCount > 0 ? overdueCount / totalCount : 0,
      keyTaskCount,
      leaderInstructionCount,
    };
  }

  /** 科级态势 */
  function getDepartmentStats(): DeptStats[] {
    const allTasks = dbManager.query<{ owner_dept_ids: string; status: string; deadline: string }>(
      'SELECT owner_dept_ids, status, deadline FROM tasks WHERE is_history = 0',
    );
    const now = new Date().toISOString().split('T')[0];

    const deptData = new Map<string, { total: number; completed: number; overdue: number }>();

    for (const t of allTasks) {
      const deptIds: string[] = typeof t.owner_dept_ids === 'string'
        ? JSON.parse(t.owner_dept_ids || '[]')
        : (t.owner_dept_ids as any || []);

      for (const id of deptIds) {
        const d = deptData.get(id) || { total: 0, completed: 0, overdue: 0 };
        d.total++;
        if (t.status === 'COMPLETED') d.completed++;
        if (t.status !== 'COMPLETED' && t.deadline && t.deadline < now) d.overdue++;
        deptData.set(id, d);
      }
    }

    return Array.from(deptData.entries()).map(([deptId, d]) => {
      const loadLevel: DeptStats['loadLevel'] = d.total > 15 ? 'HIGH' : d.total > 8 ? 'MEDIUM' : 'LOW';
      return {
        deptId,
        deptName: DEPT_MAP[deptId] || deptId,
        taskCount: d.total,
        completedCount: d.completed,
        completionRate: d.total > 0 ? d.completed / d.total : 0,
        overdueCount: d.overdue,
        loadLevel,
      };
    });
  }

  /** 个人工作台 */
  function getPersonalStats(userId: string, deptId: string): PersonalStats {
    const deptIdStr = `"${deptId}"`;

    const pendingCount = dbManager.query<{ count: number }>(
      "SELECT count(*) as count FROM tasks WHERE status != 'COMPLETED' AND is_history = 0 AND (owner_dept_ids LIKE ? OR co_dept_ids LIKE ?)",
      [`%${deptIdStr}%`, `%${deptIdStr}%`],
    )[0]?.count || 0;

    const completedCount = dbManager.query<{ count: number }>(
      "SELECT count(*) as count FROM tasks WHERE status = 'COMPLETED' AND (owner_dept_ids LIKE ? OR co_dept_ids LIKE ?)",
      [`%${deptIdStr}%`, `%${deptIdStr}%`],
    )[0]?.count || 0;

    const now = new Date().toISOString().split('T')[0];
    const overdueCount = dbManager.query<{ count: number }>(
      "SELECT count(*) as count FROM tasks WHERE status != 'COMPLETED' AND deadline < ? AND is_history = 0 AND (owner_dept_ids LIKE ? OR co_dept_ids LIKE ?)",
      [now, `%${deptIdStr}%`, `%${deptIdStr}%`],
    )[0]?.count || 0;

    const watchingCount = dbManager.query<{ count: number }>(
      'SELECT count(*) as count FROM task_watches WHERE user_id = ?',
      [userId],
    )[0]?.count || 0;

    return { pendingCount, completedCount, overdueCount, watchingCount };
  }

  /** 关注管理 */
  async function addWatch(taskId: string, userId: string) {
    dbManager.execute(
      'INSERT OR REPLACE INTO task_watches (id, task_id, user_id) VALUES (?, ?, ?)',
      [uuidv4(), taskId, userId],
    );
    await dbManager.persist();
  }

  async function removeWatch(taskId: string, userId: string) {
    dbManager.execute('DELETE FROM task_watches WHERE task_id = ? AND user_id = ?', [taskId, userId]);
    await dbManager.persist();
  }

  function getWatchedTaskIds(userId: string): string[] {
    return dbManager.query<{ task_id: string }>(
      'SELECT task_id FROM task_watches WHERE user_id = ?',
      [userId],
    ).map(r => r.task_id);
  }

  /** 动态字段管理 */
  function getTaskTypeFields(taskType: string): TaskTypeField[] {
    return dbManager.query<TaskTypeField>(
      'SELECT * FROM task_type_fields WHERE task_type = ? ORDER BY sort_order ASC',
      [taskType],
    );
  }

  async function addTaskTypeField(data: Omit<TaskTypeField, 'id'>) {
    dbManager.execute(
      'INSERT INTO task_type_fields (id, task_type, field_name, field_label, field_type, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [uuidv4(), data.task_type, data.field_name, data.field_label, data.field_type, data.sort_order],
    );
    await dbManager.persist();
  }

  async function deleteTaskTypeField(id: string) {
    dbManager.execute('DELETE FROM task_type_fields WHERE id = ?', [id]);
    dbManager.execute('DELETE FROM task_field_values WHERE field_id = ?', [id]);
    await dbManager.persist();
  }

  function getTaskFieldValues(taskId: string): TaskFieldValue[] {
    return dbManager.query<TaskFieldValue>(
      'SELECT * FROM task_field_values WHERE task_id = ?',
      [taskId],
    );
  }

  async function setTaskFieldValue(taskId: string, fieldId: string, value: string) {
    const existing = dbManager.query<{ id: string }>(
      'SELECT id FROM task_field_values WHERE task_id = ? AND field_id = ?',
      [taskId, fieldId],
    );
    if (existing.length > 0) {
      dbManager.execute('UPDATE task_field_values SET field_value = ? WHERE task_id = ? AND field_id = ?', [value, taskId, fieldId]);
    } else {
      dbManager.execute('INSERT INTO task_field_values (id, task_id, field_id, field_value) VALUES (?, ?, ?, ?)', [uuidv4(), taskId, fieldId, value]);
    }
    await dbManager.persist();
  }

  /** 动态字段聚合 */
  function getAggregatedFieldStats(taskType: string): Array<{ fieldLabel: string; total: number }> {
    const fields = getTaskTypeFields(taskType);
    const tasks = dbManager.query<{ id: string }>(
      "SELECT id FROM tasks WHERE task_type = ? AND is_history = 0",
      [taskType],
    );

    return fields.map(f => {
      let total = 0;
      for (const t of tasks) {
        const vals = dbManager.query<{ field_value: string }>(
          'SELECT field_value FROM task_field_values WHERE task_id = ? AND field_id = ?',
          [t.id, f.id],
        );
        if (vals[0] && f.field_type === 'NUMBER') {
          total += parseFloat(vals[0].field_value) || 0;
        }
      }
      return { fieldLabel: f.field_label, total };
    });
  }

  return {
    getGuanquStats, getDepartmentStats, getPersonalStats,
    addWatch, removeWatch, getWatchedTaskIds,
    getTaskTypeFields, addTaskTypeField, deleteTaskTypeField,
    getTaskFieldValues, setTaskFieldValue, getAggregatedFieldStats,
  };
});
