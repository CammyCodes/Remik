/**
 * Remik — Combined HTTP + WebSocket server.
 * Serves static files with proper MIME types for ES modules.
 * Manages multiplayer rooms via WebSocket.
 * 
 * Usage: node server.cjs
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const roomManager = require('./src/server/roomManager.cjs');
const gameServer = require('./src/server/gameServer.cjs');
const leaderboard = require('./src/server/leaderboard.cjs');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, 'dist');
const SRC_ROOT = __dirname;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
};

// ═══════════════════════════════
// HTTP SERVER
// ═══════════════════════════════

const server = http.createServer((req, res) => {
    const method = req.method;
    let urlPath = req.url.split('?')[0];

    // ── API ENDPOINTS ──
    if (urlPath === '/api/leaderboard' && method === 'GET') {
        const data = leaderboard.getLeaderboard();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data));
        return;
    }

    if (urlPath === '/api/rooms' && method === 'GET') {
        const data = roomManager.getOpenRooms();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data));
        return;
    }

    // ── STATIC FILE SERVING ──
    if (urlPath === '/') urlPath = '/index.html';

    // Try dist first (production build), fall back to source root (dev)
    let filePath = path.join(ROOT, urlPath);
    if (!fs.existsSync(filePath)) {
        filePath = path.join(SRC_ROOT, urlPath);
    }

    // Security: prevent path traversal
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(path.resolve(ROOT)) && !resolvedPath.startsWith(path.resolve(SRC_ROOT))) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found: ' + urlPath);
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache'
        });
        res.end(data);
    });
});

// ═══════════════════════════════
// WEBSOCKET SERVER
// ═══════════════════════════════

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    console.log(`[WS] New connection from ${ws._socket?.remoteAddress || 'unknown'}`);
    /** @type {string|null} player ID assigned on room join/create */
    let currentPlayerId = null;
    /** @type {string|null} room code */
    let currentRoomCode = null;

    ws.on('message', (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw.toString());
        } catch {
            ws.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' }));
            return;
        }

        console.log(`[WS] Message received: type=${msg.type}`, JSON.stringify(msg).slice(0, 200));

        switch (msg.type) {
            case 'create_room':
                handleCreateRoom(ws, msg);
                break;
            case 'join_room':
                handleJoinRoom(ws, msg);
                break;
            case 'start_game':
                handleStartGame(ws, msg);
                break;
            case 'game_action':
                handleGameAction(ws, msg);
                break;
            case 'next_round':
                handleNextRound(ws, msg);
                break;
            case 'reconnect':
                handleReconnect(ws, msg);
                break;
            case 'leave_room':
                handleLeave(ws);
                break;
            default:
                ws.send(JSON.stringify({ type: 'error', error: `Unknown message type: ${msg.type}` }));
        }
    });

    ws.on('close', () => {
        handleDisconnect(ws);
    });

    ws.on('error', (err) => {
        console.warn('WebSocket error:', err.message);
        handleDisconnect(ws);
    });

    // ── MESSAGE HANDLERS ──

    function handleCreateRoom(socket, msg) {
        const name = (msg.playerName || msg.name || '').trim().slice(0, 20) || 'Player';
        const settings = msg.settings || {};
        const colour = msg.colour || '#e63946';
        const icon = msg.icon || '♠';
        console.log(`[ROOM] Creating room — host: "${name}", colour: ${colour}, icon: ${icon}`);

        const { room, playerId } = roomManager.createRoom(name, socket, settings, colour, icon);
        currentPlayerId = playerId;
        currentRoomCode = room.code;
        console.log(`[ROOM] Room ${room.code} created — host ID: ${playerId}`);

        socket.send(JSON.stringify({
            type: 'room_created',
            roomCode: room.code,
            playerId,
            players: room.players.map(p => ({
                id: p.id,
                name: p.name,
                colour: p.colour,
                icon: p.icon,
                isHost: p.id === room.host
            })),
            settings: room.settings
        }));
    }

    function handleJoinRoom(socket, msg) {
        const code = (msg.roomCode || '').trim().toUpperCase();
        const name = (msg.playerName || msg.name || '').trim().slice(0, 20) || 'Player';
        const colour = msg.colour || '#457b9d';
        const icon = msg.icon || '♥';
        console.log(`[ROOM] Join request — room: ${code}, name: "${name}", colour: ${colour}`);

        const { room, playerId, error } = roomManager.joinRoom(code, name, socket, colour, icon);
        if (error) {
            console.log(`[ROOM] Join REJECTED — room: ${code}, name: "${name}", error: ${error}`);
            socket.send(JSON.stringify({ type: 'error', error }));
            return;
        }
        console.log(`[ROOM] Join OK — room: ${code}, name: "${name}", playerId: ${playerId}`);

        currentPlayerId = playerId;
        currentRoomCode = room.code;

        const playerList = room.players.map(p => ({
            id: p.id,
            name: p.name,
            colour: p.colour,
            icon: p.icon,
            isHost: p.id === room.host
        }));

        // Notify the joining player
        socket.send(JSON.stringify({
            type: 'room_joined',
            roomCode: room.code,
            playerId,
            players: playerList,
            settings: room.settings
        }));

        // Notify all other players in the room
        gameServer.broadcastToRoom(room, {
            type: 'player_joined',
            players: playerList,
            newPlayer: { id: playerId, name, colour, icon }
        });
    }

    function handleStartGame(socket, msg) {
        if (!currentRoomCode) {
            socket.send(JSON.stringify({ type: 'error', error: 'Not in a room' }));
            return;
        }

        const room = roomManager.getRoom(currentRoomCode);
        if (!room) {
            socket.send(JSON.stringify({ type: 'error', error: 'Room not found' }));
            return;
        }

        // Only host can start
        if (room.host !== currentPlayerId) {
            socket.send(JSON.stringify({ type: 'error', error: 'Only the host can start the game' }));
            return;
        }

        if (room.players.length < 2) {
            socket.send(JSON.stringify({ type: 'error', error: 'Need at least 2 players' }));
            return;
        }

        console.log(`[GAME] Starting game in room ${currentRoomCode} with ${room.players.length} players`);
        gameServer.startGame(room);
    }

    function handleGameAction(socket, msg) {
        if (!currentRoomCode || !currentPlayerId) {
            socket.send(JSON.stringify({ type: 'error', error: 'Not in a game' }));
            return;
        }

        const room = roomManager.getRoom(currentRoomCode);
        if (!room || room.status !== 'playing') {
            socket.send(JSON.stringify({ type: 'error', error: 'No active game' }));
            return;
        }

        const result = gameServer.handleAction(room, currentPlayerId, msg);
        if (!result.success) {
            socket.send(JSON.stringify({ type: 'action_error', error: result.error }));
        }
    }

    function handleNextRound(socket, msg) {
        if (!currentRoomCode || !currentPlayerId) return;

        const room = roomManager.getRoom(currentRoomCode);
        if (!room) return;

        if (room.host !== currentPlayerId) {
            socket.send(JSON.stringify({ type: 'error', error: 'Only the host can start the next round' }));
            return;
        }

        gameServer.nextRound(room);
    }

    function handleReconnect(socket, msg) {
        const code = (msg.roomCode || '').trim().toUpperCase();
        const playerId = msg.playerId;

        if (!code || !playerId) {
            socket.send(JSON.stringify({ type: 'error', error: 'Missing roomCode or playerId' }));
            return;
        }

        const { room, playerIndex, error } = roomManager.reconnectPlayer(code, playerId, socket);
        if (error) {
            socket.send(JSON.stringify({ type: 'reconnect_failed', error }));
            return;
        }

        currentPlayerId = playerId;
        currentRoomCode = code;

        socket.send(JSON.stringify({
            type: 'reconnected',
            roomCode: code,
            playerId,
            playerIndex,
            status: room.status,
            players: room.players.map(p => ({
                id: p.id,
                name: p.name,
                colour: p.colour,
                icon: p.icon,
                isHost: p.id === room.host,
                connected: p.connected
            }))
        }));

        // If game is in progress, send current state
        if (room.status === 'playing' && room.gameState) {
            gameServer.broadcastGameState(room);
        }

        // Notify others
        gameServer.broadcastToRoom(room, {
            type: 'player_reconnected',
            playerName: room.players[playerIndex].name
        });
    }

    function handleLeave(socket) {
        handleDisconnect(socket);
    }

    function handleDisconnect(socket) {
        console.log(`[WS] Disconnect — player: ${currentPlayerId || 'none'}, room: ${currentRoomCode || 'none'}`);
        if (!currentRoomCode || !currentPlayerId) return;

        const room = roomManager.getRoom(currentRoomCode);
        if (!room) return;

        if (room.status === 'playing') {
            // Mark as disconnected, don't remove (allow reconnection)
            roomManager.markDisconnected(currentRoomCode, currentPlayerId);
            gameServer.broadcastToRoom(room, {
                type: 'player_disconnected',
                playerId: currentPlayerId,
                playerName: room.players.find(p => p.id === currentPlayerId)?.name || '?'
            });
        } else {
            // In lobby, remove player
            const { room: updatedRoom, destroyed } = roomManager.leaveRoom(currentRoomCode, currentPlayerId);
            if (!destroyed && updatedRoom) {
                gameServer.broadcastToRoom(updatedRoom, {
                    type: 'player_left',
                    players: updatedRoom.players.map(p => ({
                        id: p.id,
                        name: p.name,
                        colour: p.colour,
                        icon: p.icon,
                        isHost: p.id === updatedRoom.host
                    }))
                });
            }
        }

        currentPlayerId = null;
        currentRoomCode = null;
    }
});

// ═══════════════════════════════
// STARTUP
// ═══════════════════════════════

// Restore rooms from snapshots on startup
const restoredCount = roomManager.loadSnapshots();
if (restoredCount > 0) {
    console.log(`  🔄 Restored ${restoredCount} room(s) from snapshots`);
}

server.listen(PORT, () => {
    console.log(`\n  ♠ ♥ ♦ ♣  Remik — Polish Rummy  ♠ ♥ ♦ ♣\n`);
    console.log(`  HTTP + WebSocket server running at: http://localhost:${PORT}\n`);
    console.log(`  Press Ctrl+C to stop.\n`);
});
