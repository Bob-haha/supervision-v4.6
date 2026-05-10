import type { DatabaseManager } from '@/core/database/DatabaseManager';
import { generateUUID } from '@/utils';
import type { SyncModelAdapter } from './SyncModelAdapter';

export interface SyncConfig {
  enabled: boolean;
  conflictResolution: 'timestamp' | 'manual' | 'client-priority';
  autoRetry: boolean;
  maxRetryAttempts: number;
}

export interface TableSyncConfig {
  tableName: string;
  syncEnabled: boolean;
  conflictResolution: SyncConfig['conflictResolution'];
  fieldsToSync: string[];
  excludedFields: string[];
  customMergeLogic?: (local: any, remote: any) => any;
}

export class SyncFramework {
  private db: DatabaseManager;
  private clientId: string;
  private config: SyncConfig;
  private tableConfigs: Map<string, TableSyncConfig>;
  private isInitialized: boolean = false;
  private modelInstances: Map<string, SyncModelAdapter> = new Map();

  constructor(db: DatabaseManager, clientId: string) {
    this.db = db;
    this.clientId = clientId;
    this.config = {
      enabled: true,
      conflictResolution: 'timestamp',
      autoRetry: true,
      maxRetryAttempts: 3,
    };
    this.tableConfigs = new Map();
    this.initializeTableConfigs();
  }

