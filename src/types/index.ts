// ============================================================
// V3.0 数据模型 - 完整类型定义
// 基于: 完整数据模型与流转设计文档 V3.1 + 开发规格书 v1.0
// ============================================================

// ========== 基础枚举 ==========

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'archived'
export type TaskPriority = 'normal' | 'urgent' | 'leadership_attention'
export type MetricLevel = 'customs_level' | 'section_level'
export type MetricMode = 'filter' | 'specific'
export type AggFunc = 'SUM' | 'COUNT' | 'AVG' | 'MAX' | 'MIN'
export type FieldType = 'text' | 'number' | 'date' | 'select'
export type FileCategory = 'template' | 'policy' | 'attachment'
export type RelationType = 'parent_child' | 'reference'
export type AggregationMode = 'none' | 'homogeneous' | 'heterogeneous'
export type UserRoleType = 'inspector' | 'admin'
export type VisibilityScope = 'all' | 'role:leader' | 'role:section_chief' | 'role:inspector'
export type FeedbackStatus = 'pending' | 'submitted' | 'confirmed'

export type ActivityLogType =
  | 'stage_progress'
  | 'feedback'
  | 'attachment'
  | 'subtask_summary'
  | 'leader_comment'
  | 'system'
  | 'responsibility_feedback'
  | 'external_notification'
  | 'urge'

// ========== 组织架构 ==========

export interface Department {
  id: string
  name: string
  shortName?: string
  parentId?: string
  leaderId?: string
  order: number
  isActive: boolean
}

export interface Personnel {
  id: string
  name: string
  employeeNo: string
  departmentId: string
  position: string
  isLeader: boolean
  email?: string
  isActive: boolean
  order: number
}

// ========== 任务核心 ==========

export interface ResponsibleEntry {
  departmentId: string
  personnelId: string | null
  role: 'main' | 'assist'
  feedbackStatus?: FeedbackStatus
}

export interface ResponsibleMatrix {
  primary: ResponsibleEntry[]
  cooperative: ResponsibleEntry[]
}

export interface StageOption {
  label: string
  nextStageIndex: number
  resources?: {
    templates?: string[]
    links?: string[]
    policies?: PolicyRef[]
  }
}

export interface PolicyRef {
  fileId: string
  clauseId?: string
  clauseTitle?: string
  pageNumber?: number
}

export interface StageSnapshot {
  stageIndex: number
  name: string
  options: StageOption[]
  requireAttachment?: boolean
  requireSupervisorConfirm?: boolean
}

export interface ActivityLogEntry {
  id: string
  type: ActivityLogType
  content: string
  timestamp: string
  actorPeerId: string
  metadata?: {
    oldStageIndex?: number
    newStageIndex?: number
    attachmentIds?: string[]
    urgeTargets?: string[]
    rowId?: string
    fieldChanges?: Record<string, any>
  }
}

export interface DataSheetRow {
  rowId: string
  data: Record<string, any>
  creatorId: string
  createdAt: string
  updatedAt: string
}

export interface DataSheetFieldDef {
  fieldId: string
  required: boolean
  order: number
}

export interface AggregationRule {
  sourceTaskId: string
  sourceFieldId: string
  targetSummaryId: string
  aggFunction: AggFunc
}

export interface TaskSnapshot {
  sourceTaskId: string
  sourceTaskTitle: string
  snapshotType: string
  frozenAt: string
  data: {
    dataSheetRows?: DataSheetRow[]
    summary?: Record<string, any>
    status?: string
  }
}

export interface ExtractionConfig {
  enabled: boolean
  executorId: string
  targetUrl: string
  domMappings: DomMapping[]
  schedule: { mode: 'auto' | 'manual'; intervalMinutes?: number }
  lastExtractionStatus?: 'success' | 'failed'
  lastExtractionTime?: string
}

export interface DomMapping {
  fieldName: string
  selector: string
  attribute: string
}

export interface TaskSource {
  type: 'manual' | 'email' | 'document'
  reference?: string
}

export interface ConfirmedFeedback {
  summary: string
  confirmedAt: string
  confirmedBy: string
}

export interface SupervisionTask {
  id: string
  title: string
  description?: string
  taskTypeGroupId?: string
  taskTypeId?: string
  status: TaskStatus
  priority: TaskPriority
  deadline?: string
  tags?: string[]
  parentTaskId?: string
  childTaskIds: string[]
  source?: TaskSource
  responsibleMatrix: ResponsibleMatrix
  flowTemplateId?: string
  stagesSnapshot?: StageSnapshot[]
  currentStageIndex?: number
  confirmedFeedback?: ConfirmedFeedback
  dataSheetTemplateId?: string
  dataSheetFields?: DataSheetFieldDef[]
  dataSheetRows?: DataSheetRow[]
  childAggregationMode?: AggregationMode
  aggregationRules?: AggregationRule[]
  snapshots?: TaskSnapshot[]
  extractionConfig?: ExtractionConfig
  authorizedPeers: string[]
  sharedWith?: string[]
  createdBy: string
  createdAt: string
  updatedAt: string
  starredBy?: string[]
  activityLog?: ActivityLogEntry[]
}

// ========== 任务关联 ==========

export interface TaskRelation {
  id: string
  parentTaskId: string
  childTaskId: string
  relationType: RelationType
  aggregationMode: AggregationMode
  aggregationRules?: AggregationRule[]
  createdAt: string
}

// ========== 流程配置 ==========

export interface FlowTemplate {
  id: string
  name: string
  stages: StageSnapshot[]
  createdBy: string
  isPublic: boolean
  createdAt: string
  updatedAt: string
}

// ========== 系统字段与明细模板 ==========

