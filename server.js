const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

const emoji_list = ['🍇',
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


// In-memory data store for rooms
let rooms = {};

// Helper function to get room details
const getRoomsList = () => {
    const allRooms = {};
    for (const roomName in rooms) {
        allRooms[roomName] = {
            name: roomName,
            userCount: rooms[roomName].users.length,
            isPublic: rooms[roomName].isPublic
        };
    }
    return allRooms;
};

io.on('connection', (socket) => {
    console.log(`A user connected: ${socket.id}`);

    // Send the initial list of rooms
    socket.emit('room list', getRoomsList());

    socket.on('create room', ({ roomName, password, userName }) => {
        if (rooms[roomName]) {
            return socket.emit('error message', 'Room name already exists.');
        }

        const user = {
            id: socket.id,
            uuid: uuidv4(),
            name: userName,
            emoji: emoji_list[Math.floor(Math.random() * emoji_list.length)]
        };

        rooms[roomName] = {
            users: [user],
            history: [],
            isPublic: !password,
            password: password || null
        };

        socket.join(roomName);
        socket.room = roomName;
        socket.user = user;

        console.log(`User ${user.name} created and joined room: ${roomName}`);

        socket.emit('join success', { roomName, users: rooms[roomName].users, history: rooms[roomName].history });
        io.emit('room list', getRoomsList()); // Broadcast updated room list to everyone
    });

    socket.on('join room', ({ roomName, password, userName }) => {
        const room = rooms[roomName];
        if (!room) {
            return socket.emit('error message', 'Room does not exist.');
        }
        if (!room.isPublic && room.password !== password) {
            return socket.emit('error message', 'Incorrect password.');
        }

        const user = {
            id: socket.id,
            uuid: uuidv4(),
            name: userName,
            emoji: emoji_list[Math.floor(Math.random() * emoji_list.length)]
        };

        room.users.push(user);
        socket.join(roomName);
        socket.room = roomName;
        socket.user = user;

        console.log(`User ${user.name} joined room: ${roomName}`);

        // Send room data to the joining user
        socket.emit('join success', { roomName, users: room.users, history: room.history });
        // Update user list for others in the room
        socket.to(roomName).emit('user list', room.users);
        // Update user count in public room list
        io.emit('room list', getRoomsList());
    });

    socket.on('chat message', (msg) => {
        if (!socket.room || !socket.user) {
            return; // Ignore messages from users not in a room
        }
        const room = rooms[socket.room];
        if (!room) {
            return;
        }

        const message = {
            user: socket.user,
            content: msg,
            timestamp: new Date()
        };

        room.history.push(message);
        // Limit history to last 100 messages
        if (room.history.length > 100) {
            room.history.shift();
        }

        io.to(socket.room).emit('chat message', message);
    });

    socket.on('disconnect', () => {
        console.log(`A user disconnected: ${socket.id}`);
        if (socket.room && socket.user) {
            const room = rooms[socket.room];
            if (room) {
                room.users = room.users.filter(u => u.id !== socket.id);
                // If room is empty, remove it after a delay (e.g., 60 seconds)
                if (room.users.length === 0) {
                    console.log(`Room ${socket.room} is empty. It will be removed in 24 hours.`);
                    setTimeout(() => {
                        const currentRoom = rooms[socket.room];
                        if (currentRoom && currentRoom.users.length === 0) {
                            delete rooms[socket.room];
                            io.emit('room list', getRoomsList());
                            console.log(`Room ${socket.room} has been removed.`);
                        }
                    }, 24 * 60 * 60 * 1000); // 24 hours
                } else {
                    // Broadcast updated user list
                    io.to(socket.room).emit('user list', room.users);
                    io.emit('room list', getRoomsList()); // Update user count
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});