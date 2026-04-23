import { createRouter, createWebHistory } from 'vue-router';
import Dashboard from '@/views/Dashboard/Dashboard.vue';
import TaskView from '@/views/Task/index.vue';
import HistoryView from '@/views/Task/HistoryView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
     { path: '/', redirect: '/dashboard' }, // 首页重定向
    { path: '/dashboard', component: Dashboard },
  { path: '/tasks', component: TaskView }, // 全部事项
  { path: '/host', component: TaskView },  // 主办事项 (复用)
  { path: '/Co-organized', component: TaskView }, // 协办事项 (复用)
  { path: '/dept-completed', component: TaskView }, // 科室办结事项 (复用)
  { path: '/history', component: HistoryView }
  ]
});

export default router;