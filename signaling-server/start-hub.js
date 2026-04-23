// signaling-server/start-hub.js
const express = require('express');
const { Server } = require("socket.io");
const http = require('http');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);

// 1. 托管网页 (把 dist 文件夹放在 signaling-server 的上一级)
app.use(express.static(path.join(__dirname, '../dist')));

// 2. 信令服务器逻辑
const io = new Server(server, { cors: { origin: "*" } });
io.on("connection", (socket) => {
  socket.on("signal", (data) => io.to(data.to).emit("signal", { from: socket.id, signal: data.signal }));
  socket.on("join", (room) => {
    socket.join(room);
    socket.to(room).emit("user-joined", socket.id);
  });
});

// 获取主机内网 IP
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (let name in interfaces) {
    for (let iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

const PORT = 3030;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`------------------------------------------------`);
  console.log(`✅ 督办系统分发中心已启动！`);
  console.log(`请让同事在浏览器打开：http://${getLocalIP()}:${PORT}`);
  console.log(`------------------------------------------------`);
});