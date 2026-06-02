import { DatabaseManager } from '@/core/database/DatabaseManager';
import { useSyncStore } from '@/stores/sync';

export interface CleanupConfig {
  operationLogRetentionDays: number;
  maxOperationLogs: number;
  cleanupThreshold: number;
  softDeleteRetentionDays: number;
  maxSoftDeletedRecords: number;
  cleanupOnStartup: boolean;
  cleanupOnThreshold: boolean;
  cleanupOnSyncCompletion: boolean;
}

export const DEFAULT_CLEANUP_CONFIG: CleanupConfig = {
  operationLogRetentionDays: 30,
  maxOperationLogs: 10000,
  cleanupThreshold: 1000,
  softDeleteRetentionDays: 30,
  maxSoftDeletedRecords: 5000,
  cleanupOnStartup: true,
  cleanupOnThreshold: true,
  cleanupOnSyncCompletion: true,
};

export class SmartCleanupManager {
  private static instance: SmartCleanupManager;
  private db: DatabaseManager;
  private syncStore: ReturnType<typeof useSyncStore>;
  private config: CleanupConfig = { ...DEFAULT_CLEANUP_CONFIG };
  private lastCleanupTime: number = 0;
  private isCleaning: boolean = false;
  private isInitialized: boolean = false;

  private constructor() {
    this.db = DatabaseManager.getInstance();
    this.syncStore = useSyncStore();
    this.loadCleanupState();
  }

  static getInstance(): SmartCleanupManager {
    if (!SmartCleanupManager.instance) {
      SmartCleanupManager.instance = new SmartCleanupManager();
    }
    return SmartCleanupManager.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    console.log('🧹 初始化智能清理管理器...');
    await this.waitForDatabaseInitialization();
    this.isInitialized = true;

    if (this.config.cleanupOnStartup) {
      await this.cleanupOnStartup();
    }

    this.setupOperationListeners();
  }

