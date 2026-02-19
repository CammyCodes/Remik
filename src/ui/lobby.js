/**
 * Lobby screen — mode selection, name entry, room creation/joining, personalisation.
 * Supports both solo (vs AI) and multiplayer flows.
 * @module ui/lobby
 */

import { hasSave, deleteSave } from '../engine/saveManager.js';
import { playButtonClick } from '../engine/soundManager.js';
import { PLAYER_COLOURS, PLAYER_ICONS, DEFAULTS } from '../engine/gameConfig.js';
import { getSession } from '../engine/networkClient.js';

/**
 * Render the lobby screen.
 * @param {HTMLElement} root — container element
 * @param {object} callbacks
 * @param {Function} callbacks.onStartSolo — called with (playerName, configOverrides)
 * @param {Function} callbacks.onResume — called when resuming a saved solo game
 * @param {Function} callbacks.onCreateRoom — called with (playerName, colour, icon, settings)
 * @param {Function} callbacks.onJoinRoom — called with (roomCode, playerName, colour, icon)
 * @param {Function} callbacks.onReconnect — called with session info
 */
export function renderLobby(root, callbacks) {
  const history = loadScoreHistory();
  const canResume = hasSave();
  const session = getSession();

  root.innerHTML = `
        <div class="lobby">
            <span class="lobby__cards-deco lobby__cards-deco--left">♠♥</span>
            <span class="lobby__cards-deco lobby__cards-deco--right">♦♣</span>

            <h1 class="lobby__title">Remik</h1>
            <p class="lobby__subtitle">Polish Rummy</p>

            <!-- Mode Tabs -->
            <div class="lobby__mode-tabs">
                <button class="lobby__mode-tab lobby__mode-tab--active" data-mode="solo">🤖 Solo</button>
                <button class="lobby__mode-tab" data-mode="multi">🌐 Multiplayer</button>
            </div>

            <!-- Name + Personalisation (shared) -->
            <div class="lobby__personalisation">
                <input
                    type="text"
                    class="lobby__input"
                    id="player-name"
                    placeholder="Enter your name…"
                    maxlength="20"
                    autocomplete="off"
                    required
                />

                <div class="lobby__colour-picker" id="colour-picker">
                    <label class="lobby__picker-label">Colour</label>
                    <div class="lobby__colour-grid">
                        ${PLAYER_COLOURS.map((c, i) =>
    `<button type="button" class="lobby__colour-swatch${i === 0 ? ' lobby__colour-swatch--active' : ''}" data-colour="${c}" style="background:${c}" title="${c}"></button>`
  ).join('')}
                    </div>
                </div>

                <div class="lobby__icon-picker" id="icon-picker">
                    <label class="lobby__picker-label">Icon</label>
                    <div class="lobby__icon-grid">
                        ${PLAYER_ICONS.map((ic, i) =>
    `<button type="button" class="lobby__icon-btn${i === 0 ? ' lobby__icon-btn--active' : ''}" data-icon="${ic}">${ic}</button>`
  ).join('')}
                    </div>
                </div>
            </div>

            <!-- SOLO panel -->
            <div class="lobby__panel lobby__panel--solo" id="panel-solo">
                <form class="lobby__form" id="solo-form">
                    <div class="lobby__solo-settings">
                        <label class="lobby__setting">
                            <span>Points Limit</span>
                            <input type="number" id="solo-points" class="lobby__setting-input" value="501" min="50" max="2000" step="50" />
                        </label>
                        <label class="lobby__setting">
                            <span>Jokers</span>
                            <input type="number" id="solo-jokers" class="lobby__setting-input" value="4" min="0" max="10" />
                        </label>
                    </div>
                    <button type="submit" class="lobby__btn">New Game</button>
                    ${canResume ? '<button type="button" class="lobby__btn lobby__btn--resume" id="btn-resume">▶ Resume Game</button>' : ''}
                </form>
                ${history.length > 0 ? renderHistory(history) : ''}
            </div>

            <!-- MULTIPLAYER panel -->
            <div class="lobby__panel lobby__panel--multi lobby__panel--hidden" id="panel-multi">
                <div class="lobby__multi-actions">
                    <button type="button" class="lobby__btn lobby__btn--create" id="btn-create-room">🏠 Create Room</button>
                    <div class="lobby__join-row">
                        <input type="text" class="lobby__input lobby__input--code" id="join-code" placeholder="Room code…" maxlength="6" autocomplete="off" />
                        <button type="button" class="lobby__btn lobby__btn--join" id="btn-join-room">🚪 Join</button>
                    </div>
                    ${session ? `<button type="button" class="lobby__btn lobby__btn--reconnect" id="btn-reconnect">🔄 Resume Game (${session.roomCode})</button>` : ''}
                </div>

                <!-- Room settings (shown after Create Room) -->
                <div class="lobby__room-settings lobby__room-settings--hidden" id="room-settings">
                    <h3 class="lobby__settings-title">Room Settings</h3>
                    <div class="lobby__settings-grid">
                        <label class="lobby__setting">
                            <span>Points Limit</span>
                            <input type="number" id="mp-points" class="lobby__setting-input" value="501" min="50" max="2000" step="50" />
                        </label>
                        <label class="lobby__setting">
                            <span>Jokers</span>
                            <input type="number" id="mp-jokers" class="lobby__setting-input" value="4" min="0" max="10" />
                        </label>
                        <label class="lobby__setting">
                            <span>Turn Timer (sec)</span>
                            <input type="number" id="mp-timer" class="lobby__setting-input" value="300" min="30" max="600" step="30" />
                        </label>
                        <label class="lobby__setting">
                            <span>Hand Size (first player)</span>
                            <input type="number" id="mp-hand-first" class="lobby__setting-input" value="14" min="7" max="20" />
                        </label>
                        <label class="lobby__setting">
                            <span>Hand Size (others)</span>
                            <input type="number" id="mp-hand-other" class="lobby__setting-input" value="13" min="7" max="20" />
                        </label>
                        <label class="lobby__setting lobby__setting--toggle">
                            <span>Opening Requirement (51pts)</span>
                            <input type="checkbox" id="mp-require-opening" checked />
                        </label>
                        <label class="lobby__setting lobby__setting--toggle">
                            <span>Allow Joker Swap</span>
                            <input type="checkbox" id="mp-joker-swap" />
                        </label>
                        <label class="lobby__setting lobby__setting--toggle">
                            <span>Speed Mode (60s, no anims)</span>
                            <input type="checkbox" id="mp-speed-mode" />
                        </label>
                    </div>
                    <button type="button" class="lobby__btn lobby__btn--create-go" id="btn-create-go">Create & Wait for Players</button>
                </div>
            </div>

            <!-- Waiting room (shown after creating/joining) -->
            <div class="lobby__waiting lobby__waiting--hidden" id="waiting-room">
                <h3 class="lobby__waiting-title">Room: <span id="waiting-room-code">---</span></h3>
                <p class="lobby__waiting-hint">Share this code with your friend!</p>
                <div class="lobby__waiting-players" id="waiting-players"></div>
                <button type="button" class="lobby__btn lobby__btn--start lobby__btn--hidden" id="btn-start-game">🎮 Start Game</button>
                <p class="lobby__waiting-status" id="waiting-status">Waiting for players…</p>
            </div>
        </div>
    `;

  // ── STATE ──
  let selectedColour = PLAYER_COLOURS[0];
  let selectedIcon = PLAYER_ICONS[0];

  // ── RESTORE NAME ──
  const nameInput = root.querySelector('#player-name');
  const savedName = localStorage.getItem('remik_playerName');
  if (savedName) nameInput.value = savedName;
  setTimeout(() => nameInput.focus(), 100);

  // ── MODE TABS ──
  const tabs = root.querySelectorAll('.lobby__mode-tab');
  const panelSolo = root.querySelector('#panel-solo');
  const panelMulti = root.querySelector('#panel-multi');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      playButtonClick();
      tabs.forEach(t => t.classList.remove('lobby__mode-tab--active'));
      tab.classList.add('lobby__mode-tab--active');

      if (tab.dataset.mode === 'solo') {
        panelSolo.classList.remove('lobby__panel--hidden');
        panelMulti.classList.add('lobby__panel--hidden');
      } else {
        panelSolo.classList.add('lobby__panel--hidden');
        panelMulti.classList.remove('lobby__panel--hidden');
      }
    });
  });

  // ── COLOUR PICKER ──
  root.querySelectorAll('.lobby__colour-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('.lobby__colour-swatch').forEach(b => b.classList.remove('lobby__colour-swatch--active'));
      btn.classList.add('lobby__colour-swatch--active');
      selectedColour = btn.dataset.colour;
    });
  });

  // ── ICON PICKER ──
  root.querySelectorAll('.lobby__icon-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('.lobby__icon-btn').forEach(b => b.classList.remove('lobby__icon-btn--active'));
      btn.classList.add('lobby__icon-btn--active');
      selectedIcon = btn.dataset.icon;
    });
  });

  // ── SOLO FORM ──
  root.querySelector('#solo-form').addEventListener('submit', (e) => {
    e.preventDefault();
    playButtonClick();
    const name = nameInput.value.trim() || 'Player';
    localStorage.setItem('remik_playerName', name);
    deleteSave();

    const configOverrides = {
      POINTS_LIMIT: parseInt(root.querySelector('#solo-points').value) || 501,
      JOKER_COUNT: parseInt(root.querySelector('#solo-jokers').value) ?? 4,
    };

    callbacks.onStartSolo(name, configOverrides);
  });

  // Resume solo
  if (canResume) {
    root.querySelector('#btn-resume')?.addEventListener('click', () => {
      playButtonClick();
      callbacks.onResume?.();
    });
  }

  // ── MULTIPLAYER: CREATE ROOM ──
  const roomSettingsDiv = root.querySelector('#room-settings');
  root.querySelector('#btn-create-room')?.addEventListener('click', () => {
    playButtonClick();
    roomSettingsDiv.classList.remove('lobby__room-settings--hidden');
  });

  root.querySelector('#btn-create-go')?.addEventListener('click', () => {
    playButtonClick();
    const name = nameInput.value.trim() || 'Player';
    localStorage.setItem('remik_playerName', name);

    const speedMode = root.querySelector('#mp-speed-mode').checked;
    const settings = {
      POINTS_LIMIT: parseInt(root.querySelector('#mp-points').value) || 501,
      JOKER_COUNT: parseInt(root.querySelector('#mp-jokers').value) ?? 4,
      TURN_TIMER_SECONDS: speedMode ? 60 : (parseInt(root.querySelector('#mp-timer').value) || 300),
      HAND_SIZE_FIRST: parseInt(root.querySelector('#mp-hand-first').value) || 14,
      HAND_SIZE_OTHER: parseInt(root.querySelector('#mp-hand-other').value) || 13,
      REQUIRE_OPENING: root.querySelector('#mp-require-opening').checked,
      ALLOW_JOKER_SWAP: root.querySelector('#mp-joker-swap').checked,
      SPEED_MODE: speedMode,
    };

    callbacks.onCreateRoom(name, selectedColour, selectedIcon, settings);
  });

  // ── MULTIPLAYER: JOIN ROOM ──
  const joinCodeInput = root.querySelector('#join-code');
  joinCodeInput?.addEventListener('input', () => {
    joinCodeInput.value = joinCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  root.querySelector('#btn-join-room')?.addEventListener('click', () => {
    playButtonClick();
    const name = nameInput.value.trim() || 'Player';
    const code = joinCodeInput.value.trim().toUpperCase();
    if (!code || code.length < 4) return;
    localStorage.setItem('remik_playerName', name);
    callbacks.onJoinRoom(code, name, selectedColour, selectedIcon);
  });

  // ── RECONNECT ──
  root.querySelector('#btn-reconnect')?.addEventListener('click', () => {
    playButtonClick();
    callbacks.onReconnect?.(session);
  });
}

/**
 * Update the waiting room UI with player list.
 * @param {HTMLElement} root
 * @param {string} roomCode
 * @param {Array<object>} players
 * @param {boolean} isHost
 */
export function updateWaitingRoom(root, roomCode, players, isHost) {
  const waitingRoom = root.querySelector('#waiting-room');
  if (!waitingRoom) return;

  // Show waiting room, hide other panels
  root.querySelector('#panel-solo')?.classList.add('lobby__panel--hidden');
  root.querySelector('#panel-multi')?.classList.add('lobby__panel--hidden');
  root.querySelector('.lobby__personalisation')?.classList.add('lobby__panel--hidden');
  root.querySelector('.lobby__mode-tabs')?.classList.add('lobby__panel--hidden');
  waitingRoom.classList.remove('lobby__waiting--hidden');

  // Room code
  const codeEl = root.querySelector('#waiting-room-code');
  if (codeEl) codeEl.textContent = roomCode;

  // Players list
  const playersEl = root.querySelector('#waiting-players');
  if (playersEl) {
    playersEl.innerHTML = players.map(p => `
            <div class="lobby__waiting-player" style="border-color: ${p.colour || '#666'}">
                <span class="lobby__waiting-player-icon" style="color: ${p.colour || '#fff'}">${p.icon || '♠'}</span>
                <span class="lobby__waiting-player-name">${escapeHtml(p.name)}</span>
                ${p.isHost ? '<span class="lobby__waiting-player-badge">HOST</span>' : ''}
            </div>
        `).join('');
  }

  // Start button (host only, 2+ players)
  const startBtn = root.querySelector('#btn-start-game');
  if (startBtn) {
    if (isHost && players.length >= 2) {
      startBtn.classList.remove('lobby__btn--hidden');
    } else {
      startBtn.classList.add('lobby__btn--hidden');
    }
  }

  // Status
  const statusEl = root.querySelector('#waiting-status');
  if (statusEl) {
    if (isHost && players.length < 2) {
      statusEl.textContent = 'Waiting for players…';
    } else if (isHost) {
      statusEl.textContent = `${players.length} player(s) ready — you can start!`;
    } else {
      statusEl.textContent = `Waiting for host to start the game… (${players.length} player(s))`;
    }
  }
}

/**
 * Render score history section.
 * @param {Array<object>} history
 * @returns {string}
 */
function renderHistory(history) {
  const rows = history.slice(0, 10).map(entry => {
    const date = new Date(entry.date).toLocaleDateString();
    const result = entry.won ? '🏆 Won' : '💀 Lost';
    return `<li>${date} — ${entry.playerName}: ${entry.playerScore} pts, Computer: ${entry.aiScore} pts — ${result}</li>`;
  }).join('');

  return `
        <div class="lobby__scores">
            <h3 class="lobby__scores-title">Recent Games</h3>
            <ul class="lobby__scores-list">${rows}</ul>
        </div>
    `;
}

/**
 * Save a game result to localStorage.
 * @param {object} result — { playerName, playerScore, aiScore, won }
 */
export function saveScoreHistory(result) {
  const history = loadScoreHistory();
  history.unshift({ ...result, date: Date.now() });
  localStorage.setItem('remik_history', JSON.stringify(history.slice(0, 20)));
}

/**
 * Load score history from localStorage.
 * @returns {Array<object>}
 */
function loadScoreHistory() {
  try {
    return JSON.parse(localStorage.getItem('remik_history') || '[]');
  } catch {
    return [];
  }
}

/**
 * Escape HTML to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
