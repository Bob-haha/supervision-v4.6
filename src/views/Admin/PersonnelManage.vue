<template>
  <div class="desktop-container">
    <div class="desk-header">
      <span class="desk-title">人员管理</span>
      <el-button type="primary" icon="Plus" @click="openAdd">新增人员</el-button>
    </div>
    <el-card shadow="never" class="modern-card">
      <el-table :data="personnelList" stripe size="default" style="width:100%">
        <el-table-column prop="name" label="姓名" width="120" />
        <el-table-column label="所属科室" min-width="180">
          <template #default="{ row }">{{ DEPT_MAP[row.dept_id] || row.dept_id }}</template>
        </el-table-column>
        <el-table-column prop="position" label="职务" min-width="150" />
        <el-table-column label="是否负责人" width="100" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.is_dept_head" type="warning" size="small">负责人</el-tag>
            <span v-else class="text-gray">-</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button size="small" type="danger" @click="doDelete(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑人员' : '新增人员'" width="450px">
      <el-form :model="form" label-width="80px" size="default">
        <el-form-item label="姓名" required>
          <el-input v-model="form.name" placeholder="请输入姓名" />
        </el-form-item>
        <el-form-item label="所属科室" required>
          <el-select v-model="form.deptId" placeholder="选择科室" style="width:100%" filterable>
            <el-option v-for="(name, id) in DEPT_MAP" :key="id" :label="name" :value="id" />
          </el-select>
        </el-form-item>
        <el-form-item label="职务" required>
          <el-input v-model="form.position" placeholder="如：科长、科员" />
        </el-form-item>
        <el-form-item label="负责人">
          <el-switch v-model="form.isLeader" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="doSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue'
import { usePersonnelStore } from '@/stores/personnel'
import { DEPT_MAP } from '@/constants'
import { ElMessage, ElMessageBox } from 'element-plus'

const personnelStore = usePersonnelStore()
const personnelList = ref<any[]>([])
const dialogVisible = ref(false)
const editingId = ref('')

const form = reactive({
  name: '',
  deptId: '',
  position: '',
  isLeader: false,
})

function openAdd() {
  editingId.value = ''
  form.name = ''
  form.deptId = ''
  form.position = ''
  form.isLeader = false
  dialogVisible.value = true
}

async function doSave() {
  if (!form.name.trim()) { ElMessage.warning('请输入姓名'); return }
  if (!form.deptId) { ElMessage.warning('请选择科室'); return }
  if (!form.position.trim()) { ElMessage.warning('请输入职务'); return }

  try {
    await personnelStore.addPersonnel({
      name: form.name.trim(),
      dept_id: form.deptId,
      departmentId: form.deptId,
      position: form.position.trim(),
      isLeader: form.isLeader,
      is_dept_head: form.isLeader ? 1 : 0,
      employeeNo: '',
      email: '',
      isActive: true,
      order: 0,
    })
    ElMessage.success('人员添加成功')
    dialogVisible.value = false
    await loadData()
  } catch (e: any) {
    ElMessage.error('添加失败: ' + (e.message || '未知错误'))
  }
}

async function doDelete(id: string) {
  await ElMessageBox.confirm('确定删除该人员？', '确认', { type: 'warning' })
  await personnelStore.deletePersonnel(id)
  ElMessage.success('已删除')
  await loadData()
}

async function loadData() {
  await personnelStore.fetchAllPersonnel()
  personnelList.value = personnelStore.allPersonnel
}

onMounted(async () => {
  await personnelStore.initPersonnelIfEmpty()
  await loadData()
})
</script>

<style scoped>
.desktop-container { padding: 10px; }
.desk-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 5px; border-bottom: 1px solid var(--border-color); margin-bottom: 20px; }
.desk-title { font-weight: 700; color: var(--color-primary); border-left: 4px solid var(--color-primary-light); padding-left: 14px; font-size: var(--font-size-xl); }
.modern-card { border-radius: var(--radius-md); border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); }
:deep(.modern-card .el-card__body) { padding: 0; }
.text-gray { color: var(--text-tertiary); }
</style>
