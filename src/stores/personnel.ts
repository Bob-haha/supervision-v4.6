import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Personnel } from '@/types'
import { DatabaseManager } from '@/core/database/DatabaseManager'
import { DEFAULT_PERSONNEL } from '@/constants/personnel'
import { v4 as uuidv4 } from 'uuid'

export const usePersonnelStore = defineStore('personnel', () => {
  const allPersonnel = ref<Personnel[]>([])
  const dbManager = DatabaseManager.getInstance()

  /** 首次初始化种子数据 */
  async function initPersonnelIfEmpty() {
    const existing = dbManager.query<{ count: number }>('SELECT count(*) as count FROM personnel')
    if (existing[0]?.count > 0) return

    for (const p of DEFAULT_PERSONNEL) {
      dbManager.execute(
        `INSERT OR REPLACE INTO personnel (id, name, dept_id, position, is_dept_head, employeeNo, departmentId, isLeader, isActive, sortOrder)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.id, p.name, p.dept_id, p.position, p.is_dept_head, p.id, p.dept_id, p.is_dept_head, 1, 0],
      )
    }
    await dbManager.persist()
    await fetchAllPersonnel()
  }

  async function fetchAllPersonnel() {
    allPersonnel.value = dbManager.query<Personnel>(
      'SELECT * FROM personnel WHERE isActive = 1 ORDER BY sortOrder ASC, dept_id, isLeader DESC',
    )
  }

  function fetchByDept(deptId: string): Personnel[] {
    return dbManager.query<Personnel>(
      'SELECT * FROM personnel WHERE (dept_id = ? OR departmentId = ?) AND isActive = 1 ORDER BY isLeader DESC',
      [deptId, deptId],
    )
  }

  function searchPersonnel(query: string): Personnel[] {
    return dbManager.query<Personnel>(
      "SELECT * FROM personnel WHERE (name LIKE ? OR position LIKE ? OR employeeNo LIKE ?) AND isActive = 1 LIMIT 30",
      [`%${query}%`, `%${query}%`, `%${query}%`],
    )
  }

  function getDeptHead(deptId: string): Personnel | null {
    const results = dbManager.query<Personnel>(
      'SELECT * FROM personnel WHERE (dept_id = ? OR departmentId = ?) AND isLeader = 1 LIMIT 1',
      [deptId, deptId],
    )
    return results[0] || null
  }

  function getPersonnelById(id: string): Personnel | null {
    const results = dbManager.query<Personnel>('SELECT * FROM personnel WHERE id = ?', [id])
    return results[0] || null
  }

  async function addPersonnel(data: Omit<Personnel, 'id'>) {
    const id = uuidv4()
    dbManager.execute(
      `INSERT INTO personnel (id, name, dept_id, position, is_dept_head, employeeNo, departmentId, isLeader, email, isActive, sortOrder)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, data.name, data.departmentId || data.dept_id || '', data.position, data.isLeader ? 1 : 0,
       data.employeeNo || '', data.departmentId || data.dept_id || '', data.isLeader ? 1 : 0,
       data.email || null, data.isActive ? 1 : 0, data.order || 0],
    )
    await dbManager.persist()
    await fetchAllPersonnel()
    return id
  }

  async function updatePersonnel(id: string, data: Partial<Personnel>) {
    const fields: string[] = []
    const values: any[] = []
    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name) }
    if (data.position !== undefined) { fields.push('position = ?'); values.push(data.position) }
    if (data.departmentId !== undefined) { fields.push('departmentId = ?'); fields.push('dept_id = ?'); values.push(data.departmentId); values.push(data.departmentId) }
    if (data.isLeader !== undefined) { fields.push('isLeader = ?'); fields.push('is_dept_head = ?'); values.push(data.isLeader ? 1 : 0); values.push(data.isLeader ? 1 : 0) }
    if (data.email !== undefined) { fields.push('email = ?'); values.push(data.email) }
    if (data.isActive !== undefined) { fields.push('isActive = ?'); values.push(data.isActive ? 1 : 0) }
    if (data.order !== undefined) { fields.push('sortOrder = ?'); values.push(data.order) }
    if (fields.length > 0) {
      values.push(id)
      dbManager.execute(`UPDATE personnel SET ${fields.join(', ')} WHERE id = ?`, values)
      await dbManager.persist()
      await fetchAllPersonnel()
    }
  }

  async function deletePersonnel(id: string) {
    dbManager.execute('DELETE FROM personnel WHERE id = ?', [id])
    await dbManager.persist()
    await fetchAllPersonnel()
  }

  return {
    allPersonnel,
    initPersonnelIfEmpty, fetchAllPersonnel, fetchByDept, searchPersonnel,
    getDeptHead, getPersonnelById, addPersonnel, updatePersonnel, deletePersonnel,
  }
})
