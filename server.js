const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid'); // 引入 UUID 模組

// 初始化應用程序
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// 服務靜態文件
app.use(express.static('public'));

// 用戶列表
let users = [];
let emoji_list = [
    '🍇', '🍈',
    '🍉', '🍊', '🍋'
]

// 添加根路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html')); // 發送 index.html 文件
});


// 當客戶端連接時
io.on('connection', (socket) => {
    const ip = socket.handshake.address; // 獲取用戶的 IP 地址
    console.log(`A user connected: ${ip}`);
    const user_uuid = uuidv4(); // 生成唯一的用戶 ID

    // 處理用戶加入
    socket.on('user joined', (userName) => {
        console.log('A user connected:' + userName);
        socket.username = emoji_list[users.length + 1] + " " + userName + `||${user_uuid}`;
        users.push(socket.username); // 添加用戶名到用戶列表
        io.emit('user list', users); // 發送用戶列表給所有客戶端
    });

    // 當收到消息時，廣播給所有連接的客戶端
    socket.on('chat message', (msg) => {
        io.emit('chat message', msg);
    });

    // 當客戶端斷開時
    socket.on('disconnect', () => {
        console.log('User disconnected: ' + socket.username);
        // 從用戶列表中移除該用戶
        users = users.filter(user => user !== socket.username);
        io.emit('user list', users); // 更新用戶列表
    });
});

// 啟動伺服器
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
