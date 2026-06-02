<template>
  <el-dialog :model-value="visible" title="高级配置" width="600px" @update:model-value="$emit('update:visible', $event)">
    <el-form label-width="80px" size="small">
      <el-form-item label="任务类型">
        <el-select v-model="localFilters.taskTypeIds" multiple placeholder="全部" clearable style="width: 100%">
          <el-option v-for="t in taskTypes" :key="t.id" :label="t.name" :value="t.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="localFilters.statuses" multiple placeholder="全部" clearable style="width: 100%">
          <el-option label="待处理" value="pending" />
          <el-option label="进行中" value="in_progress" />
          <el-option label="已完成" value="completed" />
        </el-select>
      </el-form-item>
      <el-form-item label="关键词">
        <el-input v-model="localFilters.keyword" placeholder="搜索标题" clearable />
      </el-form-item>
      <el-form-item label="时间范围">
        <el-date-picker v-model="timeRange" type="daterange" range-separator="至" start-placeholder="开始" end-placeholder="结束" value-format="YYYY-MM-DD" style="width: 100%" />
      </el-form-item>
      <el-form-item label="排序">
        <el-select v-model="localSortBy.field" style="width: 140px">
          <el-option label="截止日期" value="deadline" />
          <el-option label="创建时间" value="createdAt" />
          <el-option label="标题" value="title" />
        </el-select>
        <el-select v-model="localSortBy.order" style="width: 80px; margin-left: 8px">
          <el-option label="升序" value="asc" />
          <el-option label="降序" value="desc" />
        </el-select>
      </el-form-item>
    </el-form>
    <div class="preview-summary">
      符合条件任务 <strong>{{ previewCount }}</strong> 个，逾期 <strong class="text-danger">{{ previewOverdue }}</strong> 个
    </div>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">关闭</el-button>
      <el-button type="primary" @click="applyFilter">应用</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, reactive } from 'vue'
import { useTaskStore } from '@/stores/task'
import { useConfigStore } from '@/stores/config'
import { useDashboardStore } from '@/stores/dashboard'

const props = defineProps<{ visible: boolean; filters: any; sortBy: any }>()
const emit = defineEmits<{ 'update:visible': [boolean]; apply: [filters: any, sortBy: any] }>()

const taskStore = useTaskStore()
const configStore = useConfigStore()
const dashStore = useDashboardStore()
const taskTypes = computed(() => configStore.taskTypes)

const localFilters = reactive<Record<string, any>>({ taskTypeIds: [], statuses: [], keyword: '' })
const localSortBy = reactive({ field: 'deadline', order: 'asc' as 'asc' | 'desc' })
const timeRange = ref<[string, string] | null>(null)

watch(() => props.visible, (v) => {
  if (v) {
    Object.assign(localFilters, { taskTypeIds: [], statuses: [], keyword: '', ...props.filters })
    Object.assign(localSortBy, props.sortBy || { field: 'deadline', order: 'asc' })
  }
})

const previewCount = computed(() => {
  let list = taskStore.tasks
  if (localFilters.taskTypeIds?.length) list = list.filter(t => localFilters.taskTypeIds.includes(t.taskTypeId || ''))
  if (localFilters.statuses?.length) list = list.filter(t => localFilters.statuses.includes(t.status))
  if (localFilters.keyword) {
    const kw = localFilters.keyword.toLowerCase()
    list = list.filter(t => t.title.toLowerCase().includes(kw))
  }
  return list.length
})

const previewOverdue = computed(() => {
  let list = taskStore.tasks
  if (localFilters.taskTypeIds?.length) list = list.filter(t => localFilters.taskTypeIds.includes(t.taskTypeId || ''))
  return list.filter(t => dashStore.getDeadlineStatus(t.deadline) === 'overdue').length
})

function applyFilter() {
  const filters = {
    taskTypeIds: localFilters.taskTypeIds,
    statuses: localFilters.statuses,
    keyword: localFilters.keyword,
    timeRange: timeRange.value ? { start: timeRange.value[0], end: timeRange.value[1] } : null,
  }
  emit('apply', filters, { ...localSortBy })
  emit('update:visible', false)
}
</script>

<style scoped>
.preview-summary { padding: 10px; background: #fafaf7; border-radius: 4px; margin-top: 8px; font-size: 13px; }
.text-danger { color: #F5222D; }
</style>