  private async waitForDatabaseInitialization(maxAttempts: number = 10, delay: number = 500): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.db.query('SELECT 1 as test');
        console.log('✅ 数据库已初始化，可以开始清理操作');
        return;
      } catch {
        console.log(`⏳ 等待数据库初始化... (${attempt}/${maxAttempts})`);
        if (attempt === maxAttempts) {
          console.warn('⚠️ 数据库初始化等待超时，跳过清理初始化');
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  setSyncManager(_syncManager: any): void {
    // 标记外部关联，供调试使用
  }

  private async cleanupOnStartup(): Promise<void> {
    const now = Date.now();
    const lastCleanup = this.lastCleanupTime;
    const daysSinceLastCleanup = (now - lastCleanup) / (24 * 60 * 60 * 1000);

    console.log(`🔍 启动清理检查: 距离上次清理 ${daysSinceLastCleanup.toFixed(1)} 天`);

    if (daysSinceLastCleanup > 7) {
      console.log('🚀 执行启动清理...');
      await this.performCleanup('startup');
    } else {
      console.log('⏭️ 跳过启动清理，清理间隔未到');
    }
  }

  private setupOperationListeners(): void {
    setInterval(() => {
      this.checkOperationLogThreshold();
    }, 5 * 60 * 1000);
  }

  private async checkOperationLogThreshold(): Promise<void> {
    if (!this.config.cleanupOnThreshold) return;

    try {
      const operationCount = await this.getOperationLogCount();
      const softDeleteCount = await this.getSoftDeletedRecordCount();

      console.log(
        `📊 清理检查: 操作日志 ${operationCount}/${this.config.cleanupThreshold}, 软删除记录 ${softDeleteCount}`,
      );

      if (operationCount >= this.config.cleanupThreshold) {
        console.log('🚨 达到操作日志阈值，触发清理');
        await this.performCleanup('threshold');
      }
    } catch (error) {
      console.error('检查操作日志阈值失败:', error);
    }
  }

  async performCleanup(trigger: 'startup' | 'threshold' | 'sync_completion' | 'manual'): Promise<CleanupResult> {
    if (this.isCleaning) {
      console.log('⏳ 清理操作正在进行中，跳过...');
      return { success: false, reason: 'cleanup_in_progress' };
    }

    if (!(await this.isSafeToCleanup())) {
      console.log('⚠️ 清理前状态检查失败，跳过清理');
      return { success: false, reason: 'not_safe_to_cleanup' };
    }

    this.isCleaning = true;
    console.log(`🧹 开始清理操作，触发原因: ${trigger}`);

    try {
      const results = await this.executeCleanupTasks();
      this.lastCleanupTime = Date.now();
      this.saveCleanupState();
      console.log('✅ 清理操作完成:', results);
      return { success: true, results };
    } catch (error) {
      console.error('❌ 清理操作失败:', error);
      return { success: false, reason: 'cleanup_failed', error };
    } finally {
      this.isCleaning = false;
    }
  }

  private async isSafeToCleanup(): Promise<boolean> {
    const pendingOperations = await this.getPendingSyncOperationCount();
    if (pendingOperations > 0) {
      console.log(`⚠️ 有待同步操作 (${pendingOperations}个)，跳过清理`);
      return false;
    }

    if (this.syncStore.isConnected) {
      return true;
    }

    return true;
  }

  private async executeCleanupTasks(): Promise<CleanupResults> {
    const results: CleanupResults = {
      operationLogs: { cleaned: 0, retained: 0 },
      softDeletes: { cleaned: 0, retained: 0 },
      conflicts: { cleaned: 0, retained: 0 },
    };

    try {
      results.operationLogs = await this.cleanupOperationLogs();
    } catch (error) {
      console.error('清理操作日志失败:', error);
    }

    try {
      results.softDeletes = await this.cleanupSoftDeletedRecords();
    } catch (error) {
      console.error('清理软删除记录失败:', error);
    }

    try {
      results.conflicts = await this.cleanupResolvedConflicts();
    } catch (error) {
      console.error('清理冲突记录失败:', error);
    }

    return results;
  }

  private async cleanupOperationLogs(): Promise<{ cleaned: number; retained: number }> {
    const cutoffTime = Date.now() - this.config.operationLogRetentionDays * 24 * 60 * 60 * 1000;

    const toCleanResult = this.db.query<{ count: number }>(
      "SELECT COUNT(*) as count FROM sync_operation_logs WHERE operation_timestamp < ? AND sync_status = 'synced'",
      [cutoffTime],
    );
    const toCleanCount = toCleanResult[0]?.count || 0;

    const retainedResult = this.db.query<{ count: number }>(
      "SELECT COUNT(*) as count FROM sync_operation_logs WHERE operation_timestamp >= ? OR sync_status != 'synced'",
      [cutoffTime],
    );
    const retainedCount = retainedResult[0]?.count || 0;

    this.db.run(
      "DELETE FROM sync_operation_logs WHERE operation_timestamp < ? AND sync_status = 'synced'",
      [cutoffTime],
    );

    console.log(`📝 操作日志清理: 删除 ${toCleanCount} 条，保留 ${retainedCount} 条`);
    return { cleaned: toCleanCount, retained: retainedCount };
  }

  private async cleanupSoftDeletedRecords(): Promise<{ cleaned: number; retained: number }> {
    const cutoffTime = Date.now() - this.config.softDeleteRetentionDays * 24 * 60 * 60 * 1000;
    let totalCleaned = 0;

    const tables = ['tasks', 'feedbacks', 'leader_comments'];
    for (const table of tables) {
      const recordsToDelete = this.db.query<{ id: string }>(
        `SELECT id FROM ${table} WHERE is_deleted = 1 AND deleted_at < ?`,
        [cutoffTime],
      );

      if (recordsToDelete.length === 0) continue;
      const recordIds = recordsToDelete.map((r) => r.id);
      totalCleaned += recordIds.length;

      // 清理关联数据
      if (table === 'tasks') {
        for (const taskId of recordIds) {
          this.db.run('DELETE FROM feedbacks WHERE task_id = ?', [taskId]);
          this.db.run('DELETE FROM leader_comments WHERE task_id = ?', [taskId]);
        }
      }

      this.db.run(`DELETE FROM ${table} WHERE is_deleted = 1 AND deleted_at < ?`, [cutoffTime]);
    }

    const retainedCount = await this.getSoftDeletedRecordCount();
    console.log(`🗑️ 软删除记录清理: 删除 ${totalCleaned} 条，保留 ${retainedCount} 条`);
    return { cleaned: totalCleaned, retained: retainedCount };
  }

  private async cleanupResolvedConflicts(): Promise<{ cleaned: number; retained: number }> {
    const toDeleteResult = this.db.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM sync_conflicts WHERE resolved = 1',
    );
    const toDeleteCount = toDeleteResult[0]?.count || 0;

    this.db.run('DELETE FROM sync_conflicts WHERE resolved = 1');

    const retainedResult = this.db.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM sync_conflicts WHERE resolved = 0',
    );
    const retainedCount = retainedResult[0]?.count || 0;

    console.log(`⚡ 冲突记录清理: 删除 ${toDeleteCount} 条，保留 ${retainedCount} 条`);
    return { cleaned: toDeleteCount, retained: retainedCount };
  }

  async getOperationLogCount(): Promise<number> {
    const result = this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM sync_operation_logs');
    return result[0]?.count || 0;
  }

  async getSoftDeletedRecordCount(): Promise<number> {
    let total = 0
    const tables = ['tasks', 'feedbacks', 'leader_comments']
    for (const table of tables) {
      try {
        const result = this.db.query<{ count: number }>(
          `SELECT COUNT(*) as count FROM ${table} WHERE is_deleted = 1`,
        )
        total += result[0]?.count || 0
      } catch (_) { /* is_deleted 列可能不存在 */ }
    }
    return total;
  }

  private async getPendingSyncOperationCount(): Promise<number> {
    const result = this.db.query<{ count: number }>(
      "SELECT COUNT(*) as count FROM sync_operation_logs WHERE sync_status = 'pending'",
    );
    return result[0]?.count || 0;
  }

  private loadCleanupState(): void {
    try {
      const stored = localStorage.getItem('cleanup-manager-state');
      if (stored) {
        const state = JSON.parse(stored);
        this.lastCleanupTime = state.lastCleanupTime || 0;
      }
    } catch {
      // ignore parse errors
    }
  }

  private saveCleanupState(): void {
    try {
      localStorage.setItem('cleanup-manager-state', JSON.stringify({
        lastCleanupTime: this.lastCleanupTime,
      }));
    } catch {
      // ignore storage errors
    }
  }

  async manualCleanup(): Promise<CleanupResult> {
    return await this.performCleanup('manual');
  }

  getCleanupStatus(): CleanupStatus {
    return {
      lastCleanupTime: this.lastCleanupTime,
      isCleaning: this.isCleaning,
      config: this.config,
    };
  }

  updateConfig(newConfig: Partial<CleanupConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('✅ 清理配置已更新:', this.config);
  }
}

export interface CleanupResult {
  success: boolean;
  reason?: string;
  error?: any;
  results?: CleanupResults;
}

export interface CleanupResults {
  operationLogs: { cleaned: number; retained: number };
  softDeletes: { cleaned: number; retained: number };
  conflicts: { cleaned: number; retained: number };
}

export interface CleanupStatus {
  lastCleanupTime: number;
  isCleaning: boolean;
  config: CleanupConfig;
}
