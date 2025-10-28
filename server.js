const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const cors = require('cors'); // Make sure you ran "npm install cors"

const app = express();
const server = http.createServer(app);

// Use Render's port or 3000 as a fallback
const PORT = process.env.PORT || 3000;
const historyFile = __dirname + '/messages.json';

// --- Define your allowed domains ---
const allowedOrigins = [
  'https://nikisbroke.lol',
  'https://www.nikisbroke.lol'
];

// --- Configure CORS for Express ---
// This handles the initial "handshake"
app.use(cors({ origin: allowedOrigins }));

// --- Configure CORS for Socket.IO ---
// This handles the real-time connection
const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

// --- (Message History Logic) ---
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

// --- THIS IS THE FIX ---
// We removed the app.get('/') that sent index.html
// Now it just sends a simple "OK" message
app.get('/', (req, res) => {
  res.send('Backend server is alive and running.');
});

// --- (Socket.IO Logic) ---
let connectedUsers = {};

io.on('connection', (socket) => {
  console.log(`Device connected: ${socket.id}`);

  socket.emit('loadHistory', messageHistory);

  socket.on('join', (name) => {
    socket.username = name;
    connectedUsers[socket.id] = name;
    console.log(`${name} joined`);
    socket.broadcast.emit('userJoined', `${name} joined the room.`);
    io.emit('updateUserList', Object.values(connectedUsers));
  });

  socket.on('sendCode', (data) => {
    const messageData = {
      name: socket.username || 'Anonymous',
      code: data.code,
    };
    messageHistory.push(messageData);
    saveHistory();
    io.emit('newCode', messageData);
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

// --- Start the server on Render's port ---
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
