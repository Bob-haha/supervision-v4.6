<template>
  <div class="desktop-container">
    <div class="desk-header">
      <span class="desk-title">督办管理</span>
    </div>

    <el-tabs v-model="activeTab" type="border-card" class="mt-3">
      <!-- Tab 1: 督办筛选 -->
      <el-tab-pane label="督办筛选" name="filter">
        <el-card shadow="never" class="filter-card">
          <el-form :inline="true" :model="filter" size="default">
            <el-form-item label="科室">
              <el-select v-model="filter.deptIds" multiple collapse-tags placeholder="全部" clearable style="width:200px">
                <el-option v-for="(name, id) in DEPT_MAP" :key="id" :label="name" :value="id" />
              </el-select>
            </el-form-item>
            <el-form-item label="来源">
              <el-select v-model="filter.source" placeholder="全部" clearable style="width:120px">
                <el-option v-for="(label, value) in TASK_SOURCE_MAP" :key="value" :label="label" :value="value" />
              </el-select>
            </el-form-item>
            <el-form-item label="标签">
              <el-select v-model="filter.tags" multiple collapse-tags placeholder="全部" clearable style="width:160px">
                <el-option v-for="tag in TASK_TAGS" :key="tag" :label="tag" :value="tag" />
              </el-select>
            </el-form-item>
            <el-form-item label="状态">
              <el-select v-model="filter.status" placeholder="全部" clearable style="width:100px">
                <el-option label="办理中" value="PENDING" />
                <el-option label="已办结" value="COMPLETED" />
                <el-option label="已逾期" value="OVERDUE" />
              </el-select>
            </el-form-item>
            <el-form-item label="时间">
              <el-date-picker v-model="filter.dateRange" type="daterange" range-separator="至"
                start-placeholder="开始" end-placeholder="结束" value-format="YYYY-MM-DD" style="width:240px" />
            </el-form-item>
            <el-form-item label="主办人">
              <el-input v-model="filter.handlerName" placeholder="姓名搜索" clearable style="width:130px" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" icon="Search" @click="doFilter">筛选</el-button>
              <el-button plain @click="resetFilter">重置</el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <!-- 操作栏 -->
        <div class="action-bar mt-3 flex-between" v-if="filteredTasks.length">
          <div>
            <el-checkbox v-model="selectAll" @change="onSelectAll">全选</el-checkbox>
            <span class="ml-2 text-gray">已选 {{ selectedIds.length }} / {{ filteredTasks.length }} 项</span>
          </div>
          <div>
            <el-button type="warning" size="small" icon="Bell" @click="openRemindDialog" :disabled="!selectedIds.length">
              批量催办 ({{ selectedIds.length }})
            </el-button>
            <el-button type="success" size="small" icon="Download" @click="doExport">导出CSV</el-button>
          </div>
        </div>

        <!-- 任务列表 -->
        <div class="task-list-card mt-2">
          <div class="doc-list">
            <div class="doc-item list-header">
              <span class="doc-check-head"></span>
              <span class="doc-title-head">事项标题</span>
              <span class="doc-sender-head">承办单位</span>
              <span class="doc-status-head">状态</span>
              <span class="doc-time-head">截止日期</span>
              <span class="doc-actions-head">操作</span>
            </div>
            <div v-for="t in filteredTasks" :key="t.id" class="doc-item">
              <span class="doc-check">
                <el-checkbox :model-value="selectedIds.includes(t.id)" @change="toggleSelect(t.id)" />
              </span>
              <span class="doc-title" :title="t.title">{{ t.title }}</span>
              <span class="doc-sender">{{ getDeptLabel(t) }}</span>
              <span class="doc-status" :class="getRealStatus(t)">{{ STATUS_MAP[getRealStatus(t)] }}</span>
              <span class="doc-time">{{ t.deadline || '-' }}</span>
              <div class="doc-actions">
                <el-button link type="primary" size="small" @click="markKeyTask(t)">{{ t.is_key_task ? '取消重点' : '标记重点' }}</el-button>
              </div>
            </div>
          </div>
          <el-empty v-if="!filteredTasks.length" description="点击筛选按钮查询任务" :image-size="80" />
        </div>
      </el-tab-pane>

      <!-- Tab 2: 办结分析 -->
      <el-tab-pane label="办结分析" name="completion">
        <AnalysisCharts type="completion" :data="completionData" />
      </el-tab-pane>

      <!-- Tab 3: 超期分析 -->
      <el-tab-pane label="超期分析" name="overdue">
        <AnalysisCharts type="overdue" :data="overdueData" />
      </el-tab-pane>
    </el-tabs>

    <RemindDialog ref="remindRef" :task-ids="selectedIds" @done="selectedIds = []; doFilter()" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { DEPT_MAP, STATUS_MAP, TASK_SOURCE_MAP, TASK_TAGS } from '@/constants';
