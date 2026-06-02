import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  TaskTypeGroup, TaskType, TagGroup, Tag,
  SystemField, DataSheetTemplate, MetricDefinition, FileRecord,
  UserDashboardConfig, MetricConfig,
} from '@/types'
import { DatabaseManager } from '@/core/database/DatabaseManager'
import { v4 as uuidv4 } from 'uuid'

export const useConfigStore = defineStore('config', () => {
  const dbManager = DatabaseManager.getInstance()

  // ===== 任务类型 =====
  const taskTypeGroups = ref<TaskTypeGroup[]>([])
  const taskTypes = ref<TaskType[]>([])

  async function fetchTaskTypeGroups() {
    taskTypeGroups.value = dbManager.query<TaskTypeGroup>('SELECT * FROM task_type_groups ORDER BY sortOrder ASC')
  }

  async function fetchTaskTypes() {
    taskTypes.value = dbManager.query<TaskType>('SELECT * FROM task_types ORDER BY sortOrder ASC')
  }

  function getTaskTypesByGroup(groupId: string): TaskType[] {
    return dbManager.query<TaskType>('SELECT * FROM task_types WHERE groupId = ? ORDER BY sortOrder ASC', [groupId])
  }

  async function addTaskTypeGroup(data: { name: string; order?: number }) {
    const id = uuidv4()
    dbManager.execute('INSERT INTO task_type_groups (id, name, sortOrder) VALUES (?, ?, ?)', [id, data.name, data.order || 0])
    await dbManager.persist()
    await fetchTaskTypeGroups()
    return id
  }

  async function addTaskType(data: { groupId: string; name: string; defaultFlowTemplateId?: string; defaultDataSheetTemplateId?: string; order?: number }) {
    const id = uuidv4()
    dbManager.execute(
      'INSERT INTO task_types (id, groupId, name, defaultFlowTemplateId, defaultDataSheetTemplateId, sortOrder) VALUES (?, ?, ?, ?, ?, ?)',
      [id, data.groupId, data.name, data.defaultFlowTemplateId || null, data.defaultDataSheetTemplateId || null, data.order || 0],
    )
    await dbManager.persist()
    await fetchTaskTypes()
    return id
  }

  // ===== 标签 =====
  const tagGroups = ref<TagGroup[]>([])
  const tags = ref<Tag[]>([])

  async function fetchTagGroups() {
    tagGroups.value = dbManager.query<TagGroup>('SELECT * FROM tag_groups ORDER BY sortOrder ASC')
  }

  async function fetchTags() {
    tags.value = dbManager.query<Tag>('SELECT * FROM tags ORDER BY sortOrder ASC')
  }

  function getTagsByGroup(groupId: string): Tag[] {
    return dbManager.query<Tag>('SELECT * FROM tags WHERE groupId = ? ORDER BY sortOrder ASC', [groupId])
  }

  // ===== 系统字段 =====
  const systemFields = ref<SystemField[]>([])

  async function fetchSystemFields() {
    systemFields.value = dbManager.query<SystemField>('SELECT * FROM system_fields ORDER BY id ASC')
  }

  function getAggregatableFields(): SystemField[] {
    return dbManager.query<SystemField>('SELECT * FROM system_fields WHERE isAggregatable = 1')
  }

  async function addSystemField(data: Omit<SystemField, 'id'>) {
    const id = uuidv4()
    dbManager.execute(
      'INSERT INTO system_fields (id, name, fieldType, fieldOptions, unit, isAggregatable, suggestedLevel, isSystem) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, data.name, data.type, JSON.stringify(data.options || null), data.unit || null, data.isAggregatable ? 1 : 0, data.suggestedLevel || null, data.isSystem ? 1 : 0],
    )
    await dbManager.persist()
    await fetchSystemFields()
    return id
  }

  async function updateSystemField(id: string, data: Partial<SystemField>) {
    const fields: string[] = []
    const values: any[] = []
    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name) }
    if (data.type !== undefined) { fields.push('fieldType = ?'); values.push(data.type) }
    if (data.unit !== undefined) { fields.push('unit = ?'); values.push(data.unit) }
    if (data.isAggregatable !== undefined) { fields.push('isAggregatable = ?'); values.push(data.isAggregatable ? 1 : 0) }
    if (data.suggestedLevel !== undefined) { fields.push('suggestedLevel = ?'); values.push(data.suggestedLevel) }
    if (fields.length > 0) {
      values.push(id)
      dbManager.execute(`UPDATE system_fields SET ${fields.join(', ')} WHERE id = ?`, values)
      await dbManager.persist()
      await fetchSystemFields()
    }
  }

  async function deleteSystemField(id: string) {
    const field = dbManager.query<SystemField>('SELECT isSystem FROM system_fields WHERE id = ?', [id])
    if (field[0]?.isSystem) throw new Error('系统内置字段不可删除')
    dbManager.execute('DELETE FROM system_fields WHERE id = ?', [id])
    await dbManager.persist()
    await fetchSystemFields()
  }

  // ===== 明细模板 =====
  const dataSheetTemplates = ref<DataSheetTemplate[]>([])

  async function fetchDataSheetTemplates() {
    dataSheetTemplates.value = dbManager.query<DataSheetTemplate>('SELECT * FROM data_sheet_templates ORDER BY createdAt DESC')
  }

  async function addDataSheetTemplate(data: Omit<DataSheetTemplate, 'id' | 'createdAt'>) {
    const id = uuidv4()
    dbManager.execute(
      'INSERT INTO data_sheet_templates (id, name, fields, defaultSort, createdAt) VALUES (?, ?, ?, ?, ?)',
      [id, data.name, JSON.stringify(data.fields), JSON.stringify(data.defaultSort || null), new Date().toISOString()],
    )
    await dbManager.persist()
    await fetchDataSheetTemplates()
    return id
  }

  // ===== 态势指标 =====
  const metricDefinitions = ref<MetricDefinition[]>([])

  async function fetchMetricDefinitions() {
    metricDefinitions.value = dbManager.query<MetricDefinition>('SELECT * FROM metric_definitions ORDER BY sortOrder ASC')
  }

  function getMetricsByLevel(level: string): MetricDefinition[] {
    return dbManager.query<MetricDefinition>('SELECT * FROM metric_definitions WHERE level = ? ORDER BY sortOrder ASC', [level])
  }

  async function addMetricDefinition(data: Omit<MetricDefinition, 'id'>) {
    const id = uuidv4()
    dbManager.execute(
      'INSERT INTO metric_definitions (id, name, level, isRecommended, config, visibility, isSystem, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, data.name, data.level, data.isRecommended ? 1 : 0, JSON.stringify(data.config), data.visibility, data.isSystem ? 1 : 0, data.order],
    )
    await dbManager.persist()
    await fetchMetricDefinitions()
    return id
  }

  async function updateMetricDefinition(id: string, data: Partial<MetricDefinition>) {
    const fields: string[] = []
    const values: any[] = []
    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name) }
    if (data.level !== undefined) { fields.push('level = ?'); values.push(data.level) }
    if (data.isRecommended !== undefined) { fields.push('isRecommended = ?'); values.push(data.isRecommended ? 1 : 0) }
    if (data.config !== undefined) { fields.push('config = ?'); values.push(JSON.stringify(data.config)) }
    if (data.visibility !== undefined) { fields.push('visibility = ?'); values.push(data.visibility) }
    if (data.order !== undefined) { fields.push('sortOrder = ?'); values.push(data.order) }
    if (fields.length > 0) {
      values.push(id)
      dbManager.execute(`UPDATE metric_definitions SET ${fields.join(', ')} WHERE id = ?`, values)
      await dbManager.persist()
      await fetchMetricDefinitions()
    }
  }

  async function deleteMetricDefinition(id: string) {
    const m = dbManager.query<MetricDefinition>('SELECT isSystem FROM metric_definitions WHERE id = ?', [id])
    if (m[0]?.isSystem) throw new Error('系统内置指标不可删除')
    dbManager.execute('DELETE FROM metric_definitions WHERE id = ?', [id])
    await dbManager.persist()
    await fetchMetricDefinitions()
  }

  // ===== 用户看板配置 =====
  async function getUserDashboardConfig(userId: string): Promise<UserDashboardConfig | null> {
    const results = dbManager.query<any>('SELECT * FROM user_dashboard_config WHERE userId = ?', [userId])
    if (results.length === 0) return null
    const r = results[0]
    return {
      userId: r.userId,
      customsMetrics: JSON.parse(r.customsMetrics || '[]'),
      sectionMetrics: JSON.parse(r.sectionMetrics || '[]'),
      tabs: JSON.parse(r.tabs || '[]'),
      activeTabId: r.activeTabId || '',
      layout: r.layout || 'grid',
    }
  }

  async function saveUserDashboardConfig(config: UserDashboardConfig) {
    const existing = dbManager.query<any>('SELECT userId FROM user_dashboard_config WHERE userId = ?', [config.userId])
    if (existing.length > 0) {
      dbManager.execute(
        `UPDATE user_dashboard_config SET customsMetrics = ?, sectionMetrics = ?, tabs = ?, activeTabId = ?, layout = ? WHERE userId = ?`,
        [JSON.stringify(config.customsMetrics), JSON.stringify(config.sectionMetrics), JSON.stringify(config.tabs), config.activeTabId, config.layout, config.userId],
      )
    } else {
      dbManager.execute(
        'INSERT INTO user_dashboard_config (userId, customsMetrics, sectionMetrics, tabs, activeTabId, layout) VALUES (?, ?, ?, ?, ?, ?)',
        [config.userId, JSON.stringify(config.customsMetrics), JSON.stringify(config.sectionMetrics), JSON.stringify(config.tabs), config.activeTabId, config.layout],
      )
    }
    await dbManager.persist()
  }

  // ===== 文件 =====
  const files = ref<FileRecord[]>([])

  async function fetchFiles(category?: string) {
    let sql = 'SELECT * FROM files WHERE isLatest = 1'
    const params: any[] = []
    if (category) { sql += ' AND category = ?'; params.push(category) }
    sql += ' ORDER BY uploadedAt DESC'
    files.value = dbManager.query<FileRecord>(sql, params)
  }

  async function uploadFile(file: File, category: string, metadata?: Record<string, any>) {
    const id = uuidv4()
    const arrayBuffer = await file.arrayBuffer()
    const blob = new Uint8Array(arrayBuffer)
    dbManager.execute(
      `INSERT INTO files (id, name, category, mimeType, size, data, version, isLatest, uploadedBy, uploadedAt, policyNumber, effectiveDate, expiryDate, clauses) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, file.name, category, file.type, file.size, blob, 1, 1,
        metadata?.uploadedBy || '', new Date().toISOString(),
        metadata?.policyNumber || null, metadata?.effectiveDate || null,
        metadata?.expiryDate || null, JSON.stringify(metadata?.clauses || null),
      ],
    )
    await dbManager.persist()
    await fetchFiles()
    return id
  }

  // ===== 用户角色 =====
  async function getUserRoles(userId: string): Promise<string[]> {
    const results = dbManager.query<{ role: string }>('SELECT role FROM user_roles WHERE userId = ?', [userId])
    return results.map(r => r.role)
  }

  async function setUserRole(userId: string, role: string) {
    dbManager.execute('INSERT OR REPLACE INTO user_roles (userId, role) VALUES (?, ?)', [userId, role])
    await dbManager.persist()
  }

  return {
    taskTypeGroups, taskTypes, tagGroups, tags,
    systemFields, dataSheetTemplates, metricDefinitions, files,
    fetchTaskTypeGroups, fetchTaskTypes, getTaskTypesByGroup, addTaskTypeGroup, addTaskType,
    fetchTagGroups, fetchTags, getTagsByGroup,
    fetchSystemFields, getAggregatableFields, addSystemField, updateSystemField, deleteSystemField,
    fetchDataSheetTemplates, addDataSheetTemplate,
    fetchMetricDefinitions, getMetricsByLevel, addMetricDefinition, updateMetricDefinition, deleteMetricDefinition,
    getUserDashboardConfig, saveUserDashboardConfig,
    fetchFiles, uploadFile,
    getUserRoles, setUserRole,
  }
})
