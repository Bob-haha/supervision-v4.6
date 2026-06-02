<template>
  <div class="home-page">
    <!-- 关区业务态势（关领导、督办员可见） -->
    <CustomsDashboard v-if="showCustomsDashboard" />

    <!-- 科级业务态势（所有用户可见） -->
    <SectionDashboard />

    <!-- 个人工作台 -->
    <PersonalWorkbench />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, provide } from 'vue'
import { useTaskStore } from '@/stores/task'
import { useAuthStore } from '@/stores/auth'
import { useConfigStore } from '@/stores/config'
import { usePersonnelStore } from '@/stores/personnel'
import { useDepartmentStore } from '@/stores/department'
import CustomsDashboard from './components/CustomsDashboard.vue'
import SectionDashboard from './components/SectionDashboard.vue'
import PersonalWorkbench from './components/PersonalWorkbench.vue'

const taskStore = useTaskStore()
const authStore = useAuthStore()
const configStore = useConfigStore()
const personnelStore = usePersonnelStore()
const deptStore = useDepartmentStore()

const user = computed(() => authStore.user)

const showCustomsDashboard = computed(() => {
  if (!user.value) return false
  // 关领导或督办员
  const pos = (authStore.userInfo as any)?.position || ''
  if (pos.includes('关长') || pos.includes('副关长')) return true
  // 检查 user_roles 表
  const roles = configStore.getUserRoles(user.value.id)
  // 简化：ADMIN/LEADER 角色可看关区态势
  return user.value.role === 'ADMIN' || user.value.role === 'LEADER'
})

onMounted(async () => {
  await taskStore.fetchTasks()
  await personnelStore.fetchAllPersonnel()
  await deptStore.fetchDepartments()
  await configStore.fetchMetricDefinitions()
})
</script>

<style scoped>
.home-page {
  max-width: 1600px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
</style>
