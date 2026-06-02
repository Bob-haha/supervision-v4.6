<template>
  <div class="config-page">
    <el-row :gutter="16">
      <!-- 部门管理 -->
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>
            <div class="page-header">
              <h3>部门管理</h3>
              <div class="header-btns">
                <el-button size="small" @click="downloadDeptTemplate">📥 模板</el-button>
                <el-upload :auto-upload="false" :show-file-list="false" accept=".xlsx,.xls" :on-change="importDeptExcel">
                  <el-button size="small">📤 导入</el-button>
                </el-upload>
                <el-button size="small" type="primary" @click="openDeptDialog()">+ 新增</el-button>
              </div>
            </div>
          </template>
          <el-table :data="departments" stripe size="small">
            <el-table-column prop="name" label="部门名称" min-width="160" />
            <el-table-column prop="shortName" label="简称" width="100" />
            <el-table-column label="操作" width="120">
              <template #default="{ row }">
                <el-button size="small" @click="openDeptDialog(row)">编辑</el-button>
                <el-button size="small" type="danger" @click="doDelDept(row.id)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>

      <!-- 人员管理 -->
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>
            <div class="page-header">
              <h3>人员管理</h3>
              <div class="header-btns">
                <el-button size="small" @click="downloadPersonTemplate">📥 模板</el-button>
                <el-upload :auto-upload="false" :show-file-list="false" accept=".xlsx,.xls" :on-change="importPersonExcel">
                  <el-button size="small">📤 导入</el-button>
                </el-upload>
                <el-button size="small" type="primary" @click="openPersonDialog()">+ 新增</el-button>
              </div>
            </div>
          </template>
          <el-table :data="personnel" stripe size="small">
            <el-table-column prop="name" label="姓名" width="80" />
            <el-table-column label="部门" width="120">
              <template #default="{ row }">{{ getDeptName(row.dept_id || row.departmentId) }}</template>
            </el-table-column>
            <el-table-column prop="position" label="职务" width="100" />
            <el-table-column label="操作" width="100">
              <template #default="{ row }">
                <el-button size="small" @click="openPersonDialog(row)">编辑</el-button>
                <el-button size="small" type="danger" @click="doDelPerson(row.id)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <!-- 部门对话框 -->
    <el-dialog v-model="deptDialogVisible" :title="editingDeptId ? '编辑部门' : '新增部门'" width="450px">
      <el-form :model="deptForm" label-width="80px" size="default">
        <el-form-item label="部门名称" required>
          <el-input v-model="deptForm.name" placeholder="如：查验二科" />
        </el-form-item>
        <el-form-item label="简称">
          <el-input v-model="deptForm.shortName" placeholder="如：查验二" />
        </el-form-item>
        <el-form-item label="上级部门">
          <el-select v-model="deptForm.parentId" placeholder="无（一级部门）" clearable style="width:100%">
            <el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="deptDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="doSaveDept">保存</el-button>
      </template>
    </el-dialog>

    <!-- 人员对话框 -->
    <el-dialog v-model="personDialogVisible" :title="editingPersonId ? '编辑人员' : '新增人员'" width="450px">
      <el-form :model="personForm" label-width="80px" size="default">
        <el-form-item label="姓名" required>
          <el-input v-model="personForm.name" placeholder="请输入姓名" />
        </el-form-item>
        <el-form-item label="所属部门" required>
          <el-select v-model="personForm.deptId" placeholder="选择部门" style="width:100%" filterable>
            <el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="职务" required>
          <el-input v-model="personForm.position" placeholder="如：科长、科员" />
        </el-form-item>
        <el-form-item label="负责人">
          <el-switch v-model="personForm.isLeader" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="personDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="doSavePerson">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue'
import { useDepartmentStore } from '@/stores/department'
import { usePersonnelStore } from '@/stores/personnel'
import { DEPT_MAP } from '@/constants'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'

const deptStore = useDepartmentStore()
const personnelStore = usePersonnelStore()

const departments = computed(() => deptStore.departments)
const personnel = computed(() => personnelStore.allPersonnel)

// --- 部门表单 ---
const deptDialogVisible = ref(false)
const editingDeptId = ref('')
const deptForm = reactive({ name: '', shortName: '', parentId: '' as string })

function openDeptDialog(row?: any) {
  if (row) {
    editingDeptId.value = row.id
    deptForm.name = row.name
    deptForm.shortName = row.shortName || ''
    deptForm.parentId = row.parentId || ''
  } else {
    editingDeptId.value = ''
    deptForm.name = ''
    deptForm.shortName = ''
    deptForm.parentId = ''
  }
  deptDialogVisible.value = true
}

async function doSaveDept() {
  if (!deptForm.name.trim()) { ElMessage.warning('请输入部门名称'); return }
  try {
    if (editingDeptId.value) {
      await deptStore.updateDepartment(editingDeptId.value, {
        name: deptForm.name.trim(),
        shortName: deptForm.shortName.trim() || undefined,
        parentId: deptForm.parentId || undefined,
      })
    } else {
      await deptStore.addDepartment({
        name: deptForm.name.trim(),
        shortName: deptForm.shortName.trim() || undefined,
        parentId: deptForm.parentId || undefined,
        order: departments.value.length + 1,
        isActive: true,
      })
    }
    ElMessage.success('保存成功')
    deptDialogVisible.value = false
    await deptStore.fetchDepartments()
  } catch (e: any) { ElMessage.error('保存失败: ' + (e.message || '')) }
}

async function doDelDept(id: string) {
  try {
    await ElMessageBox.confirm('确定删除该部门？', '确认', { type: 'warning' })
    await deptStore.deleteDepartment(id)
    ElMessage.success('已删除')
    await deptStore.fetchDepartments()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e.message || '删除失败')
  }
}

