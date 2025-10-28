const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config(); // Reads .env file

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const historyFile = __dirname + '/messages.json';
const MY_ADMIN_SECRET = process.env.ADMIN_KEY;

if (!MY_ADMIN_SECRET) {
  console.warn("WARNING: ADMIN_KEY is not set. Admin features will be disabled.");
}

const allowedOrigins = [
  'https://nikisbroke.lol',
  'https://www.nikisbroke.lol'
];

app.use(cors({ origin: allowedOrigins }));
const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

let messageHistory = [];
try {
  if (fs.existsSync(historyFile)) {
    const data = fs.readFileSync(historyFile, 'utf8');
    messageHistory = JSON.parse(data);
    console.log(`Loaded ${messageHistory.length} messages.`);
  } else {
    fs.writeFileSync(historyFile, '[]', 'utf8');
    console.log('Created new messages.json file.');
  }
} catch (err) {
  console.error('Error loading history:', err);
  messageHistory = [];
}

function saveHistory() {
  fs.writeFile(historyFile, JSON.stringify(messageHistory, null, 2), 'utf8', (err) => {
    if (err) console.error('Error saving history:', err);
  });
}

app.get('/', (req, res) => {
  res.send('Backend server is alive and running.');
});

let connectedUsers = {};

io.on('connection', (socket) => {
  console.log(`Device connected: ${socket.id}`);
  socket.isAdmin = false;

  socket.emit('loadHistory', messageHistory);

  socket.on('join', (data) => {
    const { name, adminKey } = data;
    if (MY_ADMIN_SECRET && adminKey === MY_ADMIN_SECRET) {
      socket.isAdmin = true;
      console.log(`${name} joined as ADMIN`);
      socket.emit('adminStatus', { isAdmin: true });
    } else {
      console.log(`${name} joined as User`);
    }
    socket.username = name;
    connectedUsers[socket.id] = name;
    socket.broadcast.emit('userJoined', `${name} joined the room.`);
    io.emit('updateUserList', Object.values(connectedUsers));
  });

  socket.on('sendCode', (data) => {
    const messageData = {
      id: crypto.randomUUID(),
      name: socket.username || 'Anonymous',
      code: data.code,
      isDeleted: false // New flag
    };
    messageHistory.push(messageData);
    saveHistory();
    // We emit 'newCode' so clients can just append it
    // instead of reloading everything
    io.emit('newCode', messageData);
  });

  // --- MODIFIED DELETE EVENT ---
  socket.on('deleteMessage', (messageId) => {
    if (socket.isAdmin) {
      // Find the message
      const msg = messageHistory.find(m => m.id === messageId);
      if (msg) {
        // Modify the message instead of filtering
        msg.code = "{MESSAGE HAS BEEN DELETED BY ADMIN}";
        msg.isDeleted = true; // Set deleted flag
        saveHistory();
        
        // Tell all clients to reload the *entire* history
        // to show the change
        io.emit('loadHistory', messageHistory);
        console.log(`Admin ${socket.username} deleted message ${messageId}`);
      }
    } else {
      console.warn(`User ${socket.username} tried to delete (no admin)`);
    }
  });

  // --- NEW EDIT EVENT ---
  socket.on('editMessage', (data) => {
    const { messageId, newCode } = data;
    if (socket.isAdmin) {
      const msg = messageHistory.find(m => m.id === messageId);
      if (msg && !msg.isDeleted) { // Can't edit a deleted message
        msg.code = newCode; // Update the code
        saveHistory();

        // Tell all clients to reload the history to see the edit
        io.emit('loadHistory', messageHistory);
        console.log(`Admin ${socket.username} edited message ${messageId}`);
      }
    } else {
      console.warn(`User ${socket.username} tried to edit (no admin)`);
    }
  });


  socket.on('disconnect', () => {
    console.log(`Device disconnected: ${socket.id}`);
    const name = connectedUsers[socket.id];
    if (name) {
      delete connectedUsers[socket.id];
      io.emit('userLeft', `${name} left the room.`);
      io.emit('updateUserList', Object.values(connectedUsers));
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
