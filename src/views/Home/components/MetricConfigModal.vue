<template>
  <el-dialog :model-value="visible" title="自定义指标" width="600px" @update:model-value="$emit('update:visible', $event)">
    <div class="config-body">
      <div class="config-left">
        <h4>可选指标</h4>
        <el-checkbox-group v-model="selected">
          <div v-for="m in availableMetrics" :key="m.id" class="metric-option">
            <el-checkbox :label="m.id">{{ m.name }}</el-checkbox>
            <el-tag size="small" :type="m.level === 'customs_level' ? '' : 'info'">{{ m.level === 'customs_level' ? '关级' : '科级' }}</el-tag>
          </div>
        </el-checkbox-group>
      </div>
    </div>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button type="primary" @click="saveConfig">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useConfigStore } from '@/stores/config'
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'

const props = defineProps<{ visible: boolean; level: string }>()
const emit = defineEmits<{ 'update:visible': [boolean] }>()

const configStore = useConfigStore()
const authStore = useAuthStore()

const availableMetrics = computed(() => configStore.metricDefinitions.filter(m => m.level === (props.level === 'customs' ? 'customs_level' : 'section_level')))
const selected = ref<string[]>([])

watch(() => props.visible, async (v) => {
  if (v) {
    await configStore.fetchMetricDefinitions()
    const userId = authStore.user?.id || ''
    const uc = await configStore.getUserDashboardConfig(userId)
    const metrics = props.level === 'customs' ? uc?.customsMetrics : uc?.sectionMetrics
    selected.value = metrics || availableMetrics.value.filter(m => m.isRecommended).map(m => m.id)
  }
})

async function saveConfig() {
  const userId = authStore.user?.id || ''
  let uc = await configStore.getUserDashboardConfig(userId)
  if (!uc) {
    uc = { userId, customsMetrics: [], sectionMetrics: [], tabs: [], activeTabId: '', layout: 'grid' }
  }
  if (props.level === 'customs') {
    uc.customsMetrics = selected.value
  } else {
    uc.sectionMetrics = selected.value
  }
  await configStore.saveUserDashboardConfig(uc)
  ElMessage.success('指标配置已保存')
  emit('update:visible', false)
}
</script>

<style scoped>
.config-body { display: flex; gap: 16px; }
.config-left { flex: 1; }
.config-left h4 { margin-bottom: 8px; font-size: 14px; }
.metric-option { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
</style>
