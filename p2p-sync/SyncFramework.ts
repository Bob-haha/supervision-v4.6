// SyncFramework.ts - 统一同步框架
import { DatabaseManager } from '@/database/utils/database'
import { v4 as uuidv4 } from 'uuid'

export interface SyncConfig {
  enabled: boolean
  conflictResolution: 'timestamp' | 'manual' | 'client-priority'
  autoRetry: boolean
  maxRetryAttempts: number
}

export interface TableSyncConfig {
  tableName: string
  syncEnabled: boolean
  conflictResolution: SyncConfig['conflictResolution']
  fieldsToSync: string[]
  excludedFields: string[]
  customMergeLogic?: (local: any, remote: any) => any
}

export class SyncFramework {
  private db: DatabaseManager
  private clientId: string
  private config: SyncConfig
  private tableConfigs: Map<string, TableSyncConfig>
  private isInitialized: boolean = false
  private modelInstances: Map<string, any> = new Map()

  constructor(db: DatabaseManager, clientId: string) {
    this.db = db
    this.clientId = clientId
    this.config = {
      enabled: true,
      conflictResolution: 'timestamp',
      autoRetry: true,
      maxRetryAttempts: 3,
    }
    this.tableConfigs = new Map()
    setTimeout(() => {
      if (!this.isInitialized) {
        this.initializeTableConfigs()
      }
    }, 0)
  }

