import { createRouter, createWebHashHistory } from 'vue-router';
import Dashboard from '@/views/Dashboard/Dashboard.vue';
import TaskView from '@/views/Task/index.vue';
import HistoryView from '@/views/Task/HistoryView.vue';
import TemplateLibrary from '@/views/Process/TemplateLibrary.vue';
import TemplateEditor from '@/views/Process/TemplateEditor.vue';
import SupervisionView from '@/views/Supervision/SupervisionView.vue';

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/dashboard', component: Dashboard },

    // 任务管理
    { path: '/tasks', component: TaskView },
    { path: '/host', component: TaskView },
    { path: '/Co-organized', component: TaskView },
    { path: '/dept-completed', component: TaskView },
    { path: '/my-watched', component: TaskView, meta: { mode: 'watched' } },

    // 流程督办
    { path: '/process/templates', component: TemplateLibrary },
    { path: '/process/template/new', component: TemplateEditor, meta: { isNew: true } },
    { path: '/process/template/:id', component: TemplateEditor },
    { path: '/supervision', component: SupervisionView },
    { path: '/history', component: HistoryView },

    // 数据统计
    { path: '/stats/dept', component: () => import('@/views/Stats/DeptStats.vue') },
    { path: '/stats/guanqu', component: () => import('@/views/Stats/GuanquStats.vue') },

    // 系统管理（懒加载）
    { path: '/admin/personnel', component: () => import('@/views/Admin/PersonnelManage.vue') },
    { path: '/admin/departments', component: () => import('@/views/Admin/DeptManage.vue') },
    { path: '/admin/roles', component: () => import('@/views/Admin/RoleManage.vue') },
    { path: '/admin/settings', component: () => import('@/views/Admin/SystemSettings.vue') },
    { path: '/admin/signaling', component: () => import('@/views/Admin/SignalingSettings.vue') },
  ],
});

export default router;
