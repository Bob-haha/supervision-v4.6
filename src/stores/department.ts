import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Department, Personnel } from '@/types'
import { DatabaseManager } from '@/core/database/DatabaseManager'
import { v4 as uuidv4 } from 'uuid'

export const useDepartmentStore = defineStore('department', () => {
  const departments = ref<Department[]>([])
  const dbManager = DatabaseManager.getInstance()

  async function fetchDepartments() {
    departments.value = dbManager.query<Department>(
      'SELECT * FROM departments WHERE isActive = 1 ORDER BY sortOrder ASC',
    )
  }

  function getDepartmentTree(): Department[] {
    const all = dbManager.query<Department>('SELECT * FROM departments WHERE isActive = 1 ORDER BY sortOrder ASC')
    return all
  }

  function getDepartmentById(id: string): Department | null {
    const results = dbManager.query<Department>('SELECT * FROM departments WHERE id = ?', [id])
    return results[0] || null
  }

  function getSubDepartments(parentId: string): Department[] {
    return dbManager.query<Department>(
      'SELECT * FROM departments WHERE parentId = ? AND isActive = 1 ORDER BY sortOrder ASC',
      [parentId],
    )
  }

  function getDeptHeadName(deptId: string): string {
    const dept = getDepartmentById(deptId)
    if (!dept?.leaderId) return ''
    const p = dbManager.query<Personnel>('SELECT name FROM personnel WHERE id = ?', [dept.leaderId])
    return p[0]?.name || ''
  }

  async function addDepartment(data: Omit<Department, 'id'>) {
    const id = uuidv4()
    dbManager.execute(
      'INSERT INTO departments (id, name, shortName, parentId, leaderId, sortOrder, isActive) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, data.name, data.shortName || null, data.parentId || null, data.leaderId || null, data.order, data.isActive ? 1 : 0],
    )
    await dbManager.persist()
    await fetchDepartments()
    return id
  }

  async function updateDepartment(id: string, data: Partial<Department>) {
    const fields: string[] = []
    const values: any[] = []
    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name) }
    if (data.shortName !== undefined) { fields.push('shortName = ?'); values.push(data.shortName) }
    if (data.parentId !== undefined) { fields.push('parentId = ?'); values.push(data.parentId) }
    if (data.leaderId !== undefined) { fields.push('leaderId = ?'); values.push(data.leaderId) }
    if (data.order !== undefined) { fields.push('sortOrder = ?'); values.push(data.order) }
    if (data.isActive !== undefined) { fields.push('isActive = ?'); values.push(data.isActive ? 1 : 0) }
    if (fields.length > 0) {
      values.push(id)
      dbManager.execute(`UPDATE departments SET ${fields.join(', ')} WHERE id = ?`, values)
      await dbManager.persist()
      await fetchDepartments()
    }
  }

  async function deleteDepartment(id: string) {
    // 检查是否有人员引用
    const personnelCount = dbManager.query<{ count: number }>(
      'SELECT count(*) as count FROM personnel WHERE dept_id = ?',
      [id],
    )
    if (personnelCount[0]?.count > 0) {
      throw new Error('该部门下仍有人员，无法删除')
    }
    dbManager.execute('DELETE FROM departments WHERE id = ?', [id])
    await dbManager.persist()
    await fetchDepartments()
  }

  return {
    departments,
    fetchDepartments, getDepartmentTree, getDepartmentById, getSubDepartments, getDeptHeadName,
    addDepartment, updateDepartment, deleteDepartment,
  }
})
