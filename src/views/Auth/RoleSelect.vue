<template>
  <div class="role-select-overlay">
    <el-card class="role-card">
      <template #header>
        <div class="header-box">
          <b>督办系统身份确认</b>
        </div>
      </template>

      <el-form label-position="top">
        <!-- 1. 姓名输入 -->
        <el-form-item label="您的姓名" required>
          <el-input v-model="form.name" placeholder="请输入姓名" />
        </el-form-item>

        <!-- 2. 角色选择 -->
        <el-form-item label="系统角色" required>
          <el-radio-group v-model="form.role">
            <el-radio value="ADMIN" border>管理员</el-radio>
            <el-radio value="LEADER" border>关领导</el-radio>
            <el-radio value="STAFF" border>关员</el-radio>
          </el-radio-group>
        </el-form-item>

        <!-- 3. 科室选择 (使用原生 HTML 下拉框) -->
        <div v-if="form.role === 'STAFF'" class="dept-selection-box">
          <label class="native-label">所属科室 <span style="color:red">*</span></label>
          <select v-model="form.deptId" class="native-select">
            <option value="" disabled selected>-- 请点击选择所属科室 --</option>
            <!-- 直接遍历全局 DEPT_MAP -->
            <option 
              v-for="(name, id) in DEPT_MAP" 
              :key="id" 
              :value="id"
            >
              {{ name }}
            </option>
          </select>
        </div>

        <el-button 
          type="primary" 
          size="large" 
          style="width: 100%; margin-top: 20px"
          @click="handleEnter"
        >
          确认并进入系统
        </el-button>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { DEPT_MAP } from '@/constants'; 
import { ElMessage } from 'element-plus';

const authStore = useAuthStore();

const form = reactive({
  name: '',
  role: 'STAFF',
  deptId: ''
});

const handleEnter = () => {
  if (!form.name.trim()) {
    ElMessage.error("请填入姓名");
    return;
  }
  if (form.role === 'STAFF' && !form.deptId) {
    ElMessage.error("请选择科室");
    return;
  }

  authStore.setUser({
    id: 'u_' + Date.now(),
    name: form.name,
    role: form.role as any,
    deptId: form.role === 'STAFF' ? form.deptId : ''
  });
  ElMessage.success('登录成功');
};
</script>

<style scoped>
.role-select-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background-color: #0d2a61;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.role-card { width: 420px; border-radius: 8px; }

/* 装饰背景盒 */
.dept-selection-box {
  margin: 15px 0;
  padding: 15px;
  background-color: #f8f9fa;
  border-radius: 6px;
  border: 1px solid #e4e7ed;
}

.native-label {
  display: block;
  font-size: 14px;
  color: #606266;
  margin-bottom: 8px;
  font-weight: bold;
}

/* 原生下拉框样式美化 */
.native-select {
  width: 100%;
  height: 40px;
  padding: 0 10px;
  border-radius: 4px;
  border: 1px solid #dcdfe6;
  background-color: white;
  color: #606266;
  font-size: 14px;
  outline: none;
  cursor: pointer;
}

.native-select:focus {
  border-color: #409eff;
}

.header-box { text-align: center; color: #0d2a61; }

:deep(.el-radio-group) {
  display: flex;
  width: 100%;
}
:deep(.el-radio.is-bordered) {
  flex: 1;
  margin-right: 0;
  text-align: center;
}
</style>