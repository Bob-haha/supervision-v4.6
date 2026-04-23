<template>
  <el-dialog v-model="visible" :title="isEdit ? '修改督办事项' : '督办立项'" width="800px" top="5vh" destroy-on-close>
    <el-form :model="form" label-width="100px">
      <el-form-item label="事项标题" required><el-input v-model="form.title" /></el-form-item>
      <el-form-item label="截止日期" required>
        <el-date-picker v-model="form.deadline" type="date" value-format="YYYY-MM-DD" style="width:100%" />
      </el-form-item>
      
        <el-form-item label="事项级别" required>
          <el-select v-model="form.level" style="width:100%">
            <el-option label="年度事项" :value="1" />
            <el-option label="阶段事项" :value="2" />
            <el-option label="科室事项" :value="3" />
          </el-select>
        </el-form-item>

        <!-- 填写事项描述，公共要求 -->
      <el-form-item label="事项描述/公共要求">
        <el-input v-model="form.content" type="textarea" :rows="4" placeholder="填写事项描述或公共要求..." />
      </el-form-item>


      <el-form-item label="主办科室" required>
        <el-select v-model="form.owner_dept_ids" multiple collapse-tags style="width:100%">
          <el-option v-for="(name, id) in DEPT_MAP" :key="id" :label="name" :value="id" />
        </el-select>
      </el-form-item>

      <!-- 主办要求动态列表 -->
      <div v-if="form.owner_dept_ids && form.owner_dept_ids.length" class="dept-req-box">
        <div v-for="id in form.owner_dept_ids" :key="id" class="mb-2">
          <div class="dept-req-label">{{ DEPT_MAP[id] }}主办要求：</div>
          <el-input v-model="form.dept_requirements[id]" type="textarea" :rows="2" placeholder="填写具体要求..." />
        </div>
      </div>

      <el-form-item label="协办科室">
        <el-select v-model="form.co_dept_ids" multiple collapse-tags style="width:100%">
          <el-option v-for="(name, id) in DEPT_MAP" :key="id" :label="name" :value="id" />
        </el-select>
      </el-form-item>

      <!-- 协办要求动态列表 -->
      <div v-if="form.co_dept_ids && form.co_dept_ids.length" class="dept-req-box">
        <div v-for="id in form.co_dept_ids" :key="id" class="mb-2">
          <div class="dept-req-label">{{ DEPT_MAP[id] }}协办要求：</div>
          <el-input v-model="form.co_dept_requirements[id]" type="textarea" :rows="2" placeholder="填写配合要求..." />
        </div>
      </div>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="save" :loading="isSaving">确认保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue';
import { DEPT_MAP } from '@/constants';
import { useTaskStore } from '@/stores/task';
import { safeParse } from '@/utils';
import { ElMessage } from 'element-plus';

const taskStore = useTaskStore();
const visible = ref(false);
const isEdit = ref(false);
const editId = ref('');
const isSaving = ref(false);

const form = reactive<any>({
  title: '', deadline: '', 
  owner_dept_ids: [], co_dept_ids: [], 
  dept_requirements: {}, co_dept_requirements: {} 
});

// 【核心修复】：增加非空判断，防止 forEach 崩溃
watch(() => [form.owner_dept_ids, form.co_dept_ids], ([os, cs]) => {
  if (!form.dept_requirements) form.dept_requirements = {};
  if (!form.co_dept_requirements) form.co_dept_requirements = {};
  
  const nr: any = {}; 
  (os || []).forEach((id: any) => nr[id] = form.dept_requirements[id] || ''); 
  form.dept_requirements = nr;
  
  const ncr: any = {}; 
  (cs || []).forEach((id: any) => ncr[id] = form.co_dept_requirements[id] || ''); 
  form.co_dept_requirements = ncr;
}, { deep: true });

const open = (levelOrTask?: any, parentId?: string) => {
  if (typeof levelOrTask === 'number' && parentId) {
    // 下发模式：创建新任务，设置级别和父任务ID
    isEdit.value = false;
    editId.value = '';
    form.title = '';
    form.content = '';
    form.deadline = ''; // 这里设为空字符串，Store 会转为 null
    form.level = levelOrTask;
    form.parent_id = parentId;
    form.priority = 'MEDIUM';
    form.owner_dept_ids = [];
    form.co_dept_ids = [];
    form.dept_requirements = {};
    form.co_dept_requirements = {};
  } else if (levelOrTask) {
    // 修改模式
    isEdit.value = true;
    editId.value = levelOrTask.id;
    Object.assign(form, {
      ...levelOrTask,
      dept_requirements: safeParse(levelOrTask.dept_requirements, {}),
      co_dept_requirements: safeParse(levelOrTask.co_dept_requirements, {})
    });
  } else {
    // 新建模式：手动清空所有属性，确保没有 undefined
    isEdit.value = false;
    editId.value = '';
    form.title = '';
    form.content = '';
    form.deadline = ''; // 这里设为空字符串，Store 会转为 null
    form.level = 1;
    form.parent_id = null;
    form.priority = 'MEDIUM';
    form.owner_dept_ids = [];
    form.co_dept_ids = [];
    form.dept_requirements = {};
    form.co_dept_requirements = {};
  }
  visible.value = true;
};
// src/views/Task/components/TaskFormDialog.vue 中的 save 函数

const save = async () => {
  if (!form.title) return ElMessage.error('标题不能为空');
  
  isSaving.value = true;
  try {
    // 构造发往 store 的数据包
    const payload = { 
      ...form, 
      // 必须将对象转为 JSON 字符串
      dept_requirements: JSON.stringify(form.dept_requirements || {}),
      co_dept_requirements: JSON.stringify(form.co_dept_requirements || {})
    };
    
    if (isEdit.value) {
      await taskStore.updateTask(editId.value, payload);
    } else {
      await taskStore.createTask(payload);
    }
    
    visible.value = false;
    ElMessage.success('事项已保存并持久化');
  } catch (error) {
    ElMessage.error('保存至本地数据库失败');
  } finally {
    isSaving.value = false;
  }
};

defineExpose({ open });
</script>

<style scoped>
@import "../style.css";

/* 弹窗表单字号 */
:deep(.el-form-item__label) {
    font-size: 16px;
    font-weight: bold;
    color: #333;
}

:deep(.el-input__inner),
:deep(.el-textarea__inner) {
    font-size: 16px;
}

/* 分科要求录入盒 */
.dept-req-box {
    background-color: #f8faff;
    padding: 20px;
    border-radius: 8px;
    border: 1px dashed #409eff;
    margin: 15px 0 25px;
}

.dept-req-label {
    font-size: 15px;
    font-weight: bold;
    color: #0d2a61;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
}

.dept-req-label::before {
    content: "";
    width: 4px;
    height: 16px;
    background: #409eff;
    margin-right: 8px;
    display: inline-block;
}

.mb-3 {
    margin-bottom: 15px;
}

/* 弹窗底部按钮加大 */
.el-dialog__footer button {
    padding: 12px 30px;
    font-size: 16px;
}
</style>