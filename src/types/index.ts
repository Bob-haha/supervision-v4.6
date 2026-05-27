// src/types/index.ts

export type UserRole = 'ADMIN' | 'LEADER' | 'STAFF';
export type TaskLevel = 1 | 2 | 3;
export type TaskStatus = 'PENDING' | 'PROCESSING' | 'TO_REVIEW' | 'COMPLETED' | 'OVERDUE';
export type TaskSource = 'DOCUMENT' | 'EMAIL' | 'SYSTEM_NOTICE' | 'LEADER_ASSIGN' | 'OTHER';
export type NodeType = 'TASK' | 'REVIEW' | 'APPROVAL' | 'NOTIFY';
export type FieldType = 'NUMBER' | 'TEXT' | 'DATE' | 'CURRENCY';

export interface UserInfo {
  id: string;
  name: string;
  role: UserRole;
  deptId: string;
}

export interface SupervisionTask {
  id: string;
  parentId: string | null;
  level: TaskLevel;
  title: string;
  content: string;
  task_type: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  owner_dept_ids: string[];
  co_dept_ids: string[];
  deadline: string;
  progress: number;
  status: TaskStatus;
  leader_instructions?: string;
  created_at: string;
  is_history: number;
  source?: TaskSource;
  tags?: string[];
  handler_name?: string;
  is_key_task?: number;
}

export interface TaskFeedback {
  id: string;
  task_id: string;
  dept_id: string;
  content: string;
  attachments: string[];
  feedback_person: string;
  feedback_time: string;
  is_apply_complete: number;
  is_leader_instruction?: number;
  highlighted?: number;
}

export interface LeaderComment {
  id: string;
  task_id: string;
  leader_name: string;
  content: string;
  created_at: string;
  attachments?: string[];
  highlighted?: number;
}

// 流程模板
export interface ProcessTemplate {
  id: string;
  name: string;
  description: string;
  scope: string;
  created_at: string;
}

// 流程模板环节
export interface ProcessNode {
  id: string;
  template_id: string;
  node_name: string;
  node_description: string;
  sort_order: number;
  node_type: NodeType;
}

// 任务运行时流程环节
export interface TaskProcessNode {
  id: string;
  task_id: string;
  template_id: string | null;
  node_name: string;
  node_description: string;
  sort_order: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  completed_at: string | null;
  completed_by: string | null;
}

// 任务协作人
export interface TaskCollaborator {
  id: string;
  task_id: string;
  dept_id: string;
  person_name: string;
  assigned_by: string;
  assigned_at: string;
  status: 'PENDING' | 'COMPLETED';
  feedback: string;
}

// 个人关注
export interface TaskWatch {
  id: string;
  task_id: string;
  user_id: string;
  created_at: string;
}

// 批示已阅
export interface LeaderInstructionRead {
  id: string;
  instruction_id: string;
  user_id: string;
  read_at: string;
}

// 动态字段定义
export interface TaskTypeField {
  id: string;
  task_type: string;
  field_name: string;
  field_label: string;
  field_type: FieldType;
  sort_order: number;
}

// 动态字段值
export interface TaskFieldValue {
  id: string;
  task_id: string;
  field_id: string;
  field_value: string;
}

// 催办记录
export interface SupervisionReminder {
  id: string;
  task_id: string;
  reminded_at: string;
  reminded_by: string;
  remind_content: string;
}

// 人员
export interface Personnel {
  id: string;
  name: string;
  dept_id: string;
  position: string;
  is_dept_head: number;
}

// 智能解析结果
export interface ParseResult {
  mainTitle: string;
  source: TaskSource;
  defaultDeadline: string;
  workItems: Array<{
    title: string;
    department: string;
    deadline: string;
  }>;
}

// 督办筛选条件
export interface SupervisionFilter {
  deptIds: string[];
  source: string;
  tags: string[];
  status: string;
  dateRange: string[];
  handlerName: string;
}

// 子任务汇总
export interface SubtaskSummary {
  total: number;
  completed: number;
  inProgress: number;
  overdue: number;
}

// 科室统计
export interface DeptStats {
  deptId: string;
  deptName: string;
  taskCount: number;
  completedCount: number;
  completionRate: number;
  overdueCount: number;
  loadLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

// 关区统计
export interface GuanquStats {
  totalCount: number;
  completionRate: number;
  overdueRate: number;
  keyTaskCount: number;
  leaderInstructionCount: number;
}

// 个人统计
export interface PersonalStats {
  pendingCount: number;
  completedCount: number;
  overdueCount: number;
  watchingCount: number;
}

// 流程保存表单
export interface SaveTemplateForm {
  name: string;
  description: string;
  scope: string;
}
