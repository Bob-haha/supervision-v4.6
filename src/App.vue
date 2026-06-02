<template>
  <div class="app-wrapper">
    <!-- 数据库加载遮罩 -->
    <div v-if="!isDbReady" class="loading-screen">
      <div class="loading-spinner">
        <el-icon class="is-loading" size="48" color="#165DFF"><Loading /></el-icon>
      </div>
      <p class="loading-text">正在初始化督办系统数据库...</p>
    </div>

    <template v-else>
      <!-- 身份选择 -->
      <RoleSelect v-if="!authStore.user" />

      <!-- V3.0 主布局 -->
      <el-container v-else class="v3-layout">
        <!-- ===== 顶部导航 72px ===== -->
        <el-header class="v3-header" height="72px">
          <div class="header-left">
            <div class="logo-area">
              <div class="logo-icon-box">
                <el-icon size="24" color="#FFFFFF"><Platform /></el-icon>
              </div>
              <div class="logo-text">
                <span class="logo-title">督办管理系统</span>
                <span class="logo-ver">V3.0</span>
              </div>
            </div>
            <div class="logo-subtitle">
              守国门 促发展 当好让党放心 让人民满意的国门卫士
            </div>
          </div>

          <div class="header-center">
            <div class="global-search">
              <el-icon size="18" color="#86909C"><Search /></el-icon>
              <input
                v-model="searchKeyword"
                type="text"
                class="search-input"
                placeholder="搜索任务、人员、流程..."
                @keydown.enter="doGlobalSearch"
              />
              <span class="search-shortcut">Ctrl+K</span>
            </div>
          </div>

          <div class="header-right">
            <!-- 消息中心 -->
            <el-badge :value="unreadMsgCount" :hidden="!unreadMsgCount" :max="99">
              <div class="header-icon-btn" title="消息中心">
                <el-icon size="20"><Message /></el-icon>
              </div>
            </el-badge>

            <!-- 待办提醒 -->
            <el-badge :value="pendingCount" :hidden="!pendingCount" :max="99">
              <div class="header-icon-btn" title="待办提醒">
                <el-icon size="20"><Bell /></el-icon>
              </div>
            </el-badge>

            <!-- 系统通知 -->
            <el-badge is-dot :hidden="!hasSystemNotice">
              <div class="header-icon-btn" title="系统通知">
                <el-icon size="20"><Notification /></el-icon>
              </div>
            </el-badge>

            <div class="header-divider"></div>

            <!-- 用户信息 -->
            <el-dropdown trigger="click" @command="handleUserCmd">
              <div class="user-area">
                <div class="user-avatar">
                  <el-icon size="20"><UserFilled /></el-icon>
                </div>
                <div class="user-info">
                  <span class="user-name">{{ authStore.user.name }}</span>
                  <span class="user-dept">{{ getDeptName(authStore.user.deptId) }}</span>
                </div>
                <el-icon size="14" color="#86909C"><ArrowDown /></el-icon>
              </div>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="profile">
                    <el-icon><User /></el-icon> 个人信息
                  </el-dropdown-item>
                  <el-dropdown-item command="settings">
                    <el-icon><Setting /></el-icon> 系统设置
                  </el-dropdown-item>
                  <el-dropdown-item divided command="logout">
                    <el-icon><SwitchButton /></el-icon> 切换身份
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </el-header>

        <!-- ===== 主体区域 ===== -->
        <el-container class="v3-body">
          <!-- 左侧菜单 260px -->
          <el-aside width="260px" class="v3-sidebar">
            <div class="sidebar-scroll">
              <template v-for="group in menuGroups" :key="group.title">
                <div class="menu-group-title">{{ group.title }}</div>
                <div
                  v-for="item in group.items"
                  :key="item.path"
                  class="menu-item"
                  :class="{ active: isMenuActive(item) }"
                  @click="navigateTo(item.path)"
                >
                  <div class="menu-item-icon">
                    <el-icon size="18"><component :is="item.icon" /></el-icon>
                  </div>
                  <span class="menu-item-label">{{ item.label }}</span>
                  <el-badge v-if="item.badge" :value="item.badge" class="menu-badge" />
                </div>
              </template>
            </div>

            <!-- 侧边栏底部 -->
            <div class="sidebar-footer">
              <div class="footer-info">
                <el-icon size="14" color="#52C41A"><CircleCheckFilled /></el-icon>
                <span>系统运行正常</span>
              </div>
              <div class="footer-info">
                <span class="footer-dot online"></span>
                <span>内网节点 {{ syncStore.peerCount }} 个在线</span>
              </div>
            </div>
          </el-aside>

          <!-- 内容区 -->
          <el-main class="v3-main">
            <router-view />
          </el-main>
        </el-container>
      </el-container>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useTaskStore } from '@/stores/task';
