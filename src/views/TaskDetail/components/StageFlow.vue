<template>
  <el-card shadow="never" class="stage-card">
    <template #header><span class="section-title">环节流程</span></template>
    <div class="stage-steps">
      <template v-for="(stage, i) in stages" :key="i">
        <span class="stage-node" :class="stageClass(i)">{{ stage.name }}</span>
        <span v-if="i < stages.length - 1" class="stage-arrow">→</span>
      </template>
      <el-empty v-if="!stages.length" description="未配置流程" :image-size="40">
        <el-button v-if="task.status !== 'completed'" size="small" type="success" @click="doProgress(0, '直接完成')">✅ 直接完成任务</el-button>
      </el-empty>
    </div>

    <!-- 当前环节操作按钮 -->
    <div v-if="currentStage" class="current-stage-actions">
      <div class="current-label">当前环节：<strong>{{ currentStage.name }}</strong></div>
      <div class="options-row">
        <el-button
          v-for="(opt, i) in (currentStage.options || [])"
          :key="i"
          size="small"
          type="primary"
          @click="doProgress(opt.nextStageIndex, opt.label)"
        >
          {{ opt.label }}
        </el-button>
        <el-button
          v-if="(currentStage.options || []).length === 0"
          size="small"
          type="success"
          @click="doProgress(stages.length, '完成')"
        >
          {{ isLastStage ? '✅ 完成任务' : '▶ 推进到下一环节' }}
        </el-button>
      </div>
      <!-- 资源配置 -->
      <div v-if="(currentStage.options || []).some(o => o.resources)" class="resources">
        <span v-for="(opt, i) in (currentStage.options || [])" :key="'r'+i">
          <template v-if="opt.resources?.templates?.length">
            <el-button size="small" link>📋 参考模板</el-button>
          </template>
          <template v-if="opt.resources?.policies?.length">
            <el-button size="small" link>📜 制度依据</el-button>
          </template>
          <template v-if="opt.resources?.links?.length">
            <el-button size="small" link>🔗 外部链接</el-button>
          </template>
        </span>
      </div>
    </div>
    <!-- 任务已完成 -->
    <div v-else-if="task.status === 'completed'" class="completed-notice">
      ✅ 此任务已于 {{ task.updatedAt?.substring(0, 10) || '' }} 完成
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { SupervisionTask, StageSnapshot } from '@/types'
import { DatabaseManager } from '@/core/database/DatabaseManager'

const props = defineProps<{ task: SupervisionTask }>()
const emit = defineEmits<{ progress: [nextStageIndex: number, optionLabel: string] }>()

const db = DatabaseManager.getInstance()
const fallbackStages = ref<StageSnapshot[]>([])

// 从多个数据源获取流程环节
const stages = computed<StageSnapshot[]>(() => {
  // 1. 优先使用 stagesSnapshot
  if (props.task.stagesSnapshot && props.task.stagesSnapshot.length > 0) {
    return props.task.stagesSnapshot
  }
  // 2. 回退：从 task_process_nodes 表加载
  if (fallbackStages.value.length > 0) {
    return fallbackStages.value
  }
  // 3. 尝试从流程模板获取
  if (props.task.flowTemplateId) {
    loadFromTemplate(props.task.flowTemplateId)
  }
  return []
})

const currentIdx = computed(() => props.task.currentStageIndex ?? 0)

const currentStage = computed(() => {
  if (stages.value.length && currentIdx.value >= 0 && currentIdx.value < stages.value.length) {
    return stages.value[currentIdx.value]
  }
  return null
})

const isLastStage = computed(() => stages.value.length > 0 && currentIdx.value >= stages.value.length - 1)

function loadFromTemplate(templateId: string) {
  try {
    // 从 flow_templates 读取 stages
    const tmpl = db.query<any>('SELECT stages FROM flow_templates WHERE id=?', [templateId])
    if (tmpl[0]?.stages) {
      const parsed = typeof tmpl[0].stages === 'string' ? JSON.parse(tmpl[0].stages) : tmpl[0].stages
      if (Array.isArray(parsed) && parsed.length > 0) {
        fallbackStages.value = parsed
        return
      }
    }
  } catch (_) {}
  // 回退到 process_nodes
  try {
    const nodes = db.query<any>(
      'SELECT node_name, node_description, sort_order FROM process_nodes WHERE template_id=? ORDER BY sort_order ASC',
      [templateId],
    )
    if (nodes.length > 0) {
      fallbackStages.value = nodes.map((n: any, i: number) => ({
        stageIndex: i, name: n.node_name, description: n.node_description, options: [],
      }))
      return
    }
  } catch (_) {}
  // 再回退到 task_process_nodes
  try {
    const nodes = db.query<any>(
      'SELECT node_name, node_description, sort_order FROM task_process_nodes WHERE task_id=? ORDER BY sort_order ASC',
      [props.task.id],
    )
    if (nodes.length > 0) {
      fallbackStages.value = nodes.map((n: any, i: number) => ({
        stageIndex: i, name: n.node_name, description: n.node_description, options: [],
      }))
    }
  } catch (_) {}
}

function stageClass(i: number) {
  if (i < currentIdx.value) return 'done'
  if (i === currentIdx.value) return 'current'
  return 'pending'
}

function doProgress(nextIdx: number, label: string) {
  emit('progress', nextIdx, label)
}

onMounted(() => {
  if (!props.task.stagesSnapshot || props.task.stagesSnapshot.length === 0) {
    if (props.task.flowTemplateId) loadFromTemplate(props.task.flowTemplateId)
    else {
      // 尝试从 task_process_nodes 加载
      try {
        const nodes = db.query<any>(
          'SELECT node_name, node_description, sort_order FROM task_process_nodes WHERE task_id=? ORDER BY sort_order ASC',
          [props.task.id],
        )
        if (nodes.length > 0) {
          fallbackStages.value = nodes.map((n: any, i: number) => ({
            stageIndex: i, name: n.node_name, description: n.node_description, options: [],
          }))
        }
      } catch (_) {}
    }
  }
})
</script>

<style scoped>
.stage-card { margin-bottom: 14px; }
.section-title { font-weight: 600; font-size: 14px; }
.stage-steps { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-bottom: 12px; }
.stage-node { padding: 4px 12px; border-radius: 3px; font-size: 13px; }
.stage-node.done { background: #e8f5e9; color: #2d6a3f; }
.stage-node.current { background: #1a3550; color: #fff; font-weight: 600; }
.stage-node.pending { background: #f0ede8; color: var(--text-secondary); }
.stage-arrow { color: #b0a99e; font-size: 11px; }
.current-stage-actions { margin-top: 8px; padding: 10px; background: #fafaf7; border-radius: 4px; }
.current-label { margin-bottom: 6px; font-size: 14px; }
.options-row { display: flex; gap: 6px; flex-wrap: wrap; }
.resources { margin-top: 6px; display: flex; gap: 8px; }
</style>
