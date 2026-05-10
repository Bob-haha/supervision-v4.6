import { DatabaseManager } from '@/database/utils/database'
import { useSyncStore } from '@/stores/useSyncStore'

export interface CleanupConfig {
  // 操作日志清理配置
  operationLogRetentionDays: number
  maxOperationLogs: number
  cleanupThreshold: number // 操作数量阈值触发清理

  // 软删除记录清理配置
  softDeleteRetentionDays: number
  maxSoftDeletedRecords: number

  // 清理时机配置
  cleanupOnStartup: boolean
  cleanupOnThreshold: boolean
  cleanupOnSyncCompletion: boolean
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
}

export class SmartCleanupManager {
  private static instance: SmartCleanupManager
  private db: DatabaseManager
  private syncStore: any
  private syncManager: any = null // 延迟设置

  private config: CleanupConfig = {
    operationLogRetentionDays: 30,
    maxOperationLogs: 10000,
    cleanupThreshold: 1000,

    softDeleteRetentionDays: 30,
    maxSoftDeletedRecords: 5000,

    cleanupOnStartup: true,
    cleanupOnThreshold: true,
    cleanupOnSyncCompletion: true,
  }

  private lastCleanupTime: number = 0
  private isCleaning: boolean = false
  private isInitialized: boolean = false

  private constructor() {
    this.db = DatabaseManager.getInstance()
    this.syncStore = useSyncStore()
    this.loadCleanupState()
  }