import { useSyncStore } from '@/stores/sync';
import { DatabaseManager } from '@/core/database/DatabaseManager';
import { P2PSyncManager } from '@/core/sync/P2PSyncManager';
import { eventBus } from '@/utils/eventBus';
import { DEPT_MAP } from '@/constants';
import RoleSelect from '@/views/Auth/RoleSelect.vue';
import {
  Loading, Platform, Search, Message, Bell, Notification,
  UserFilled, ArrowDown, User, Setting, SwitchButton,
  CircleCheckFilled
} from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

const authStore = useAuthStore();
const taskStore = useTaskStore();
const syncStore = useSyncStore();
const route = useRoute();
const router = useRouter();
const isDbReady = ref(false);
const searchKeyword = ref('');
let p2pSync: P2PSyncManager | null = null;

const getDeptName = (id: string) => DEPT_MAP[id] || '';

const unreadMsgCount = ref(0);
const hasSystemNotice = ref(false);

const pendingCount = computed(() => {
  const deptId = authStore.user?.deptId || '';
  if (!deptId) return 0;
  const now = new Date().toISOString().split('T')[0];
  return taskStore.tasks.filter(t =>
    t.status !== 'COMPLETED' &&
    (t.owner_dept_ids || []).includes(deptId) &&
    t.deadline && t.deadline < now
  ).length;
});

const menuGroups = computed(() => {
  const isAdmin = authStore.isAdmin || authStore.isLeader
  const groups: any[] = [
    {
      title: '首页',
      items: [
        { path: '/home', label: '首页看板', icon: 'DataBoard' },
      ],
    },
    {
      title: '任务管理',
      items: [
        { path: '/task/new', label: '新建任务', icon: 'Plus' },
        { path: '/task/my', label: '我的任务', icon: 'Monitor', badge: pendingCount.value || 0 },
      ],
    },
    {
      title: '流程督办',
      items: [
        { path: '/inspector', label: '督办看板', icon: 'Bell' },
      ],
    },
    {
      title: '数据统计',
      items: [
        { path: '/stats/dept', label: '科室数据看板', icon: 'PieChart' },
        { path: '/stats/guanqu', label: '关区数据看板', icon: 'TrendCharts' },
      ],
    },
  ]

  if (isAdmin) {
    groups.push({
      title: '配置管理',
      items: [
        { path: '/config/flow', label: '流程配置', icon: 'SetUp' },
        { path: '/config/datasheet', label: '明细模板配置', icon: 'Document' },
        { path: '/config/fields', label: '字段管理', icon: 'Grid' },
        { path: '/config/types', label: '类型与标签配置', icon: 'Collection' },
        { path: '/config/metrics', label: '态势配置', icon: 'TrendCharts' },
        { path: '/config/files', label: '文件管理', icon: 'Folder' },
        { path: '/config/organization', label: '组织架构', icon: 'OfficeBuilding' },
      ],
    })
    groups.push({
      title: '系统管理',
      items: [
        { path: '/admin/personnel', label: '人员管理', icon: 'User' },
        { path: '/admin/departments', label: '部门管理', icon: 'OfficeBuilding' },
        { path: '/admin/roles', label: '角色权限', icon: 'Lock' },
        { path: '/admin/signaling', label: '信令服务器', icon: 'Connection' },
        { path: '/admin/settings', label: '系统设置', icon: 'Setting' },
      ],
    })
  }

  return groups
})

function isMenuActive(item: any) {
  if (item.path === '/home') return route.path === '/home'
  return route.path === item.path || route.path.startsWith(item.path + '/')
}

function navigateTo(path: string) {
  router.push(path)
}

function doGlobalSearch() {
  if (!searchKeyword.value.trim()) return;
  router.push({ path: '/tasks', query: { search: searchKeyword.value } });
  searchKeyword.value = '';
}

function handleUserCmd(cmd: string) {
  if (cmd === 'logout') authStore.logout()
  else if (cmd === 'profile') router.push('/config/organization')
  else if (cmd === 'settings') router.push('/admin/settings')
}

function parseSQLOperation(sql: string, params: any[]): { table: string; recordId: string; operation: 'INSERT' | 'UPDATE' | 'DELETE' } | null {
  const upper = sql.trim().toUpperCase();
  const tableMatch = sql.match(/(?:INTO|FROM|UPDATE)\s+(\w+)/i);
  if (!tableMatch) return null;
  const table = tableMatch[1].toLowerCase();
  const recordId = params[0] || '';
  if (upper.startsWith('INSERT')) return { table, recordId, operation: 'INSERT' };
  if (upper.startsWith('UPDATE')) return { table, recordId, operation: 'UPDATE' };
  if (upper.startsWith('DELETE')) return { table, recordId, operation: 'DELETE' };
  return null;
}

