const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const MAX_TIMEOUT_DELAY = 2147483647; // approx 24.8 days

function setLongTimeout(callback, delay) {
    if (delay > MAX_TIMEOUT_DELAY) {
        const remaining = delay - MAX_TIMEOUT_DELAY;
        // Set a timeout for the max delay, and then recursively call setLongTimeout with the remaining time
        return setTimeout(() => {
            setLongTimeout(callback, remaining);
        }, MAX_TIMEOUT_DELAY);
    }

    return setTimeout(callback, delay);
}

app.use(express.static('public'));

const DATA_DIR = 'data';
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');

// In-memory store for room cleanup timeouts
const roomTimeouts = {};

// Load data from DB file
let rooms = {};
try {
    if (fs.existsSync(ROOMS_FILE)) {
        const data = fs.readFileSync(ROOMS_FILE, 'utf8');
        rooms = JSON.parse(data);
        // Initialize an empty users array for each room on startup
        for (const roomUUID in rooms) {
            rooms[roomUUID].users = [];
            // Reschedule auto-close for empty rooms on startup
            if (rooms[roomUUID].closingTime) {
                const closingTime = new Date(rooms[roomUUID].closingTime);
                const now = new Date();
                const delay = closingTime - now;

                if (delay > 0) {
                    console.log(`Rescheduling closing for room ${rooms[roomUUID].name} in ${delay / 1000 / 60} minutes.`);
                    roomTimeouts[roomUUID] = setLongTimeout(() => {
                        closeRoom(roomUUID);
                        delete roomTimeouts[roomUUID];
                    }, delay);
                } else {
                    // If closing time has passed, close it immediately
                    console.log(`Closing time for room ${rooms[roomUUID].name} has passed. Closing now.`);
                    closeRoom(roomUUID);
                }
            }
        }
    }
} catch (err) {
    console.error('Error reading database file:', err);
}

// Function to save data to DB file
const saveData = () => {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR);
        }
        const roomsToSave = JSON.parse(JSON.stringify(rooms));
        for (const roomUUID in roomsToSave) {
            delete roomsToSave[roomUUID].users;
        }
        const data = JSON.stringify(roomsToSave, null, 2);
        fs.writeFileSync(ROOMS_FILE, data, 'utf8');
    } catch (err) {
        console.error('Error writing to database file:', err);
    }
};

const emitOnlineUsersCount = () => {
    io.emit('online users count', io.engine.clientsCount);
};

const emoji_list = ['🍇', '🍈', '🍉', '🍊', '🍋', '🍍', '🍎', '🍏', '🍐', '🍑', '🍒', '🍓', '🥝', '🍅', '🥑', '🍆', '🥔', '🥕', '🌽', '🌶', '🥒', '🥜', '🌰', '🥐', '🥖', '🥞', '🧀', '🍖', '🍗', '🥓', '🍔', '🍟', '🍕', '🌭', '🌮', '🌯', '🥚', '🍳', '🥘', '🍲', '🥗', '🍿', '🍱', '🍘', '🍙', '🍚', '🍛', '🍜', '🍝', '🍠', '🍢', '🍣', '🍤', '🍥', '🍡', '🦀', '🦐', '🦑', '🍦', '🍧', '🍨', '🍩', '🍪', '🎂', '🍰', '🍫', '🍬', '🍭', '🍮', '🍯', '🍼', '🥛', '☕', '🍶', '🍾', '🍷', '🍸', '🍹', '🍺', '🍻', '🥂', '🥃', '🍽', '🍴', '🥄', '🔪', '🏺'];

const getRoomsList = () => {
    const allRooms = [];
    for (const roomUUID in rooms) {
        allRooms.push({
            uuid: roomUUID,
            name: rooms[roomUUID].name,
            userCount: rooms[roomUUID].users.length,
            isPublic: rooms[roomUUID].isPublic,
            isListed: rooms[roomUUID].isListed,
            creator: rooms[roomUUID].creator,
            closingTime: rooms[roomUUID].closingTime || null
        });
    }
    return allRooms;
};

const closeRoom = (roomUUID) => {
    const room = rooms[roomUUID];
    if (!room) return;

    console.log(`Closing room ${room.name} (${roomUUID})`);
    io.to(roomUUID).emit('room closed', 'The room has been closed by the creator.');
    
    // Disconnect all users in the room
    room.users.forEach(user => {
        const socketInstance = io.sockets.sockets.get(user.id);
        if (socketInstance) {
            socketInstance.leave(roomUUID);
        }
    });

    delete rooms[roomUUID];
    io.emit('room list', getRoomsList());
    saveData();
    emitOnlineUsersCount(); // Emit after room closed (users disconnected)
};

