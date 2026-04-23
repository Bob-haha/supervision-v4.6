<template>
  <div class="desktop-container">
    <!-- 顶部标题与操作栏 -->
    <div class="desk-header">
      <div class="header-title-box">
        <span class="desk-title">{{ pageTitle }}</span>
      </div>
      <div class="header-actions">
        <!-- 只有具备管理权限的人才能发起立项 -->
        <el-button 
          v-if="hasAdminPower"
          type="primary" 
          size="default" 
          icon="Plus" 
          @click="dialogRef.open()"
        >发起督办立项</el-button>
      </div>
    </div>

    <!-- 【新增】多维度搜索过滤栏 -->
    <el-card class="filter-card" shadow="never">
      <el-form :inline="true" :model="searchForm" size="default">
        <el-form-item label="事项标题">
          <el-input v-model="searchForm.title" placeholder="模糊搜索标题" clearable style="width: 180px" />
        </el-form-item>

        <el-form-item label="任务类型">
          <el-select v-model="searchForm.level" placeholder="全部" clearable style="width: 100px">
            <el-option label="年度" :value="1" />
            <el-option label="阶段" :value="2" />
            <el-option label="科室" :value="3" />
          </el-select>
        </el-form-item>

        <el-form-item label="承办单位">
          <el-select v-model="searchForm.deptId" placeholder="选择科室" clearable filterable style="width: 180px">
            <el-option v-for="(name, id) in DEPT_MAP" :key="id" :label="name" :value="id" />
          </el-select>
        </el-form-item>

        <!-- 只有在非办结页面才显示“办理状态”筛选 -->
        <el-form-item label="状态" v-if="route.path !== '/dept-completed'">
          <el-select v-model="searchForm.status" placeholder="全部" clearable style="width: 100px">
            <el-option label="办理中" value="PENDING" />
            <el-option label="已逾期" value="OVERDUE" />
          </el-select>
        </el-form-item>

        <el-form-item label="发起日期">
          <el-date-picker
            v-model="searchForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始"
            end-placeholder="结束"
            value-format="YYYY-MM-DD"
            style="width: 240px"
          />
        </el-form-item>

        <el-form-item>
          <el-button type="info" plain @click="resetSearch">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 督办事项列表卡片 -->
    <div class="task-list-card mt-3">
      <div class="doc-list">
        <!-- 列表头 -->
        <div class="doc-item list-header">
          <span class="doc-tag-head">类型</span>
          <span class="doc-sender-head">承办单位</span>
          <span class="doc-title-head">督办事项标题</span>
          <span class="doc-status-head">办理状态</span>
          <span class="doc-time-head">发起时间</span>
          <span class="doc-actions-head">操作</span>
        </div>

        <!-- 数据行 -->
        <div 
          v-for="t in filteredTasks" 
          :key="t.id" 
          class="doc-item" 
          @click="drawerRef.open(t)"
        >
          <!-- 级别标记 -->
          <span class="doc-tag" :class="'tag-level-' + t.level">
            {{ t.level === 1 ? '年度' : t.level === 2 ? '阶段' : '科室' }}
          </span>
          
          <!-- 承办单位展示 -->
          <span class="doc-sender" :title="getDeptLabelFull(t)">
            {{ getDeptLabelBrief(t.owner_dept_ids, t.co_dept_ids) }}
          </span>
          
          <!-- 事项标题 -->
          <span class="doc-title" :title="t.title">{{ t.title }}</span>
          
          <!-- 状态展示（含实时逾期逻辑） -->
          <span class="doc-status" :class="getRealStatus(t)">
            {{ STATUS_MAP[getRealStatus(t)] }}
          </span>
          
          <!-- 发起时间 -->
          <span class="doc-time">{{ formatDate(t.created_at) }}</span>
          
          <!-- 操作区 -->
          <div class="doc-actions" @click.stop>
            <!-- 管理权限：修改、删除 -->
            <template v-if="hasAdminPower">
              <el-button v-if="t.level < 3" link type="primary" @click="dialogRef.open(t.level + 1, t.id)">下发</el-button>
              <el-button link type="warning" @click="dialogRef.open(t)">修改</el-button>
              <el-button link type="danger" @click="handleDel(t.id)">删除</el-button>
            </template>
            <!-- 所有人：查看进展 -->
            <el-button link type="primary" @click="drawerRef.open(t)">进展</el-button>
          </div>
        </div>

        <!-- 空状态 -->
        <el-empty v-if="!filteredTasks.length" description="暂无符合条件的督办事项" :image-size="100" />
      </div>
    </div>

    <!-- 子组件引用 -->
    <TaskFormDialog ref="dialogRef" />
    <TaskDetailDrawer ref="drawerRef" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue';
import { useRoute } from 'vue-router';
import { useTaskStore } from '@/stores/task';
import { useAuthStore } from '@/stores/auth';
import { DEPT_MAP, STATUS_MAP } from '@/constants';
import { formatDate } from '@/utils';
import { ElMessageBox, ElMessage } from 'element-plus';
import TaskFormDialog from './components/TaskFormDialog.vue';
import TaskDetailDrawer from './components/TaskDetailDrawer.vue';
import './style.css'; // 引用刚才定义的对齐样式

const route = useRoute();
const taskStore = useTaskStore();
const authStore = useAuthStore();

const dialogRef = ref();
const drawerRef = ref();