onMounted(async () => {
  try {
    const dbManager = DatabaseManager.getInstance();
    await dbManager.init();

    p2pSync = P2PSyncManager.getInstance();
    (window as any).p2pSyncInstance = p2pSync;
    await p2pSync.initialize();

    dbManager.setOnExecute((sql, params) => {
      const parsed = parseSQLOperation(sql, params);
      if (parsed) {
        p2pSync?.recordChange(parsed.table, parsed.recordId, parsed.operation);
      }
    });

    eventBus.on('store-update:tasks', () => taskStore.fetchTasks());
    eventBus.on('leader-comment-added', () => taskStore.fetchTasks());
    eventBus.on('task-updated', () => taskStore.fetchTasks());

    authStore.loadFromStorage();
    isDbReady.value = true;
  } catch (e) {
    console.error("系统初始化失败:", e);
  }
});

onUnmounted(() => {
  p2pSync?.disconnect();
});
</script>

<style>
/* ===== 全局重置 ===== */
html, body, #app, .app-wrapper {
  height: 100vh;
  width: 100vw;
  margin: 0;
  padding: 0;
  overflow: hidden;
  font-family: var(--font-family);
  font-size: var(--font-size-md);
  color: var(--text-primary);
  background: var(--bg-page);
}

/* ===== 加载屏 ===== */
.loading-screen {
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: var(--bg-page);
  gap: 16px;
}
.loading-text {
  font-size: var(--font-size-lg);
  color: var(--text-secondary);
}

/* ===== V3.0 主布局 ===== */
.v3-layout {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-page);
}

/* ===== 顶部导航 72px ===== */
.v3-header {
  height: 72px !important;
  background: var(--bg-header);
  color: var(--text-white);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  flex-shrink: 0;
  box-sizing: border-box;
  z-index: 100;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-shrink: 0;
}

.logo-area {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo-icon-box {
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.10);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.logo-text {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.logo-title {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 1px;
  white-space: nowrap;
}

.logo-ver {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  font-weight: 400;
}

.logo-subtitle {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  padding-left: 20px;
  border-left: 1px solid rgba(255, 255, 255, 0.15);
  white-space: nowrap;
  font-family: "SimSun", "PingFang SC", serif;
}

/* 全局搜索 */
.header-center {
  flex: 1;
  display: flex;
  justify-content: center;
  padding: 0 40px;
  max-width: 480px;
}

.global-search {
  width: 100%;
  height: 40px;
  background: rgba(255, 255, 255, 0.10);
  border-radius: 8px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 8px;
  transition: background var(--transition-fast);
  border: 1px solid transparent;
}
.global-search:focus-within {
  background: rgba(255, 255, 255, 0.18);
  border-color: rgba(255, 255, 255, 0.25);
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #fff;
  font-size: var(--font-size-md);
  font-family: var(--font-family);
}
.search-input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.search-shortcut {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

/* 右侧 */
.header-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.header-icon-btn {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.75);
  transition: all var(--transition-fast);
}
.header-icon-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.header-divider {
  width: 1px;
  height: 24px;
  background: rgba(255, 255, 255, 0.12);
  margin: 0 8px;
}

.user-area {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background var(--transition-fast);
}
.user-area:hover {
  background: rgba(255, 255, 255, 0.06);
}

.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.user-info {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}

.user-name {
  font-size: var(--font-size-md);
  font-weight: 500;
}

.user-dept {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}

/* ===== 主体区域 ===== */
.v3-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* ===== 侧边栏 260px ===== */
.v3-sidebar {
  width: 260px !important;
  background: var(--bg-sidebar);
  display: flex;
  flex-direction: column;
  height: 100%;
  flex-shrink: 0;
  overflow: hidden;
}

.sidebar-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.menu-group-title {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.28);
  padding: 20px 20px 8px;
  letter-spacing: 2px;
  text-transform: uppercase;
}

.menu-item {
  display: flex;
  align-items: center;
  height: 44px;
  margin: 2px 12px;
  padding: 0 14px;
  border-radius: 8px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.65);
  transition: all var(--transition-fast);
  position: relative;
  gap: 10px;
}
.menu-item:hover {
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.85);
}
.menu-item.active {
  background: var(--bg-menu-active);
  color: #fff;
}
.menu-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 20px;
  background: var(--color-primary-light);
  border-radius: 2px;
}

.menu-item-icon {
  width: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.menu-item-label {
  font-size: var(--font-size-md);
  flex: 1;
}

.menu-badge {
  flex-shrink: 0;
}

/* 侧边栏底部状态 */
.sidebar-footer {
  padding: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.footer-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.35);
}

.footer-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #86909C;
}
.footer-dot.online {
  background: #52C41A;
}

/* ===== 主内容区 ===== */
.v3-main {
  background: var(--bg-page);
  padding: 20px 24px !important;
  overflow-y: auto;
  overflow-x: hidden;
}

/* ===== 全局滚动条 ===== */
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.12); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: rgba(0, 0, 0, 0.20); }
::-webkit-scrollbar-track { background: transparent; }
</style>
