import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { TaskCollaborator, SubtaskSummary } from '@/types';
import { DatabaseManager } from '@/core/database/DatabaseManager';
import { v4 as uuidv4 } from 'uuid';

export const useCollaborationStore = defineStore('collaboration', () => {
  const collaborators = ref<TaskCollaborator[]>([]);
  const dbManager = DatabaseManager.getInstance();

  // ===== 直接分派 =====

  async function addCollaborator(taskId: string, data: { deptId: string; personName: string; assignedBy: string }) {
    const id = uuidv4();
    dbManager.execute(
      'INSERT INTO task_collaborators (id, task_id, dept_id, person_name, assigned_by) VALUES (?, ?, ?, ?, ?)',
      [id, taskId, data.deptId, data.personName, data.assignedBy],
    );
    await dbManager.persist();
    await fetchCollaborators(taskId);
  }

  async function removeCollaborator(id: string, taskId: string) {
    dbManager.execute('DELETE FROM task_collaborators WHERE id = ?', [id]);
    await dbManager.persist();
    await fetchCollaborators(taskId);
  }

  async function fetchCollaborators(taskId: string) {
    collaborators.value = dbManager.query<TaskCollaborator>(
      'SELECT * FROM task_collaborators WHERE task_id = ? ORDER BY assigned_at DESC',
      [taskId],
    );
  }

  function getTaskCollaborators(taskId: string): TaskCollaborator[] {
    return dbManager.query<TaskCollaborator>(
      'SELECT * FROM task_collaborators WHERE task_id = ? ORDER BY assigned_at DESC',
      [taskId],
    );
  }

  async function updateCollaboratorStatus(id: string, status: 'PENDING' | 'COMPLETED', feedback?: string) {
    dbManager.execute(
      'UPDATE task_collaborators SET status = ?, feedback = ? WHERE id = ?',
      [status, feedback || null, id],
    );
    await dbManager.persist();
  }

  // ===== 子任务 =====

  function getSubtasks(parentId: string): any[] {
    return dbManager.query(
      "SELECT * FROM tasks WHERE parent_id = ? AND is_history = 0 ORDER BY created_at ASC",
      [parentId],
    ).map(t => ({
      ...t,
      owner_dept_ids: JSON.parse(t.owner_dept_ids || '[]'),
      co_dept_ids: JSON.parse(t.co_dept_ids || '[]'),
    }));
  }

  function getSubtaskSummary(parentId: string): SubtaskSummary {
    const subtasks = getSubtasks(parentId);
    const now = new Date().toISOString().split('T')[0];
    const completed = subtasks.filter(s => s.status === 'COMPLETED').length;
    const overdue = subtasks.filter(s => s.status !== 'COMPLETED' && s.deadline && s.deadline < now).length;
    const inProgress = subtasks.length - completed;

    return {
      total: subtasks.length,
      completed,
      inProgress,
      overdue,
    };
  }

  return {
    collaborators,
    addCollaborator, removeCollaborator, fetchCollaborators, getTaskCollaborators,
    updateCollaboratorStatus, getSubtasks, getSubtaskSummary,
  };
});
