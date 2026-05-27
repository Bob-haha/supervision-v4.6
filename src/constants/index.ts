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

// 4. 任务来源映射
export const TASK_SOURCE_MAP: Record<string, string> = {
  'DOCUMENT': '公文',
  'EMAIL': '邮件',
  'SYSTEM_NOTICE': '系统通知',
  'LEADER_ASSIGN': '领导交办',
  'OTHER': '其他'
};

// 5. 流程节点类型映射
export const NODE_TYPE_MAP: Record<string, string> = {
  'TASK': '办理',
  'REVIEW': '审核',
  'APPROVAL': '审批',
  'NOTIFY': '知会'
};

// 6. 任务标签预设
export const TASK_TAGS = [
  '重点督办', '领导批示', '会议纪要', '专项工作',
  '日常事务', '紧急事项', '长期推进', '跨部门协作'
];

// 7. 任务类型预设
export const TASK_TYPES = [
  '常规', '会议', '文件', '批示', '调研',
  '采购', '专项', '党务', '人事', '财务'
];

// 8. 部门负责人映射
export const DEPT_HEAD_MAP: Record<string, string> = {
  'dept_01': '张振华', 'dept_02': '李建国', 'dept_03': '王明辉',
  'dept_04': '赵志强', 'dept_05': '陈伟民', 'dept_06': '刘建华',
  'dept_07': '黄志刚', 'dept_08': '周文博', 'dept_09': '吴国栋',
  'dept_10': '郑晓峰', 'dept_11': '林海生', 'dept_12': '何耀祖',
  'dept_13': '孙启明', 'dept_14': '马志远', 'dept_15': '朱学文',
  'dept_16': '胡明达', 'dept_17': '郭建平'
};