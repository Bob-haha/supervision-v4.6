<template>
  <div class="config-page">
    <el-row :gutter="16">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>
            <div class="page-header">
              <h3>一级分类</h3>
              <el-button size="small" type="primary" @click="addGroupVisible=true">+ 新增</el-button>
            </div>
          </template>
          <div v-for="g in groups" :key="g.id" class="list-item" :class="{ active: selectedGroup === g.id }" @click="selectedGroup = g.id">
            {{ g.name }}
            <span class="text-muted">({{ getTypeCount(g.id) }})</span>
            <el-button size="small" type="danger" @click.stop="delGroup(g.id)" :disabled="getTypeCount(g.id) > 0" style="float:right">删除</el-button>
          </div>
          <el-empty v-if="!groups.length" description="暂无分类" :image-size="40" />
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>
            <div class="page-header">
              <h3>二级类型</h3>
              <el-button v-if="selectedGroup" size="small" type="primary" @click="addTypeVisible=true">+ 新增</el-button>
            </div>
          </template>
          <el-table v-if="selectedGroup" :data="currentTypes" stripe size="small">
            <el-table-column prop="name" label="名称" width="140" />
            <el-table-column label="默认流程" width="120">
              <template #default="{ row }">{{ getFlowName(row.defaultFlowTemplateId) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="60">
              <template #default="{ row }">
                <el-button size="small" type="danger" @click="delType(row.id)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!selectedGroup" description="选择左侧分类" :image-size="40" />
        </el-card>
      </el-col>
    </el-row>

    <!-- 标签管理 -->
    <el-row :gutter="16" style="margin-top:16px">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>
            <div class="page-header"><h3>标签组</h3><el-button size="small" type="primary" @click="addTagGroupVisible=true">+ 新增</el-button></div>
          </template>
          <div v-for="tg in tagGroups" :key="tg.id" class="list-item" :class="{ active: selectedTagGroup === tg.id }" @click="selectedTagGroup = tg.id">
            {{ tg.name }}
            <el-button size="small" type="danger" @click.stop="delTagGroup(tg.id)" style="float:right">删除</el-button>
          </div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>
            <div class="page-header"><h3>标签</h3><el-button v-if="selectedTagGroup" size="small" type="primary" @click="addTagVisible=true">+ 新增</el-button></div>
          </template>
          <div v-for="t in currentTags" :key="t.id" class="list-item">
            {{ t.name }}
            <el-button size="small" type="danger" @click.stop="delTag(t.id)" style="float:right">删除</el-button>
          </div>
          <el-empty v-if="!selectedTagGroup" description="选择标签组" :image-size="40" />
        </el-card>
      </el-col>
    </el-row>

    <!-- 一级分类对话框 -->
    <el-dialog v-model="addGroupVisible" title="新增一级分类" width="400px">
      <el-input v-model="newGroupName" placeholder="分类名称" />
      <template #footer><el-button @click="addGroupVisible=false">取消</el-button><el-button type="primary" @click="doAddGroup">保存</el-button></template>
    </el-dialog>

    <!-- 二级类型对话框 -->
    <el-dialog v-model="addTypeVisible" title="新增二级类型" width="400px">
      <el-input v-model="newTypeName" placeholder="类型名称" />
      <template #footer><el-button @click="addTypeVisible=false">取消</el-button><el-button type="primary" @click="doAddType">保存</el-button></template>
    </el-dialog>

    <!-- 标签组对话框 -->
    <el-dialog v-model="addTagGroupVisible" title="新增标签组" width="400px">
      <el-input v-model="newTagGroupName" placeholder="标签组名称" />
      <template #footer><el-button @click="addTagGroupVisible=false">取消</el-button><el-button type="primary" @click="doAddTagGroup">保存</el-button></template>
    </el-dialog>

    <!-- 标签对话框 -->
    <el-dialog v-model="addTagVisible" title="新增标签" width="400px">
      <el-input v-model="newTagName" placeholder="标签名称" />
      <template #footer><el-button @click="addTagVisible=false">取消</el-button><el-button type="primary" @click="doAddTag">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { DatabaseManager } from '@/core/database/DatabaseManager'
import { ElMessage } from 'element-plus'
import { v4 as uuidv4 } from 'uuid'

const db = DatabaseManager.getInstance()
const groups = ref<any[]>([])
const types = ref<any[]>([])
const tagGroups = ref<any[]>([])
const allTags = ref<any[]>([])
const flowTemplates = ref<any[]>([])

