import type { Personnel } from '@/types';
import { DEPT_MAP } from '@/constants';

export interface TreeNode {
  id: string;
  label: string;
  children?: TreeNode[];
  data?: Personnel;
}

/** 将扁平人员列表构建为部门→人员的树结构 */
export function buildOrgTree(personnelList: Personnel[]): TreeNode[] {
  const deptMap = new Map<string, Personnel[]>();

  for (const p of personnelList) {
    const list = deptMap.get(p.dept_id) || [];
    list.push(p);
    deptMap.set(p.dept_id, list);
  }

  const tree: TreeNode[] = [];

  for (const [deptId, members] of deptMap.entries()) {
    const deptName = DEPT_MAP[deptId] || deptId;

    // 部门负责人排在前面
    members.sort((a, b) => b.is_dept_head - a.is_dept_head);

    tree.push({
      id: deptId,
      label: deptName,
      children: members.map(p => ({
        id: p.id,
        label: `${p.name}${p.position ? ' - ' + p.position : ''}`,
        data: p,
      })),
    });
  }

  return tree;
}

/** 将 DEPT_MAP 转换为部门树（不含具体人员） */
export function buildDeptTree(): TreeNode[] {
  return Object.entries(DEPT_MAP).map(([id, name]) => ({
    id,
    label: name,
  }));
}
