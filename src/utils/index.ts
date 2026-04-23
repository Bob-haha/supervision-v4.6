// src/utils/index.ts

/**
 * 格式化日期时间
 * @param dateStr 字符串日期
 * @param type 'date' | 'datetime'
 */
export const formatDate = (dateStr: string | null, type: 'date' | 'datetime' = 'datetime') => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  
  return type === 'date' ? `${y}-${m}-${d}` : `${y}-${m}-${d} ${h}:${min}`;
};

/**
 * 安全解析 JSON
 */
export const safeParse = (str: any, defaultVal: any = {}) => {
  if (!str) return defaultVal;
  try {
    return typeof str === 'string' ? JSON.parse(str) : str;
  } catch (e) {
    return defaultVal;
  }
};