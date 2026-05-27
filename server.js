// 信令服务器 - 用于 P2P 协作同步
// 启动: node server.js
// 默认端口 3030，可通过环境变量 PORT 修改

import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3030;
const ROOT = __dirname;

// 简易静态文件服务
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function serveFile(res, filePath) {
  const ext = path.extname(filePath);
  const mime = MIME[ext] || 'application/octet-stream';
  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
}

const server = http.createServer((req, res) => {
  // 健康检查端点
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    return;
  }

  // 静态文件服务 - 先查 dist，再查根目录
  let filePath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  let fullPath = path.join(ROOT, 'dist', filePath);
  if (!fs.existsSync(fullPath)) {
    fullPath = path.join(ROOT, filePath);
  }
  serveFile(res, fullPath);
});

// Socket.IO 信令服务
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e8,
});

io.on('connection', (socket) => {
  console.log(`[连接] ${socket.id}`);

  socket.on('signal', (data) => {
    if (data.to) {
      io.to(data.to).emit('signal', { from: socket.id, signal: data.signal });
    }
  });

  socket.on('join', (room) => {
    socket.join(room);
    socket.to(room).emit('user-joined', socket.id);
    console.log(`[加入] ${socket.id} -> ${room}`);
  });

  socket.on('disconnecting', () => {
    socket.rooms.forEach((room) => {
      if (room !== socket.id) {
        io.to(room).emit('user-left', socket.id);
      }
    });
  });

  socket.on('disconnect', () => {
    console.log(`[断开] ${socket.id}`);
  });
});

function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIPs();
  console.log('');
  console.log('══════════════════════════════════════════════');
  console.log('  信令服务器已启动');
  console.log('══════════════════════════════════════════════');
  console.log('');
  console.log('  端口: ' + PORT);
  console.log('');
  if (ips.length > 0) {
    console.log('  局域网地址 (其他用户填入此地址):');
    ips.forEach((ip) => console.log('    http://' + ip + ':' + PORT));
  }
  console.log('');
  console.log('  本机访问: http://localhost:' + PORT);
  console.log('  健康检查: http://localhost:' + PORT + '/health');
  console.log('');
  console.log('══════════════════════════════════════════════');
});
