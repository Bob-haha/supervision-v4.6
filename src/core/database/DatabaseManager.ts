import initSqlJs from 'sql.js';
import type { Database, SqlJsStatic } from 'sql.js';

// 定义 P2P 广播回调类型
type ExecuteCallback = (sql: string, params: any[]) => void;

export class DatabaseManager {
  private static instance: DatabaseManager;
  private db: Database | null = null;
  private SQL: SqlJsStatic | null = null;
  private onExecuteCallback: ExecuteCallback | null = null;
  
  private readonly DB_STORE_NAME = 'supervision_db_store';
  private readonly DB_KEY = 'sqlite_db';

  private constructor() {}

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  /**
   * 设置 P2P 广播回调
   */
  public setOnExecute(cb: ExecuteCallback) {
    this.onExecuteCallback = cb;
  }

  /**
   * 初始化入口：加载引擎 -> 从 IndexedDB 恢复 -> 初始化表结构
   */
  public async init(): Promise<Database> {
    if (this.db) return this.db;

    try {
      // 1. 初始化 SQL.js 引擎 (加载 WASM)
      this.SQL = await initSqlJs({
        locateFile: (file) => `/sqljs/${file}`
      });

      // 2. 从 IndexedDB 加载上一次保存的数据库二进制数据
      const buffer = await this.loadFromIndexedDB();

      if (buffer) {
        this.db = new this.SQL.Database(new Uint8Array(buffer));
        console.log("已从本地存储恢复数据库");
      } else {
        this.db = new this.SQL.Database();
        console.log("创建全新数据库实例");
      }

      // 3. 执行初始化表结构和迁移逻辑
      await this.initializeSchema();

      return this.db;
    } catch (error) {
      console.error("数据库初始化关键错误:", error);
      throw error;
    }
  }

