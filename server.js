const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const path = require('path');

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).send('Something broke!');
});

// Debug logging for requests
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Serve the main index.html from root
app.get('/', (req, res) => {
    try {
        console.log('Serving index.html from root');
        res.sendFile(path.join(__dirname, 'index.html'));
    } catch (err) {
        console.error('Error serving index.html:', err);
        res.status(500).send('Error loading game');
    }
});

// Serve static files from the src directory
app.use('/src', express.static(path.join(__dirname, 'src')));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Add a route to get texture URLs
app.get('/texture-urls', (req, res) => {
    res.json({
        sunset: 'https://drive.google.com/uc?export=download&id=1wTUHG_Ek0JpR2eIpf0WUE8tYFvCmcCgO',
        terrainDiff: 'https://drive.google.com/uc?export=download&id=1vNirPuEnwrDoJtGqApQteyuI00vFCWVn',
        terrainNormal: 'https://drive.google.com/uc?export=download&id=1p8zdeWtbv5hLtaARg9LKQfO88AuJfSnV',
        carModel: 'https://drive.google.com/uc?export=download&id=15K6krbc54hUXHBOZlB9eMFXNAFz2cg7z'
    });
});

// Store connected players
const players = new Map();

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Handle player joining
    socket.on('playerJoin', (playerData) => {
        console.log('Player joined:', playerData);
        players.set(socket.id, {
            username: playerData.username,
            position: playerData.position,
            rotation: playerData.rotation
        });
        
        // Send current players to the new player
        socket.emit('currentPlayers', Array.from(players.entries()));
        
        // Notify other players about the new player
        socket.broadcast.emit('playerJoined', {
            id: socket.id,
            ...playerData
        });
    });

    // Handle player movement
    socket.on('playerMove', (data) => {
        if (players.has(socket.id)) {
            players.get(socket.id).position = data.position;
            players.get(socket.id).rotation = data.rotation;
            socket.broadcast.emit('playerMoved', {
                id: socket.id,
                position: data.position,
                rotation: data.rotation
            });
        }
    });

    // Handle chat messages
    socket.on('chatMessage', (message) => {
        const username = players.get(socket.id)?.username || 'Unknown';
        console.log(`Chat message from ${username}:`, message);
        io.emit('chatMessage', {
            username: username,
            text: message
        });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        players.delete(socket.id);
        io.emit('playerLeft', socket.id);
    });
});

// Start the server
const PORT = process.env.PORT || 10000;

console.log('Starting server with configuration:');
console.log('PORT:', PORT);
console.log('Current directory:', __dirname);
console.log('Process ID:', process.pid);

http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Game URL: https://multiplayer-car-game.onrender.com`);
}); 