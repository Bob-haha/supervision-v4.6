<template>
  <div class="browser-tabs">
    <div class="tabs-row">
      <span
        v-for="tab in tabs"
        :key="tab.id"
        class="tab-item"
        :class="{ active: tab.id === modelValue }"
        @click="onTabClick(tab)"
      >
        <span class="tab-label" @dblclick="startRename(tab)">{{ editingId === tab.id ? '' : tab.label }}</span>
        <input
          v-if="editingId === tab.id"
          v-model="editingLabel"
          class="tab-edit-input"
          @blur="finishRename(tab)"
          @keydown.enter="finishRename(tab)"
          @click.stop
          ref="editInput"
        />
        <span v-if="!tab.config.isDefault" class="tab-close" @click.stop="closeTab(tab)">&times;</span>
      </span>
      <button class="tab-add" @click="addTab" title="新建标签页">+</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'
import type { DashboardTab } from '@/types'

const props = defineProps<{
  modelValue: string
  tabs: DashboardTab[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:tabs': [tabs: DashboardTab[]]
}>()

const editingId = ref<string | null>(null)
const editingLabel = ref('')
let counter = 1

function onTabClick(tab: DashboardTab) {
  emit('update:modelValue', tab.id)
}

function addTab() {
  const id = 'tab-custom-' + Date.now()
  const newTab: DashboardTab = {
    id,
    label: `新标签 ${counter++}`,
    type: 'customs_task_list',
    config: { columns: ['title', 'taskType', 'department', 'deadline', 'progress'], filters: {}, sortBy: { field: 'deadline', order: 'asc' }, isDefault: false },
  }
  const newTabs = [...props.tabs, newTab]
  emit('update:tabs', newTabs)
  emit('update:modelValue', id)
}

function closeTab(tab: DashboardTab) {
  if (props.tabs.length <= 1) return
  const idx = props.tabs.findIndex(t => t.id === tab.id)
  const newTabs = props.tabs.filter(t => t.id !== tab.id)
  emit('update:tabs', newTabs)
  if (tab.id === props.modelValue) {
    const next = newTabs[Math.min(idx, newTabs.length - 1)]
    if (next) emit('update:modelValue', next.id)
  }
}

function startRename(tab: DashboardTab) {
  editingId.value = tab.id
  editingLabel.value = tab.label
  nextTick(() => {
    const inp = document.querySelector('.tab-edit-input') as HTMLInputElement
    inp?.focus()
    inp?.select()
  })
}

function finishRename(tab: DashboardTab) {
  if (editingLabel.value.trim()) {
    tab.label = editingLabel.value.trim()
    emit('update:tabs', [...props.tabs])
  }
  editingId.value = null
}
</script>

<style scoped>
.browser-tabs { margin-bottom: 8px; }
.tabs-row { display: flex; align-items: center; gap: 1px; border-bottom: 1px solid var(--border-color); flex-wrap: wrap; min-height: 34px; }
.tab-item { display: inline-flex; align-items: center; gap: 4px; padding: 6px 10px; cursor: pointer; font-size: 13px; color: var(--text-secondary); background: #f5f2ed; border: 1px solid var(--border-light); border-bottom-color: var(--border-color); border-radius: 3px 3px 0 0; margin-bottom: -1px; user-select: none; }
.tab-item:hover { background: #fafaf7; }
.tab-item.active { background: #fff; color: var(--text-primary); font-weight: 600; border-bottom-color: #fff; }
.tab-close { width: 16px; height: 16px; border-radius: 50%; font-size: 11px; display: flex; align-items: center; justify-content: center; margin-left: 2px; }
.tab-close:hover { background: #ddd; }
.tab-add { width: 28px; height: 28px; border: 1px solid transparent; background: transparent; cursor: pointer; font-size: 18px; color: var(--text-muted); border-radius: 3px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.tab-add:hover { background: #e8e4dc; }
.tab-edit-input { width: 80px; padding: 1px 4px; font-size: 13px; border: 1px solid var(--border-color); border-radius: 2px; outline: none; }
</style>
