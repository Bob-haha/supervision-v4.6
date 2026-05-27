import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Personnel } from '@/types';
import { DatabaseManager } from '@/core/database/DatabaseManager';
import { DEFAULT_PERSONNEL } from '@/constants/personnel';
import { v4 as uuidv4 } from 'uuid';

export const usePersonnelStore = defineStore('personnel', () => {
  const allPersonnel = ref<Personnel[]>([]);
  const dbManager = DatabaseManager.getInstance();

  /** 首次初始化种子数据 */
  async function initPersonnelIfEmpty() {
    const existing = dbManager.query<{ count: number }>('SELECT count(*) as count FROM personnel');
    if (existing[0]?.count > 0) return;

    for (const p of DEFAULT_PERSONNEL) {
      dbManager.execute(
        'INSERT OR REPLACE INTO personnel (id, name, dept_id, position, is_dept_head) VALUES (?, ?, ?, ?, ?)',
        [p.id, p.name, p.dept_id, p.position, p.is_dept_head],
      );
    }
    await dbManager.persist();
    await fetchAllPersonnel();
  }

  async function fetchAllPersonnel() {
    allPersonnel.value = dbManager.query<Personnel>(
      'SELECT * FROM personnel ORDER BY dept_id, is_dept_head DESC',
    );
  }

  function fetchByDept(deptId: string): Personnel[] {
    return dbManager.query<Personnel>(
      'SELECT * FROM personnel WHERE dept_id = ? ORDER BY is_dept_head DESC',
      [deptId],
    );
  }

  function searchPersonnel(query: string): Personnel[] {
    return dbManager.query<Personnel>(
      'SELECT * FROM personnel WHERE name LIKE ? OR position LIKE ? OR dept_id LIKE ? LIMIT 30',
      [`%${query}%`, `%${query}%`, `%${query}%`],
    );
  }

  function getDeptHead(deptId: string): Personnel | null {
    const results = dbManager.query<Personnel>(
      'SELECT * FROM personnel WHERE dept_id = ? AND is_dept_head = 1 LIMIT 1',
      [deptId],
    );
    return results[0] || null;
  }

  function addPersonnel(data: Omit<Personnel, 'id'>) {
    const id = uuidv4();
    dbManager.execute(
      'INSERT OR REPLACE INTO personnel (id, name, dept_id, position, is_dept_head) VALUES (?, ?, ?, ?, ?)',
      [id, data.name, data.dept_id, data.position, data.is_dept_head],
    );
    dbManager.persist();
    fetchAllPersonnel();
  }

  return {
    allPersonnel,
    initPersonnelIfEmpty,
    fetchAllPersonnel,
    fetchByDept,
    searchPersonnel,
    getDeptHead,
    addPersonnel,
  };
});
