import { DEPT_MAP, STATUS_MAP } from '@/constants';

/** 导出任务列表为 CSV 并触发下载 */
export function exportTasksToCSV(tasks: any[], filename: string = 'tasks_export.csv'): void {
  const headers = ['标题', '承办单位', '状态', '截止日期', '发起时间', '来源', '标签', '主办人'];

  const rows = tasks.map(t => {
    const deptLabel = (t.owner_dept_ids || [])
      .map((id: string) => DEPT_MAP[id] || id)
      .join('、');
    const realStatus = getRealStatus(t);
    const tags = Array.isArray(t.tags)
      ? t.tags.join('、')
      : safeParseArray(t.tags).join('、');

    return [
      escapeCSV(t.title || ''),
      escapeCSV(deptLabel),
      STATUS_MAP[realStatus] || realStatus,
      t.deadline || '',
      (t.created_at || '').substring(0, 10),
      t.source || '其他',
      tags,
      escapeCSV(t.handler_name || ''),
    ];
  });

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadCSV(csv, filename);
}

/** 导出统计数据为 CSV */
export function exportStatsToCSV(stats: Array<{ deptId: string; deptName: string; taskCount: number; completedCount: number; completionRate: number; overdueCount: number }>, filename: string = 'stats_export.csv'): void {
  const headers = ['科室', '任务总数', '已办结', '办结率(%)', '超期数'];

  const rows = stats.map(s => [
    escapeCSV(s.deptName),
    String(s.taskCount),
    String(s.completedCount),
    (s.completionRate * 100).toFixed(1),
    String(s.overdueCount),
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadCSV(csv, filename);
}

function escapeCSV(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function getRealStatus(t: any): string {
  if (t.status === 'COMPLETED') return 'COMPLETED';
  const now = new Date().toISOString().split('T')[0];
  if (t.deadline && t.deadline < now) return 'OVERDUE';
  return 'PENDING';
}

function safeParseArray(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return []; }
}
