/**
 * Room lifecycle management for multiplayer Remik.
 * Handles room creation, joining, leaving, and reconnection.
 * @module server/roomManager
 */

const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const SNAPSHOT_DIR = path.join(__dirname, '..', 'data', 'rooms');

/** @type {Map<string, object>} roomCode → room */
const rooms = new Map();

/**
 * Generate a 6-character uppercase room code.
 * @returns {string}
 */
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    // Ensure uniqueness
    if (rooms.has(code)) return generateRoomCode();
    return code;
}

/**
 * Create a new room.
 * @param {string} hostName
 * @param {WebSocket} hostWs
 * @param {object} settings — game config overrides
 * @param {string} [colour='#e63946']
 * @param {string} [icon='♠']
 * @returns {object} room
 */
function createRoom(hostName, hostWs, settings = {}, colour = '#e63946', icon = '♠') {
    const code = generateRoomCode();
    const playerId = uuidv4();

    const room = {
        code,
        host: playerId,
        players: [{
            id: playerId,
            name: hostName,
            colour,
            icon,
            ws: hostWs,
            connected: true
        }],
        settings: { ...settings },
        gameState: null,
        status: 'waiting', // 'waiting' | 'playing' | 'finished'
        createdAt: Date.now()
    };

    rooms.set(code, room);
    return { room, playerId };
}

/**
 * Join an existing room.
 * @param {string} code
 * @param {string} playerName
 * @param {WebSocket} playerWs
 * @param {string} [colour='#457b9d']
 * @param {string} [icon='♥']
 * @returns {{ room: object, playerId: string, error?: string }}
 */
function joinRoom(code, playerName, playerWs, colour = '#457b9d', icon = '♥') {
    const room = rooms.get(code);
    if (!room) return { room: null, playerId: null, error: 'Room not found' };
    if (room.status !== 'waiting') return { room: null, playerId: null, error: 'Game already in progress' };
    if (room.players.length >= 4) return { room: null, playerId: null, error: 'Room is full' };

    // Check for duplicate names
    if (room.players.some(p => p.name.toLowerCase() === playerName.toLowerCase())) {
        return { room: null, playerId: null, error: 'Name already taken in this room' };
    }

    const playerId = uuidv4();
    room.players.push({
        id: playerId,
        name: playerName,
        colour,
        icon,
        ws: playerWs,
        connected: true
    });

    return { room, playerId };
}

/**
 * Remove a player from a room. Promotes new host if needed.
 * @param {string} code
 * @param {string} playerId
 * @returns {{ room: object|null, destroyed: boolean }}
 */
function leaveRoom(code, playerId) {
    const room = rooms.get(code);
    if (!room) return { room: null, destroyed: false };

    room.players = room.players.filter(p => p.id !== playerId);

    if (room.players.length === 0) {
        rooms.delete(code);
        cleanupSnapshot(code);
        return { room: null, destroyed: true };
    }

    // Promote new host if the host left
    if (room.host === playerId) {
        room.host = room.players[0].id;
    }

    return { room, destroyed: false };
}

/**
 * Mark a player as disconnected (for reconnection support).
 * @param {string} code
 * @param {string} playerId
 */
function markDisconnected(code, playerId) {
    const room = rooms.get(code);
    if (!room) return;
    const player = room.players.find(p => p.id === playerId);
    if (player) {
        player.connected = false;
        player.ws = null;
    }
}

/**
 * Reconnect a player to a room.
 * @param {string} code
 * @param {string} playerId
 * @param {WebSocket} newWs
 * @returns {{ room: object|null, playerIndex: number, error?: string }}
 */
function reconnectPlayer(code, playerId, newWs) {
    const room = rooms.get(code);
    if (!room) return { room: null, playerIndex: -1, error: 'Room not found' };

    const playerIndex = room.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return { room: null, playerIndex: -1, error: 'Player not found in room' };

    room.players[playerIndex].ws = newWs;
    room.players[playerIndex].connected = true;

    return { room, playerIndex };
}

/**
 * Get a room by code.
 * @param {string} code
 * @returns {object|null}
 */
function getRoom(code) {
    return rooms.get(code) || null;
}

/**
 * Get all open rooms (waiting for players).
 * @returns {Array<{ code: string, host: string, playerCount: number, maxPlayers: number }>}
 */
function getOpenRooms() {
    const open = [];
    for (const [code, room] of rooms) {
        if (room.status === 'waiting') {
            open.push({
                code,
                host: room.players.find(p => p.id === room.host)?.name || '?',
                playerCount: room.players.length,
                maxPlayers: 4,
                settings: {
                    pointsLimit: room.settings.POINTS_LIMIT,
                    jokerCount: room.settings.JOKER_COUNT,
                    turnTimer: room.settings.TURN_TIMER_SECONDS
                }
            });
        }
    }
    return open;
}

/**
 * Find a room by player WebSocket.
 * @param {WebSocket} ws
 * @returns {{ room: object|null, player: object|null }}
 */
function findByWs(ws) {
    for (const room of rooms.values()) {
        const player = room.players.find(p => p.ws === ws);
        if (player) return { room, player };
    }
    return { room: null, player: null };
}

// ═══════════════════════════════
// SNAPSHOT PERSISTENCE
// ═══════════════════════════════

/**
 * Save room state to a JSON file for crash recovery.
 * @param {object} room
 */
function saveSnapshot(room) {
    try {
        if (!fs.existsSync(SNAPSHOT_DIR)) {
            fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
        }
        const snapshot = {
            code: room.code,
            host: room.host,
            players: room.players.map(p => ({
                id: p.id,
                name: p.name,
                colour: p.colour,
                icon: p.icon,
                connected: p.connected
            })),
            settings: room.settings,
            gameState: room.gameState,
            status: room.status,
            createdAt: room.createdAt,
            savedAt: Date.now()
        };
        const filePath = path.join(SNAPSHOT_DIR, `${room.code}.json`);
        fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
    } catch (err) {
        console.warn('saveSnapshot: failed —', err.message);
    }
}

/**
 * Load all saved room snapshots on server restart.
 * @returns {number} count of restored rooms
 */
function loadSnapshots() {
    try {
        if (!fs.existsSync(SNAPSHOT_DIR)) return 0;
        const files = fs.readdirSync(SNAPSHOT_DIR).filter(f => f.endsWith('.json'));
        let count = 0;
        for (const file of files) {
            try {
                const raw = fs.readFileSync(path.join(SNAPSHOT_DIR, file), 'utf-8');
                const snapshot = JSON.parse(raw);
                if (snapshot.status === 'playing') {
                    // Restore room without WebSocket connections (players must reconnect)
                    const room = {
                        ...snapshot,
                        players: snapshot.players.map(p => ({
                            ...p,
                            ws: null,
                            connected: false
                        }))
                    };
                    rooms.set(room.code, room);
                    count++;
                }
            } catch (err) {
                console.warn(`loadSnapshots: failed to load ${file} —`, err.message);
            }
        }
        return count;
    } catch {
        return 0;
    }
}

/**
 * Clean up snapshot file for a finished/destroyed room.
 * @param {string} code
 */
function cleanupSnapshot(code) {
    try {
        const filePath = path.join(SNAPSHOT_DIR, `${code}.json`);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (err) {
        console.warn('cleanupSnapshot: failed —', err.message);
    }
}

module.exports = {
    createRoom,
    joinRoom,
    leaveRoom,
    markDisconnected,
    reconnectPlayer,
    getRoom,
    getOpenRooms,
    findByWs,
    saveSnapshot,
    loadSnapshots,
    cleanupSnapshot
};
