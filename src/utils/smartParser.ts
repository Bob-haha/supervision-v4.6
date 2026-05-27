import type { ParseResult, TaskSource } from '@/types';
import { DEPT_MAP } from '@/constants';

/**
 * 规则化智能解析：从粘贴文本中提取任务结构
 */
export function parseSmartImport(text: string): ParseResult {
  if (!text || !text.trim()) {
    return { mainTitle: '', source: 'OTHER', defaultDeadline: '', workItems: [] };
  }

  const cleaned = text.replace(/\s+/g, ' ').trim();

  const source = extractSource(cleaned);
  const deadlines = extractDates(cleaned);
  const defaultDeadline = deadlines.length > 0 ? deadlines[0] : '';
  const workItems = extractWorkItems(cleaned, defaultDeadline);
  const mainTitle = workItems.length > 0
    ? workItems[0].title
    : cleaned.substring(0, 40);

  return { mainTitle, source, defaultDeadline, workItems };
}

/** 识别任务来源 */
function extractSource(text: string): TaskSource {
  if (/公文|来文|收文|发文|函件/.test(text)) return 'DOCUMENT';
  if (/邮件|email|邮箱/.test(text)) return 'EMAIL';
  if (/系统通知|系统提醒|OA|办公系统/.test(text)) return 'SYSTEM_NOTICE';
  if (/领导交办|领导指示|批示|交办/.test(text)) return 'LEADER_ASSIGN';
  return 'OTHER';
}

/** 提取所有日期 */
function extractDates(text: string): string[] {
  const results: string[] = [];
  const now = new Date();
  const year = now.getFullYear();

  // 匹配 X月X日 格式
  const mdRegex = /(\d{1,2})\s*月\s*(\d{1,2})\s*日/g;
  let match;
  while ((match = mdRegex.exec(text)) !== null) {
    const m = match[1].padStart(2, '0');
    const d = match[2].padStart(2, '0');
    results.push(`${year}-${m}-${d}`);
  }

  // 匹配 YYYY年X月X日 格式
  const ymdRegex = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g;
  while ((match = ymdRegex.exec(text)) !== null) {
    const y = match[1];
    const m = match[2].padStart(2, '0');
    const d = match[3].padStart(2, '0');
    results.push(`${y}-${m}-${d}`);
  }

  // 匹配 X月X日前 / X月X日之前
  const beforeRegex = /(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*[之前]/g;
  while ((match = beforeRegex.exec(text)) !== null) {
    const m = match[1].padStart(2, '0');
    const d = match[2].padStart(2, '0');
    if (!results.some(r => r.includes(`${m}-${d}`))) {
      results.push(`${year}-${m}-${d}`);
    }
  }

  return results;
}

/** 提取部门 */
function extractDepartments(text: string): string[] {
  const found: string[] = [];
  const deptNames = Object.values(DEPT_MAP);

  // 完全匹配科室全名
  for (const name of deptNames) {
    if (text.includes(name) && !found.includes(name)) {
      found.push(name);
    }
  }

  // 短关键词匹配
  const deptKeywords: Record<string, string> = {
    '纪检': 'dept_01', '办公室': 'dept_02', '人事政工': 'dept_03', '综合保障': 'dept_04',
    '综合业务一': 'dept_05', '综合业务二': 'dept_06', '查验一': 'dept_07', '查验二': 'dept_08',
    '查验三': 'dept_09', '监控管理': 'dept_10', '物流监控': 'dept_11', '船舶清关': 'dept_12',
    '船舶检查': 'dept_13', '验估一': 'dept_14', '验估二': 'dept_15', '验估三': 'dept_16',
    '跨境贸易': 'dept_17', '贸易便利化': 'dept_17',
  };

  for (const [keyword, deptId] of Object.entries(deptKeywords)) {
    if (text.includes(keyword)) {
      const deptName = DEPT_MAP[deptId];
      if (deptName && !found.includes(deptName)) {
        found.push(deptName);
      }
    }
  }

  return found;
}

/** 按部门名查找 dept_id */
function findDeptId(name: string): string {
  for (const [id, dname] of Object.entries(DEPT_MAP)) {
    if (dname === name) return id;
    if (name.includes(dname) || dname.includes(name)) return id;
  }
  return '';
}

/** 拆分工作事项 */
function extractWorkItems(
  text: string,
  defaultDeadline: string,
): Array<{ title: string; department: string; deadline: string }> {
  const departments = extractDepartments(text);

  // 按分隔符拆分句子
  const sentences = text
    .split(/[。；;，,\n]+/)
    .map(s => s.trim())
    .filter(s => s.length > 4);

  // 尝试匹配"部门+完成+事项"模式
  const items: Array<{ title: string; department: string; deadline: string }> = [];

  for (const sentence of sentences) {
    // 查找句子中涉及的部门
    let dept = '';
    for (const d of departments) {
      if (sentence.includes(d) || sentence.includes(d.substring(0, 3))) {
        dept = d;
        break;
      }
    }

    // 提取句中的日期
    const dates = extractDates(sentence);
    const deadline = dates.length > 0 ? dates[0] : defaultDeadline;

    // 生成事项标题：去掉部门名和日期后剩余的文本
    let title = sentence;
    if (dept) {
      title = title.replace(dept, '').replace(dept.substring(0, 3), '');
    }
    for (const d of dates) {
      const dParts = d.split('-');
      title = title
        .replace(new RegExp(`${dParts[0]}年${parseInt(dParts[1])}月${parseInt(dParts[2])}日`), '')
        .replace(new RegExp(`${parseInt(dParts[1])}月${parseInt(dParts[2])}日`), '')
        .replace(/[之前完成]+$/, '');
    }
    title = title.replace(/[，。,\.\s]+/g, ' ').replace(/请|要求|负责|牵头/g, '').trim();

    if (title.length >= 2) {
      items.push({
        title: title.length > 30 ? title.substring(0, 30) : title,
        department: dept ? findDeptId(dept) : '',
        deadline,
      });
    }
  }

  // 如果没有匹配到具体事项，将整个文本作为一个任务
  if (items.length === 0) {
    const dept = departments.length > 0 ? findDeptId(departments[0]) : '';
    items.push({
      title: text.substring(0, 40),
      department: dept,
      deadline: defaultDeadline,
    });
  }

  return items;
}