  /**
   * 初始化表结构（生产级：确保所有字段在首次建表时就存在）
   */
  private async initializeSchema() {
    if (!this.db) return;

    const schemaSql = `
      -- 1. 督办任务主表
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        parent_id TEXT,
        level INTEGER NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        task_type TEXT,
        priority TEXT,
        owner_dept_ids TEXT,     -- 存储主办科室 JSON
        co_dept_ids TEXT,        -- 存储协办科室 JSON
        dept_requirements TEXT,  -- 存储分科室要求 JSON
        co_dept_requirements TEXT, -- 存储分协办科室要求 JSON
        deadline DATETIME,
        status TEXT DEFAULT 'PENDING',
        progress INTEGER DEFAULT 0,
        leader_instructions TEXT,
        is_history INTEGER DEFAULT 0,        
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- 2. 进展反馈留痕表
      CREATE TABLE IF NOT EXISTS feedbacks (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        dept_id TEXT NOT NULL,
        content TEXT,
        attachments TEXT,       -- 附件路径 JSON
        feedback_person TEXT,
        feedback_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_apply_complete INTEGER DEFAULT 0
      );

      -- 3. 领导批示记录表
      CREATE TABLE IF NOT EXISTS leader_comments (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        leader_name TEXT,
        content TEXT,
        attachments TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- 4. 同步操作日志表
      CREATE TABLE IF NOT EXISTS sync_operation_logs (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        table_name TEXT NOT NULL,
        record_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        operation_data TEXT,
        operation_timestamp INTEGER,
        sync_status TEXT DEFAULT 'pending',
        version INTEGER DEFAULT 1
      );

      -- 5. 同步记录映射表
      CREATE TABLE IF NOT EXISTS sync_record_mappings (
        id TEXT PRIMARY KEY,
        source_client_id TEXT NOT NULL,
        source_record_id TEXT NOT NULL,
        local_record_id TEXT NOT NULL,
        table_name TEXT NOT NULL,
        operation_type TEXT,
        sync_timestamp INTEGER
      );

      -- 6. 同步冲突记录表
      CREATE TABLE IF NOT EXISTS sync_conflicts (
        id TEXT PRIMARY KEY,
        client_id TEXT,
        table_name TEXT,
        record_id TEXT,
        conflict_type TEXT,
        conflict_data TEXT,
        resolved INTEGER DEFAULT 0,
        conflict_timestamp INTEGER
      );

      -- 7. 流程模板库
      CREATE TABLE IF NOT EXISTS process_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        scope TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- 8. 流程模板环节
      CREATE TABLE IF NOT EXISTS process_nodes (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL,
        node_name TEXT NOT NULL,
        node_description TEXT,
        sort_order INTEGER NOT NULL,
        node_type TEXT DEFAULT 'TASK'
      );

      -- 9. 任务运行时流程环节
      CREATE TABLE IF NOT EXISTS task_process_nodes (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        template_id TEXT,
        node_name TEXT NOT NULL,
        node_description TEXT,
        sort_order INTEGER NOT NULL,
        status TEXT DEFAULT 'PENDING',
        completed_at DATETIME,
        completed_by TEXT
      );

      -- 10. 任务协作人
      CREATE TABLE IF NOT EXISTS task_collaborators (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        dept_id TEXT NOT NULL,
        person_name TEXT NOT NULL,
        assigned_by TEXT,
        assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'PENDING',
        feedback TEXT
      );

      -- 11. 个人关注事项
      CREATE TABLE IF NOT EXISTS task_watches (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- 12. 领导批示已阅记录
      CREATE TABLE IF NOT EXISTS leader_instruction_reads (
        id TEXT PRIMARY KEY,
        instruction_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        read_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- 13. 任务类型动态字段定义
      CREATE TABLE IF NOT EXISTS task_type_fields (
        id TEXT PRIMARY KEY,
        task_type TEXT NOT NULL,
        field_name TEXT NOT NULL,
        field_label TEXT NOT NULL,
        field_type TEXT DEFAULT 'TEXT',
        sort_order INTEGER DEFAULT 0
      );

      -- 14. 任务动态字段值
      CREATE TABLE IF NOT EXISTS task_field_values (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        field_id TEXT NOT NULL,
        field_value TEXT
      );

      -- 15. 督办催办记录
      CREATE TABLE IF NOT EXISTS supervision_reminders (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        reminded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        reminded_by TEXT,
        remind_content TEXT
      );

      -- 16. 人员目录
      CREATE TABLE IF NOT EXISTS personnel (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        dept_id TEXT NOT NULL,
        position TEXT,
        is_dept_head INTEGER DEFAULT 0
      );
    `;

    try {
      // 分解执行多条 SQL 语句
      const statements = schemaSql.split(';').filter(s => s.trim());
      for (const statement of statements) {
        this.db.run(statement);
      }
      
      // 检查旧表是否需要增补 dept_requirements 字段（针对从旧版升级的用户）
      try {
        this.db.run("ALTER TABLE tasks ADD COLUMN dept_requirements TEXT;");
      } catch (e) { /* 字段已存在 */ }

      // 迁移：tasks 表新增字段
      try { this.db.run("ALTER TABLE tasks ADD COLUMN source TEXT DEFAULT 'OTHER';"); } catch (e) { /* 已存在 */ }
      try { this.db.run("ALTER TABLE tasks ADD COLUMN tags TEXT DEFAULT '[]';"); } catch (e) { /* 已存在 */ }
      try { this.db.run("ALTER TABLE tasks ADD COLUMN handler_name TEXT DEFAULT '';"); } catch (e) { /* 已存在 */ }
      try { this.db.run("ALTER TABLE tasks ADD COLUMN is_key_task INTEGER DEFAULT 0;"); } catch (e) { /* 已存在 */ }

      // 迁移：feedbacks 表新增字段
      try { this.db.run("ALTER TABLE feedbacks ADD COLUMN is_leader_instruction INTEGER DEFAULT 0;"); } catch (e) { /* 已存在 */ }
      try { this.db.run("ALTER TABLE feedbacks ADD COLUMN highlighted INTEGER DEFAULT 0;"); } catch (e) { /* 已存在 */ }

      // 迁移：leader_comments 表新增字段
      try { this.db.run("ALTER TABLE leader_comments ADD COLUMN attachments TEXT;"); } catch (e) { /* 已存在 */ }
      try { this.db.run("ALTER TABLE leader_comments ADD COLUMN highlighted INTEGER DEFAULT 0;"); } catch (e) { /* 已存在 */ }

      await this.persist(); // 结构初始化后存一次盘
      console.log("督办系统数据库架构校验成功");
    } catch (e) {
      console.error("建表或迁移失败:", e);
    }
  }

  /**
   * 底层 SQL 执行（不触发广播），用于同步元数据操作
   */
  public run(sql: string, params: any[] = []): void {
    if (!this.db) throw new Error("数据库未就绪");
    this.db.run(sql, params);
  }

