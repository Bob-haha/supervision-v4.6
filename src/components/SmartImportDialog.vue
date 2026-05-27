<template>
  <el-dialog
    v-model="visible"
    title="智能导入 - 从文本生成任务"
    width="900px"
    top="3vh"
    destroy-on-close
  >
    <div class="smart-import-body">
      <!-- 粘贴区域 -->
      <div class="paste-section">
        <div class="section-label">请粘贴公文、邮件或通知内容：</div>
        <el-input
          v-model="rawText"
          type="textarea"
          :rows="8"
          placeholder="例如：请综合科于6月30日前完成材料汇总，贸易科完成数据统计，监管科完成现场核查。"
        />
        <el-button type="primary" class="mt-2" @click="doParse" :loading="isParsing">
          解析内容
        </el-button>
      </div>

      <!-- 解析预览 -->
      <div v-if="parseResult && parseResult.workItems.length > 0" class="preview-section mt-4">
        <el-divider>解析预览</el-divider>

        <el-descriptions :column="2" border size="small" class="mb-3">
          <el-descriptions-item label="任务来源">
            <el-tag>{{ TASK_SOURCE_MAP[parseResult.source] || parseResult.source }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="默认时限">{{ parseResult.defaultDeadline || '未识别' }}</el-descriptions-item>
        </el-descriptions>

        <el-table :data="editableItems" border size="small" max-height="350">
          <el-table-column prop="title" label="事项标题" min-width="180">
            <template #default="{ row, $index }">
              <el-input v-model="editableItems[$index].title" size="small" />
            </template>
          </el-table-column>
          <el-table-column prop="department" label="责任部门" width="160">
            <template #default="{ row, $index }">
              <el-select v-model="editableItems[$index].department" size="small" filterable clearable>
                <el-option v-for="(name, id) in DEPT_MAP" :key="id" :label="name" :value="id" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column prop="deadline" label="办结时限" width="140">
            <template #default="{ row, $index }">
              <el-date-picker
                v-model="editableItems[$index].deadline"
                type="date"
                value-format="YYYY-MM-DD"
                size="small"
                style="width:100%"
              />
            </template>
          </el-table-column>
          <el-table-column width="60" align="center">
            <template #default="{ $index }">
              <el-button link type="danger" size="small" icon="Delete" @click="removeItem($index)" />
            </template>
          </el-table-column>
        </el-table>

        <div class="flex-between mt-3">
          <el-button size="small" icon="Plus" @click="addItem">添加事项</el-button>
          <div>
            <span class="text-gray mr-2">将创建 {{ editableItems.length > 1 ? '1个主任务 + ' + editableItems.length + '个子任务' : '1个任务' }}</span>
          </div>
        </div>
      </div>

      <el-empty v-else-if="parseResult" description="未能解析出有效事项，请检查文本内容" :image-size="80" />
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button
        type="primary"
        @click="doImport"
        :disabled="!editableItems.length"
        :loading="isImporting"
      >
        确认导入 ({{ editableItems.length }} 项)
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { DEPT_MAP, TASK_SOURCE_MAP } from '@/constants';
import { useTaskStore } from '@/stores/task';
import { parseSmartImport } from '@/utils/smartParser';
import type { ParseResult } from '@/types';
import { ElMessage } from 'element-plus';

const taskStore = useTaskStore();
const visible = ref(false);
const rawText = ref('');
const isParsing = ref(false);
const isImporting = ref(false);
const parseResult = ref<ParseResult | null>(null);

interface EditableItem {
  title: string;
  department: string;
  deadline: string;
}

const editableItems = ref<EditableItem[]>([]);

function doParse() {
  if (!rawText.value.trim()) return ElMessage.warning('请输入文本内容');
  isParsing.value = true;
  try {
    parseResult.value = parseSmartImport(rawText.value);
    editableItems.value = parseResult.value.workItems.map(item => ({
      title: item.title,
      department: item.department,
      deadline: item.deadline,
    }));
    if (editableItems.value.length === 0) {
      ElMessage.info('未能解析出事项，请尝试更明确的文本格式');
    }
  } finally {
    isParsing.value = false;
  }
}

function addItem() {
  editableItems.value.push({
    title: '',
    department: editableItems.value[0]?.department || '',
    deadline: parseResult.value?.defaultDeadline || '',
  });
}

function removeItem(index: number) {
  editableItems.value.splice(index, 1);
}

async function doImport() {
  const validItems = editableItems.value.filter(i => i.title.trim());
  if (!validItems.length) return ElMessage.error('至少需要一个有效事项');

  isImporting.value = true;
  try {
    if (validItems.length === 1) {
      await taskStore.createTask({
        title: validItems[0].title,
        content: rawText.value,
        owner_dept_ids: validItems[0].department ? [validItems[0].department] : [],
        deadline: validItems[0].deadline,
        source: parseResult.value?.source || 'OTHER',
        tags: ['智能导入'],
      });
    } else {
      // 创建主任务 + 子任务
      await taskStore.createTask({
        title: parseResult.value?.mainTitle || validItems[0].title,
        content: rawText.value,
        owner_dept_ids: [],
        deadline: parseResult.value?.defaultDeadline || '',
        source: parseResult.value?.source || 'OTHER',
        tags: ['智能导入'],
        level: 1,
      });

      // 找到刚创建的主任务
      const allTasks = taskStore.tasks;
      const parentTask = allTasks[0]; // 最新创建的

      if (parentTask) {
        for (const item of validItems) {
          await taskStore.createTask({
            title: item.title,
            parentId: parentTask.id,
            level: 3,
            owner_dept_ids: item.department ? [item.department] : [],
            deadline: item.deadline,
            source: parseResult.value?.source || 'OTHER',
            tags: ['智能导入', '子任务'],
          });
        }
      }
    }

    visible.value = false;
    rawText.value = '';
    parseResult.value = null;
    editableItems.value = [];
    ElMessage.success(`成功导入 ${validItems.length} 个任务`);
  } finally {
    isImporting.value = false;
  }
}

function open() {
  visible.value = true;
}

defineExpose({ open });
</script>

<style scoped>
.smart-import-body {
  padding: 0 10px;
}
.paste-section {
  background: #f8faff;
  padding: 20px;
  border-radius: 8px;
  border: 1px dashed #409eff;
}
.section-label {
  font-size: 15px;
  font-weight: bold;
  color: #0d2a61;
  margin-bottom: 10px;
}
.preview-section {
  padding: 10px 0;
}
.flex-between {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.mt-2 { margin-top: 12px; }
.mt-3 { margin-top: 15px; }
.mt-4 { margin-top: 20px; }
.mb-3 { margin-bottom: 12px; }
.mr-2 { margin-right: 8px; }
.text-gray { color: #999; font-size: 13px; }
</style>