const selectedGroup = ref('')
const selectedTagGroup = ref('')
const addGroupVisible = ref(false); const newGroupName = ref('')
const addTypeVisible = ref(false); const newTypeName = ref('')
const addTagGroupVisible = ref(false); const newTagGroupName = ref('')
const addTagVisible = ref(false); const newTagName = ref('')

const currentTypes = computed(() => types.value.filter((t: any) => t.groupId === selectedGroup.value))
const currentTags = computed(() => allTags.value.filter((t: any) => t.groupId === selectedTagGroup.value))

function getTypeCount(gid: string) { return types.value.filter((t: any) => t.groupId === gid).length }
function getFlowName(id?: string) { return flowTemplates.value.find((f: any) => f.id === id)?.name || '-' }

// 一级分类
async function doAddGroup() {
  if (!newGroupName.value.trim()) return
  db.execute('INSERT INTO task_type_groups (id, name, sortOrder) VALUES (?,?,?)', [uuidv4(), newGroupName.value.trim(), groups.value.length + 1])
  await db.persist(); addGroupVisible.value = false; newGroupName.value = ''
  ElMessage.success('已添加'); await loadData()
}
async function delGroup(id: string) {
  db.execute('DELETE FROM task_type_groups WHERE id=?', [id])
  await db.persist(); ElMessage.success('已删除'); await loadData()
}

// 二级类型
async function doAddType() {
  if (!newTypeName.value.trim() || !selectedGroup.value) return
  db.execute('INSERT INTO task_types (id, groupId, name, sortOrder) VALUES (?,?,?,?)', [uuidv4(), selectedGroup.value, newTypeName.value.trim(), currentTypes.value.length + 1])
  await db.persist(); addTypeVisible.value = false; newTypeName.value = ''
  ElMessage.success('已添加'); await loadData()
}
async function delType(id: string) {
  db.execute('DELETE FROM task_types WHERE id=?', [id])
  await db.persist(); ElMessage.success('已删除'); await loadData()
}

// 标签组
async function doAddTagGroup() {
  if (!newTagGroupName.value.trim()) return
  db.execute('INSERT INTO tag_groups (id, name, sortOrder) VALUES (?,?,?)', [uuidv4(), newTagGroupName.value.trim(), tagGroups.value.length + 1])
  await db.persist(); addTagGroupVisible.value = false; newTagGroupName.value = ''
  ElMessage.success('已添加'); await loadData()
}
async function delTagGroup(id: string) {
  allTags.value.filter((t: any) => t.groupId === id).forEach((t: any) => db.execute('DELETE FROM tags WHERE id=?', [t.id]))
  db.execute('DELETE FROM tag_groups WHERE id=?', [id])
  await db.persist(); ElMessage.success('已删除'); await loadData()
}

// 标签
async function doAddTag() {
  if (!newTagName.value.trim() || !selectedTagGroup.value) return
  db.execute('INSERT INTO tags (id, groupId, name, sortOrder) VALUES (?,?,?,?)', [uuidv4(), selectedTagGroup.value, newTagName.value.trim(), currentTags.value.length + 1])
  await db.persist(); addTagVisible.value = false; newTagName.value = ''
  ElMessage.success('已添加'); await loadData()
}
async function delTag(id: string) {
  db.execute('DELETE FROM tags WHERE id=?', [id])
  await db.persist(); ElMessage.success('已删除'); await loadData()
}

async function loadData() {
  groups.value = db.query<any>('SELECT * FROM task_type_groups ORDER BY sortOrder ASC')
  types.value = db.query<any>('SELECT * FROM task_types ORDER BY sortOrder ASC')
  tagGroups.value = db.query<any>('SELECT * FROM tag_groups ORDER BY sortOrder ASC')
  allTags.value = db.query<any>('SELECT * FROM tags ORDER BY sortOrder ASC')
  flowTemplates.value = db.query<any>('SELECT id, name FROM flow_templates')
}

onMounted(loadData)
</script>

<style scoped>
.config-page { max-width: 1400px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; }
.page-header h3 { margin: 0; font-size: 16px; }
.list-item { padding: 10px 12px; border-bottom: 1px solid #f0f0f0; cursor: pointer; font-size: 14px; }
.list-item:hover { background: #fafaf7; }
.list-item.active { background: #e3edf5; color: #1a5a8a; font-weight: 600; }
.text-muted { font-size: 12px; color: var(--text-muted); }
</style>
