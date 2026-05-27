import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { ProcessTemplate, ProcessNode, TaskProcessNode } from '@/types';
import { DatabaseManager } from '@/core/database/DatabaseManager';
import { v4 as uuidv4 } from 'uuid';

export const useProcessStore = defineStore('process', () => {
  const templates = ref<ProcessTemplate[]>([]);
  const currentNodes = ref<ProcessNode[]>([]);
  const dbManager = DatabaseManager.getInstance();

  // ===== 流程模板 CRUD =====

  async function fetchTemplates() {
    templates.value = dbManager.query<ProcessTemplate>(
      'SELECT * FROM process_templates ORDER BY created_at DESC',
    );
  }

  async function createTemplate(data: { name: string; description: string; scope: string }) {
    const id = uuidv4();
    dbManager.execute(
      'INSERT INTO process_templates (id, name, description, scope) VALUES (?, ?, ?, ?)',
      [id, data.name, data.description, data.scope],
    );
    await dbManager.persist();
    await fetchTemplates();
    return id;
  }

  async function updateTemplate(id: string, data: { name: string; description: string; scope: string }) {
    dbManager.execute(
      'UPDATE process_templates SET name = ?, description = ?, scope = ? WHERE id = ?',
      [data.name, data.description, data.scope, id],
    );
    await dbManager.persist();
    await fetchTemplates();
  }

  async function deleteTemplate(id: string) {
    dbManager.execute('DELETE FROM process_nodes WHERE template_id = ?', [id]);
    dbManager.execute('DELETE FROM process_templates WHERE id = ?', [id]);
    await dbManager.persist();
    await fetchTemplates();
  }

  // ===== 流程环节管理 =====

  function getTemplateNodes(templateId: string): ProcessNode[] {
    return dbManager.query<ProcessNode>(
      'SELECT * FROM process_nodes WHERE template_id = ? ORDER BY sort_order ASC',
      [templateId],
    );
  }

  async function addProcessNode(templateId: string, data: { node_name: string; node_description: string; node_type: string }) {
    const maxOrder = dbManager.query<{ max_order: number }>(
      'SELECT COALESCE(MAX(sort_order), 0) as max_order FROM process_nodes WHERE template_id = ?',
      [templateId],
    );
    const id = uuidv4();
    dbManager.execute(
      'INSERT INTO process_nodes (id, template_id, node_name, node_description, sort_order, node_type) VALUES (?, ?, ?, ?, ?, ?)',
      [id, templateId, data.node_name, data.node_description, (maxOrder[0]?.max_order || 0) + 1, data.node_type],
    );
    await dbManager.persist();
    return getTemplateNodes(templateId);
  }

  async function updateProcessNode(id: string, data: { node_name: string; node_description: string; node_type: string }) {
    dbManager.execute(
      'UPDATE process_nodes SET node_name = ?, node_description = ?, node_type = ? WHERE id = ?',
      [data.node_name, data.node_description, data.node_type, id],
    );
    await dbManager.persist();
  }

  async function deleteProcessNode(id: string) {
    dbManager.execute('DELETE FROM process_nodes WHERE id = ?', [id]);
    await dbManager.persist();
  }

  async function reorderNodes(templateId: string, nodeIds: string[]) {
    for (let i = 0; i < nodeIds.length; i++) {
      dbManager.run('UPDATE process_nodes SET sort_order = ? WHERE id = ?', [i + 1, nodeIds[i]]);
    }
    await dbManager.persist();
  }

  // ===== 任务流程挂载 =====

  async function applyTemplateToTask(templateId: string, taskId: string) {
    // 先清除旧流程
    dbManager.execute('DELETE FROM task_process_nodes WHERE task_id = ?', [taskId]);

    const nodes = getTemplateNodes(templateId);
    for (const node of nodes) {
      dbManager.execute(
        'INSERT INTO task_process_nodes (id, task_id, template_id, node_name, node_description, sort_order, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uuidv4(), taskId, templateId, node.node_name, node.node_description, node.sort_order, 'PENDING'],
      );
    }
    // 自动激活第一个环节
    const first = dbManager.query<{ id: string }>(
      'SELECT id FROM task_process_nodes WHERE task_id = ? ORDER BY sort_order ASC LIMIT 1',
      [taskId],
    );
    if (first[0]) {
      dbManager.execute("UPDATE task_process_nodes SET status = 'IN_PROGRESS' WHERE id = ?", [first[0].id]);
    }
    await dbManager.persist();
  }

  function getTaskProcessNodes(taskId: string): TaskProcessNode[] {
    return dbManager.query<TaskProcessNode>(
      'SELECT * FROM task_process_nodes WHERE task_id = ? ORDER BY sort_order ASC',
      [taskId],
    );
  }

  async function updateTaskNodeStatus(nodeId: string, status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED', completedBy?: string) {
    const now = new Date().toISOString();
    dbManager.execute(
      'UPDATE task_process_nodes SET status = ?, completed_at = ?, completed_by = ? WHERE id = ?',
      [status, status === 'COMPLETED' ? now : null, completedBy || null, nodeId],
    );

    // 自动激活下一个环节
    if (status === 'COMPLETED') {
      const node = dbManager.query<{ task_id: string; sort_order: number }>(
        'SELECT task_id, sort_order FROM task_process_nodes WHERE id = ?',
        [nodeId],
      );
      if (node[0]) {
        const next = dbManager.query<{ id: string }>(
          'SELECT id FROM task_process_nodes WHERE task_id = ? AND sort_order > ? AND status = ? ORDER BY sort_order ASC LIMIT 1',
          [node[0].task_id, node[0].sort_order, 'PENDING'],
        );
        if (next[0]) {
          dbManager.execute("UPDATE task_process_nodes SET status = 'IN_PROGRESS' WHERE id = ?", [next[0].id]);
        }
      }
    }
    await dbManager.persist();
  }

  async function addTaskProcessNode(taskId: string, data: { node_name: string; node_description: string; node_type: string }) {
    const maxOrder = dbManager.query<{ max_order: number }>(
      'SELECT COALESCE(MAX(sort_order), 0) as max_order FROM task_process_nodes WHERE task_id = ?',
      [taskId],
    );
    dbManager.execute(
      'INSERT INTO task_process_nodes (id, task_id, template_id, node_name, node_description, sort_order, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuidv4(), taskId, null, data.node_name, data.node_description, (maxOrder[0]?.max_order || 0) + 1, 'PENDING'],
    );
    await dbManager.persist();
  }

  async function deleteTaskProcessNode(id: string) {
    dbManager.execute('DELETE FROM task_process_nodes WHERE id = ?', [id]);
    await dbManager.persist();
  }

  async function reorderTaskNodes(taskId: string, nodeIds: string[]) {
    for (let i = 0; i < nodeIds.length; i++) {
      dbManager.run('UPDATE task_process_nodes SET sort_order = ? WHERE id = ?', [i + 1, nodeIds[i]]);
    }
    await dbManager.persist();
  }

  async function saveTaskFlowAsTemplate(taskId: string, templateData: { name: string; description: string; scope: string }) {
    const templateId = await createTemplate(templateData);
    const nodes = getTaskProcessNodes(taskId);
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      dbManager.execute(
        'INSERT INTO process_nodes (id, template_id, node_name, node_description, sort_order, node_type) VALUES (?, ?, ?, ?, ?, ?)',
        [uuidv4(), templateId, n.node_name, n.node_description, i + 1, 'TASK'],
      );
    }
    await dbManager.persist();
    return templateId;
  }

  return {
    templates, currentNodes,
    fetchTemplates, createTemplate, updateTemplate, deleteTemplate,
    getTemplateNodes, addProcessNode, updateProcessNode, deleteProcessNode, reorderNodes,
    applyTemplateToTask, getTaskProcessNodes, updateTaskNodeStatus,
    addTaskProcessNode, deleteTaskProcessNode, reorderTaskNodes,
    saveTaskFlowAsTemplate,
  };
});
