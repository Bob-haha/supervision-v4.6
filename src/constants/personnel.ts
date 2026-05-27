// 默认人员目录种子数据（17个科室，约70人）
export const DEFAULT_PERSONNEL = [
  // dept_01 第八派驻纪检组
  { id: 'p001', name: '张振华', dept_id: 'dept_01', position: '纪检组组长', is_dept_head: 1 },
  { id: 'p002', name: '陈小燕', dept_id: 'dept_01', position: '纪检员', is_dept_head: 0 },
  { id: 'p003', name: '杨立新', dept_id: 'dept_01', position: '纪检员', is_dept_head: 0 },

  // dept_02 办公室（党委办公室）
  { id: 'p004', name: '李建国', dept_id: 'dept_02', position: '办公室主任', is_dept_head: 1 },
  { id: 'p005', name: '刘芳', dept_id: 'dept_02', position: '副主任', is_dept_head: 0 },
  { id: 'p006', name: '赵明辉', dept_id: 'dept_02', position: '科员', is_dept_head: 0 },
  { id: 'p007', name: '周雪琴', dept_id: 'dept_02', position: '科员', is_dept_head: 0 },

  // dept_03 人事政工科
  { id: 'p008', name: '王明辉', dept_id: 'dept_03', position: '人事政工科科长', is_dept_head: 1 },
  { id: 'p009', name: '黄丽华', dept_id: 'dept_03', position: '副科长', is_dept_head: 0 },
  { id: 'p010', name: '谢文杰', dept_id: 'dept_03', position: '科员', is_dept_head: 0 },
  { id: 'p011', name: '邓晓琳', dept_id: 'dept_03', position: '科员', is_dept_head: 0 },

  // dept_04 综合保障科
  { id: 'p012', name: '赵志强', dept_id: 'dept_04', position: '综合保障科科长', is_dept_head: 1 },
  { id: 'p013', name: '冯国良', dept_id: 'dept_04', position: '副科长', is_dept_head: 0 },
  { id: 'p014', name: '曹建军', dept_id: 'dept_04', position: '科员', is_dept_head: 0 },
  { id: 'p015', name: '沈玉兰', dept_id: 'dept_04', position: '科员', is_dept_head: 0 },

  // dept_05 综合业务一科
  { id: 'p016', name: '陈伟民', dept_id: 'dept_05', position: '综合业务一科科长', is_dept_head: 1 },
  { id: 'p017', name: '徐志远', dept_id: 'dept_05', position: '副科长', is_dept_head: 0 },
  { id: 'p018', name: '钱伟强', dept_id: 'dept_05', position: '科员', is_dept_head: 0 },
  { id: 'p019', name: '蒋丽萍', dept_id: 'dept_05', position: '科员', is_dept_head: 0 },

  // dept_06 综合业务二科
  { id: 'p020', name: '刘建华', dept_id: 'dept_06', position: '综合业务二科科长', is_dept_head: 1 },
  { id: 'p021', name: '韩雪峰', dept_id: 'dept_06', position: '副科长', is_dept_head: 0 },
  { id: 'p022', name: '唐明亮', dept_id: 'dept_06', position: '科员', is_dept_head: 0 },
  { id: 'p023', name: '彭佳慧', dept_id: 'dept_06', position: '科员', is_dept_head: 0 },

  // dept_07 查验一科
  { id: 'p024', name: '黄志刚', dept_id: 'dept_07', position: '查验一科科长', is_dept_head: 1 },
  { id: 'p025', name: '董文斌', dept_id: 'dept_07', position: '副科长', is_dept_head: 0 },
  { id: 'p026', name: '苏伟雄', dept_id: 'dept_07', position: '科员', is_dept_head: 0 },
  { id: 'p027', name: '黎桂英', dept_id: 'dept_07', position: '科员', is_dept_head: 0 },

  // dept_08 查验二科
  { id: 'p028', name: '周文博', dept_id: 'dept_08', position: '查验二科科长', is_dept_head: 1 },
  { id: 'p029', name: '叶志明', dept_id: 'dept_08', position: '副科长', is_dept_head: 0 },
  { id: 'p030', name: '方永康', dept_id: 'dept_08', position: '科员', is_dept_head: 0 },
  { id: 'p031', name: '袁美丽', dept_id: 'dept_08', position: '科员', is_dept_head: 0 },

  // dept_09 查验三科
  { id: 'p032', name: '吴国栋', dept_id: 'dept_09', position: '查验三科科长', is_dept_head: 1 },
  { id: 'p033', name: '潘志豪', dept_id: 'dept_09', position: '副科长', is_dept_head: 0 },
  { id: 'p034', name: '范俊杰', dept_id: 'dept_09', position: '科员', is_dept_head: 0 },
  { id: 'p035', name: '杜晓霞', dept_id: 'dept_09', position: '科员', is_dept_head: 0 },

  // dept_10 监控管理科
  { id: 'p036', name: '郑晓峰', dept_id: 'dept_10', position: '监控管理科科长', is_dept_head: 1 },
  { id: 'p037', name: '任志勇', dept_id: 'dept_10', position: '副科长', is_dept_head: 0 },
  { id: 'p038', name: '姜海波', dept_id: 'dept_10', position: '科员', is_dept_head: 0 },
  { id: 'p039', name: '钟丽娟', dept_id: 'dept_10', position: '科员', is_dept_head: 0 },

  // dept_11 物流监控科
  { id: 'p040', name: '林海生', dept_id: 'dept_11', position: '物流监控科科长', is_dept_head: 1 },
  { id: 'p041', name: '卢伟明', dept_id: 'dept_11', position: '副科长', is_dept_head: 0 },
  { id: 'p042', name: '蔡志强', dept_id: 'dept_11', position: '科员', is_dept_head: 0 },
  { id: 'p043', name: '许嘉欣', dept_id: 'dept_11', position: '科员', is_dept_head: 0 },

  // dept_12 船舶清关科
  { id: 'p044', name: '何耀祖', dept_id: 'dept_12', position: '船舶清关科科长', is_dept_head: 1 },
  { id: 'p045', name: '罗志强', dept_id: 'dept_12', position: '副科长', is_dept_head: 0 },
  { id: 'p046', name: '高伟杰', dept_id: 'dept_12', position: '科员', is_dept_head: 0 },
  { id: 'p047', name: '邱淑贞', dept_id: 'dept_12', position: '科员', is_dept_head: 0 },

  // dept_13 船舶检查科
  { id: 'p048', name: '孙启明', dept_id: 'dept_13', position: '船舶检查科科长', is_dept_head: 1 },
  { id: 'p049', name: '宋志伟', dept_id: 'dept_13', position: '副科长', is_dept_head: 0 },
  { id: 'p050', name: '田建国', dept_id: 'dept_13', position: '科员', is_dept_head: 0 },
  { id: 'p051', name: '夏玉梅', dept_id: 'dept_13', position: '科员', is_dept_head: 0 },

  // dept_14 验估一科
  { id: 'p052', name: '马志远', dept_id: 'dept_14', position: '验估一科科长', is_dept_head: 1 },
  { id: 'p053', name: '吕俊华', dept_id: 'dept_14', position: '副科长', is_dept_head: 0 },
  { id: 'p054', name: '区伟雄', dept_id: 'dept_14', position: '科员', is_dept_head: 0 },
  { id: 'p055', name: '谭丽冰', dept_id: 'dept_14', position: '科员', is_dept_head: 0 },

  // dept_15 验估二科
  { id: 'p056', name: '朱学文', dept_id: 'dept_15', position: '验估二科科长', is_dept_head: 1 },
  { id: 'p057', name: '秦志明', dept_id: 'dept_15', position: '副科长', is_dept_head: 0 },
  { id: 'p058', name: '江伟杰', dept_id: 'dept_15', position: '科员', is_dept_head: 0 },
  { id: 'p059', name: '阎桂芳', dept_id: 'dept_15', position: '科员', is_dept_head: 0 },

  // dept_16 验估三科
  { id: 'p060', name: '胡明达', dept_id: 'dept_16', position: '验估三科科长', is_dept_head: 1 },
  { id: 'p061', name: '余伟强', dept_id: 'dept_16', position: '副科长', is_dept_head: 0 },
  { id: 'p062', name: '姚志文', dept_id: 'dept_16', position: '科员', is_dept_head: 0 },
  { id: 'p063', name: '段晓红', dept_id: 'dept_16', position: '科员', is_dept_head: 0 },

  // dept_17 跨境贸易便利化科
  { id: 'p064', name: '郭建平', dept_id: 'dept_17', position: '跨境贸易便利化科科长', is_dept_head: 1 },
  { id: 'p065', name: '万志豪', dept_id: 'dept_17', position: '副科长', is_dept_head: 0 },
  { id: 'p066', name: '贺文彬', dept_id: 'dept_17', position: '科员', is_dept_head: 0 },
  { id: 'p067', name: '武嘉琪', dept_id: 'dept_17', position: '科员', is_dept_head: 0 },
];
