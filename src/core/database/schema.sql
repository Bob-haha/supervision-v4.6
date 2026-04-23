-- 1. 任务表 (支持 L1/L2/L3 层级)
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    parent_id TEXT,          -- 父任务ID
    level INTEGER NOT NULL,  -- 1:年度, 2:阶段, 3:具体办案
    title TEXT NOT NULL,
    content TEXT,
    task_type TEXT,          -- 会议/文件/批示
    priority TEXT,           -- HIGH/MEDIUM/LOW
    dept_ids TEXT,           -- 承办科室 (JSON数组字符串)
    deadline DATETIME,
    status TEXT DEFAULT 'PENDING',
    progress INTEGER DEFAULT 0,
    leader_instructions TEXT,
    is_history INTEGER DEFAULT 0, -- 0:活跃, 1:历史
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. 进展反馈表 (过程留痕)
CREATE TABLE IF NOT EXISTS feedbacks (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    dept_id TEXT NOT NULL,   -- 哪个科室反馈的
    content TEXT,
    attachments TEXT,       -- 附件路径 (JSON数组)
    feedback_person TEXT,
    feedback_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_apply_complete INTEGER DEFAULT 0 -- 是否申请办结
);

-- 3. 本地用户角色表 (用于权限识别)
CREATE TABLE IF NOT EXISTS local_auth (
    id TEXT PRIMARY KEY,
    username TEXT,
    role TEXT,              -- ADMIN/LEADER/STAFF
    dept_id TEXT            -- 所属科室
);