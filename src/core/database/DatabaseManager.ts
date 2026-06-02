import initSqlJs from 'sql.js';
import type { Database, SqlJsStatic } from 'sql.js';
import { wasmBase64 } from './wasmData';

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

    console.log("[DB] 开始初始化数据库...");

    try {
      // 1. 初始化 SQL.js 引擎 (使用内联的 WASM 数据)
      console.log("[DB] 正在加载 SQL.js WASM 引擎...");
      // 将 base64 解码为 ArrayBuffer
      const wasmBinary = Uint8Array.from(atob(wasmBase64), c => c.charCodeAt(0)).buffer;
      
      const sqlPromise = initSqlJs({
        wasmBinary: wasmBinary
      });
      
      // 设置 30 秒超时
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("SQL.js WASM 加载超时")), 30000);
      });

      this.SQL = await Promise.race([sqlPromise, timeoutPromise]);
      console.log("[DB] SQL.js WASM 引擎加载成功");

      // 2. 从 IndexedDB 加载上一次保存的数据库二进制数据 - 添加超时机制
      console.log("[DB] 正在从 IndexedDB 恢复数据...");
      const loadPromise = this.loadFromIndexedDB();
      const loadTimeoutPromise = new Promise<ArrayBuffer | null>((resolve) => {
        setTimeout(() => {
          console.warn("[DB] IndexedDB 读取超时，将创建新数据库");
          resolve(null);
        }, 10000);
      });

      const buffer = await Promise.race([loadPromise, loadTimeoutPromise]);

      if (buffer) {
        try {
          this.db = new this.SQL.Database(new Uint8Array(buffer));
          console.log("[DB] 已从本地存储恢复数据库");
        } catch (e) {
          console.warn("[DB] 本地存储数据损坏，将创建新数据库:", e);
          this.db = new this.SQL.Database();
        }
      } else {
        this.db = new this.SQL.Database();
        console.log("[DB] 创建全新数据库实例");
      }

      // 3. 执行初始化表结构和迁移逻辑
      console.log("[DB] 正在初始化表结构...");
      await this.initializeSchema();

      console.log("[DB] 数据库初始化完成");
      return this.db;
    } catch (error) {
      console.error("[DB] 数据库初始化关键错误:", error);
      // 如果初始化失败，尝试创建一个新的空数据库作为后备方案
      try {
        if (this.SQL) {
          this.db = new this.SQL.Database();
          await this.initializeSchema();
          console.warn("[DB] 已使用后备方案创建新数据库");
          return this.db;
        }
      } catch (e) {
        console.error("[DB] 后备方案也失败:", e);
      }
      throw error;
    }
  }

  /**
   * 初始化表结构（生产级：确保所有字段在首次建表时就存在）
   */
  private async initializeSchema() {
    if (!this.db) return;

    const schemaSql = `
      -- ============================================================
      -- 原有表（保留兼容）
      -- ============================================================

      -- 1. 督办任务主表（V3.0 扩展）
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        parent_id TEXT,
        level INTEGER NOT NULL DEFAULT 1,
        title TEXT NOT NULL,
        content TEXT,
        task_type TEXT,
        priority TEXT DEFAULT 'normal',
        owner_dept_ids TEXT,
        co_dept_ids TEXT,
        dept_requirements TEXT,
        co_dept_requirements TEXT,
        deadline TEXT,
        status TEXT DEFAULT 'pending',
        progress INTEGER DEFAULT 0,
        leader_instructions TEXT,
        is_history INTEGER DEFAULT 0,
        created_at TEXT,
        -- V3.0 扩展字段
        taskTypeGroupId TEXT,
        taskTypeId TEXT,
        description TEXT,
        responsibleMatrix TEXT,
        stagesSnapshot TEXT,
        flowTemplateId TEXT,
        currentStageIndex INTEGER DEFAULT 0,
        confirmedFeedback TEXT,
        dataSheetTemplateId TEXT,
        dataSheetFields TEXT,
        dataSheetRows TEXT,
        childAggregationMode TEXT DEFAULT 'none',
        aggregationRules TEXT,
        snapshots TEXT,
        extractionConfig TEXT,
        authorizedPeers TEXT DEFAULT '[]',
        sharedWith TEXT DEFAULT '[]',
        createdBy TEXT,
        updatedAt TEXT,
        starredBy TEXT DEFAULT '[]',
        activityLog TEXT DEFAULT '[]',
        childTaskIds TEXT DEFAULT '[]',
        source TEXT DEFAULT 'OTHER',
        tags TEXT DEFAULT '[]',
        handler_name TEXT DEFAULT '',
        is_key_task INTEGER DEFAULT 0
      );

      -- 2. 进展反馈留痕表
      CREATE TABLE IF NOT EXISTS feedbacks (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        dept_id TEXT NOT NULL,
        content TEXT,
        attachments TEXT,
        feedback_person TEXT,
        feedback_time TEXT,
        is_apply_complete INTEGER DEFAULT 0,
        is_leader_instruction INTEGER DEFAULT 0,
        highlighted INTEGER DEFAULT 0
      );

      -- 3. 领导批示记录表
      CREATE TABLE IF NOT EXISTS leader_comments (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        leader_name TEXT,
        content TEXT,
        attachments TEXT,
        created_at TEXT,
        highlighted INTEGER DEFAULT 0
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

      -- 7. 流程模板库（V3.0 扩展）
      CREATE TABLE IF NOT EXISTS flow_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        scope TEXT,
        stages TEXT,
        createdBy TEXT,
        isPublic INTEGER DEFAULT 1,
        created_at TEXT,
        updatedAt TEXT
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
        completed_at TEXT,
        completed_by TEXT
      );

      -- 10. 任务协作人
      CREATE TABLE IF NOT EXISTS task_collaborators (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        dept_id TEXT NOT NULL,
        person_name TEXT NOT NULL,
        assigned_by TEXT,
        assigned_at TEXT,
        status TEXT DEFAULT 'PENDING',
        feedback TEXT
      );

      -- 11. 个人关注事项
      CREATE TABLE IF NOT EXISTS task_watches (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at TEXT
      );

      -- 12. 领导批示已阅记录
      CREATE TABLE IF NOT EXISTS leader_instruction_reads (
        id TEXT PRIMARY KEY,
        instruction_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        read_at TEXT
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
        reminded_at TEXT,
        reminded_by TEXT,
        remind_content TEXT
      );

      -- 16. 人员目录（V3.0 扩展）
      CREATE TABLE IF NOT EXISTS personnel (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        dept_id TEXT NOT NULL,
        position TEXT,
        is_dept_head INTEGER DEFAULT 0,
        employeeNo TEXT,
        departmentId TEXT,
        isLeader INTEGER DEFAULT 0,
        email TEXT,
        isActive INTEGER DEFAULT 1,
        sortOrder INTEGER DEFAULT 0
      );

      -- ============================================================
      -- V3.0 新增表
      -- ============================================================

      -- 17. 部门表
      CREATE TABLE IF NOT EXISTS departments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        shortName TEXT,
        parentId TEXT,
        leaderId TEXT,
        sortOrder INTEGER DEFAULT 0,
        isActive INTEGER DEFAULT 1
      );

      -- 18. 任务关联表
      CREATE TABLE IF NOT EXISTS task_relations (
        id TEXT PRIMARY KEY,
        parentTaskId TEXT NOT NULL,
        childTaskId TEXT NOT NULL,
        relationType TEXT NOT NULL DEFAULT 'parent_child',
        aggregationMode TEXT DEFAULT 'none',
        aggregationRules TEXT,
        createdAt TEXT
      );

      -- 19. 系统字段库
      CREATE TABLE IF NOT EXISTS system_fields (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        fieldType TEXT NOT NULL DEFAULT 'text',
        fieldOptions TEXT,
        unit TEXT,
        isAggregatable INTEGER DEFAULT 0,
        suggestedLevel TEXT,
        isSystem INTEGER DEFAULT 0
      );

      -- 20. 动态明细模板表
      CREATE TABLE IF NOT EXISTS data_sheet_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        fields TEXT NOT NULL,
        defaultSort TEXT,
        createdAt TEXT
      );

      -- 21. 任务类型一级分类
      CREATE TABLE IF NOT EXISTS task_type_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sortOrder INTEGER DEFAULT 0
      );

      -- 22. 任务类型二级子项
      CREATE TABLE IF NOT EXISTS task_types (
        id TEXT PRIMARY KEY,
        groupId TEXT NOT NULL,
        name TEXT NOT NULL,
        defaultFlowTemplateId TEXT,
        defaultDataSheetTemplateId TEXT,
        sortOrder INTEGER DEFAULT 0
      );

      -- 23. 标签组
      CREATE TABLE IF NOT EXISTS tag_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sortOrder INTEGER DEFAULT 0
      );

      -- 24. 标签
      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        groupId TEXT NOT NULL,
        name TEXT NOT NULL,
        sortOrder INTEGER DEFAULT 0
      );

      -- 25. 文件表
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'attachment',
        mimeType TEXT,
        size INTEGER DEFAULT 0,
        data BLOB,
        version INTEGER DEFAULT 1,
        isLatest INTEGER DEFAULT 1,
        replacesFileId TEXT,
        relatedTaskId TEXT,
        uploadedBy TEXT,
        uploadedAt TEXT,
        policyNumber TEXT,
        effectiveDate TEXT,
        expiryDate TEXT,
        clauses TEXT
      );

      -- 26. 态势指标定义表
      CREATE TABLE IF NOT EXISTS metric_definitions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        level TEXT NOT NULL DEFAULT 'customs_level',
        isRecommended INTEGER DEFAULT 0,
        config TEXT NOT NULL,
        visibility TEXT DEFAULT 'all',
        isSystem INTEGER DEFAULT 0,
        sortOrder INTEGER DEFAULT 0
      );

      -- 27. 用户看板配置
      CREATE TABLE IF NOT EXISTS user_dashboard_config (
        userId TEXT PRIMARY KEY,
        customsMetrics TEXT DEFAULT '[]',
        sectionMetrics TEXT DEFAULT '[]',
        tabs TEXT DEFAULT '[]',
        activeTabId TEXT,
        layout TEXT DEFAULT 'grid'
      );

      -- 28. 用户角色表
      CREATE TABLE IF NOT EXISTS user_roles (
        userId TEXT NOT NULL,
        role TEXT NOT NULL,
        scope TEXT,
        PRIMARY KEY (userId, role)
      );
    `;

    try {
      const statements = schemaSql.split(';').filter(s => s.trim());
      for (const statement of statements) {
        this.db.run(statement);
      }

      // ========== 向后兼容迁移（V3.0 强制迁移） ==========
      const ensureColumn = (table: string, col: string, def: string) => {
        try {
          // 先检查列是否已存在
          const colCheck = this.db!.exec(`PRAGMA table_info(${table})`);
          if (colCheck.length > 0) {
            const columns = colCheck[0].values.map((r: any) => r[1]);
            if (columns.includes(col)) return; // 列已存在，跳过
          }
          this.db!.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${def};`);
          console.log(`[DB] 迁移: ${table}.${col} 添加成功`);
        } catch (e: any) {
          console.warn(`[DB] 迁移警告: ${table}.${col} 添加失败, 原因: ${e.message}`);
        }
      };

      // tasks 表所有 V3.0 必需字段
      const taskV3Columns: [string, string][] = [
        ['dept_requirements', 'TEXT'], ['co_dept_requirements', 'TEXT'],
        ['source', "TEXT DEFAULT 'OTHER'"], ['tags', "TEXT DEFAULT '[]'"],
        ['handler_name', "TEXT DEFAULT ''"], ['is_key_task', 'INTEGER DEFAULT 0'],
        ['taskTypeGroupId', 'TEXT'], ['taskTypeId', 'TEXT'], ['description', 'TEXT'],
        ['responsibleMatrix', 'TEXT'], ['stagesSnapshot', 'TEXT'],
        ['flowTemplateId', 'TEXT'], ['currentStageIndex', 'INTEGER DEFAULT 0'],
        ['confirmedFeedback', 'TEXT'], ['dataSheetTemplateId', 'TEXT'],
        ['dataSheetFields', 'TEXT'], ['dataSheetRows', 'TEXT'],
        ['childAggregationMode', "TEXT DEFAULT 'none'"], ['aggregationRules', 'TEXT'],
        ['snapshots', 'TEXT'], ['extractionConfig', 'TEXT'],
        ['authorizedPeers', "TEXT DEFAULT '[]'"], ['sharedWith', "TEXT DEFAULT '[]'"],
        ['createdBy', 'TEXT'], ['updatedAt', 'TEXT'],
        ['starredBy', "TEXT DEFAULT '[]'"], ['activityLog', "TEXT DEFAULT '[]'"],
        ['childTaskIds', "TEXT DEFAULT '[]'"],
      ];
      for (const [col, def] of taskV3Columns) {
        ensureColumn('tasks', col, def);
      }

      // feedbacks / leader_comments / personnel 补全
      for (const [col, def] of [['is_leader_instruction', 'INTEGER DEFAULT 0'], ['highlighted', 'INTEGER DEFAULT 0']]) {
        ensureColumn('feedbacks', col, def);
      }
      for (const [col, def] of [['attachments', 'TEXT'], ['highlighted', 'INTEGER DEFAULT 0']]) {
        ensureColumn('leader_comments', col, def);
      }
      const personnelV3Cols: [string, string][] = [
        ['employeeNo', 'TEXT'], ['departmentId', 'TEXT'],
        ['isLeader', 'INTEGER DEFAULT 0'], ['email', 'TEXT'],
        ['isActive', 'INTEGER DEFAULT 1'], ['sortOrder', 'INTEGER DEFAULT 0'],
      ];
      for (const [col, def] of personnelV3Cols) {
        ensureColumn('personnel', col, def);
      }

      // flow_templates 扩展（确保表存在）
      try {
        this.db!.exec('SELECT count(*) FROM flow_templates');
      } catch (_) {
        // flow_templates 表不存在，创建它
        this.db!.run(`CREATE TABLE IF NOT EXISTS flow_templates (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, scope TEXT,
          stages TEXT, createdBy TEXT, isPublic INTEGER DEFAULT 1,
          created_at TEXT, updatedAt TEXT
        )`);
      }
      for (const [col, def] of [['stages', 'TEXT'], ['createdBy', 'TEXT'], ['isPublic', 'INTEGER DEFAULT 1'], ['updatedAt', 'TEXT']]) {
        ensureColumn('flow_templates', col, def);
      }
      // 从旧的 process_templates 迁移到 flow_templates（如果没有 flow_templates 数据）
      try {
        const ftCount = this.db!.exec('SELECT count(*) as c FROM flow_templates');
        const ptCount = this.db!.exec('SELECT count(*) as c FROM process_templates');
        if (ftCount[0]?.values[0]?.[0] === 0 && ptCount[0]?.values[0]?.[0] > 0) {
          this.db!.run(`INSERT INTO flow_templates (id, name, description, scope, created_at, isPublic)
            SELECT id, name, description, scope, created_at, 1 FROM process_templates`);
        }
      } catch (_) { /* 迁移跳过 */ }

      // personnel 从 dept_id 同步 departmentId
      try {
        this.db!.run(`UPDATE personnel SET departmentId = dept_id WHERE departmentId IS NULL OR departmentId = ''`);
        this.db!.run(`UPDATE personnel SET isLeader = is_dept_head WHERE isLeader = 0 AND is_dept_head = 1`);
        this.db!.run(`UPDATE personnel SET employeeNo = id WHERE employeeNo IS NULL OR employeeNo = ''`);
      } catch (_) { /* 迁移跳过 */ }

      // departments 种子数据（如果表为空）
      try {
        const dCount = this.db!.exec("SELECT count(*) as c FROM departments");
        if (dCount[0]?.values[0]?.[0] === 0) {
          const deptSeeds = [
            ["dept_01","第八派驻纪检组","纪检组",null,null,1,1],
            ["dept_02","办公室（党委办公室）","办公室",null,null,2,1],
            ["dept_03","人事政工科","人事政工",null,null,3,1],
            ["dept_04","综合保障科","综合保障",null,null,4,1],
            ["dept_05","综合业务一科","综合一",null,null,5,1],
            ["dept_06","综合业务二科","综合二",null,null,6,1],
            ["dept_07","查验一科","查验一",null,null,7,1],
            ["dept_08","查验二科","查验二",null,null,8,1],
            ["dept_09","查验三科","查验三",null,null,9,1],
            ["dept_10","监控管理科","监控管理",null,null,10,1],
            ["dept_11","物流监控科","物流监控",null,null,11,1],
            ["dept_12","船舶清关科","船舶清关",null,null,12,1],
            ["dept_13","船舶检查科","船舶检查",null,null,13,1],
            ["dept_14","验估一科","验估一",null,null,14,1],
            ["dept_15","验估二科","验估二",null,null,15,1],
            ["dept_16","验估三科","验估三",null,null,16,1],
            ["dept_17","跨境贸易便利化科","跨境贸易",null,null,17,1],
          ];
          const stmt = this.db!.prepare("INSERT INTO departments (id, name, shortName, parentId, leaderId, sortOrder, isActive) VALUES (?,?,?,?,?,?,?)");
          for (const d of deptSeeds) { stmt.run(d); }
          stmt.free();
        }
      } catch (_) { /* 种子已存在 */ }

      // 创建旧 process_templates 兼容视图（如果 flow_templates 存在但 process_templates 为空）
      try {
        this.db!.exec("SELECT count(*) as c FROM process_templates");
      } catch (_) {
        this.db!.run(`CREATE TABLE IF NOT EXISTS process_templates (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, scope TEXT, created_at TEXT)`);
        try {
          this.db!.run(`INSERT INTO process_templates (id, name, description, scope, created_at)
            SELECT id, name, description, scope, created_at FROM flow_templates`);
        } catch (_2) { /* skip */ }
      }

      await this.persist();
      console.log("[DB] V3.0 数据库架构校验成功 (28张表)");
    } catch (e) {
      console.error("[DB] 建表或迁移失败:", e);
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
      const now = new Date().toISOString()
      this.run(
        `INSERT INTO tasks (id, parent_id, level, title, content, task_type, priority,
         owner_dept_ids, co_dept_ids, dept_requirements, co_dept_requirements,
         deadline, status, progress, leader_instructions, is_history, created_at,
         taskTypeGroupId, taskTypeId, description, responsibleMatrix, stagesSnapshot,
         currentStageIndex, confirmedFeedback, dataSheetTemplateId, dataSheetFields,
         dataSheetRows, childAggregationMode, aggregationRules, snapshots,
         extractionConfig, authorizedPeers, sharedWith, createdBy, updatedAt,
         starredBy, activityLog, source, tags, handler_name, is_key_task)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                 ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                 ?, ?, ?, ?, ?)`,
        [
          id, data.parent_id || null, data.level || 1, data.title || '', data.content || '',
          data.task_type || '常规', data.priority || 'normal',
          data.owner_dept_ids || '[]', data.co_dept_ids || '[]',
          data.dept_requirements || '{}', data.co_dept_requirements || '{}',
          data.deadline || null, data.status || 'pending', data.progress || 0,
          data.leader_instructions || null, data.is_history || 0, data.created_at || now,
          data.taskTypeGroupId || null, data.taskTypeId || null,
          data.description || '', data.responsibleMatrix || '{"primary":[],"cooperative":[]}',
          data.stagesSnapshot || null, data.currentStageIndex ?? 0,
          data.confirmedFeedback || null, data.dataSheetTemplateId || null,
          data.dataSheetFields || null, data.dataSheetRows || null,
          data.childAggregationMode || 'none', data.aggregationRules || null,
          data.snapshots || null, data.extractionConfig || null,
          data.authorizedPeers || '[]', data.sharedWith || '[]',
          data.createdBy || '', now,
          data.starredBy || '[]', data.activityLog || '[]',
          data.source || 'OTHER', data.tags || '[]',
          data.handler_name || '', data.is_key_task ? 1 : 0,
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