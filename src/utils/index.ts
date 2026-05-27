// src/utils/index.ts
import { v4 as uuidv4 } from 'uuid';

/**
 * 格式化日期时间
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
  } catch {
    return defaultVal;
  }
};

/** 生成 UUID v4 */
export function generateUUID(): string {
  return uuidv4();
}

/** 获取或生成客户端 ID（持久化到 localStorage） */
export function generateClientId(): string {
  let clientId = localStorage.getItem('p2p-client-id');
  if (!clientId) {
    clientId = uuidv4();
    localStorage.setItem('p2p-client-id', clientId);
  }
  return clientId;
}

/** ArrayBuffer → Base64 字符串 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Base64 字符串 → ArrayBuffer */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
