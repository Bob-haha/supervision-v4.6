<template>
  <!-- 领导/管理员：批示专区 -->
  <el-card v-if="authStore.isAdmin || authStore.isLeader" shadow="never" class="v3-card leader-card" body-class="leader-body">
    <div class="inst-scroll" v-if="instructions.length">
      <div v-for="item in instructions" :key="item.id" class="inst-item" :class="{ unread: !item.isRead }">
        <div class="inst-top">
          <div class="inst-person-row">
            <span class="inst-dot" v-if="!item.isRead"></span>
            <span class="inst-person">{{ item.leader_name }}</span>
            <el-tag size="small" type="warning" effect="dark">批示</el-tag>
          </div>
          <span class="inst-time">{{ item.created_at?.substring(0, 16) }}</span>
        </div>
        <div class="inst-content">"{{ item.content }}"</div>
        <div class="inst-footer">
          <span class="inst-task">关联: {{ item.taskTitle || '未知任务' }}</span>
          <div class="inst-stats">
            <span class="stat-read">{{ item.readCount }} 已阅</span>
            <span v-if="item.unreadCount" class="stat-unread">{{ item.unreadCount }} 未读</span>
          </div>
        </div>
      </div>
    </div>
    <el-empty v-else description="暂无领导批示" :image-size="50" />
  </el-card>

  <!-- 普通用户：通知公告 -->
  <el-card v-else shadow="never" class="v3-card" body-class="leader-body">
    <div class="notice-scroll" v-if="notices.length">
      <div v-for="n in notices" :key="n.id" class="notice-item">
        <el-icon color="#FAAD14" size="16"><Bell /></el-icon>
        <div class="notice-body">
          <span class="notice-text">{{ n.content }}</span>
          <span class="notice-time">{{ n.time }}</span>
        </div>
      </div>
    </div>
    <el-empty v-else description="暂无通知" :image-size="50" />
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useTaskStore } from '@/stores/task';

const authStore = useAuthStore();
const taskStore = useTaskStore();

// 领导批示数据
const instructions = computed(() => {
  const userId = authStore.user?.id || '';
  const result: any[] = [];
  taskStore.tasks.forEach(t => {
    const comments = taskStore.getTaskComments(t.id);
    comments.forEach(c => {
      const isRead = taskStore.isInstructionRead(c.id, userId);
      const allUsers = 1; // 简化为全关用户数
      const readCount = isRead ? 1 : 0;
      result.push({
        ...c, taskTitle: t.title, isRead,
        readCount, unreadCount: allUsers - readCount,
      });
    });
  });
  return result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 6);
});

// 普通用户通知
const notices = computed(() => {
  const result: any[] = [];
  taskStore.tasks.forEach(t => {
    if (t.deadline && t.status !== 'COMPLETED') {
      const diff = (new Date(t.deadline).getTime() - Date.now()) / 86400000;
      if (diff >= 0 && diff <= 3) {
        result.push({ id: 'dl-' + t.id, content: `${t.title} 即将到期`, time: t.deadline });
      }
    }
  });
  return result.slice(0, 8);
});
</script>

<style scoped>
.v3-card {
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  height: 100%;
}
:deep(.v3-card .el-card__header) {
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-light);
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-primary);
}

.leader-card {
  border-color: #FFE58F;
}

:deep(.leader-body) {
  padding: 8px 16px !important;
  background: #FFFBE6;
}

.inst-scroll { max-height: 282px; overflow-y: auto; }
.inst-scroll::-webkit-scrollbar { width: 4px; }
.inst-scroll::-webkit-scrollbar-thumb { background: #D9C580; border-radius: 2px; }

.inst-item {
  padding: 12px;
  margin-bottom: 8px;
  background: #FFFFFF;
  border-radius: 8px;
  border: 1px solid #F0EBD0;
  transition: box-shadow var(--transition-fast);
}
.inst-item.unread {
  border-left: 3px solid var(--color-danger);
  background: #FFF;
}
.inst-item:hover {
  box-shadow: var(--shadow-sm);
}

.inst-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.inst-person-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.inst-dot {
  width: 7px; height: 7px; border-radius: 50%; background: var(--color-danger);
}

.inst-person {
  font-size: var(--font-size-md);
  font-weight: 600;
  color: var(--text-primary);
}

.inst-time {
  font-size: 11px;
  color: var(--text-tertiary);
}

.inst-content {
  font-size: var(--font-size-md);
  color: var(--text-secondary);
  font-style: italic;
  padding: 4px 0;
  line-height: 1.5;
}

.inst-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 6px;
}

.inst-task {
  font-size: 12px;
  color: var(--color-primary-light);
}

.inst-stats {
  display: flex;
  gap: 12px;
  font-size: 11px;
}
.stat-read { color: var(--text-tertiary); }
.stat-unread { color: var(--color-danger); }

/* 通知公告 */
.notice-scroll { max-height: 282px; overflow-y: auto; }
.notice-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-light);
}
.notice-item:last-child { border-bottom: none; }
.notice-body { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.notice-text { font-size: var(--font-size-md); color: var(--text-secondary); }
.notice-time { font-size: 11px; color: var(--text-tertiary); }
</style>
