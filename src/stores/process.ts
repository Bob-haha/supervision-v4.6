import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ProcessTemplate, ProcessNode, TaskProcessNode } from '@/types'
import { DatabaseManager } from '@/core/database/DatabaseManager'
import { v4 as uuidv4 } from 'uuid'

export const useProcessStore = defineStore('process', () => {
  const templates = ref<ProcessTemplate[]>([])
  const dbManager = DatabaseManager.getInstance()

  function safeJSON<T = any>(str: any, def: T): T {
    if (!str) return def
    if (typeof str !== 'string') return str as unknown as T
    try { return JSON.parse(str) } catch { return def }
  }

  // ===== 流程模板 CRUD =====
  // 使用 flow_templates 为主表，兼容 process_templates

  async function fetchTemplates() {
    try {
      const raw = dbManager.query<any>('SELECT * FROM flow_templates ORDER BY created_at DESC')
      templates.value = raw.map((r: any) => {
        let stages = safeJSON(r.stages, null)
        // 如果 flow_templates 中没有 stages，从 process_nodes 加载
        if (!stages || stages.length === 0) {
          const nodes = dbManager.query<any>(
            'SELECT node_name, node_description, sort_order, node_type FROM process_nodes WHERE template_id=? ORDER BY sort_order ASC',
            [r.id],
          )
          if (nodes.length > 0) {
            stages = nodes.map((n: any, i: number) => ({
              stageIndex: i, name: n.node_name, description: n.node_description || '',
              nodeType: n.node_type, options: [],
            }))
          }
        }
        return {
          id: r.id, name: r.name, description: r.description || '',
          scope: r.scope || '', created_at: r.created_at || '',
          stages: stages || [], isPublic: r.isPublic === 1 || r.isPublic === undefined,
        }
      })
    } catch {
      // 回退到 process_templates + process_nodes
      const raw = dbManager.query<any>('SELECT * FROM process_templates ORDER BY created_at DESC')
      templates.value = raw.map((r: any) => {
        const nodes = dbManager.query<any>(
          'SELECT node_name, node_description, sort_order, node_type FROM process_nodes WHERE template_id=? ORDER BY sort_order ASC',
          [r.id],
        )
        return {
          id: r.id, name: r.name, description: r.description || '',
          scope: r.scope || '', created_at: r.created_at || '',
          stages: nodes.map((n: any, i: number) => ({
            stageIndex: i, name: n.node_name, description: n.node_description || '',
            nodeType: n.node_type, options: [],
          })),
        }
      })
    }
  }

  async function createTemplate(data: { name: string; description: string; scope: string; stages?: any[] }) {
    const id = uuidv4()
    const now = new Date().toISOString()
    dbManager.execute(
      `INSERT INTO flow_templates (id, name, description, scope, stages, createdBy, isPublic, created_at, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, data.name, data.description, data.scope, JSON.stringify(data.stages || []), '', 1, now, now],
    )
    // 同步写入 process_templates 兼容旧页面
    try {
      dbManager.run(
        'INSERT OR REPLACE INTO process_templates (id, name, description, scope, created_at) VALUES (?, ?, ?, ?, ?)',
        [id, data.name, data.description, data.scope, now],
      )
    } catch (_) { /* process_templates 可能不存在 */ }
    await dbManager.persist()
    await fetchTemplates()
    return id
  }

  async function updateTemplate(id: string, data: { name: string; description: string; scope: string; stages?: any[] }) {
    const now = new Date().toISOString()
    dbManager.execute(
      `UPDATE flow_templates SET name = ?, description = ?, scope = ?, stages = ?, updatedAt = ? WHERE id = ?`,
      [data.name, data.description, data.scope, JSON.stringify(data.stages || []), now, id],
    )
    try {
      dbManager.run(
        'UPDATE process_templates SET name = ?, description = ?, scope = ? WHERE id = ?',
        [data.name, data.description, data.scope, id],
      )
    } catch (_) { /* ignore */ }
    await dbManager.persist()
    await fetchTemplates()
  }

  async function deleteTemplate(id: string) {
    dbManager.execute('DELETE FROM flow_templates WHERE id = ?', [id])
    dbManager.execute('DELETE FROM process_nodes WHERE template_id = ?', [id])
    try { dbManager.run('DELETE FROM process_templates WHERE id = ?', [id]) } catch (_) { /* ignore */ }
    await dbManager.persist()
    await fetchTemplates()
  }

  // ===== 流程环节管理（保留兼容） =====

  function getTemplateNodes(templateId: string): ProcessNode[] {
    return dbManager.query<ProcessNode>(
      'SELECT * FROM process_nodes WHERE template_id = ? ORDER BY sort_order ASC',
      [templateId],
    )
  }

  async function addProcessNode(templateId: string, data: { node_name: string; node_description: string; node_type: string }) {
    const maxOrder = dbManager.query<{ max_order: number }>(
      'SELECT COALESCE(MAX(sort_order), 0) as max_order FROM process_nodes WHERE template_id = ?',
      [templateId],
    )
    dbManager.execute(
      'INSERT INTO process_nodes (id, template_id, node_name, node_description, sort_order, node_type) VALUES (?, ?, ?, ?, ?, ?)',
      [uuidv4(), templateId, data.node_name, data.node_description, (maxOrder[0]?.max_order || 0) + 1, data.node_type],
    )
    await dbManager.persist()
    return getTemplateNodes(templateId)
  }

  async function updateProcessNode(id: string, data: { node_name: string; node_description: string; node_type: string }) {
    dbManager.execute(
      'UPDATE process_nodes SET node_name = ?, node_description = ?, node_type = ? WHERE id = ?',
      [data.node_name, data.node_description, data.node_type, id],
    )
    await dbManager.persist()
  }

  async function deleteProcessNode(id: string) {
    dbManager.execute('DELETE FROM process_nodes WHERE id = ?', [id])
    await dbManager.persist()
  }

  async function reorderNodes(_templateId: string, nodeIds: string[]) {
    for (let i = 0; i < nodeIds.length; i++) {
      dbManager.run('UPDATE process_nodes SET sort_order = ? WHERE id = ?', [i + 1, nodeIds[i]])
    }
    await dbManager.persist()
  }

  // ===== 任务流程挂载 =====

  async function applyTemplateToTask(templateId: string, taskId: string) {
    dbManager.execute('DELETE FROM task_process_nodes WHERE task_id = ?', [taskId])
    const nodes = getTemplateNodes(templateId)
    for (const node of nodes) {
      dbManager.execute(
        'INSERT INTO task_process_nodes (id, task_id, template_id, node_name, node_description, sort_order, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uuidv4(), taskId, templateId, node.node_name, node.node_description, node.sort_order, 'PENDING'],
      )
    }
    const first = dbManager.query<{ id: string }>(
      'SELECT id FROM task_process_nodes WHERE task_id = ? ORDER BY sort_order ASC LIMIT 1',
      [taskId],
    )
    if (first[0]) {
      dbManager.execute("UPDATE task_process_nodes SET status = 'IN_PROGRESS' WHERE id = ?", [first[0].id])
    }
    await dbManager.persist()
  }

  function getTaskProcessNodes(taskId: string): TaskProcessNode[] {
    return dbManager.query<TaskProcessNode>(
      'SELECT * FROM task_process_nodes WHERE task_id = ? ORDER BY sort_order ASC',
      [taskId],
    )
  }

  async function updateTaskNodeStatus(nodeId: string, status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED', completedBy?: string) {
    const now = new Date().toISOString()
    dbManager.execute(
      'UPDATE task_process_nodes SET status = ?, completed_at = ?, completed_by = ? WHERE id = ?',
      [status, status === 'COMPLETED' ? now : null, completedBy || null, nodeId],
    )
    if (status === 'COMPLETED') {
      const node = dbManager.query<{ task_id: string; sort_order: number }>(
        'SELECT task_id, sort_order FROM task_process_nodes WHERE id = ?', [nodeId],
      )
      if (node[0]) {
        const next = dbManager.query<{ id: string }>(
          'SELECT id FROM task_process_nodes WHERE task_id = ? AND sort_order > ? AND status = ? ORDER BY sort_order ASC LIMIT 1',
          [node[0].task_id, node[0].sort_order, 'PENDING'],
        )
        if (next[0]) {
          dbManager.execute("UPDATE task_process_nodes SET status = 'IN_PROGRESS' WHERE id = ?", [next[0].id])
        }
      }
    }
    await dbManager.persist()
  }

  return {
    templates,
    fetchTemplates, createTemplate, updateTemplate, deleteTemplate,
    getTemplateNodes, addProcessNode, updateProcessNode, deleteProcessNode, reorderNodes,
    applyTemplateToTask, getTaskProcessNodes, updateTaskNodeStatus,
  }
})
