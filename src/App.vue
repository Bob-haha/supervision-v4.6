<template>
  <div class="app-wrapper">
    <!-- 1. 数据库加载遮罩 -->
    <div v-if="!isDbReady" class="loading-screen">
      <el-icon class="is-loading" size="40"><Loading /></el-icon>
      <p>正在初始化督办系统数据库...</p>
    </div>

    <template v-else>
      <!-- 2. 身份选择拦截 -->
      <RoleSelect v-if="!authStore.user" />

      <!-- 3. HB2020 风格业务主布局 -->
      <el-container v-else class="hb-layout">
        <el-header class="hb-header" height="80px">
          <div class="header-left">
            <el-icon size="32"><Platform /></el-icon>
            <div class="title-group">
              <span class="system-title">督办管理系统 V2.0</span>
              <span class="slogan">守国门 促发展 当好让党放心 让人民满意的国门卫士</span>
            </div>
          </div>
          <div class="header-right">
            <el-button link class="logout-btn" @click="authStore.logout">
              <el-icon><SwitchButton /></el-icon> 切换身份
            </el-button>
          </div>
        </el-header>

        <el-container class="hb-body">
          <el-aside width="260px" class="hb-aside">
            <div class="user-profile">
              <div class="avatar-box"><el-icon size="30"><UserFilled /></el-icon></div>
              <div class="info-text">
                <div class="name">{{ authStore.user.name }}</div>
                <div class="role-row">
                  <span class="tag">{{ '新沙海关' }}</span>
                  <span class="dept">{{ getDeptName(authStore.user.deptId) }}</span>
                </div>
              </div>
            </div>

            <el-menu active-text-color="#ffd04b" background-color="#0a1d37" text-color="#fff" router :default-active="route.fullPath" class="hb-menu">
              <el-menu-item index="/dashboard"><el-icon><DataBoard /></el-icon><span>督办总览看板</span></el-menu-item>
              <el-divider class="menu-sep">任务管理</el-divider>
              <el-menu-item index="/tasks"><el-icon><Monitor /></el-icon><span>全部督办事项</span></el-menu-item>
              <el-menu-item index="/host"><el-icon><EditPen /></el-icon><span>科室主办事项</span></el-menu-item>
              <el-menu-item index="/Co-organized"><el-icon><EditPen /></el-icon><span>科室协办事项</span></el-menu-item>
              <el-menu-item index="/dept-completed"><el-icon><EditPen /></el-icon><span>科室办结事项</span></el-menu-item>
              <el-divider class="menu-sep">历史档案</el-divider>
              <el-menu-item index="/history"><el-icon><Finished /></el-icon><span>办结归档事项</span></el-menu-item>
            </el-menu>
          </el-aside>

          <el-main class="hb-main">
            <router-view />
          </el-main>
        </el-container>
      </el-container>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useTaskStore } from '@/stores/task';
import { DatabaseManager } from '@/core/database/DatabaseManager';
import { P2PManager } from '@/core/sync/P2PManager';
import RoleSelect from '@/views/Auth/RoleSelect.vue';
import { DEPT_MAP } from '@/constants';
import { 
  Loading, Platform, SwitchButton, Monitor, DataBoard,
  EditPen, Finished, UserFilled 
} from '@element-plus/icons-vue';

const authStore = useAuthStore();
const taskStore = useTaskStore();
const route = useRoute();
const isDbReady = ref(false);
let p2p: P2PManager | null = null;

const getDeptName = (id: string) => DEPT_MAP[id] || '';

onMounted(async () => {
  try {
    // 1. 初始化数据库
    const dbManager = DatabaseManager.getInstance();
    await dbManager.init();
    p2p = new P2PManager();
    (window as any).p2pInstance = p2p;
    // 2. 初始化 P2P 同步
   
    
    // 3. 核心绑定：SQL 执行时自动广播给 P2P
    dbManager.setOnExecute((sql, params) => {
      p2p?.broadcastSQL(sql, params);
    });

    // 4. 核心绑定：P2P 收到新数据时自动刷新 Store
    p2p.setOnDataSync(() => {
      taskStore.fetchTasks();
    });

    authStore.loadFromStorage();
    isDbReady.value = true;
  } catch (e) {
    console.error("系统初始化失败:", e);
  }
});

