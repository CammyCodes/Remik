/**
 * Remik — Polish Rummy • Application entry point.
 * Manages screen transitions between lobby, game (solo), and multiplayer.
 * Supports resuming from saved solo games and multiplayer reconnection.
 * @module main
 */

import { renderLobby, updateWaitingRoom } from './ui/lobby.js';
import { renderGameBoard, renderMultiplayerBoard } from './ui/gameBoard.js';
import { loadGame } from './engine/saveManager.js';
import * as net from './engine/networkClient.js';

const app = document.getElementById('app');

/** Show the lobby screen */
function showLobby() {
    app.innerHTML = '';
    renderLobby(app, {
        onStartSolo: (playerName, configOverrides) => {
            showGame(playerName, configOverrides);
        },
        onResume: () => {
            resumeGame();
        },
        onCreateRoom: (name, colour, icon, settings) => {
            createRoom(name, colour, icon, settings);
        },
        onJoinRoom: (code, name, colour, icon) => {
            joinRoom(code, name, colour, icon);
        },
        onReconnect: (session) => {
            reconnectToRoom(session);
        }
    });
}

/**
 * Show the game board (new solo game).
 * @param {string} playerName
 * @param {object} [configOverrides={}]
 */
function showGame(playerName, configOverrides = {}) {
    app.innerHTML = '';
    renderGameBoard(app, playerName, () => {
        showLobby();
    }, null, configOverrides);
}

/**
 * Resume a saved solo game.
 */
function resumeGame() {
    const saved = loadGame();
    if (!saved || !saved.state) {
        showLobby();
        return;
    }

    app.innerHTML = '';
    const playerName = saved.state.players?.[0]?.name || 'Player';
    renderGameBoard(app, playerName, () => {
        showLobby();
    }, {
        savedState: saved.state,
        savedTurnTracker: saved.turnHistory,
        savedEventLog: saved.eventLog
    });
}

// ═══════════════════════════════
// MULTIPLAYER FLOWS
// ═══════════════════════════════

/**
 * Create a multiplayer room.
 * @param {string} name
 * @param {string} colour
 * @param {string} icon
 * @param {object} settings
 */
async function createRoom(name, colour, icon, settings) {
    try {
        await net.connect();
    } catch (err) {
        alert(`Connection failed: ${err.message}`);
        return;
    }

    net.send('create_room', {
        playerName: name,
        colour,
        icon,
        settings
    });

    net.on('room_created', (msg) => {
        updateWaitingRoom(app, msg.roomCode, msg.players, true);

        // Wire up start button
        setTimeout(() => {
            const startBtn = document.getElementById('btn-start-game');
            startBtn?.addEventListener('click', () => {
                net.send('start_game', { roomCode: msg.roomCode });
            });
        }, 100);
    });

    net.on('player_joined', (msg) => {
        updateWaitingRoom(app, msg.roomCode, msg.players, true);
    });

    net.on('player_left', (msg) => {
        updateWaitingRoom(app, msg.roomCode, msg.players, true);
    });

    net.on('game_start', (msg) => {
        app.innerHTML = '';
        renderMultiplayerBoard(app, name, () => showLobby(), msg.myIndex, true);
    });

    net.on('error', (msg) => {
        alert(`Room error: ${msg.error}`);
    });
}

/**
 * Join an existing room.
 * @param {string} code
 * @param {string} name
 * @param {string} colour
 * @param {string} icon
 */
async function joinRoom(code, name, colour, icon) {
    try {
        await net.connect();
    } catch (err) {
        alert(`Connection failed: ${err.message}`);
        return;
    }

    net.send('join_room', {
        roomCode: code,
        playerName: name,
        colour,
        icon
    });

    net.on('room_joined', (msg) => {
        updateWaitingRoom(app, msg.roomCode, msg.players, false);
    });

    net.on('player_joined', (msg) => {
        updateWaitingRoom(app, msg.roomCode, msg.players, false);
    });

    net.on('game_start', (msg) => {
        app.innerHTML = '';
        renderMultiplayerBoard(app, name, () => showLobby(), msg.myIndex, false);
    });

    net.on('error', (msg) => {
        alert(`Join error: ${msg.error}`);
    });
}

/**
 * Reconnect to an existing room.
 * @param {object} session
 */
async function reconnectToRoom(session) {
    try {
        await net.connect();
    } catch (err) {
        alert(`Reconnect failed: ${err.message}`);
        showLobby();
        return;
    }

    net.send('reconnect', {
        sessionId: session.sessionId,
        roomCode: session.roomCode
    });

    net.on('reconnected', (msg) => {
        app.innerHTML = '';
        renderMultiplayerBoard(app, msg.playerName, () => showLobby(), msg.myIndex, msg.isHost);
    });

    net.on('error', (msg) => {
        alert(`Reconnect error: ${msg.error}`);
        showLobby();
    });
}

// Start with the lobby
showLobby();