export interface SystemField {
  id: string
  name: string
  type: FieldType
  options?: string[]
  unit?: string
  isAggregatable: boolean
  suggestedLevel?: MetricLevel
  isSystem: boolean
}

export interface DataSheetTemplateField {
  fieldId: string
  required: boolean
  order: number
}

export interface DataSheetTemplate {
  id: string
  name: string
  fields: DataSheetTemplateField[]
  defaultSort?: string[]
  createdAt: string
}

// ========== 类型与标签 ==========

export interface TaskTypeGroup {
  id: string
  name: string
  order: number
}

export interface TaskType {
  id: string
  groupId: string
  name: string
  defaultFlowTemplateId?: string
  defaultDataSheetTemplateId?: string
  order: number
}

export interface TagGroup {
  id: string
  name: string
  order: number
}

export interface Tag {
  id: string
  groupId: string
  name: string
  order: number
}

// ========== 文件管理 ==========

export interface ClauseItem {
  id: string
  title: string
  pageNumber: number
  children?: ClauseItem[]
}

export interface FileRecord {
  id: string
  name: string
  category: FileCategory
  mimeType: string
  size: number
  data: Blob
  version: number
  isLatest: boolean
  replacesFileId?: string
  relatedTaskId?: string
  uploadedBy: string
  uploadedAt: string
  // 制度文件特有
  policyNumber?: string
  effectiveDate?: string
  expiryDate?: string
  clauses?: ClauseItem[]
}

// ========== 态势与用户配置 ==========

export interface MetricConfig {
  mode: MetricMode
  taskTypeIds?: string[]
  filterTags?: string[]
  timeRange?: { start: string; end: string }
  specificTaskIds?: string[]
  fieldId: string
  aggFunc: AggFunc
}

export interface MetricDefinition {
  id: string
  name: string
  level: MetricLevel
  isRecommended: boolean
  config: MetricConfig
  visibility: VisibilityScope
  isSystem: boolean
  order: number
}

export interface DashboardTab {
  id: string
  label: string
  type: 'customs_task_list' | 'section_task_list'
  config: {
    columns: string[]
    filters: {
      taskTypeIds?: string[]
      statuses?: string[]
      tagIds?: string[]
      departmentIds?: string[]
      keyword?: string
      timeRange?: { start: string | null; end: string | null }
    }
    sortBy: { field: string; order: 'asc' | 'desc' }
    isDefault: boolean
  }
}

export interface UserDashboardConfig {
  userId: string
  customsMetrics: string[]
  sectionMetrics: string[]
  tabs: DashboardTab[]
  activeTabId: string
  layout: 'grid' | 'list'
}

// ========== 用户角色 ==========

export interface UserRole {
  userId: string
  role: UserRoleType
  scope?: string[]
}

// ========== 兼容旧版（逐步废弃） ==========

/** @deprecated 使用 SupervisionTask 代替 */
export type { SupervisionTask as OldSupervisionTask }

export interface UserInfo {
  id: string
  name: string
  role: 'ADMIN' | 'LEADER' | 'STAFF'
  deptId: string
}

// 保留旧的简单类型供过渡使用
export type TaskLevel = 1 | 2 | 3
export type TaskSourceLegacy = 'DOCUMENT' | 'EMAIL' | 'SYSTEM_NOTICE' | 'LEADER_ASSIGN' | 'OTHER'
export type NodeType = 'TASK' | 'REVIEW' | 'APPROVAL' | 'NOTIFY'

export interface ProcessTemplate {
  id: string
  name: string
  description: string
  scope: string
  created_at: string
}

export interface ProcessNode {
  id: string
  template_id: string
  node_name: string
  node_description: string
  sort_order: number
  node_type: NodeType
}

export interface TaskProcessNode {
  id: string
  task_id: string
  template_id: string | null
  node_name: string
  node_description: string
  sort_order: number
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'
  completed_at: string | null
  completed_by: string | null
}

export interface TaskCollaborator {
  id: string
  task_id: string
  dept_id: string
  person_name: string
  assigned_by: string
  assigned_at: string
  status: 'PENDING' | 'COMPLETED'
  feedback: string
}

export interface TaskFeedback {
  id: string
  task_id: string
  dept_id: string
  content: string
  attachments: string[]
  feedback_person: string
  feedback_time: string
  is_apply_complete: number
  is_leader_instruction?: number
  highlighted?: number
}

export interface LeaderComment {
  id: string
  task_id: string
  leader_name: string
  content: string
  created_at: string
  attachments?: string[]
  highlighted?: number
}

export interface SupervisionReminder {
  id: string
  task_id: string
  reminded_at: string
  reminded_by: string
  remind_content: string
}

export interface SubtaskSummary {
  total: number
  completed: number
  inProgress: number
  overdue: number
}

export interface DeptStats {
  deptId: string
  deptName: string
  taskCount: number
  completedCount: number
  completionRate: number
  overdueCount: number
  loadLevel: 'LOW' | 'MEDIUM' | 'HIGH'
}

export interface GuanquStats {
  totalCount: number
  completionRate: number
  overdueRate: number
  keyTaskCount: number
  leaderInstructionCount: number
}

export interface PersonalStats {
  pendingCount: number
  completedCount: number
  overdueCount: number
  watchingCount: number
}

export interface SupervisionFilter {
  deptIds: string[]
  source: string
  tags: string[]
  status: string
  dateRange: string[]
  handlerName: string
}

export interface SaveTemplateForm {
  name: string
  description: string
  scope: string
}

export interface ParseResult {
  mainTitle: string
  source: TaskSourceLegacy
  defaultDeadline: string
  workItems: Array<{
    title: string
    department: string
    deadline: string
  }>
}