  private initializeTableConfigs(): void {
    if (this.isInitialized) return
    this.isInitialized = true
    console.log('🔄 初始化表同步配置...')
    this.tableConfigs.set('files', { tableName: 'files', syncEnabled: true, conflictResolution: 'timestamp', fieldsToSync: [], excludedFields: ['id'] })
    this.tableConfigs.set('work_tasks', { tableName: 'work_tasks', syncEnabled: true, conflictResolution: 'timestamp', fieldsToSync: [], excludedFields: ['id'] })
    this.tableConfigs.set('annual_tasks', { tableName: 'annual_tasks', syncEnabled: true, conflictResolution: 'timestamp', fieldsToSync: [], excludedFields: ['id'] })
    this.tableConfigs.set('budget_applications', { tableName: 'budget_applications', syncEnabled: true, conflictResolution: 'timestamp', fieldsToSync: [], excludedFields: ['id'] })
    this.tableConfigs.set('procurement_tasks', { tableName: 'procurement_tasks', syncEnabled: true, conflictResolution: 'timestamp', fieldsToSync: [], excludedFields: ['id'] })
    this.tableConfigs.set('contracts', { tableName: 'contracts', syncEnabled: true, conflictResolution: 'timestamp', fieldsToSync: [], excludedFields: ['id'] })
    this.tableConfigs.set('departments', { tableName: 'departments', syncEnabled: true, conflictResolution: 'timestamp', fieldsToSync: [], excludedFields: ['id'] })
    this.tableConfigs.set('payment_applications', { tableName: 'payment_applications', syncEnabled: true, conflictResolution: 'timestamp', fieldsToSync: [], excludedFields: ['id'] })
    this.tableConfigs.set('procurement_methods', { tableName: 'procurement_methods', syncEnabled: true, conflictResolution: 'timestamp', fieldsToSync: [], excludedFields: ['id'] })
    this.tableConfigs.set('projects', { tableName: 'projects', syncEnabled: true, conflictResolution: 'timestamp', fieldsToSync: [], excludedFields: ['id'] })
    this.tableConfigs.set('regular_payment_plans', { tableName: 'regular_payment_plans', syncEnabled: true, conflictResolution: 'timestamp', fieldsToSync: [], excludedFields: ['id'] })
    this.tableConfigs.set('reimbursement_tasks', { tableName: 'reimbursement_tasks', syncEnabled: true, conflictResolution: 'timestamp', fieldsToSync: [], excludedFields: ['id'] })
    this.tableConfigs.set('subjects', { tableName: 'subjects', syncEnabled: true, conflictResolution: 'timestamp', fieldsToSync: [], excludedFields: ['id'] })
    this.tableConfigs.set('tags', { tableName: 'tags', syncEnabled: true, conflictResolution: 'timestamp', fieldsToSync: [], excludedFields: ['id'] })
    this.tableConfigs.set('users', { tableName: 'users', syncEnabled: true, conflictResolution: 'timestamp', fieldsToSync: [], excludedFields: ['id'] })
    console.log(`✅ 表同步配置初始化完成: ${this.tableConfigs.size} 个表`)
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) this.initializeTableConfigs()
  }

  public async getPendingSyncOperations(sinceTimestamp?: number): Promise<any[]> {
    this.ensureInitialized()
    try {
      let sql = 'SELECT * FROM sync_operation_logs WHERE sync_status = ?'
      const params: any[] = ['pending']
      if (sinceTimestamp) {
        sql += ' AND operation_timestamp > ?'
        params.push(sinceTimestamp)
      }
      sql += ' ORDER BY operation_timestamp ASC'
      const results = await this.db.execute(sql, params)
      return results.rows.map((row: any) => ({
        id: row.id,
        client_id: row.client_id,
        table_name: row.table_name,
        record_id: row.record_id,
        operation: row.operation,
        operation_data: typeof row.operation_data === 'string' ? JSON.parse(row.operation_data) : row.operation_data,
        operation_timestamp: row.operation_timestamp,
        sync_status: row.sync_status,
      }))
    } catch (error) {
      console.error('获取待同步操作失败:', error)
      return []
    }
  }

  public async markOperationsAsSynced(operationIds: string[]): Promise<void> {
    if (operationIds.length === 0) return
    try {
      const placeholders = operationIds.map(() => '?').join(',')
      const sql = `UPDATE sync_operation_logs SET sync_status = 'synced', updated_at = ? WHERE id IN (${placeholders})`
      await this.db.execute(sql, [Date.now(), ...operationIds])
      console.log(`✅ 标记 ${operationIds.length} 个操作为已同步`)
    } catch (error) {
      console.error('标记操作为已同步失败:', error)
    }
  }

  public registerModel(tableName: string, modelInstance: any): void {
    this.modelInstances.set(tableName, modelInstance)
    console.log(`✅ 注册Model: ${tableName}`)
  }

  private getModelForTable(tableName: string): any {
    const model = this.modelInstances.get(tableName)
    if (!model) throw new Error(`未找到表 ${tableName} 对应的Model实例`)
    return model
  }

  public async recordChange(
    tableName: string,
    recordId: string,
    operation: 'INSERT' | 'UPDATE' | 'DELETE',
    oldData?: any,
    newData?: any,
  ): Promise<string> {
    this.ensureInitialized()
    if (!this.config.enabled) return ''
    const tableConfig = this.tableConfigs.get(tableName)
    if (!tableConfig || !tableConfig.syncEnabled) return ''
    const operationId = this.generateUUID()
    const operationData = {
      old_data: this.filterData(oldData, tableConfig),
      new_data: this.filterData(newData, tableConfig),
      client_id: this.clientId,
      timestamp: Date.now(),
    }
    await this.db.saveSyncOperationLog({
      id: operationId,
      client_id: this.clientId,
      table_name: tableName,
      record_id: recordId,
      operation,
      operation_data: operationData,
      operation_timestamp: Date.now(),
      sync_status: 'pending',
    })
    console.log(`📝 记录同步操作: ${tableName} ${operation} ${recordId}`)
    return operationId
  }

  public async applySyncOperationsBatch(operations: any[]): Promise<boolean[]> {
    this.ensureInitialized()
    const results: boolean[] = []
    for (const operation of operations) {
      try {
        const success = await this.applySyncOperation(operation)
        results.push(success)
        await new Promise((resolve) => setTimeout(resolve, 50))
      } catch (error) {
        console.error(`批量应用操作失败:`, error)
        results.push(false)
      }
    }
    return results
  }

  public async recordChangesBatch(
    changes: { tableName: string; recordId: string; operation: 'INSERT' | 'UPDATE' | 'DELETE'; oldData?: any; newData?: any }[],
  ): Promise<string[]> {
    this.ensureInitialized()
    if (!this.config.enabled) return changes.map(() => '')
    const operationIds: string[] = []
    for (const change of changes) {
      const { tableName, recordId, operation, oldData, newData } = change
      const tableConfig = this.tableConfigs.get(tableName)
      if (!tableConfig || !tableConfig.syncEnabled) {
        operationIds.push('')
        continue
      }
      const operationId = this.generateUUID()
      const operationData = {
        old_data: this.filterData(oldData, tableConfig),
        new_data: this.filterData(newData, tableConfig),
        client_id: this.clientId,
        timestamp: Date.now(),
      }
      await this.db.saveSyncOperationLog({
        id: operationId,
        client_id: this.clientId,
        table_name: tableName,
        record_id: recordId,
        operation,
        operation_data: operationData,
        operation_timestamp: Date.now(),
        sync_status: 'pending',
      })
      operationIds.push(operationId)
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    console.log(`📝 批量记录同步操作: ${operationIds.filter((id) => id).length} 个操作`)
    return operationIds
  }

  private filterData(data: any, tableConfig: TableSyncConfig): any {
    if (!data) return data
    if (tableConfig.fieldsToSync.length === 0) {
      const filtered: any = {}
      Object.keys(data).forEach((field) => {
        if (!tableConfig.excludedFields.includes(field)) {
          filtered[field] = data[field]
        }
      })
      return filtered
    }
    const filtered: any = {}
    tableConfig.fieldsToSync.forEach((field) => {
      if (data[field] !== undefined) filtered[field] = data[field]
    })
    return filtered
  }

  public async applySyncOperation(operation: any): Promise<boolean> {
    this.ensureInitialized()
    const { table_name, operation: op } = operation
    const tableConfig = this.tableConfigs.get(table_name)
    if (!tableConfig || !tableConfig.syncEnabled) return false
    try {
      switch (op) {
        case 'INSERT':
          await this.handleInsertOperation(operation, tableConfig)
          break
        case 'UPDATE':
          await this.handleUpdateOperation(operation, tableConfig)
          break
        case 'DELETE':
          await this.handleDeleteOperation(operation, tableConfig)
          break
      }
      await this.db.updateSyncOperationStatus(operation.id, 'synced')
      return true
    } catch (error) {
      console.error(`应用同步操作失败:`, error)
      await this.handleSyncConflict(operation, error, tableConfig)
      return false
    }
  }

  private async handleInsertOperation(operation: any, tableConfig: TableSyncConfig): Promise<void> {
    const { table_name, record_id, operation_data } = operation
    const existingRecord = await this.findRecordByUUID(table_name, record_id)
    if (existingRecord) {
      if (existingRecord.is_deleted) {
        console.log(`⏭️ 跳过已软删除记录的插入操作: ${record_id}`)
        await this.db.saveSyncConflict({
          id: this.generateUUID(),
          client_id: operation.client_id,
          table_name: table_name,
          record_id: record_id,
          conflict_type: 'insert_on_soft_deleted',
          conflict_data: { local_record: existingRecord, remote_operation: operation, reason: '尝试插入已软删除的记录' },
          resolved: false,
        })
        return
      }
      console.log(`记录已存在，跳过INSERT: ${record_id}`)
      return
    }
    const insertData = {
      ...operation_data.new_data,
      id: record_id,
      created_by: operation.client_id || 'sync-system',
      created_at: Date.now(),
      timestamp: Date.now(),
      is_deleted: operation_data.new_data?.is_deleted || false,
    }
    await this.saveRecordByTableName(table_name, insertData)
    await this.db.saveSyncRecordMapping({
      id: this.generateUUID(),
      source_client_id: operation.client_id,
      source_record_id: record_id,
      local_record_id: record_id,
      table_name: table_name,
      operation_type: 'INSERT',
      sync_timestamp: Date.now(),
    })
    console.log(`✅ 插入新记录: ${record_id}, 表: ${table_name}`)
    if (table_name === 'files') {
      await this.handleFileContentSync(record_id, operation.client_id, insertData)
    }
  }

  private async handleFileContentSync(fileId: string, sourceClientId: string, fileData: any): Promise<void> {
    try {
      const FileManagerModule = await import('@/utils/FileManager')
      const FileManager = FileManagerModule.default
      const fileManager = FileManager.getInstance()
      const contentExists = await fileManager.checkFileContentExists(fileId)
      if (!contentExists) {
        console.log(`📨 检测到缺少文件内容，请求同步: ${fileId}`)
        await fileManager.requestFileContentSync(fileId, sourceClientId)
      } else {
        console.log(`✅ 文件内容已存在: ${fileId}`)
      }
    } catch (error) {
      console.error(`处理文件内容同步失败: ${fileId}`, error)
    }
  }

  private async handleUpdateOperation(operation: any, tableConfig: TableSyncConfig): Promise<void> {
    const { table_name, record_id, operation_data } = operation
    const localRecord = await this.findRecordByUUID(table_name, record_id)
    if (!localRecord) {
      console.warn(`未找到要更新的记录，尝试插入: ${record_id}`)
      await this.handleInsertOperation(operation, tableConfig)
      return
    }
    if (localRecord.is_deleted) {
      console.log(`⏭️ 跳过对已软删除记录的更新: ${record_id}, 表: ${table_name}`)
      await this.db.saveSyncConflict({
        id: this.generateUUID(),
        client_id: operation.client_id,
        table_name: table_name,
        record_id: record_id,
        conflict_type: 'update_on_soft_deleted',
        conflict_data: { local_record: localRecord, remote_operation: operation, reason: '尝试更新已软删除的记录' },
        resolved: false,
      })
      return
    }
    if (operation_data.new_data && operation_data.new_data.is_deleted === true) {
      console.log(`🔄 应用软删除操作: ${record_id}, 表: ${table_name}`)
    }
    if (tableConfig.conflictResolution === 'timestamp') {
      await this.resolveByTimestamp(localRecord, operation, tableConfig)
    } else if (tableConfig.conflictResolution === 'client-priority') {
      await this.resolveByClientPriority(localRecord, operation, tableConfig)
    } else {
      await this.resolveManually(localRecord, operation, tableConfig)
    }
  }

  private async resolveByTimestamp(localRecord: any, operation: any, tableConfig: TableSyncConfig): Promise<void> {
    const { table_name, record_id, operation_data } = operation
    if (localRecord.is_deleted) {
      console.log(`🛡️ 保护已软删除记录，拒绝更新: ${record_id}`)
      return
    }
    if (operation_data.timestamp > (localRecord.timestamp || 0)) {
      const updateData = {
        ...operation_data.new_data,
        id: record_id,
        updated_at: Date.now(),
        timestamp: operation_data.timestamp,
        is_deleted: localRecord.is_deleted || false,
      }
      await this.saveRecordByTableName(table_name, updateData)
      console.log(`✅ 基于时间戳更新记录: ${record_id}, 表: ${table_name}`)
    } else {
      console.log(`⏭️ 跳过旧时间戳的更新: ${record_id}, 本地: ${localRecord.timestamp}, 远程: ${operation_data.timestamp}`)
    }
  }

  private async resolveByClientPriority(localRecord: any, operation: any, tableConfig: TableSyncConfig): Promise<void> {
    const { operation_data } = operation
    const clientPriority = this.getClientPriority(operation.client_id)
    const localPriority = this.getClientPriority(this.clientId)
    if (clientPriority >= localPriority) {
      const updateData = {
        ...operation_data.new_data,
        id: operation.record_id,
        updated_at: Date.now(),
        timestamp: Date.now(),
      }
      await this.saveRecordByTableName(operation.table_name, updateData)
    }
  }

  private async resolveManually(localRecord: any, operation: any, tableConfig: TableSyncConfig): Promise<void> {
    await this.db.saveSyncConflict({
      id: this.generateUUID(),
      client_id: operation.client_id,
      table_name: operation.table_name,
      record_id: operation.record_id,
      conflict_type: 'manual_resolution_required',
      conflict_data: { local_data: localRecord, remote_data: operation.operation_data.new_data, operation: operation },
      resolved: false,
    })
  }

  private async handleDeleteOperation(operation: any, tableConfig: TableSyncConfig): Promise<void> {
    console.log('🔍 DELETE操作开始:', { table: operation.table_name, recordId: operation.record_id, clientId: operation.client_id })
    const { table_name, record_id, client_id } = operation
    const localRecord = await this.findRecordByUUID(table_name, record_id)
    if (!localRecord) {
      console.warn(`⚠️ 未找到要删除的记录: ${record_id}`)
      return
    }
    console.log(`🗑️ 执行软删除操作: ${record_id}`)
    await this.softDeleteRecordByTableName(table_name, record_id, client_id)
    await this.deleteRecordMapping(client_id, record_id, table_name)
    console.log(`✅ 软删除操作完成: ${record_id}`)
  }

  private async deleteRecordMapping(sourceClientId: string, sourceRecordId: string, tableName: string): Promise<void> {
    try {
      await this.db.deleteSyncRecordMapping(sourceClientId, sourceRecordId, tableName)
      console.log(`🗑️ 删除记录映射: ${sourceClientId}-${sourceRecordId}-${tableName}`)
    } catch (error) {
      console.error('删除记录映射失败:', error)
    }
  }

  // ========== 修改点1：在软删除前先更新足迹 ==========
  private async softDeleteRecordByTableName(tableName: string, recordId: string, deletedBy: string): Promise<void> {
    try {
      const model = this.getModelForTable(tableName)
      if (model && typeof model.delete === 'function') {
        // 先更新足迹
        const record = await this.findRecordByUUID(tableName, recordId)
        if (record) {
          record.modified_by = this.clientId
          record.modified_at = Date.now()
          await this.saveRecordByTableName(tableName, record) // 更新足迹
        }
        await model.delete(recordId, deletedBy)
        return
      }
    } catch (error) {
      console.warn(`Model层删除失败，回退到DatabaseManager: ${error}`)
    }
    console.log(`🔄 使用DatabaseManager软删除 ${tableName}: ${recordId}`)
    // 先更新足迹
    const updateSql = `UPDATE ${tableName} SET modified_by = ?, modified_at = ? WHERE id = ?`
    await this.db.run(updateSql, [this.clientId, Date.now(), recordId])
    switch (tableName) {
      case 'work_tasks':
        await this.db.softDeleteWorkTask(recordId, deletedBy)
        break
      default:
        throw new Error(`未知的表名: ${tableName}`)
    }
  }

  private async handleSyncConflict(operation: any, error: any, tableConfig: TableSyncConfig): Promise<void> {
    await this.db.saveSyncConflict({
      id: this.generateUUID(),
      client_id: operation.client_id,
      table_name: operation.table_name,
      record_id: operation.record_id,
      conflict_type: 'apply_operation_failed',
      conflict_data: { operation, error: error.message, table_config: tableConfig },
      resolved: false,
    })
  }

  // ========== 修改点2：在保存记录时强制添加足迹字段 ==========
  private async saveRecordByTableName(tableName: string, data: any): Promise<string> {
    const protectedData = { ...data }
    const recordId = protectedData.id

    // 强制添加足迹
    protectedData.modified_by = this.clientId
    protectedData.modified_at = Date.now()
    if (!recordId) {
      protectedData.created_by = this.clientId
      protectedData.created_at = Date.now()
    }

    let operation: 'INSERT' | 'UPDATE' = 'INSERT'
    let oldData: any = null
    try {
      const existingRecord = await this.findRecordByUUID(tableName, recordId)
      if (existingRecord) {
        operation = 'UPDATE'
        const tableConfig = this.tableConfigs.get(tableName)
        oldData = tableConfig ? this.filterData(existingRecord, tableConfig) : existingRecord
      }
    } catch (error) {
      console.warn(`检查记录存在性失败: ${recordId}`, error)
    }

    let finalRecordId: string
    try {
      const model = this.getModelForTable(tableName)
      if (model && typeof model.save === 'function') {
        console.log(`🔄 使用Model层保存 ${tableName}: ${recordId}`)
        finalRecordId = await model.save(protectedData)
      } else {
        console.log(`🔄 使用DatabaseManager保存 ${tableName}: ${recordId}`)
        switch (tableName) {
          case 'work_tasks':
            finalRecordId = await this.db.saveWorkTask(protectedData)
            break
          default:
            throw new Error(`未知的表名: ${tableName}`)
        }
      }
      await this.recordChange(tableName, finalRecordId, operation, oldData, protectedData)
      return finalRecordId
    } catch (error) {
      console.error(`❌ 保存记录失败 ${tableName}:`, error)
      throw error
    }
  }

  // 公共接口
  public async saveRecord(tableName: string, data: any): Promise<string> {
    this.ensureInitialized()
    return await this.saveRecordByTableName(tableName, data)
  }

  public async deleteRecord(tableName: string, recordId: string): Promise<void> {
    this.ensureInitialized()
    await this.softDeleteRecordByTableName(tableName, recordId, this.clientId)
    await this.recordChange(tableName, recordId, 'DELETE', null, null)
  }

  private async deleteRecordByTableName(tableName: string, recordId: string): Promise<void> {
    switch (tableName) {
      case 'work_tasks':
        await this.db.deleteWorkTask(recordId)
        break
      default:
        throw new Error(`未知的表名: ${tableName}`)
    }
  }

  private async findRecordByUUID(tableName: string, recordId: string): Promise<any> {
    try {
      const model = this.getModelForTable(tableName)
      if (model && typeof model.get === 'function') {
        return await model.get(recordId)
      }
    } catch (error) {
      console.warn(`Model层查询失败，回退到DatabaseManager: ${error}`)
    }
    switch (tableName) {
      case 'work_tasks':
        return await this.db.getWorkTask(recordId)
      case 'annual_tasks':
        return await this.db.getAnnualTask(recordId)
      default:
        return null
    }
  }

  private getClientPriority(clientId: string): number {
    const priorityRules: { [key: string]: number } = {
      'admin-client': 100,
      'manager-client': 80,
      'user-client': 50,
    }
    return priorityRules[clientId] || 10
  }

  private generateUUID(): string {
    return uuidv4()
  }

  public getTableConfig(tableName: string): TableSyncConfig | undefined {
    this.ensureInitialized()
    return this.tableConfigs.get(tableName)
  }

  public updateTableConfig(tableName: string, config: Partial<TableSyncConfig>): void {
    this.ensureInitialized()
    const existingConfig = this.tableConfigs.get(tableName)
    if (existingConfig) {
      this.tableConfigs.set(tableName, { ...existingConfig, ...config })
    }
  }

  public getAllTableConfigs(): TableSyncConfig[] {
    this.ensureInitialized()
    return Array.from(this.tableConfigs.values())
  }

  public initialize(): void {
    if (this.isInitialized) {
      console.log('⏭️ SyncFramework 已经初始化，跳过重复初始化')
      return
    }
    this.initializeTableConfigs()
    this.isInitialized = true
  }

  public getSyncStats(): any {
    this.ensureInitialized()
    return {
      tableConfigs: this.getAllTableConfigs().length,
      enabledTables: this.getAllTableConfigs().filter((config) => config.syncEnabled).length,
      conflictResolution: this.config.conflictResolution,
      isInitialized: this.isInitialized,
    }
  }

  public async cleanupSoftDeletedRecords(retentionDays: number = 30): Promise<void> {
    try {
      await this.db.cleanupExpiredSoftDeletes(retentionDays)
      console.log(`✅ 软删除记录清理完成`)
    } catch (error) {
      console.error('清理软删除记录失败:', error)
    }
  }
}