io.on('connection', (socket) => {
    console.log(`A user connected: ${socket.id}`);
    emitOnlineUsersCount(); // Emit on connection

    socket.emit('room list', getRoomsList());

    socket.on('create room', ({ roomName, password, userName, userUUID, isListed, autoCloseMinutes }) => {
        const roomUUID = uuidv4();
        const user = {
            id: socket.id,
            uuid: userUUID,
            name: userName,
            emoji: emoji_list[Math.floor(Math.random() * emoji_list.length)]
        };

        rooms[roomUUID] = {
            uuid: roomUUID,
            name: roomName,
            users: [user],
            history: [],
            isPublic: !password,
            password: password || null,
            creator: userUUID,
            isListed: isListed,
            autoCloseMinutes: parseInt(autoCloseMinutes, 10) || 1440 // Default to 24 hours
        };

        socket.join(roomUUID);
        socket.room = roomUUID;
        socket.user = user;

        console.log(`User ${user.name} created and joined room: ${roomName} (${roomUUID})`);

        socket.emit('join success', { roomUUID, roomName, users: rooms[roomUUID].users, history: rooms[roomUUID].history, creator: rooms[roomUUID].creator });
        io.emit('room list', getRoomsList());
        saveData();
        emitOnlineUsersCount(); // Emit after user creates and joins a room
    });

    socket.on('check room status', (roomUUID) => {
        const room = rooms[roomUUID];
        if (room) {
            socket.emit('room status response', { roomUUID, isPublic: room.isPublic });
        } else {
            // If the room doesn't exist, treat it as an error and inform the user.
            socket.emit('error message', `The room you are trying to join does not exist.`);
            // Also remove the hash from their URL to prevent retries.
            socket.emit('clear hash'); 
        }
    });

    socket.on('join room', ({ roomUUID, password, userName, userUUID: clientUUID }) => {
        const room = rooms[roomUUID];
        if (!room) {
            return socket.emit('error message', 'Room does not exist.');
        }
        if (!room.isPublic && room.password !== password) {
            return socket.emit('error message', 'Incorrect password.');
        }

        const user = {
            id: socket.id,
            uuid: clientUUID,
            name: userName,
            emoji: emoji_list[Math.floor(Math.random() * emoji_list.length)]
        };

        // Clear any pending cleanup timeout for this room
        if (roomTimeouts[roomUUID]) {
            clearTimeout(roomTimeouts[roomUUID]);
            delete roomTimeouts[roomUUID];
            delete room.closingTime;
            saveData();
        }

        room.users.push(user);
        socket.join(roomUUID);
        socket.room = roomUUID;
        socket.user = user;

        console.log(`User ${user.name} joined room: ${room.name} (${roomUUID})`);

        socket.emit('join success', { roomUUID: room.uuid, roomName: room.name, users: room.users, history: room.history, creator: room.creator });
        socket.to(roomUUID).emit('user list', room.users);
        io.emit('room list', getRoomsList());
        emitOnlineUsersCount(); // Emit after user joins a room
    });

    socket.on('close room', ({ roomUUID, userUUID }) => {
        const room = rooms[roomUUID];
        if (room && room.creator === userUUID) {
            closeRoom(roomUUID);
        }
    });

    socket.on('get room settings', ({ roomUUID, userUUID }) => {
        const room = rooms[roomUUID];
        if (room && room.creator === userUUID) {
            socket.emit('room settings data', {
                name: room.name,
                password: room.password,
                isListed: room.isListed,
                autoCloseMinutes: room.autoCloseMinutes
            });
        } else {
            socket.emit('error message', 'Not authorized to get room settings.');
        }
    });

    socket.on('update room settings', ({ roomUUID, userUUID, settings }) => {
        const room = rooms[roomUUID];
        if (room && room.creator === userUUID) {
            // Update room properties
            room.name = settings.roomName;
            room.password = settings.password || null;
            room.isPublic = !settings.password;
            room.isListed = settings.isListed;
            room.autoCloseMinutes = parseInt(settings.autoCloseMinutes, 10);

            saveData();

            // Notify clients in the room of the name change
            io.to(roomUUID).emit('room settings updated', { roomName: room.name });

            // Update the lobby list for everyone
            io.emit('room list', getRoomsList());

            // Send success confirmation back to the creator
            socket.emit('generic success', 'Room settings updated successfully!');
        } else {
            socket.emit('error message', 'You are not authorized to edit this room.');
        }
    });

    socket.on('chat message', (msg) => {
        if (!socket.room || !socket.user) return;
        const room = rooms[socket.room];
        if (!room) return;

        const message = { user: socket.user, content: msg, timestamp: new Date() };
        room.history.push(message);
        if (room.history.length > 100) room.history.shift();

        io.to(socket.room).emit('chat message', message);
        saveData();
    });

    socket.on('change emoji', ({ newEmoji, userUUID }) => {
        if (!socket.room || !socket.user) return;
        const room = rooms[socket.room];
        if (!room) return;

        const userToUpdate = room.users.find(user => user.uuid === userUUID);
        if (userToUpdate) {
            userToUpdate.emoji = newEmoji;
            io.to(socket.room).emit('user list', room.users);
        }
    });

    socket.on('disconnect', () => {
        console.log(`A user disconnected: ${socket.id}`);
        if (socket.room && socket.user) {
            const room = rooms[socket.room];
            if (room) {
                room.users = room.users.filter(u => u.id !== socket.id);
                if (room.users.length === 0 && room.autoCloseMinutes > 0) {
                    const closingTime = new Date(new Date().getTime() + room.autoCloseMinutes * 60 * 1000);
                    room.closingTime = closingTime;
                    console.log(`Room ${room.name} (${socket.room}) is empty. It will be removed in ${room.autoCloseMinutes} minutes.`);
                    const delay = room.autoCloseMinutes * 60 * 1000;
                    roomTimeouts[socket.room] = setLongTimeout(() => {
                        closeRoom(socket.room);
                        delete roomTimeouts[socket.room];
                    }, delay);
                    io.emit('room list', getRoomsList());
                    saveData();
                } else {
                    io.to(socket.room).emit('user list', room.users);
                    io.emit('room list', getRoomsList());
                }
            }
        }
    });
    emitOnlineUsersCount(); // Emit on disconnect
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});