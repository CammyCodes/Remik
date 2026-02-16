/**
 * Remik — Polish Rummy • Application entry point.
 * Manages screen transitions between lobby and game.
 * Supports resuming from saved games.
 * @module main
 */

import { renderLobby } from './ui/lobby.js';
import { renderGameBoard } from './ui/gameBoard.js';
import { loadGame } from './engine/saveManager.js';

const app = document.getElementById('app');

/** Show the lobby screen */
function showLobby() {
    app.innerHTML = '';
    renderLobby(app, (playerName) => {
        showGame(playerName);
    }, () => {
        resumeGame();
    });
}

/**
 * Show the game board (new game).
 * @param {string} playerName
 */
function showGame(playerName) {
    app.innerHTML = '';
    renderGameBoard(app, playerName, () => {
        showLobby();
    });
}

/**
 * Resume a saved game.
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

// Start with the lobby
showLobby();
