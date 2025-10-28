const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs'); // <-- Import File System module

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = 3000;
const historyFile = __dirname + '/messages.json';

// --- Our "Databases" ---
let messageHistory = [];
let connectedUsers = {}; // Stores users by socket.id

// --- Load History from JSON file ---
try {
  if (fs.existsSync(historyFile)) {
    const data = fs.readFileSync(historyFile, 'utf8');
    messageHistory = JSON.parse(data);
    console.log(`Loaded ${messageHistory.length} messages from history.`);
  } else {
    fs.writeFileSync(historyFile, '[]', 'utf8'); // Create the file if it doesn't exist
  }
} catch (err) {
  console.error('Error loading message history:', err);
  messageHistory = [];
}

// --- Helper function to save history ---
function saveHistory() {
  fs.writeFile(historyFile, JSON.stringify(messageHistory, null, 2), 'utf8', (err) => {
    if (err) {
      console.error('Error saving message history:', err);
    }
  });
}

// Tell Express to serve your HTML file
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// --- Main Socket.IO logic ---
io.on('connection', (socket) => {
  console.log('A device connected');

  // 1. Send the entire message history to the newly connected user
  socket.emit('loadHistory', messageHistory);

  // When a user joins with their name
  socket.on('join', (name) => {
    socket.username = name;
    connectedUsers[socket.id] = name;
    console.log(`${name} joined`);

    // Broadcast "user joined" message
    socket.broadcast.emit('userJoined', `${name} joined the room.`);
    
    // 3. Broadcast the new, complete user list to EVERYONE
    io.emit('updateUserList', Object.values(connectedUsers));
  });

  // When a user sends a code snippet
  socket.on('sendCode', (data) => {
    const messageData = {
      name: socket.username || 'Anonymous',
      code: data.code,
    };
    
    // 4. Add new message to history and save it
    messageHistory.push(messageData);
    saveHistory(); // Asynchronously save

    // 5. Broadcast the new code to EVERYONE
    io.emit('newCode', messageData);
  });

  // When a user disconnects
  socket.on('disconnect', () => {
    const name = connectedUsers[socket.id];
    if (name) {
      console.log(`${name} left`);
      delete connectedUsers[socket.id]; // Remove from list
      
      // 6. Broadcast the "user left" message and the updated user list
      io.emit('userLeft', `${name} left the room.`);
      io.emit('updateUserList', Object.values(connectedUsers));
    }
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server is running!`);
  console.log(`Open http://localhost:${PORT} in your browser.`);
  console.log(`On other devices, visit http://[YOUR-IP-ADDRESS]:${PORT}`);
});