  static getInstance(): SmartCleanupManager {
    if (!SmartCleanupManager.instance) {
      SmartCleanupManager.instance = new SmartCleanupManager()
    }
    return SmartCleanupManager.instance
  }
  /**
   * 初始化清理管理器
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return

    console.log('🧹 初始化智能清理管理器...')

    // 等待数据库初始化完成
    await this.waitForDatabaseInitialization()

    this.isInitialized = true

    // 启动时清理检查
    if (this.config.cleanupOnStartup) {
      await this.cleanupOnStartup()
    }

    // 设置操作监听
    this.setupOperationListeners()
  }

  /**
   * 等待数据库初始化完成
   */
  private async waitForDatabaseInitialization(
    maxAttempts: number = 10,
    delay: number = 500,
  ): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // 尝试执行一个简单的查询来检查数据库是否就绪
        const result = await this.db.query('SELECT 1 as test')
        console.log('✅ 数据库已初始化，可以开始清理操作')
        return
      } catch (error) {
        console.log(`⏳ 等待数据库初始化... (${attempt}/${maxAttempts})`)
        if (attempt === maxAttempts) {
          console.warn('⚠️ 数据库初始化等待超时，跳过清理初始化')
          return
        }
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  /**
   * 设置同步管理器（延迟注入，避免循环依赖）
   */
  setSyncManager(syncManager: any): void {
    this.syncManager = syncManager
  }

  /**
   * 启动时清理检查
   */
  private async cleanupOnStartup(): Promise<void> {
    const now = Date.now()
    const lastCleanup = this.lastCleanupTime
    const daysSinceLastCleanup = (now - lastCleanup) / (24 * 60 * 60 * 1000)

    console.log(`🔍 启动清理检查: 距离上次清理 ${daysSinceLastCleanup.toFixed(1)} 天`)

    // 如果超过7天没有清理，执行清理
    if (daysSinceLastCleanup > 7) {
      console.log('🚀 执行启动清理...')
      await this.performCleanup('startup')
    } else {
      console.log('⏭️  跳过启动清理，清理间隔未到')
    }
  }

  /**
   * 设置操作监听
   */
  private setupOperationListeners(): void {
    // 修复：添加类型注解
    this.syncStore.$subscribe((mutation: any, state: any) => {
      if (mutation.type === 'direct' && mutation.events?.key === 'recordsReceived') {
        this.handleSyncOperationComplete()
      }
    })

    // 监听操作日志数量
    setInterval(
      () => {
        this.checkOperationLogThreshold()
      },
      5 * 60 * 1000,
    ) // 每5分钟检查一次
  }

  /**
   * 处理同步操作完成
   */
  private async handleSyncOperationComplete(): Promise<void> {
    if (!this.config.cleanupOnSyncCompletion) return

    // 等待一小段时间，确保所有操作都已完成
    setTimeout(async () => {
      if (await this.isSafeToCleanup()) {
        await this.performCleanup('sync_completion')
      }
    }, 5000)
  }

  /**
   * 检查操作日志阈值
   */
  private async checkOperationLogThreshold(): Promise<void> {
    if (!this.config.cleanupOnThreshold) return

    try {
      const operationCount = await this.getOperationLogCount()
      const softDeleteCount = await this.getSoftDeletedRecordCount()

      console.log(
        `📊 清理检查: 操作日志 ${operationCount}/${this.config.cleanupThreshold}, 软删除记录 ${softDeleteCount}`,
      )

      if (operationCount >= this.config.cleanupThreshold) {
        console.log(`🚨 达到操作日志阈值，触发清理`)
        await this.performCleanup('threshold')
      }
    } catch (error) {
      console.error('检查操作日志阈值失败:', error)
    }
  }

  /**
   * 执行清理操作
   */
  async performCleanup(
    trigger: 'startup' | 'threshold' | 'sync_completion' | 'manual',
  ): Promise<CleanupResult> {
    if (this.isCleaning) {
      console.log('⏳ 清理操作正在进行中，跳过...')
      return { success: false, reason: 'cleanup_in_progress' }
    }

    // 清理前状态检查
    if (!(await this.isSafeToCleanup())) {
      console.log('⚠️ 清理前状态检查失败，跳过清理')
      return { success: false, reason: 'not_safe_to_cleanup' }
    }

    this.isCleaning = true
    console.log(`🧹 开始清理操作，触发原因: ${trigger}`)

    try {
      const results = await this.executeCleanupTasks()

      // 更新最后清理时间
      this.lastCleanupTime = Date.now()
      this.saveCleanupState()

      console.log(`✅ 清理操作完成:`, results)
      return { success: true, results }
    } catch (error) {
      console.error('❌ 清理操作失败:', error)
      return { success: false, reason: 'cleanup_failed', error }
    } finally {
      this.isCleaning = false
    }
  }

  /**
   * 清理前状态检查
   */
  private async isSafeToCleanup(): Promise<boolean> {
    // 检查是否有待同步操作
    const pendingOperations = await this.getPendingSyncOperationCount()
    if (pendingOperations > 0) {
      console.log(`⚠️ 有待同步操作 (${pendingOperations}个)，跳过清理`)
      return false
    }

    // 检查网络连接状态
    if (!this.syncStore.isConnected) {
      console.log('⚠️ 网络连接断开，跳过清理')
      return false
    }

    // 检查是否有正在进行的同步
    if (this.syncStore.stats.syncSpeed > 0) {
      console.log('⚠️ 有正在进行的同步操作，跳过清理')
      return false
    }

    return true
  }

  /**
   * 执行清理任务
   */
  private async executeCleanupTasks(): Promise<CleanupResults> {
    const results: CleanupResults = {
      operationLogs: { cleaned: 0, retained: 0 },
      softDeletes: { cleaned: 0, retained: 0 },
      conflicts: { cleaned: 0, retained: 0 },
    }

    // 1. 清理操作日志
    try {
      const operationLogResult = await this.cleanupOperationLogs()
      results.operationLogs = operationLogResult
    } catch (error) {
      console.error('清理操作日志失败:', error)
    }

    // 2. 清理软删除记录
    try {
      const softDeleteResult = await this.cleanupSoftDeletedRecords()
      results.softDeletes = softDeleteResult
    } catch (error) {
      console.error('清理软删除记录失败:', error)
    }

    // 3. 清理已解决的冲突
    try {
      const conflictResult = await this.cleanupResolvedConflicts()
      results.conflicts = conflictResult
    } catch (error) {
      console.error('清理冲突记录失败:', error)
    }

    return results
  }

  /**
   * 清理操作日志
   */
  private async cleanupOperationLogs(): Promise<{ cleaned: number; retained: number }> {
    const cutoffTime = Date.now() - this.config.operationLogRetentionDays * 24 * 60 * 60 * 1000

    // 获取要清理的记录数量
    const toCleanCount = await this.db.query(
      'SELECT COUNT(*) as count FROM sync_operation_logs WHERE operation_timestamp < ? AND sync_status = ?',
      [cutoffTime, 'synced'],
    )[0].count

    // 获取保留的记录数量
    const retainedCount = await this.db.query(
      'SELECT COUNT(*) as count FROM sync_operation_logs WHERE operation_timestamp >= ? OR sync_status != ?',
      [cutoffTime, 'synced'],
    )[0].count

    // 执行清理
    await this.db.run(
      'DELETE FROM sync_operation_logs WHERE operation_timestamp < ? AND sync_status = ?',
      [cutoffTime, 'synced'],
    )

    console.log(`📝 操作日志清理: 删除 ${toCleanCount} 条，保留 ${retainedCount} 条`)

    return { cleaned: toCleanCount, retained: retainedCount }
  }

  /**
   * 清理软删除记录
   */
  private async cleanupSoftDeletedRecords(): Promise<{ cleaned: number; retained: number }> {
    const cutoffTime = Date.now() - this.config.softDeleteRetentionDays * 24 * 60 * 60 * 1000

    let totalCleaned = 0

    // 清理各表的软删除记录
    const tables = ['work_tasks', 'annual_tasks', 'budget_applications', 'procurement_tasks']

    for (const table of tables) {
      const cleaned = await this.cleanupSoftDeletesForTable(table, cutoffTime)
      totalCleaned += cleaned
    }

    // 获取保留的软删除记录数量
    const retainedCount = await this.getSoftDeletedRecordCount()

    console.log(`🗑️ 软删除记录清理: 删除 ${totalCleaned} 条，保留 ${retainedCount} 条`)

    return { cleaned: totalCleaned, retained: retainedCount }
  }

  /**
   * 清理特定表的软删除记录
   */
  private async cleanupSoftDeletesForTable(tableName: string, cutoffTime: number): Promise<number> {
    // 先获取要删除的记录ID，用于清理关联表
    const recordsToDelete = await this.db.query(
      `SELECT id FROM ${tableName} WHERE is_deleted = TRUE AND deleted_at < ?`,
      [cutoffTime],
    )

    if (recordsToDelete.length === 0) return 0

    const recordIds = recordsToDelete.map((r: any) => r.id)

    // 清理关联表数据（如果有）
    await this.cleanupRelatedRecords(tableName, recordIds)

    // 删除主表记录
    const result = await this.db.run(
      `DELETE FROM ${tableName} WHERE is_deleted = TRUE AND deleted_at < ?`,
      [cutoffTime],
    )

    return recordIds.length
  }

  /**
   * 清理关联记录
   */
  private async cleanupRelatedRecords(mainTable: string, recordIds: string[]): Promise<void> {
    // 根据主表清理相关的子表数据
    const relationMap: { [key: string]: string } = {
      work_tasks: 'work_task_expenses',
      procurement_tasks: 'procurement_demand_items',
      // 添加其他表的关联关系
    }

    const relatedTable = relationMap[mainTable]
    if (relatedTable && recordIds.length > 0) {
      const placeholders = recordIds.map(() => '?').join(',')
      await this.db.run(
        `DELETE FROM ${relatedTable} WHERE ${mainTable.slice(0, -1)}_id IN (${placeholders})`,
        recordIds,
      )
      console.log(`🔗 清理关联表 ${relatedTable}: ${recordIds.length} 条记录`)
    }
  }

  // 其他辅助方法...
  async getOperationLogCount(): Promise<number> {
    const result = await this.db.query('SELECT COUNT(*) as count FROM sync_operation_logs')
    return result[0].count
  }

  async getSoftDeletedRecordCount(): Promise<number> {
    let total = 0
    const tables = ['work_tasks', 'annual_tasks', 'budget_applications', 'procurement_tasks']

    for (const table of tables) {
      const result = await this.db.query(
        `SELECT COUNT(*) as count FROM ${table} WHERE is_deleted = TRUE`,
      )
      total += result[0].count
    }

    return total
  }

  private async getPendingSyncOperationCount(): Promise<number> {
    const result = await this.db.query(
      'SELECT COUNT(*) as count FROM sync_operation_logs WHERE sync_status = ?',
      ['pending'],
    )
    return result[0].count
  }

  private async cleanupResolvedConflicts(): Promise<{ cleaned: number; retained: number }> {
    try {
      // 先查询要删除的记录数量
      const toDeleteResult = await this.db.query(
        'SELECT COUNT(*) as count FROM sync_conflicts WHERE resolved = TRUE',
      )
      const toDeleteCount = toDeleteResult[0]?.count || 0

      // 执行删除
      await this.db.run('DELETE FROM sync_conflicts WHERE resolved = TRUE')

      // 查询保留的记录数量
      const retainedResult = await this.db.query(
        'SELECT COUNT(*) as count FROM sync_conflicts WHERE resolved = FALSE',
      )
      const retainedCount = retainedResult[0]?.count || 0

      console.log(`⚡ 冲突记录清理: 删除 ${toDeleteCount} 条，保留 ${retainedCount} 条`)

      return { cleaned: toDeleteCount, retained: retainedCount }
    } catch (error) {
      console.error('清理冲突记录失败:', error)
      return { cleaned: 0, retained: 0 }
    }
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('SmartCleanupManager not initialized')
    }
  }

  private loadCleanupState(): void {
    try {
      const stored = localStorage.getItem('cleanup-manager-state')
      if (stored) {
        const state = JSON.parse(stored)
        this.lastCleanupTime = state.lastCleanupTime || 0
      }
    } catch (error) {
      console.error('加载清理状态失败:', error)
    }
  }

  private saveCleanupState(): void {
    try {
      const state = {
        lastCleanupTime: this.lastCleanupTime,
      }
      localStorage.setItem('cleanup-manager-state', JSON.stringify(state))
    } catch (error) {
      console.error('保存清理状态失败:', error)
    }
  }

  /**
   * 手动触发清理
   */
  async manualCleanup(): Promise<CleanupResult> {
    return await this.performCleanup('manual')
  }

  /**
   * 获取清理状态
   */
  getCleanupStatus(): CleanupStatus {
    return {
      lastCleanupTime: this.lastCleanupTime,
      isCleaning: this.isCleaning,
      config: this.config,
    }
  }

  /**
   * 更新清理配置
   */
  updateConfig(newConfig: Partial<CleanupConfig>): void {
    this.config = { ...this.config, ...newConfig }
    console.log('✅ 清理配置已更新:', this.config)
  }
}

export interface CleanupResult {
  success: boolean
  reason?: string
  error?: any
  results?: CleanupResults
}

export interface CleanupResults {
  operationLogs: { cleaned: number; retained: number }
  softDeletes: { cleaned: number; retained: number }
  conflicts: { cleaned: number; retained: number }
}

export interface CleanupStatus {
  lastCleanupTime: number
  isCleaning: boolean
  config: CleanupConfig
}
