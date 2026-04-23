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
      } catch (e) {
        // 如果字段已存在会报错，捕获并忽略即可
      }

      await this.persist(); // 结构初始化后存一次盘
      console.log("督办系统数据库架构校验成功");
    } catch (e) {
      console.error("建表或迁移失败:", e);
    }
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