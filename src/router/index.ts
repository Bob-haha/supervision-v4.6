import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/home' },

    // 首页看板
    { path: '/home', component: () => import('@/views/Home/Home.vue') },

    // 任务管理
    { path: '/task/new', component: () => import('@/views/TaskNew/TaskNew.vue') },
    { path: '/task/:id', component: () => import('@/views/TaskDetail/TaskDetail.vue') },
    { path: '/task/my', component: () => import('@/views/MyTasks/MyTasks.vue') },

    // 督办看板
    { path: '/inspector', component: () => import('@/views/Inspector/InspectorDashboard.vue') },

    // 配置管理
    { path: '/config/flow', component: () => import('@/views/Config/FlowConfig.vue') },
    { path: '/config/datasheet', component: () => import('@/views/Config/DataSheetConfig.vue') },
    { path: '/config/fields', component: () => import('@/views/Config/FieldsConfig.vue') },
    { path: '/config/metrics', component: () => import('@/views/Config/MetricsConfig.vue') },
    { path: '/config/files', component: () => import('@/views/Config/FilesConfig.vue') },
    { path: '/config/types', component: () => import('@/views/Config/TypesConfig.vue') },
    { path: '/config/organization', component: () => import('@/views/Config/OrganizationConfig.vue') },

    // 统计（保留）
    { path: '/stats/dept', component: () => import('@/views/Stats/DeptStats.vue') },
    { path: '/stats/guanqu', component: () => import('@/views/Stats/GuanquStats.vue') },

    // 系统管理（保留）
    { path: '/admin/personnel', component: () => import('@/views/Admin/PersonnelManage.vue') },
    { path: '/admin/departments', component: () => import('@/views/Admin/DeptManage.vue') },
    { path: '/admin/roles', component: () => import('@/views/Admin/RoleManage.vue') },
    { path: '/admin/settings', component: () => import('@/views/Admin/Settings.vue') },
    { path: '/admin/signaling', redirect: '/admin/settings' },

    // 兼容旧路由
    { path: '/dashboard', redirect: '/home' },
    { path: '/tasks', redirect: '/task/my' },
    { path: '/host', redirect: '/task/my' },
    { path: '/Co-organized', redirect: '/task/my' },
    { path: '/dept-completed', redirect: '/task/my' },
    { path: '/my-watched', redirect: '/task/my' },
    { path: '/process/templates', redirect: '/config/flow' },
    { path: '/supervision', redirect: '/inspector' },
    { path: '/history', redirect: '/task/my' },
  ],
})

export default router
