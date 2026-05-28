import fs from 'fs';
import path from 'path';

// 读取 WASM 文件并转换为 base64
const wasmPath = path.join(path.dirname(import.meta.url).replace('file:///', ''), '../public/sqljs/sql-wasm.wasm');
const wasmData = fs.readFileSync(wasmPath);
const base64Data = wasmData.toString('base64');

// 生成 TypeScript 文件
const outputPath = path.join(path.dirname(import.meta.url).replace('file:///', ''), '../src/core/database/wasmData.ts');
const content = `export const wasmBase64 = '${base64Data}';`;

fs.writeFileSync(outputPath, content);
console.log('WASM data file generated successfully!');
