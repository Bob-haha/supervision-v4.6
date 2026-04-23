import os
import socket
import eventlet
import socketio
from flask import Flask, send_from_directory

# 1. 初始化 Flask 和 Socket.IO
sio = socketio.Server(cors_allowed_origins='*')
app = Flask(__name__, static_folder='dist') # 指向打包后的文件夹

# 2. 补全 WASM 的 MIME 类型 (解决麒麟系统可能报错的问题)
import mimetypes
mimetypes.add_type('application/wasm', '.wasm')

# 3. 信令逻辑：与原来的 JS 逻辑完全一致
@sio.event
def connect(sid, environ):
    print(f"用户已连接: {sid}")

@sio.event
def join(sid, room):
    sio.enter_room(sid, room)
    print(f"用户 {sid} 加入房间: {room}")
    # 广播给房间内其他人：有新人加入
    sio.emit('user-joined', sid, room=room, skip_sid=sid)

@sio.event
def signal(sid, data):
    # 转发 WebRTC 握手信号
    target_sid = data.get('to')
    sio.emit('signal', {
        'from': sid,
        'signal': data.get('signal')
    }, room=target_sid)

@sio.event
def disconnect(sid):
    print(f"用户离开: {sid}")

# 4. 网页托管逻辑 (SPA 路由支持)
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path != "" and os.path.exists(app.static_folder + '/' + path):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')

# 5. 自动获取内网 IP 地址
def get_host_ip():
    s = None
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        
        ip = s.getsockname()[0]
    finally:
        if s:
            s.close()
    return ip

if __name__ == '__main__':
    # 包装 Flask App
    app_combined = socketio.WSGIApp(sio, app)
    
    port = 3030
    local_ip = get_host_ip()
    
    print(f"-------------------------------------------")
    print(f"🚀 督办系统分发中心 (Python版) 已启动")
    print(f"主 机 IP: {local_ip}")
    print(f"访问地址: http://{local_ip}:{port}")
    print(f"-------------------------------------------")
    print(f"提示：请确保同事浏览器已开启 unsafely-treat-insecure-origin 权限")
    
    # 启动服务器
    eventlet.wsgi.server(eventlet.listen(('0.0.0.0', port)), app_combined)