  private initializeTableConfigs(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;
    console.log('🔄 初始化表同步配置...');
    const defaultExclude = ['id'];
    const tableNames = ['tasks', 'feedbacks', 'leader_comments'];
    for (const name of tableNames) {
      this.tableConfigs.set(name, {
        tableName: name,
        syncEnabled: true,
        conflictResolution: 'timestamp',
        fieldsToSync: [],
        excludedFields: defaultExclude,
      });
    }
    console.log(`✅ 表同步配置初始化完成: ${this.tableConfigs.size} 个表`);
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) this.initializeTableConfigs();
  }

  async getPendingSyncOperations(sinceTimestamp?: number): Promise<any[]> {
    this.ensureInitialized();
    try {
      let sql = 'SELECT * FROM sync_operation_logs WHERE sync_status = ?';
      const params: any[] = ['pending'];
      if (sinceTimestamp) {
        sql += ' AND operation_timestamp > ?';
        params.push(sinceTimestamp);
      }
      sql += ' ORDER BY operation_timestamp ASC';
      const results = this.db.query(sql, params);
      return results.map((row: any) => ({
        id: row.id,
        client_id: row.client_id,
        table_name: row.table_name,
        record_id: row.record_id,
        operation: row.operation,
        operation_data: typeof row.operation_data === 'string' ? JSON.parse(row.operation_data) : row.operation_data,
        operation_timestamp: row.operation_timestamp,
        sync_status: row.sync_status,
      }));
    } catch (error) {
      console.error('获取待同步操作失败:', error);
      return [];
    }
  }

  async markOperationsAsSynced(operationIds: string[]): Promise<void> {
    if (operationIds.length === 0) return;
    try {
      const placeholders = operationIds.map(() => '?').join(',');
      const sql = `UPDATE sync_operation_logs SET sync_status = 'synced' WHERE id IN (${placeholders})`;
      this.db.run(sql, operationIds);
      console.log(`✅ 标记 ${operationIds.length} 个操作为已同步`);
    } catch (error) {
      console.error('标记操作为已同步失败:', error);
    }
  }

  registerModel(tableName: string, modelInstance: SyncModelAdapter): void {
    this.modelInstances.set(tableName, modelInstance);
    console.log(`✅ 注册Model: ${tableName}`);
  }

  async recordChange(
    tableName: string,
    recordId: string,
    operation: 'INSERT' | 'UPDATE' | 'DELETE',
    oldData?: any,
    newData?: any,
  ): Promise<string> {
    this.ensureInitialized();
    if (!this.config.enabled) return '';
    const tableConfig = this.tableConfigs.get(tableName);
    if (!tableConfig || !tableConfig.syncEnabled) return '';
    const operationId = generateUUID();
    const operationData = {
      old_data: this.filterData(oldData, tableConfig),
      new_data: this.filterData(newData, tableConfig),
      client_id: this.clientId,
      timestamp: Date.now(),
    };
    this.db.saveSyncOperationLog({
      id: operationId,
      client_id: this.clientId,
      table_name: tableName,
      record_id: recordId,
      operation,
      operation_data: operationData,
      operation_timestamp: Date.now(),
      sync_status: 'pending',
    });
    console.log(`📝 记录同步操作: ${tableName} ${operation} ${recordId}`);
    return operationId;
  }

  async applySyncOperationsBatch(operations: any[]): Promise<boolean[]> {
    this.ensureInitialized();
    const results: boolean[] = [];
    for (const operation of operations) {
      try {
        const success = await this.applySyncOperation(operation);
        results.push(success);
        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch (error) {
        console.error('批量应用操作失败:', error);
        results.push(false);
      }
    }
    return results;
  }

  async recordChangesBatch(
    changes: { tableName: string; recordId: string; operation: 'INSERT' | 'UPDATE' | 'DELETE'; oldData?: any; newData?: any }[],
  ): Promise<string[]> {
    this.ensureInitialized();
    if (!this.config.enabled) return changes.map(() => '');
    const operationIds: string[] = [];
    for (const change of changes) {
      const { tableName, recordId, operation, oldData, newData } = change;
      const tableConfig = this.tableConfigs.get(tableName);
      if (!tableConfig || !tableConfig.syncEnabled) {
        operationIds.push('');
        continue;
      }
      const operationId = generateUUID();
      const operationData = {
        old_data: this.filterData(oldData, tableConfig),
        new_data: this.filterData(newData, tableConfig),
        client_id: this.clientId,
        timestamp: Date.now(),
      };
      this.db.saveSyncOperationLog({
        id: operationId,
        client_id: this.clientId,
        table_name: tableName,
        record_id: recordId,
        operation,
        operation_data: operationData,
        operation_timestamp: Date.now(),
        sync_status: 'pending',
      });
      operationIds.push(operationId);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    console.log(`📝 批量记录同步操作: ${operationIds.filter((id) => id).length} 个操作`);
    return operationIds;
  }

  private filterData(data: any, tableConfig: TableSyncConfig): any {
    if (!data) return data;
    if (tableConfig.fieldsToSync.length === 0) {
      const filtered: any = {};
      Object.keys(data).forEach((field) => {
        if (!tableConfig.excludedFields.includes(field)) {
          filtered[field] = data[field];
        }
      });
      return filtered;
    }
    const filtered: any = {};
    tableConfig.fieldsToSync.forEach((field) => {
      if (data[field] !== undefined) filtered[field] = data[field];
    });
    return filtered;
  }

  async applySyncOperation(operation: any): Promise<boolean> {
    this.ensureInitialized();
    const { table_name, operation: op } = operation;
    const tableConfig = this.tableConfigs.get(table_name);
    if (!tableConfig || !tableConfig.syncEnabled) return false;
    try {
      switch (op) {
        case 'INSERT':
          await this.handleInsertOperation(operation, tableConfig);
          break;
        case 'UPDATE':
          await this.handleUpdateOperation(operation, tableConfig);
          break;
        case 'DELETE':
          await this.handleDeleteOperation(operation, tableConfig);
          break;
      }
      this.db.updateSyncOperationStatus(operation.id, 'synced');
      return true;
    } catch (error) {
      console.error('应用同步操作失败:', error);
      await this.handleSyncConflict(operation, error, tableConfig);
      return false;
    }
  }

  private async handleInsertOperation(operation: any, _tableConfig: TableSyncConfig): Promise<void> {
    const { table_name, record_id, operation_data } = operation;
    const existingRecord = await this.findRecordByUUID(table_name, record_id);
    if (existingRecord) {
      if (existingRecord.is_deleted) {
        console.log(`⏭️ 跳过已软删除记录的插入操作: ${record_id}`);
        this.db.saveSyncConflict({
          id: generateUUID(),
          client_id: operation.client_id,
          table_name: table_name,
          record_id: record_id,
          conflict_type: 'insert_on_soft_deleted',
          conflict_data: { local_record: existingRecord, remote_operation: operation, reason: '尝试插入已软删除的记录' },
          resolved: false,
        });
        return;
      }
      console.log(`记录已存在，跳过INSERT: ${record_id}`);
      return;
    }
    const insertData = {
      ...operation_data.new_data,
      id: record_id,
      created_by: operation.client_id || 'sync-system',
      created_at: Date.now(),
      timestamp: Date.now(),
      is_deleted: operation_data.new_data?.is_deleted || false,
    };
    await this.saveRecordByTableName(table_name, insertData);
    this.db.saveSyncRecordMapping({
      id: generateUUID(),
      source_client_id: operation.client_id,
      source_record_id: record_id,
      local_record_id: record_id,
      table_name: table_name,
      operation_type: 'INSERT',
      sync_timestamp: Date.now(),
    });
    console.log(`✅ 插入新记录: ${record_id}, 表: ${table_name}`);
  }

  private async handleUpdateOperation(operation: any, tableConfig: TableSyncConfig): Promise<void> {
    const { table_name, record_id } = operation;
    const localRecord = await this.findRecordByUUID(table_name, record_id);
    if (!localRecord) {
      console.warn(`未找到要更新的记录，尝试插入: ${record_id}`);
      await this.handleInsertOperation(operation, tableConfig);
      return;
    }
    if (localRecord.is_deleted) {
      console.log(`⏭️ 跳过对已软删除记录的更新: ${record_id}, 表: ${table_name}`);
      this.db.saveSyncConflict({
        id: generateUUID(),
        client_id: operation.client_id,
        table_name: table_name,
        record_id: record_id,
        conflict_type: 'update_on_soft_deleted',
        conflict_data: { local_record: localRecord, remote_operation: operation, reason: '尝试更新已软删除的记录' },
        resolved: false,
      });
      return;
    }
    if (tableConfig.conflictResolution === 'timestamp') {
      await this.resolveByTimestamp(localRecord, operation, tableConfig);
    } else if (tableConfig.conflictResolution === 'client-priority') {
      await this.resolveByClientPriority(localRecord, operation, tableConfig);
    } else {
      await this.resolveManually(localRecord, operation, tableConfig);
    }
  }

  private async resolveByTimestamp(localRecord: any, operation: any, _tableConfig: TableSyncConfig): Promise<void> {
    const { table_name, record_id, operation_data } = operation;
    if (localRecord.is_deleted) {
      console.log(`🛡️ 保护已软删除记录，拒绝更新: ${record_id}`);
      return;
    }
    if (operation_data.timestamp > (localRecord.timestamp || 0)) {
      const updateData = {
        ...operation_data.new_data,
        id: record_id,
        updated_at: Date.now(),
        timestamp: operation_data.timestamp,
        is_deleted: localRecord.is_deleted || false,
      };
      await this.saveRecordByTableName(table_name, updateData);
      console.log(`✅ 基于时间戳更新记录: ${record_id}, 表: ${table_name}`);
    } else {
      console.log(`⏭️ 跳过旧时间戳的更新: ${record_id}`);
    }
  }

  private async resolveByClientPriority(_localRecord: any, operation: any, _tableConfig: TableSyncConfig): Promise<void> {
    const { operation_data } = operation;
    const clientPriority = this.getClientPriority(operation.client_id);
    const localPriority = this.getClientPriority(this.clientId);
    if (clientPriority >= localPriority) {
      const updateData = {
        ...operation_data.new_data,
        id: operation.record_id,
        updated_at: Date.now(),
        timestamp: Date.now(),
      };
      await this.saveRecordByTableName(operation.table_name, updateData);
    }
  }

  private async resolveManually(localRecord: any, operation: any, _tableConfig: TableSyncConfig): Promise<void> {
    this.db.saveSyncConflict({
      id: generateUUID(),
      client_id: operation.client_id,
      table_name: operation.table_name,
      record_id: operation.record_id,
      conflict_type: 'manual_resolution_required',
      conflict_data: { local_data: localRecord, remote_data: operation.operation_data.new_data, operation: operation },
      resolved: false,
    });
  }

  private async handleDeleteOperation(operation: any, _tableConfig: TableSyncConfig): Promise<void> {
    const { table_name, record_id, client_id } = operation;
    const localRecord = await this.findRecordByUUID(table_name, record_id);
    if (!localRecord) {
      console.warn(`⚠️ 未找到要删除的记录: ${record_id}`);
      return;
    }
    console.log(`🗑️ 执行软删除操作: ${record_id}`);
    await this.softDeleteRecordByTableName(table_name, record_id, client_id);
    this.db.deleteSyncRecordMapping(client_id, record_id, table_name);
    console.log(`✅ 软删除操作完成: ${record_id}`);
  }

  private async softDeleteRecordByTableName(tableName: string, recordId: string, deletedBy: string): Promise<void> {
    try {
      const model = this.modelInstances.get(tableName);
      if (model && typeof model.delete === 'function') {
        const record = await this.findRecordByUUID(tableName, recordId);
        if (record) {
          record.modified_by = this.clientId;
          record.modified_at = Date.now();
          await this.saveRecordByTableName(tableName, record);
        }
        await model.delete(recordId, deletedBy);
        return;
      }
    } catch (error) {
      console.warn(`Model层删除失败，回退到DatabaseManager: ${error}`);
    }
    console.log(`🔄 使用DatabaseManager软删除 ${tableName}: ${recordId}`);
    this.db.run(`UPDATE ${tableName} SET modified_by = ?, modified_at = ? WHERE id = ?`, [this.clientId, Date.now(), recordId]);
    if (tableName === 'tasks') {
      this.db.softDeleteWorkTask(recordId, deletedBy);
    } else {
      this.db.run(`UPDATE ${tableName} SET is_deleted = 1, deleted_at = ?, deleted_by = ? WHERE id = ?`, [Date.now(), deletedBy, recordId]);
    }
  }

  private async handleSyncConflict(operation: any, error: any, tableConfig: TableSyncConfig): Promise<void> {
    const errMsg = error instanceof Error ? error.message : String(error);
    this.db.saveSyncConflict({
      id: generateUUID(),
      client_id: operation.client_id,
      table_name: operation.table_name,
      record_id: operation.record_id,
      conflict_type: 'apply_operation_failed',
      conflict_data: { operation, error: errMsg, table_config: tableConfig },
      resolved: false,
    });
  }

  private async saveRecordByTableName(tableName: string, data: any): Promise<string> {
    const protectedData = { ...data };
    const recordId = protectedData.id;

    protectedData.modified_by = this.clientId;
    protectedData.modified_at = Date.now();
    if (!recordId) {
      protectedData.created_by = this.clientId;
      protectedData.created_at = Date.now();
    }

    let operation: 'INSERT' | 'UPDATE' = 'INSERT';
    let oldData: any = null;
    try {
      const existingRecord = await this.findRecordByUUID(tableName, recordId);
      if (existingRecord) {
        operation = 'UPDATE';
        const tableConfig = this.tableConfigs.get(tableName);
        oldData = tableConfig ? this.filterData(existingRecord, tableConfig) : existingRecord;
      }
    } catch (error) {
      console.warn(`检查记录存在性失败: ${recordId}`, error);
    }

    let finalRecordId: string;
    try {
      const model = this.modelInstances.get(tableName);
      if (model && typeof model.save === 'function') {
        console.log(`🔄 使用Model层保存 ${tableName}: ${recordId}`);
        finalRecordId = await model.save(protectedData);
      } else if (tableName === 'tasks') {
        finalRecordId = this.db.saveWorkTask(protectedData);
      } else {
        // 通用保存：简单 INSERT OR REPLACE
        const keys = Object.keys(protectedData).filter((k) => protectedData[k] !== undefined);
        const columns = keys.join(', ');
        const placeholders = keys.map(() => '?').join(', ');
        const values = keys.map((k) => protectedData[k]);
        this.db.run(`INSERT OR REPLACE INTO ${tableName} (${columns}) VALUES (${placeholders})`, values);
        finalRecordId = recordId;
      }
      await this.recordChange(tableName, finalRecordId, operation, oldData, protectedData);
      return finalRecordId;
    } catch (error) {
      console.error(`❌ 保存记录失败 ${tableName}:`, error);
      throw error;
    }
  }

  // 公共接口
  async saveRecord(tableName: string, data: any): Promise<string> {
    this.ensureInitialized();
    return await this.saveRecordByTableName(tableName, data);
  }

  async deleteRecord(tableName: string, recordId: string): Promise<void> {
    this.ensureInitialized();
    await this.softDeleteRecordByTableName(tableName, recordId, this.clientId);
    await this.recordChange(tableName, recordId, 'DELETE', null, null);
  }

  private async findRecordByUUID(tableName: string, recordId: string): Promise<any> {
    try {
      const model = this.modelInstances.get(tableName);
      if (model && typeof model.get === 'function') {
        return await model.get(recordId);
      }
    } catch (error) {
      console.warn(`Model层查询失败，回退到DatabaseManager: ${error}`);
    }
    // 回退到直接查询
    const results = this.db.query(`SELECT * FROM ${tableName} WHERE id = ?`, [recordId]);
    return results.length > 0 ? results[0] : null;
  }

  private getClientPriority(clientId: string): number {
    const priorityRules: Record<string, number> = {
      'admin-client': 100,
      'manager-client': 80,
      'user-client': 50,
    };
    return priorityRules[clientId] || 10;
  }

  getTableConfig(tableName: string): TableSyncConfig | undefined {
    this.ensureInitialized();
    return this.tableConfigs.get(tableName);
  }

  updateTableConfig(tableName: string, config: Partial<TableSyncConfig>): void {
    this.ensureInitialized();
    const existingConfig = this.tableConfigs.get(tableName);
    if (existingConfig) {
      this.tableConfigs.set(tableName, { ...existingConfig, ...config });
    }
  }

  getAllTableConfigs(): TableSyncConfig[] {
    this.ensureInitialized();
    return Array.from(this.tableConfigs.values());
  }

  initialize(): void {
    if (this.isInitialized) {
      console.log('⏭️ SyncFramework 已经初始化，跳过重复初始化');
      return;
    }
    this.initializeTableConfigs();
    this.isInitialized = true;
  }

  getSyncStats(): any {
    this.ensureInitialized();
    return {
      tableConfigs: this.getAllTableConfigs().length,
      enabledTables: this.getAllTableConfigs().filter((config) => config.syncEnabled).length,
      conflictResolution: this.config.conflictResolution,
      isInitialized: this.isInitialized,
    };
  }
}