// --- 搜索表单状态 ---
const searchForm = reactive({
  title: '',
  level: null as number | null,
  deptId: '',
  status: '',
  dateRange: [] as string[]
});

const resetSearch = () => {
  Object.assign(searchForm, { title: '', level: null, deptId: '', status: '', dateRange: [] });
};

// --- 核心权限判定：管理员、领导 或 办公室(dept_02) ---
const hasAdminPower = computed(() => {
  const user = authStore.user;
  if (!user) return false;
  return user.role !== 'STAFF' || user.deptId === 'dept_02';
});

// --- 页面标题联动 ---
const pageTitle = computed(() => {
  const pathMap: any = { 
    '/host': '科室主办事项', 
    '/Co-organized': '科室协办事项',
    '/dept-completed': '科室办结事项(已销号)'
  };
  if (pathMap[route.path]) return pathMap[route.path];
  const ql = route.query.level;
  return ql === '1' ? '年度重点督办' : ql === '2' ? '阶段分解任务' : '全部督办事项';
});

// --- 核心逻辑：数据过滤流 (含状态隔离与搜索叠加) ---
const filteredTasks = computed(() => {
  let list = [...(taskStore.tasks || [])];
  const myDeptId = authStore.user?.deptId || '';
  const path = route.path;

  // 1. 基础维度过滤：隔离“办理中”与“已办结”
  if (path === '/dept-completed') {
    // 页面 A：科室办结事项 (必须已办结 + 与我科室相关)
    list = list.filter(t => 
      t.status === 'COMPLETED' && 
      ((t.owner_dept_ids || []).includes(myDeptId) || (t.co_dept_ids || []).includes(myDeptId))
    );
  } else {
    // 页面 B：其他所有页面均不显示已办结项
    list = list.filter(t => t.status !== 'COMPLETED');

    // 针对具体路由的二次过滤
    if (path === '/host') {
      list = list.filter(t => t.owner_dept_ids?.includes(myDeptId));
    } else if (path === '/Co-organized') {
      list = list.filter(t => t.co_dept_ids?.includes(myDeptId));
    } else if (route.query.level) {
      list = list.filter(t => t.level === Number(route.query.level));
    }

    // 关员权限额外限制：只能看自己参与的任务 (除非是公开的 L1/L2)
    if (authStore.user?.role === 'STAFF') {
      list = list.filter(t => 
        t.level < 3 || 
        t.owner_dept_ids?.includes(myDeptId) || 
        t.co_dept_ids?.includes(myDeptId)
      );
    }
  }

  // 2. 搜索表单叠加过滤
  if (searchForm.title) {
    list = list.filter(t => t.title.toLowerCase().includes(searchForm.title.toLowerCase()));
  }
  if (searchForm.level) {
    list = list.filter(t => t.level === searchForm.level);
  }
  if (searchForm.deptId) {
    list = list.filter(t => 
      t.owner_dept_ids?.includes(searchForm.deptId) || 
      t.co_dept_ids?.includes(searchForm.deptId)
    );
  }
  if (searchForm.status && path !== '/dept-completed') {
    list = list.filter(t => getRealStatus(t) === searchForm.status);
  }
  if (searchForm.dateRange && searchForm.dateRange.length === 2) {
    const [start, end] = searchForm.dateRange;
    list = list.filter(t => {
      const d = t.created_at.split('T')[0];
      return d >= start && d <= end;
    });
  }

  return list;
});

// --- 工具函数 ---

// 实时状态判定 (用于列表显示和筛选)
const getRealStatus = (t: any) => {
  if (t.status === 'COMPLETED') return 'COMPLETED';
  const now = new Date().toISOString().split('T')[0];
  if (t.deadline && t.deadline < now) return 'OVERDUE';
  return 'PENDING';
};

// 列表简要部门显示
const getDeptLabelBrief = (o: any[] = [], c: any[] = []) => {
  let l = o.length ? (DEPT_MAP[o[0]] || o[0]) : '统筹';
  if (o.length > 1) l += '等';
  if (c && c.length > 0) l += '(协)';
  return l;
};

// 鼠标悬停完整显示
const getDeptLabelFull = (t: any) => {
  const os = t.owner_dept_ids.map((id:string) => DEPT_MAP[id] || id).join('、');
  const cs = t.co_dept_ids.map((id:string) => DEPT_MAP[id] || id).join('、');
  return `主办：${os || '无'}\n协办：${cs || '无'}`;
};

const handleDel = (id: string) => {
  ElMessageBox.confirm('删除操作将永久抹除该任务及其所有办理留痕，确定继续吗？', '严重警告', {
    confirmButtonText: '确定删除',
    cancelButtonText: '取消',
    type: 'error'
  }).then(async () => {
    await taskStore.deleteTask(id);
    ElMessage.success('数据已彻底删除');
  });
};

onMounted(() => {
  taskStore.fetchTasks();
});
</script>

<style scoped>
.filter-card {
  margin-top: 10px;
  background-color: #f8faff;
  border: 1px solid #eef2f8;
}

.mt-3 { margin-top: 15px; }

/* 调整搜索框间的距离 */
:deep(.el-form-item) {
  margin-right: 20px;
  margin-bottom: 10px;
}

/* 按钮图标与文字间距 */
.el-button .el-icon {
  margin-right: 4px;
}
</style>