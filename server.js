const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const historyFile = path.join(__dirname, 'messages.json');
const MY_ADMIN_SECRET = process.env.ADMIN_KEY;

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}
app.use('/uploads', express.static(uploadsDir));

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
  },
  maxHttpBufferSize: 1e8 // 100 MB file size limit
});

let messageHistory = [];
try {
  if (fs.existsSync(historyFile)) {
    messageHistory = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
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

// No longer need connectedUsers
// let connectedUsers = {}; 

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
    // Removed all user list and join/leave emits
  });

  socket.on('sendMessage', (data) => {
    const messageData = {
      id: crypto.randomUUID(),
      name: socket.username || 'Anonymous',
      timestamp: new Date().toISOString(),
      isDeleted: false,
      type: 'code',
      content: data.content
    };
    messageHistory.push(messageData);
    saveHistory();
    io.emit('newMessage', messageData);
  });

  socket.on('sendFile', (data) => {
    const { fileName, buffer } = data;
    const safeFileName = path.basename(fileName);
    const filePath = path.join(uploadsDir, safeFileName);
    const fileUrl = `/uploads/${safeFileName}`;

    fs.writeFile(filePath, Buffer.from(buffer), (err) => {
      if (err) {
        console.error('File write error:', err);
        return;
      }
      const messageData = {
        id: crypto.randomUUID(),
        name: socket.username || 'Anonymous',
        timestamp: new Date().toISOString(),
        isDeleted: false,
        type: 'file',
        fileName: safeFileName,
        url: fileUrl
      };
      messageHistory.push(messageData);
      saveHistory();
      io.emit('newMessage', messageData);
      console.log(`User ${socket.username} uploaded ${safeFileName}`);
    });
  });

  socket.on('deleteMessage', (messageId) => {
    if (socket.isAdmin) {
      const msg = messageHistory.find(m => m.id === messageId);
      if (msg) {
        msg.content = "{MESSAGE HAS BEEN DELETED BY ADMIN}";
        msg.type = 'code';
        msg.isDeleted = true;
        msg.timestamp = new Date().toISOString();
        saveHistory();
        io.emit('loadHistory', messageHistory);
      }
    }
  });

  socket.on('editMessage', (data) => {
    const { messageId, newCode } = data;
    if (socket.isAdmin) {
      const msg = messageHistory.find(m => m.id === messageId);
      if (msg && !msg.isDeleted && msg.type === 'code') {
        msg.content = newCode;
        msg.timestamp = new Date().toISOString();
        saveHistory();
        io.emit('loadHistory', messageHistory);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`Device disconnected: ${socket.id}`);
    if (socket.username) {
        console.log(`${socket.username} disconnected`);
    }
    // Removed all user list and join/leave emits
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