// 页面关闭前销毁 P2P 连接，防止内存泄露
onUnmounted(() => {
  p2p?.destroyAll();
});
</script>

<style>
/* 1. 彻底锁定网页高度，防止出现双滚动条或背景断层 */
html, body, #app, .app-wrapper {
  height: 100vh;
  width: 100vw;
  margin: 0;
  padding: 0;
  overflow: hidden; /* 根容器禁止滚动，由内部 Main 容器滚动 */
  font-family: "Microsoft YaHei", "微软雅黑", sans-serif;
}

/* 2. 数据库加载遮罩 - 居中且全屏 */
.loading-screen {
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: #f4f7fa;
  color: #0d2a61;
}

/* 3. 主布局架构 - 强制占满屏幕 */
.hb-layout {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #f4f7fa;
}

/* 4. 顶部页眉 - 修正文字重叠与对齐 */
.hb-header {
  height: 80px !important; /* 增加高度 */
  background-color: #0d2a61;
  color: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 30px;
  border-bottom: 4px solid #ffd04b; /* 加粗金边 */
  flex-shrink: 0; /* 禁止页眉被挤压 */
  box-sizing: border-box;
}

.header-left { 
  display: flex; 
  align-items: center; 
  gap: 20px; 
}

.title-group { 
  display: flex; 
  flex-direction: column;
  justify-content: center;
}

.system-title { 
  font-size: 26px; 
  font-weight: bold; 
  letter-spacing: 2px;
  line-height: 1.2;
}

.slogan { 
  font-size: 14px; 
  opacity: 0.8; 
  margin-top: 5px; 
  font-family: "SimSun", "STSong", serif;
  letter-spacing: 1px;
}

.logout-btn { 
  color: #fff !important; 
  font-size: 15px;
}

/* 5. 中间主体区 */
.hb-body {
  flex: 1; /* 自动填充剩余高度 */
  display: flex;
  overflow: hidden; /* 让侧边栏和主内容区独立控制 */
}

/* 6. 侧边栏 - 修正高度和个人信息显示 */
.hb-aside {
  width: 300px !important; /* 调宽侧边栏 */
  background-color: #0a1d37;
  display: flex;
  flex-direction: column;
  height: 100%;
  flex-shrink: 0;
}

.user-profile {
  padding: 30px 20px;
  background: rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  gap: 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.avatar-box {
  background: #1a2d4b;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffd04b;
  border: 2px solid #ffd04b;
  flex-shrink: 0;
}

.info-text .name { 
  color: #fff; 
  font-size: 20px; 
  font-weight: bold;
}

.role-row { 
  margin-top: 6px; 
  display: flex; 
  align-items: center; 
  gap: 8px; 
}

.role-row .tag { 
  background: #ffd04b; 
  color: #0d2a61; 
  font-size: 11px; 
  padding: 2px 6px; 
  border-radius: 4px; 
  font-weight: bold;
}

.role-row .dept { 
  color: #90a4ae; 
  font-size: 12px;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 7. 导航菜单 - 修正字号与样式 */
.hb-menu {
  flex: 1;
  border-right: none !important;
  overflow-y: auto; /* 菜单过多时可滚动 */
}

.el-menu-item {
  font-size: 16px !important;
  height: 56px !important;
  line-height: 56px !important;
}

.menu-sep {
  margin: 15px 0 5px !important;
  border-top-color: rgba(255, 255, 255, 0.1) !important;
  color: #546e7a !important;
  font-size: 12px;
}

/* 8. 主内容区 - 修正滚动逻辑 */
.hb-main {
  background-color: #f4f7fa;
  padding: 25px !important;
  overflow-y: auto; /* 核心：只有这里负责垂直滚动 */
  display: flex;
  flex-direction: column;
}

/* 全局滚动条美化 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 4px;
}
::-webkit-scrollbar-track {
  background: #f1f1f1;
}
</style>