  /**
   * 核心查询方法：将 SQL 结果映射为对象数组
   */
  public query<T = any>(sql: string, params: any[] = []): T[] {
    if (!this.db) throw new Error("数据库未就绪");
    
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    
    const results: T[] = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject() as unknown as T);
    }
    
    stmt.free();
    return results;
  }

  /**
   * 核心执行方法：集成 P2P 同步广播
   * @param isRemote 如果为 true，说明是接收到的同步指令，不再向外发送，防止死循环
   */
  // src/core/database/DatabaseManager.ts

public execute(sql: string, params: any[] = [], isRemote: boolean = false): void {
  if (!this.db) throw new Error("数据库未就绪");

  try {
    this.db.run(sql, params);

    // 如果是本地操作，广播出去
    if (!isRemote && this.onExecuteCallback) {
      const upperSql = sql.trim().toUpperCase();
      if (upperSql.startsWith("INSERT") || upperSql.startsWith("UPDATE") || upperSql.startsWith("DELETE")) {
        this.onExecuteCallback(sql, params);
      }
    }
  } catch (e: any) {
    // 【修改点】：如果是远程同步过来的指令报错，记录日志但不抛出异常
    // 这样可以防止一个同步包的错误导致整个 P2P 链路断开
    if (isRemote) {
      console.warn("⚠️ 远程同步指令执行被跳过（可能数据已存在）:", e.message);
    } else {
      console.error("❌ 本地 SQL 执行失败:", sql, e);
      throw e; 
    }
  }
}

  /**
   * 导出数据库二进制流 (用于 P2P 全量同步发送)
   */
  public export(): Uint8Array {
    if (!this.db) throw new Error("数据库未初始化");
    return this.db.export();
  }

  /**
   * 全量导入数据库 (用于 P2P 接收他人的完整库)
   */
  public async importDatabase(binaryData: Uint8Array) {
    if (!this.SQL) return;
    try {
      // 重新创建数据库实例
      this.db = new this.SQL.Database(binaryData);
      await this.persist();
      console.log("✅ 数据库全量导入成功");
      // 注意：这里不要写 window.location.reload()
    } catch (e) {
      console.error("导入失败:", e);
    }
  }

  // 辅助方法：检查本地是否有数据
  public hasData(): boolean {
    const res = this.query("SELECT count(*) as count FROM tasks");
    return res[0].count > 0;
  }

  /**
   * 将内存数据持久化到浏览器 IndexedDB
   */
  public async persist(): Promise<void> {
    if (!this.db) return;
    const data = this.db.export();
    await this.saveToIndexedDB(data.buffer);
  }

  // ========== 同步元数据操作方法 ==========

  /** 保存同步操作日志 */
  saveSyncOperationLog(data: Record<string, any>): void {
    this.run(
      `INSERT OR REPLACE INTO sync_operation_logs
       (id, client_id, table_name, record_id, operation, operation_data, operation_timestamp, sync_status, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.id,
        data.client_id,
        data.table_name,
        data.record_id,
        data.operation,
        typeof data.operation_data === 'string' ? data.operation_data : JSON.stringify(data.operation_data),
        data.operation_timestamp,
        data.sync_status || 'pending',
        data.version || 1,
      ],
    );
  }

  /** 更新同步操作状态 */
  updateSyncOperationStatus(id: string, status: string): void {
    this.run('UPDATE sync_operation_logs SET sync_status = ? WHERE id = ?', [status, id]);
  }

  /** 保存同步记录映射 */
  saveSyncRecordMapping(data: Record<string, any>): void {
    this.run(
      `INSERT OR REPLACE INTO sync_record_mappings
       (id, source_client_id, source_record_id, local_record_id, table_name, operation_type, sync_timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.id,
        data.source_client_id,
        data.source_record_id,
        data.local_record_id,
        data.table_name,
        data.operation_type,
        data.sync_timestamp,
      ],
    );
  }

  /** 删除同步记录映射 */
  deleteSyncRecordMapping(sourceClientId: string, sourceRecordId: string, tableName: string): void {
    this.run(
      'DELETE FROM sync_record_mappings WHERE source_client_id = ? AND source_record_id = ? AND table_name = ?',
      [sourceClientId, sourceRecordId, tableName],
    );
  }

  /** 保存同步冲突记录 */
  saveSyncConflict(data: Record<string, any>): void {
    this.run(
      `INSERT OR REPLACE INTO sync_conflicts
       (id, client_id, table_name, record_id, conflict_type, conflict_data, resolved, conflict_timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.id,
        data.client_id,
        data.table_name,
        data.record_id,
        data.conflict_type,
        typeof data.conflict_data === 'string' ? data.conflict_data : JSON.stringify(data.conflict_data),
        data.resolved ? 1 : 0,
        data.conflict_timestamp || Date.now(),
      ],
    );
  }

  /** 检查操作是否已处理 */
  isOperationProcessed(operationId: string): boolean {
    const result = this.query<{ count: number }>(
      "SELECT COUNT(*) as count FROM sync_operation_logs WHERE id = ? AND sync_status = 'synced'",
      [operationId],
    );
    return result[0]?.count > 0;
  }

  /** 获取指定时间之后的操作日志 */
  getOperationsSince(timestamp: number): any[] {
    return this.query(
      'SELECT * FROM sync_operation_logs WHERE operation_timestamp > ? ORDER BY operation_timestamp ASC',
      [timestamp],
    );
  }

  /** 清理过期的操作日志 */
  cleanupExpiredOperationLogs(retentionDays: number): void {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    this.run(
      "DELETE FROM sync_operation_logs WHERE operation_timestamp < ? AND sync_status = 'synced'",
      [cutoff],
    );
  }

  /** 清理过期的软删除记录 */
  cleanupExpiredSoftDeletes(retentionDays: number): void {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const tables = ['tasks', 'feedbacks', 'leader_comments'];
    for (const table of tables) {
      this.run(`DELETE FROM ${table} WHERE is_deleted = 1 AND deleted_at < ?`, [cutoff]);
    }
  }

  // ========== 业务表操作方法（SyncFramework 兼容） ==========

  /** 保存工作任务记录 */
  saveWorkTask(data: Record<string, any>): string {
    const id = data.id;
    const existing = this.query('SELECT id FROM tasks WHERE id = ?', [id]);
    if (existing.length > 0) {
      const keys = Object.keys(data).filter((k) => k !== 'id');
      const setClauses = keys.map((k) => `${k} = ?`).join(', ');
      const values = keys.map((k) => data[k]);
      this.run(`UPDATE tasks SET ${setClauses} WHERE id = ?`, [...values, id]);
    } else {
      this.run(
        `INSERT INTO tasks (id, parent_id, level, title, content, task_type, priority,
         owner_dept_ids, co_dept_ids, dept_requirements, co_dept_requirements,
         deadline, status, progress, leader_instructions, is_history, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, data.parent_id || null, data.level || 1, data.title || '', data.content || '',
          data.task_type || '常规', data.priority || 'MEDIUM',
          data.owner_dept_ids || '[]', data.co_dept_ids || '[]',
          data.dept_requirements || '{}', data.co_dept_requirements || '{}',
          data.deadline || null, data.status || 'PENDING', data.progress || 0,
          data.leader_instructions || null, data.is_history || 0, data.created_at || new Date().toISOString(),
        ],
      );
    }
    return id;
  }

  /** 获取工作任务记录 */
  getWorkTask(recordId: string): Record<string, any> | null {
    const results = this.query('SELECT * FROM tasks WHERE id = ?', [recordId]);
    return results.length > 0 ? results[0] : null;
  }

  /** 获取年度任务记录（当前项目无此表，返回 null） */
  getAnnualTask(_recordId: string): null {
    return null;
  }

  /** 软删除工作任务 */
  softDeleteWorkTask(recordId: string, deletedBy: string): void {
    this.run('UPDATE tasks SET is_deleted = 1, deleted_at = ?, deleted_by = ? WHERE id = ?', [
      Date.now(), deletedBy, recordId,
    ]);
  }

  /** 硬删除工作任务 */
  deleteWorkTask(recordId: string): void {
    this.run('DELETE FROM tasks WHERE id = ?', [recordId]);
  }

  // --- IndexedDB 底层封装 ---

  private async loadFromIndexedDB(): Promise<ArrayBuffer | null> {
    return new Promise((resolve) => {
      const request = indexedDB.open(this.DB_STORE_NAME, 1);
      
      request.onupgradeneeded = () => {
        request.result.createObjectStore('data');
      };

      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('data', 'readonly');
        const store = transaction.objectStore('data');
        const getRequest = store.get(this.DB_KEY);
        
        getRequest.onsuccess = () => resolve(getRequest.result || null);
        getRequest.onerror = () => resolve(null);
      };

      request.onerror = () => resolve(null);
    });
  }

  private async saveToIndexedDB(buffer: ArrayBufferLike): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_STORE_NAME, 1);
      
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('data', 'readwrite');
        const store = transaction.objectStore('data');
        store.put(buffer, this.DB_KEY);
        
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }
}