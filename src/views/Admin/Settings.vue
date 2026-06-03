<template>
  <div class="desktop-container">
    <div class="desk-header">
      <span class="desk-title">系统设置</span>
    </div>

    <el-card shadow="never" class="modern-card">
      <el-tabs v-model="activeTab" type="border-card">
        <!-- 系统设置 -->
        <el-tab-pane label="通用设置" name="general">
          <el-form :model="systemForm" label-width="140px" size="default">
            <el-divider content-position="left">通用设置</el-divider>
            <el-form-item label="系统名称">
              <el-input v-model="systemForm.systemName" />
            </el-form-item>
            <el-form-item label="数据刷新间隔">
              <el-select v-model="systemForm.refreshInterval" style="width:200px">
                <el-option label="30秒" value="30" />
                <el-option label="1分钟" value="60" />
                <el-option label="5分钟" value="300" />
              </el-select>
            </el-form-item>
            <el-divider content-position="left">P2P同步设置</el-divider>
            <el-form-item label="自动同步">
              <el-switch v-model="systemForm.autoSync" />
            </el-form-item>
            <el-form-item label="同步端口">
              <el-input-number v-model="systemForm.syncPort" :min="1024" :max="65535" />
            </el-form-item>
            <el-divider content-position="left">关于</el-divider>
            <el-descriptions :column="1" border>
              <el-descriptions-item label="版本">V3.0</el-descriptions-item>
              <el-descriptions-item label="技术栈">Vue 3 + TypeScript + Element Plus + SQL.js</el-descriptions-item>
              <el-descriptions-item label="数据库">SQLite (浏览器本地存储)</el-descriptions-item>
              <el-descriptions-item label="同步方式">P2P 内网点对点同步</el-descriptions-item>
            </el-descriptions>
          </el-form>
        </el-tab-pane>

        <!-- 信令服务器配置 -->
        <el-tab-pane label="信令服务器" name="signaling">
          <el-form :model="signalingForm" label-width="140px" size="default">
            <el-divider content-position="left">服务器连接</el-divider>

            <el-form-item label="服务器地址">
              <el-input v-model="signalingForm.host" placeholder="例如：192.168.1.100 或 localhost" style="width: 320px" />
            </el-form-item>

            <el-form-item label="端口号">
              <el-input-number v-model="signalingForm.port" :min="1024" :max="65535" style="width: 320px" />
            </el-form-item>

            <el-form-item label="完整地址">
              <el-tag type="info" size="large" style="font-size:14px; font-family: monospace;">
                http://{{ signalingForm.host || 'localhost' }}:{{ signalingForm.port }}
              </el-tag>
            </el-form-item>

            <el-form-item>
              <el-button type="primary" @click="saveAndConnect" :loading="connecting">
                <el-icon><Connection /></el-icon> 保存并连接
              </el-button>
              <el-button @click="testConnection" :loading="testing">
                <el-icon><Link /></el-icon> 测试连接
              </el-button>
            </el-form-item>

            <el-divider content-position="left">连接状态</el-divider>

            <el-descriptions :column="2" border>
              <el-descriptions-item label="信令服务器">
                <el-tag v-if="connectionStatus === 'connected'" type="success" effect="dark">已连接</el-tag>
                <el-tag v-else-if="connectionStatus === 'connecting'" type="warning" effect="dark">连接中...</el-tag>
                <el-tag v-else type="danger" effect="dark">未连接</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="当前地址">
                {{ currentUrl || '未配置' }}
              </el-descriptions-item>
              <el-descriptions-item label="P2P 节点数">
                {{ syncStore.peerCount }} 个在线
              </el-descriptions-item>
              <el-descriptions-item label="网络状态">
                <span v-if="syncStore.isOnline" style="color: #52C41A;">在线</span>
                <span v-else style="color: #F53F3F;">离线</span>
              </el-descriptions-item>
              <el-descriptions-item label="Client ID" :span="2">
                <code style="font-size:12px;">{{ clientId }}</code>
              </el-descriptions-item>
            </el-descriptions>

            <el-divider content-position="left">使用说明</el-divider>
            <el-alert type="info" :closable="false" show-icon>
              <template #title>
                <ol style="margin:0; padding-left:18px; line-height:2;">
                  <li>在一台机器上运行信令服务器：<code>node server.js</code></li>
                  <li>在该页面填入运行服务器机器的 IP 地址和端口</li>
                  <li>点击"保存并连接"，系统将自动建立 P2P 同步通道</li>
                  <li>同一局域网内的其他用户打开 HTML 页面后，填入相同地址即可互联</li>
                </ol>
              </template>
            </el-alert>
          </el-form>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue';
