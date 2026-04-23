// src/constants/index.ts

// 1. 全局科室映射

export const DEPT_MAP: Record<string, string> = {
  'dept_01': '第八派驻纪检组',
  'dept_02': '办公室（党委办公室）',
  'dept_03': '人事政工科',
  'dept_04': '综合保障科',
  'dept_05': '综合业务一科',
  'dept_06': '综合业务二科',
  'dept_07': '查验一科',
  'dept_08': '查验二科',
  'dept_09': '查验三科',
  'dept_10': '监控管理科',
  'dept_11': '物流监控科',
  'dept_12': '船舶清关科',
  'dept_13': '船舶检查科',
  'dept_14': '验估一科',
  'dept_15': '验估二科',
  'dept_16': '验估三科',
  'dept_17': '跨境贸易便利化科'
};

// 2. 状态映射
export const STATUS_MAP: Record<string, string> = {
  'PENDING': '办理中',
  'COMPLETED': '已办结',
  'OVERDUE': '已逾期',
  'TO_REVIEW': '待审核'
};

// 3. 角色映射
export const ROLE_LABELS: Record<string, string> = {
  'ADMIN': '统筹管理员',
  'LEADER': '关领导',
  'STAFF': '科室关员'
};