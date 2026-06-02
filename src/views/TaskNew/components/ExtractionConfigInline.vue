<template>
  <div class="extraction-config">
    <el-form-item label="目标URL">
      <el-input v-model="localConfig.targetUrl" placeholder="https://..." size="small" />
    </el-form-item>
    <el-form-item label="执行人">
      <el-input v-model="localConfig.executorId" placeholder="指定执行人" size="small" />
    </el-form-item>
    <el-form-item label="提取模式">
      <el-select v-model="localConfig.schedule.mode" size="small" style="width: 160px">
        <el-option label="手动" value="manual" />
        <el-option label="自动（定时）" value="auto" />
      </el-select>
      <el-input-number v-if="localConfig.schedule.mode === 'auto'" v-model="localConfig.schedule.intervalMinutes" :min="1" :max="1440" size="small" style="width: 120px; margin-left: 8px" /> 分钟
    </el-form-item>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import type { ExtractionConfig } from '@/types'

const props = defineProps<{ modelValue: ExtractionConfig | null }>()
const emit = defineEmits<{ 'update:modelValue': [v: ExtractionConfig | null] }>()

const localConfig = reactive<ExtractionConfig>({
  enabled: true,
  executorId: '',
  targetUrl: '',
  domMappings: [],
  schedule: { mode: 'manual' },
})

watch(() => props.modelValue, (v) => {
  if (v) Object.assign(localConfig, v)
}, { immediate: true })

watch(localConfig, (v) => emit('update:modelValue', { ...v }), { deep: true })
</script>