import { useSyncStore } from '@/stores/sync';
import { Connection, Link } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

const SIGNALING_CONFIG_KEY = 'signaling-config';

const syncStore = useSyncStore();
const activeTab = ref('general');

// 系统设置表单
const systemForm = reactive({
  systemName: '督办管理系统',
  refreshInterval: '60',
  autoSync: true,
  syncPort: 3000,
});

// 信令服务器表单
const signalingForm = reactive({
  host: 'localhost',
  port: 3030,
});

const connecting = ref(false);
const testing = ref(false);
const connectionStatus = ref<'connected' | 'connecting' | 'disconnected'>('disconnected');
const currentUrl = ref('');
const clientId = ref('');

onMounted(() => {
  loadSignalingConfig();
  syncStatus();
});

function loadSignalingConfig() {
  try {
    const saved = localStorage.getItem(SIGNALING_CONFIG_KEY);
    if (saved) {
      const config = JSON.parse(saved);
      signalingForm.host = config.host || 'localhost';
      signalingForm.port = config.port || 3030;
      currentUrl.value = `http://${signalingForm.host}:${signalingForm.port}`;
    }
  } catch { /* ignore */ }
}

function saveSignalingConfig() {
  localStorage.setItem(SIGNALING_CONFIG_KEY, JSON.stringify({
    host: signalingForm.host,
    port: signalingForm.port,
  }));
  currentUrl.value = `http://${signalingForm.host}:${signalingForm.port}`;
}

function syncStatus() {
  connectionStatus.value = syncStore.connectionStatus as any;
  const p2p = (window as any).p2pSyncInstance;
  if (p2p?.getClientId) {
    clientId.value = p2p.getClientId();
  }
}

async function saveAndConnect() {
  connecting.value = true;
  try {
    saveSignalingConfig();
    const url = `http://${signalingForm.host}:${signalingForm.port}`;
    connectionStatus.value = 'connecting';

    const p2p = (window as any).p2pSyncInstance;
    if (p2p?.disconnect) {
      p2p.disconnect();
    }

    await new Promise(r => setTimeout(r, 500));

    if (p2p?.initialize) {
      await p2p.initialize();
    }

    connectionStatus.value = syncStore.isConnected ? 'connected' : 'disconnected';
    ElMessage.success('配置已保存，正在重新连接...');
  } catch (e: any) {
    ElMessage.error('连接失败: ' + (e.message || '未知错误'));
    connectionStatus.value = 'disconnected';
  } finally {
    connecting.value = false;
  }
}

async function testConnection() {
  testing.value = true;
  const url = `http://${signalingForm.host}:${signalingForm.port}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const resp = await fetch(url + '/health', {
      signal: controller.signal,
      mode: 'cors',
    }).catch(() => null);

    clearTimeout(timeout);

    if (resp && resp.ok) {
      ElMessage.success(`服务器 ${url} 可达`);
    } else {
      ElMessage.warning(`HTTP 健康检查未通过，但信令服务可能仍可用。请尝试"保存并连接"。`);
    }
  } catch {
    ElMessage.warning(`无法连接到 ${url}，请确认服务器已启动且地址正确`);
  } finally {
    testing.value = false;
  }
}
</script>

<style scoped>
.desktop-container { padding: 10px; }
.desk-header { padding: 10px 5px; border-bottom: 1px solid var(--border-color); margin-bottom: 20px; }
.desk-title { font-weight: 700; color: var(--color-primary); border-left: 4px solid var(--color-primary-light); padding-left: 14px; font-size: var(--font-size-xl); }
.modern-card { border-radius: var(--radius-md); border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); }
:deep(.modern-card .el-card__body) { padding: 24px; }
code { background: #f0f0f0; padding: 1px 6px; border-radius: 3px; color: #165DFF; }
</style>
