const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid'); // 引入 UUID 模組
const fs = require('fs');

// 初始化應用程序
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// 服務靜態文件
app.use(express.static('public'));

// 用戶列表
let users = [];
let emoji_list = ['🍇',
    '🍈',
    '🍉',
    '🍊',
    '🍋',
    '🍍',
    '🍎',
    '🍏',
    '🍐',
    '🍑',
    '🍒',
    '🍓',
    '🥝',
    '🍅',
    '🥑',
    '🍆',
    '🥔',
    '🥕',
    '🌽',
    '🌶',
    '🥒',
    '🥜',
    '🌰',
    '🥐',
    '🥖',
    '🥞',
    '🧀',
    '🍖',
    '🍗',
    '🥓',
    '🍔',
    '🍟',
    '🍕',
    '🌭',
    '🌮',
    '🌯',
    '🥚',
    '🍳',
    '🥘',
    '🍲',
    '🥗',
    '🍿',
    '🍱',
    '🍘',
    '🍙',
    '🍚',
    '🍛',
    '🍜',
    '🍝',
    '🍠',
    '🍢',
    '🍣',
    '🍤',
    '🍥',
    '🍡',
    '🦀',
    '🦐',
    '🦑',
    '🍦',
    '🍧',
    '🍨',
    '🍩',
    '🍪',
    '🎂',
    '🍰',
    '🍫',
    '🍬',
    '🍭',
    '🍮',
    '🍯',
    '🍼',
    '🥛',
    '☕',
    '🍶',
    '🍾',
    '🍷',
    '🍸',
    '🍹',
    '🍺',
    '🍻',
    '🥂',
    '🥃',
    '🍽',
    '🍴',
    '🥄',
    '🔪',
    '🏺'
];

const historyFile = 'chat_history.json';
let chatHistory = [];

// 讀取歷史紀錄
fs.readFile(historyFile, 'utf8', (err, data) => {
    if (!err) {
        chatHistory = JSON.parse(data);
        // 過濾超過3天的歷史紀錄
        const thirtyDaysAgo = new Date().getTime() - 3 * 24 * 60 * 60 * 1000;
        chatHistory = chatHistory.filter(message => new Date(message.timestamp).getTime() > thirtyDaysAgo);
        fs.writeFile(historyFile, JSON.stringify(chatHistory, null, 2), () => { });
    }
});

// 添加根路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html')); // 發送 index.html 文件
});


// 當客戶端連接時
io.on('connection', (socket) => {
    const ip = socket.handshake.address; // 獲取用戶的 IP 地址
    console.log(`A user connected: ${ip}`);
    const user_uuid = uuidv4(); // 生成唯一的用戶 ID

    // 發送歷史紀錄
    socket.emit('chat history', chatHistory);

    // 處理用戶加入
    socket.on('user joined', (userName) => {
        console.log('A user connected:' + userName);
        socket.username = emoji_list[Math.floor(Math.random() * emoji_list.length)] + " " + userName + `||${user_uuid}`;
        users.push(socket.username); // 添加用戶名到用戶列表
        io.emit('user list', users); // 發送用戶列表給所有客戶端
    });

    // 處理用戶名稱變更
    socket.on('change username', (newUserName) => {
        const oldUserName = socket.username;
        if (oldUserName) {
            const userIndex = users.findIndex(user => user === oldUserName);
            if (userIndex !== -1) {
                const uuid = oldUserName.split('||')[1];
                const emoji = oldUserName.split(' ')[0];
                const newSocketUsername = `${emoji} ${newUserName}||${uuid}`;

                users[userIndex] = newSocketUsername;
                socket.username = newSocketUsername;

                io.emit('user list', users);
            }
        }
    });

    // 當收到消息時，廣播給所有連接的客戶端
    socket.on('chat message', (msg) => {
        const message = {
            content: msg,
            timestamp: new Date()
        };
        chatHistory.push(message);
        fs.writeFile(historyFile, JSON.stringify(chatHistory, null, 2), () => { });
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
