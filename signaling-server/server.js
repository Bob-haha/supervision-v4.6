// signaling-server/server.js
const { Server } = require("socket.io");

const io = new Server(3030, {
  cors: { origin: "*" }
});

io.on("connection", (socket) => {
  console.log("用户连接:", socket.id);

  // 转发 WebRTC 握手信息
  socket.on("signal", (data) => {
    io.to(data.to).emit("signal", {
      from: socket.id,
      signal: data.signal
    });
  });

  // 广播新成员加入
  socket.on("join", (room) => {
    socket.join(room);
    socket.to(room).emit("user-joined", socket.id);
  });

  // 【新增】：当某个窗口关闭或断开连接时，通知房间里其他人
  socket.on("disconnecting", () => {
    socket.rooms.forEach(room => {
      if (room !== socket.id) {
        io.to(room).emit("user-left", socket.id);
      }
    });
  });

  socket.on("disconnect", () => {
    console.log("用户离开:", socket.id);
  });
});

console.log("信令服务器运行在端口 3030");