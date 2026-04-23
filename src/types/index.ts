// src/types/index.ts

export type UserRole = 'ADMIN' | 'LEADER' | 'STAFF';
export type TaskLevel = 1 | 2 | 3;
export type TaskStatus = 'PENDING' | 'PROCESSING' | 'TO_REVIEW' | 'COMPLETED' | 'OVERDUE';

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
  owner_dept_ids: string[]; // 主办
  co_dept_ids: string[];    // 协办
  deadline: string;
  progress: number;
  status: TaskStatus;
  leader_instructions?: string;
  created_at: string;
  is_history: number;
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
}

export interface LeaderComment {
  id: string;
  task_id: string;
  leader_name: string;
  content: string;
  created_at: string;
}