// --- 人员表单 ---
const personDialogVisible = ref(false)
const editingPersonId = ref('')
const personForm = reactive({ name: '', deptId: '', position: '', isLeader: false })

function openPersonDialog(row?: any) {
  if (row) {
    editingPersonId.value = row.id
    personForm.name = row.name
    personForm.deptId = row.dept_id || row.departmentId || ''
    personForm.position = row.position || ''
    personForm.isLeader = !!(row.is_dept_head || row.isLeader)
  } else {
    editingPersonId.value = ''
    personForm.name = ''
    personForm.deptId = ''
    personForm.position = ''
    personForm.isLeader = false
  }
  personDialogVisible.value = true
}

async function doSavePerson() {
  if (!personForm.name.trim()) { ElMessage.warning('请输入姓名'); return }
  if (!personForm.deptId) { ElMessage.warning('请选择部门'); return }
  try {
    if (editingPersonId.value) {
      await personnelStore.updatePersonnel(editingPersonId.value, {
        name: personForm.name.trim(),
        departmentId: personForm.deptId,
        position: personForm.position.trim(),
        isLeader: personForm.isLeader,
      })
    } else {
      await personnelStore.addPersonnel({
        name: personForm.name.trim(),
        dept_id: personForm.deptId,
        departmentId: personForm.deptId,
        position: personForm.position.trim(),
        isLeader: personForm.isLeader,
        is_dept_head: personForm.isLeader ? 1 : 0,
        employeeNo: '',
        email: '',
        isActive: true,
        order: 0,
      })
    }
    ElMessage.success('保存成功')
    personDialogVisible.value = false
    await personnelStore.fetchAllPersonnel()
  } catch (e: any) { ElMessage.error('保存失败: ' + (e.message || '')) }
}

async function doDelPerson(id: string) {
  await ElMessageBox.confirm('确定删除该人员？', '确认', { type: 'warning' })
  await personnelStore.deletePersonnel(id)
  ElMessage.success('已删除')
  await personnelStore.fetchAllPersonnel()
}

function getDeptName(id: string) { return DEPT_MAP[id] || id }

// ===== Excel 导入导出 =====

function downloadTemplate(filename: string, headers: string[], sampleData: any[]) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData])
  ws['!cols'] = headers.map(() => ({ wch: 20 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  XLSX.writeFile(wb, filename)
}

function downloadDeptTemplate() {
  const headers = ['部门名称', '简称', '上级部门名称（空为一级部门）']
  const rows = [['查验二科', '查验二', '']]
  downloadTemplate('部门导入模板.xlsx', headers, rows)
  ElMessage.success('模板已下载')
}

function downloadPersonTemplate() {
  const headers = ['姓名', '所属部门名称', '职务', '是否负责人（是/否）']
  const rows = [['张三', '查验二科', '科员', '否']]
  downloadTemplate('人员导入模板.xlsx', headers, rows)
  ElMessage.success('模板已下载')
}

async function importDeptExcel(file: any) {
  try {
    const data = await readExcelFile(file.raw)
    if (!data || data.length < 2) { ElMessage.warning('文件为空或格式不正确'); return }
    const headers = data[0] as string[]
    const rows = data.slice(1) as any[][]
    let count = 0
    for (const row of rows) {
      const name = String(row[0] || '').trim()
      if (!name) continue
      const shortName = String(row[1] || '').trim()
      const parentName = String(row[2] || '').trim()
      let parentId: string | undefined
      if (parentName) {
        const parent = departments.value.find(d => d.name === parentName)
        parentId = parent?.id
      }
      await deptStore.addDepartment({
        name, shortName: shortName || undefined, parentId,
        order: departments.value.length + count + 1, isActive: true,
      })
      count++
    }
    await deptStore.fetchDepartments()
    ElMessage.success(`成功导入 ${count} 个部门`)
  } catch (e: any) { ElMessage.error('导入失败: ' + (e.message || '')) }
}

async function importPersonExcel(file: any) {
  try {
    const data = await readExcelFile(file.raw)
    if (!data || data.length < 2) { ElMessage.warning('文件为空或格式不正确'); return }
    const headers = data[0] as string[]
    const rows = data.slice(1) as any[][]
    let count = 0
    for (const row of rows) {
      const name = String(row[0] || '').trim()
      if (!name) continue
      const deptName = String(row[1] || '').trim()
      const position = String(row[2] || '').trim()
      const isLeader = String(row[3] || '').trim() === '是'

      // 根据部门名称查找部门ID
      const dept = departments.value.find(d => d.name === deptName)
      const deptId = dept?.id || ''
      if (!deptId) continue

      await personnelStore.addPersonnel({
        name, dept_id: deptId, departmentId: deptId, position,
        isLeader, is_dept_head: isLeader ? 1 : 0,
        employeeNo: '', email: '', isActive: true, order: 0,
      })
      count++
    }
    await personnelStore.fetchAllPersonnel()
    ElMessage.success(`成功导入 ${count} 人`)
  } catch (e: any) { ElMessage.error('导入失败: ' + (e.message || '')) }
}

function readExcelFile(file: File): Promise<any[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][]
        resolve(data)
      } catch (err) { reject(err) }
    }
    reader.onerror = reject
    reader.readAsBinaryString(file)
  })
}

onMounted(async () => {
  await deptStore.fetchDepartments()
  await personnelStore.fetchAllPersonnel()
})
</script>

<style scoped>
.config-page { max-width: 1400px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; }
.page-header h3 { margin: 0; font-size: 16px; }
.header-btns { display: flex; gap: 6px; align-items: center; }
</style>
