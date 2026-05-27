import type { DatabaseManager } from '@/core/database/DatabaseManager';
import { generateUUID } from '@/utils';

export class SyncModelAdapter {
  private tableName: string;
  private db: DatabaseManager;

  constructor(tableName: string, db: DatabaseManager) {
    this.tableName = tableName;
    this.db = db;
  }

  async save(data: Record<string, any>): Promise<string> {
    const keys = Object.keys(data).filter((k) => data[k] !== undefined);
    const columns = keys.join(', ');
    const placeholders = keys.map(() => '?').join(', ');
    const values = keys.map((k) => data[k]);
    const id = data.id || generateUUID();

    // 先检查是否存在
    const existing = await this.get(id);
    if (existing) {
      const setClauses = keys.map((k) => `${k} = ?`).join(', ');
      const sql = `UPDATE ${this.tableName} SET ${setClauses} WHERE id = ?`;
      this.db.execute(sql, [...values, id], true);
    } else {
      const sql = `INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders})`;
      this.db.execute(sql, values, true);
    }

    return id;
  }

  async get(id: string): Promise<Record<string, any> | null> {
    const results = this.db.query<Record<string, any>>(
      `SELECT * FROM ${this.tableName} WHERE id = ?`,
      [id],
    );
    return results.length > 0 ? results[0] : null;
  }

  async delete(id: string, deletedBy: string): Promise<void> {
    const sql = `UPDATE ${this.tableName} SET is_deleted = 1, deleted_at = ?, deleted_by = ? WHERE id = ?`;
    this.db.execute(sql, [Date.now(), deletedBy, id], true);
  }
}
