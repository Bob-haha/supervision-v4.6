<template>
  <div class="config-page">
    <el-card shadow="never">
      <template #header>
        <div class="page-header"><h2>文件管理</h2><el-button type="primary" size="small" @click="uploadVisible = true">+ 上传文件</el-button></div>
      </template>
      <div class="toolbar">
        <el-select v-model="categoryFilter" placeholder="全部分类" clearable style="width:140px" @change="loadFiles">
          <el-option label="模板" value="template" /><el-option label="制度" value="policy" /><el-option label="附件" value="attachment" />
        </el-select>
      </div>
      <el-table :data="filteredFiles" stripe size="small">
        <el-table-column prop="name" label="文件名" min-width="180" show-overflow-tooltip />
        <el-table-column label="分类" width="80">
          <template #default="{ row }">{{ { template: '模板', policy: '制度', attachment: '附件' }[row.category] || row.category }}</template>
        </el-table-column>
        <el-table-column label="版本" width="60"><template #default="{ row }">v{{ row.version || 1 }}</template></el-table-column>
        <el-table-column prop="policyNumber" label="文号" width="160" />
        <el-table-column label="有效期" width="180">
          <template #default="{ row }">
            <span :class="{ 'text-danger': isExpired(row) }">
              {{ (row.effectiveDate || '').substring(0, 10) || '-' }} ~ {{ (row.expiryDate || '').substring(0, 10) || '-' }}
              <el-tag v-if="isExpired(row)" size="small" type="danger">过期</el-tag>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140">
          <template #default="{ row }">
            <el-button size="small" @click="doDownload(row)">下载</el-button>
            <el-button size="small" type="danger" @click="doDelete(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!filteredFiles.length" description="暂无文件" :image-size="60" />
    </el-card>

    <!-- 上传对话框 -->
    <el-dialog v-model="uploadVisible" title="上传文件" width="500px">
      <el-upload drag :auto-upload="false" :limit="1" :on-change="onFileChange" :file-list="fileList">
        <el-icon style="font-size:36px;color:#c0c4cc"><UploadFilled /></el-icon>
        <div style="margin-top:8px">将文件拖到此处或点击上传</div>
      </el-upload>
      <el-form size="small" style="margin-top:12px" label-width="80px">
        <el-form-item label="分类">
          <el-select v-model="uploadCategory" style="width:100%">
            <el-option label="模板文件" value="template" /><el-option label="制度文件" value="policy" /><el-option label="附件" value="attachment" />
          </el-select>
        </el-form-item>
        <template v-if="uploadCategory === 'policy'">
          <el-form-item label="文号"><el-input v-model="uploadPolicyNo" placeholder="如：署监发〔2025〕12号" /></el-form-item>
          <el-form-item label="生效日期"><el-date-picker v-model="uploadEffDate" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
          <el-form-item label="失效日期"><el-date-picker v-model="uploadExpDate" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="uploadVisible = false">取消</el-button>
        <el-button type="primary" @click="doUpload">上传</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { DatabaseManager } from '@/core/database/DatabaseManager'
import { ElMessage, ElMessageBox } from 'element-plus'
import { v4 as uuidv4 } from 'uuid'

const db = DatabaseManager.getInstance()
const files = ref<any[]>([])
const categoryFilter = ref('')

const uploadVisible = ref(false)
const uploadCategory = ref('template')
const uploadPolicyNo = ref('')
const uploadEffDate = ref('')
const uploadExpDate = ref('')
const uploadFileData = ref<{ raw: File; name: string; size: number; type: string } | null>(null)
const fileList = ref<any[]>([])

const filteredFiles = computed(() => {
  if (!categoryFilter.value) return files.value
  return files.value.filter((f: any) => f.category === categoryFilter.value)
})

function isExpired(f: any) {
  if (!f.expiryDate) return false
  return f.expiryDate < new Date().toISOString().split('T')[0]
}

function onFileChange(file: any) {
  fileList.value = [file]
  uploadFileData.value = { raw: file.raw, name: file.name, size: file.size || 0, type: file.raw?.type || '' }
}

async function doUpload() {
  if (!uploadFileData.value) { ElMessage.warning('请选择文件'); return }
  try {
    const f = uploadFileData.value
    const arrayBuffer = await f.raw.arrayBuffer()
    const uint8 = new Uint8Array(arrayBuffer)
    db.execute(
      `INSERT INTO files (id, name, category, mimeType, size, data, version, isLatest, uploadedBy, uploadedAt, policyNumber, effectiveDate, expiryDate)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        uuidv4(), f.name, uploadCategory.value, f.type, f.size,
        uint8, 1, 1, '', new Date().toISOString(),
        uploadCategory.value === 'policy' ? uploadPolicyNo.value || null : null,
        uploadCategory.value === 'policy' ? uploadEffDate.value || null : null,
        uploadCategory.value === 'policy' ? uploadExpDate.value || null : null,
      ],
    )
    await db.persist()
    ElMessage.success('上传成功')
    uploadVisible.value = false
    uploadFileData.value = null
    fileList.value = []
    uploadPolicyNo.value = ''; uploadEffDate.value = ''; uploadExpDate.value = ''
    await loadFiles()
  } catch (e: any) { ElMessage.error('上传失败: ' + (e.message || '')) }
}

async function doDownload(f: any) {
  try {
    // 按 ID 单独查询获取完整 BLOB 数据
    const result = db.query<any>('SELECT data, mimeType, name FROM files WHERE id=?', [f.id])
    if (!result[0] || !result[0].data) { ElMessage.warning('文件数据不存在'); return }
    const blob = new Blob([new Uint8Array(result[0].data)], { type: result[0].mimeType || 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = result[0].name || f.name
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (e: any) { ElMessage.error('下载失败: ' + (e.message || '')) }
}

async function doDelete(id: string) {
  await ElMessageBox.confirm('确定删除此文件？', '确认', { type: 'warning' })
  db.execute('DELETE FROM files WHERE id=?', [id])
  await db.persist()
  ElMessage.success('已删除')
  await loadFiles()
}

async function loadFiles() {
  // 列表不加载 BLOB 数据，仅加载元数据
  let sql = 'SELECT id, name, category, mimeType, size, version, isLatest, uploadedBy, uploadedAt, policyNumber, effectiveDate, expiryDate, clauses FROM files WHERE isLatest=1'
  const params: any[] = []
  if (categoryFilter.value) { sql += ' AND category=?'; params.push(categoryFilter.value) }
  sql += ' ORDER BY uploadedAt DESC'
  files.value = db.query<any>(sql, params)
}

onMounted(loadFiles)
</script>

<style scoped>
.config-page { max-width: 1400px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; }
.page-header h2 { margin: 0; font-size: 18px; }
.toolbar { margin-bottom: 12px; }
.text-danger { color: #F5222D; }
</style>