import { useSupervisionStore } from '@/stores/supervision';
import { useTaskStore } from '@/stores/task';
import { exportTasksToCSV } from '@/utils/exportUtils';
import { ElMessage } from 'element-plus';
import RemindDialog from './components/RemindDialog.vue';
import AnalysisCharts from './components/AnalysisCharts.vue';

const supervisionStore = useSupervisionStore();
const taskStore = useTaskStore();
const activeTab = ref('filter');
const remindRef = ref();
const filteredTasks = ref<any[]>([]);
const selectedIds = ref<string[]>([]);
const selectAll = ref(false);

const filter = reactive({
  deptIds: [] as string[],
  source: '',
  tags: [] as string[],
  status: '',
  dateRange: [] as string[],
  handlerName: '',
});

const completionData = ref<any[]>([]);
const overdueData = ref<any[]>([]);

function doFilter() {
  filteredTasks.value = supervisionStore.getFilteredTasks({ ...filter });
  selectedIds.value = [];
  selectAll.value = false;
}

function resetFilter() {
  Object.assign(filter, { deptIds: [], source: '', tags: [], status: '', dateRange: [], handlerName: '' });
  doFilter();
}

function toggleSelect(id: string) {
  const idx = selectedIds.value.indexOf(id);
  if (idx > -1) selectedIds.value.splice(idx, 1);
  else selectedIds.value.push(id);
}

function onSelectAll(val: boolean) {
  selectedIds.value = val ? filteredTasks.value.map(t => t.id) : [];
}

function openRemindDialog() { remindRef.value?.open(); }

function doExport() {
  const data = selectedIds.value.length
    ? filteredTasks.value.filter(t => selectedIds.value.includes(t.id))
    : filteredTasks.value;
  exportTasksToCSV(data);
  ElMessage.success('导出成功');
}

function getDeptLabel(t: any) {
  const o = t.owner_dept_ids || [];
  return o.length ? (DEPT_MAP[o[0]] || o[0]) : '-';
}

function getRealStatus(t: any) {
  if (t.status === 'COMPLETED') return 'COMPLETED';
  const now = new Date().toISOString().split('T')[0];
  if (t.deadline && t.deadline < now) return 'OVERDUE';
  return 'PENDING';
}

async function markKeyTask(t: any) {
  await taskStore.updateTask(t.id, { ...t, is_key_task: t.is_key_task ? 0 : 1 });
  ElMessage.success(t.is_key_task ? '已取消重点标记' : '已标记为重点任务');
  doFilter();
}
</script>

<style scoped>
.desktop-container { padding: 10px; }
.desk-header { padding: 10px 5px; border-bottom: 1px solid #ddd; margin-bottom: 15px; }
.desk-title { font-weight: bold; color: #0d2a61; border-left: 5px solid #0d2a61; padding-left: 12px; font-size: 18px; }
.filter-card { background: #f8faff; border: 1px solid #eef2f8; }
.action-bar { padding: 12px; background: #fff; border: 1px solid #ebeef5; border-radius: 4px; }
.task-list-card { background: #fff; border: 1px solid #ddd; border-radius: 4px; min-height: 300px; }
.doc-list { }
.doc-item { display: flex; align-items: center; padding: 12px 15px; border-bottom: 1px solid #f0f0f0; }
.doc-item:hover { background-color: #f5f8ff; }
.list-header { background-color: #f8f9fa; font-weight: bold; color: #666; font-size: 14px; }
.doc-check-head { width: 40px; }
.doc-check { width: 40px; }
.doc-title-head, .doc-title { flex: 1; font-size: 15px; color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.doc-sender-head, .doc-sender { width: 140px; font-size: 14px; color: #666; }
.doc-status-head, .doc-status { width: 80px; text-align: center; }
.doc-time-head, .doc-time { width: 120px; text-align: right; color: #999; }
.doc-actions-head, .doc-actions { width: 110px; text-align: right; }
.flex-between { display: flex; justify-content: space-between; align-items: center; }
.mt-2 { margin-top: 10px; }
.mt-3 { margin-top: 15px; }
.ml-2 { margin-left: 8px; }
.text-gray { color: #999; font-size: 13px; }
</style>
