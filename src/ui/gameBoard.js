/**
 * Game board — main game UI orchestrator.
 * Renders the entire board: opponent hand, piles, table melds, player hand, controls.
 * Handles AI turn execution (solo) and network dispatch (multiplayer).
 * Integrates: event log, sound, auto-save, turn tracker, stats viewer.
 * @module ui/gameBoard
 */

import { renderCard, renderCardBack, showToast } from './cards.js';
import { HandManager } from './hand.js';
import {
    PHASE, events,
    createGame, startRound, nextRound,
    drawFromStock, drawFromDiscard,
    playMelds, addToTableMeld, swapJoker,
    discard, skipMeld
} from '../engine/gameState.js';
import { aiDecideTurn, aiDecideMeldsAndDiscard } from '../engine/ai.js';
import { classifyMeld, autoSplitMelds, canExtendMeld } from '../engine/melds.js';
import { cardToString, getCardValue } from '../engine/card.js';
import { saveScoreHistory } from './lobby.js';
import { saveGame, deleteSave } from '../engine/saveManager.js';
import { TurnTracker } from '../engine/turnTracker.js';
import { EventLog } from './eventLog.js';
import { showStatsViewer } from './statsViewer.js';
import { showRulebook } from './rulebook.js';
import { showLeaderboard } from './leaderboard.js';
import * as sound from '../engine/soundManager.js';
import * as net from '../engine/networkClient.js';

/** @type {object|null} */
let gameState = null;
/** @type {HTMLElement} */
let rootEl = null;
/** @type {HandManager|null} */
let handManager = null;
/** @type {boolean} */
let aiTurnInProgress = false;
/** @type {Function|null} */
let returnToLobbyFn = null;
/** @type {Array<Array<object>>} staged melds — each entry is a validated meld to be played together */
let stagedMelds = [];
/** @type {Set<number>} card IDs currently in the staging area */
let stagedCardIds = new Set();
/** @type {TurnTracker} */
let turnTracker = new TurnTracker();
/** @type {EventLog} */
let eventLog = new EventLog();

// ── Multiplayer state ──
/** @type {boolean} */
let isMultiplayer = false;
/** @type {number} */
let myPlayerIndex = 0;
/** @type {number} seconds remaining on turn timer */
let timerRemaining = 0;
/** @type {string|null} current player name */
let currentPlayerName = null;
/** @type {boolean} is this player the host */
let isHost = false;
/** @type {NodeJS.Timeout|null} */
let timerInterval = null;
/** @type {number} tracks previous player index to detect turn changes */
let lastCurrentPlayerIndex = -1;

/**
 * Initialize and render the game board (SOLO mode).
 * @param {HTMLElement} root
 * @param {string} playerName
 * @param {Function} onReturnToLobby
 * @param {{ savedState?: object, savedTurnTracker?: object, savedEventLog?: object }} [resumeData]
 * @param {object} [configOverrides={}]
 */
export function renderGameBoard(root, playerName, onReturnToLobby, resumeData = null, configOverrides = {}) {
    rootEl = root;
    returnToLobbyFn = onReturnToLobby;
    isMultiplayer = false;
    myPlayerIndex = 0;
    currentPlayerName = playerName;
    isHost = false;

    // Reset modules
    turnTracker = new TurnTracker();
    eventLog = new EventLog();

    if (resumeData && resumeData.savedState) {
        gameState = resumeData.savedState;
        if (resumeData.savedTurnTracker) {
            turnTracker.fromJSON(resumeData.savedTurnTracker);
        }
    } else {
        gameState = createGame(playerName, configOverrides);
        startRound(gameState);
    }

    buildBoardDOM();

    // Subscribe event log to EventBus
    eventLog.subscribe(events, gameState.players);

    // Mount event log
    const logContainer = document.getElementById('event-log-entries');
    eventLog.mount(logContainer);

    if (resumeData && resumeData.savedEventLog) {
        eventLog.fromJSON(resumeData.savedEventLog);
        eventLog.addEntry('💾', 'Game resumed from save', 'info');
    } else if (!resumeData) {
        eventLog.addRoundSeparator(gameState.roundNumber);
    }

    updateUI(true);

    // Listen for state changes
    events.on('stateChange', () => updateUI());
    events.on('roundEnd', onRoundEnd);

    // Sound hooks via EventBus
    events.on('draw', () => sound.playCardDraw());
    events.on('meld', () => sound.playMeldSuccess());
    events.on('extend', () => sound.playExtend());
    events.on('discard', () => sound.playDiscard());
    events.on('reshuffle', () => sound.playReshuffle());
}

/**
 * Initialize the game board in MULTIPLAYER mode.
 * @param {HTMLElement} root
 * @param {string} playerName
 * @param {Function} onReturnToLobby
 * @param {number} playerIndex — this player's index
 * @param {boolean} playerIsHost
 */
export function renderMultiplayerBoard(root, playerName, onReturnToLobby, playerIndex, playerIsHost) {
    rootEl = root;
    returnToLobbyFn = onReturnToLobby;
    isMultiplayer = true;
    myPlayerIndex = playerIndex;
    currentPlayerName = playerName;
    isHost = playerIsHost;

    // Reset modules
    turnTracker = new TurnTracker();
    eventLog = new EventLog();
    gameState = null; // Will be populated by server

    buildBoardDOM();

    // Mount event log
    const logContainer = document.getElementById('event-log-entries');
    eventLog.mount(logContainer);

    // Register network handlers
    net.on('game_state', onNetworkGameState);
    net.on('timer_tick', onTimerTick);
    net.on('timer_expired', onTimerExpired);
    net.on('round_start', onNetworkRoundStart);
    net.on('round_end', onRoundEnd);
    net.on('player_disconnected', onPlayerDisconnected);
    net.on('player_reconnected', onPlayerReconnected);
    net.on('action_error', onActionError);
    net.on('game_event', onNetworkGameEvent);
}

/**
 * Handle incoming game state from server.
 * @param {object} msg
 */
function onNetworkGameState(msg) {
    gameState = {
        players: msg.players.map(p => ({
            name: p.name,
            hand: p.isMe ? p.hand : Array(p.handSize).fill(null),
            hasOpened: p.hasOpened,
            score: p.score,
            eliminated: p.eliminated,
            isHuman: true,
            colour: p.colour,
            icon: p.icon,
            isMe: p.isMe
        })),
        stock: { length: msg.stock.count },
        discardPile: msg.discardPile.topCard ? [msg.discardPile.topCard] : [],
        tableMelds: msg.tableMelds,
        currentPlayerIndex: msg.currentPlayerIndex,
        phase: msg.phase,
        roundNumber: msg.roundNumber,
        drawnFromDiscard: msg.drawnFromDiscard,
        lastAction: msg.lastAction,
        config: msg.config
    };
    myPlayerIndex = msg.myIndex;

    if (!eventLog._mounted) {
        eventLog.subscribe(events, gameState.players);
    }

    // Show "Your Turn!" HUD when the turn rotates to this player
    const prevPlayerIndex = lastCurrentPlayerIndex;
    lastCurrentPlayerIndex = gameState.currentPlayerIndex;
    if (
        gameState.currentPlayerIndex === myPlayerIndex &&
        prevPlayerIndex !== myPlayerIndex &&
        gameState.phase !== PHASE.ROUND_OVER &&
        gameState.phase !== PHASE.GAME_OVER
    ) {
        showTurnNotification();
    }

    updateUI();
}

/** @param {object} msg */
function onTimerTick(msg) {
    timerRemaining = msg.remaining;
    updateTimerBar();
}

/** @param {object} msg */
function onTimerExpired(msg) {
    showToast(`⏰ ${msg.playerName}'s turn timed out — auto-discarded!`, 'warning');
    sound.playError();
}

/** @param {object} msg */
function onNetworkRoundStart(msg) {
    // fast-forward cleanup
    const overlay = document.querySelector('.overlay');
    if (overlay) overlay.remove();

    // Clear local staging
    if (handManager) {
        handManager.selectedIds.clear();
        handManager.lockedIds.clear();
    }
    stagedMelds = [];
    stagedCardIds = new Set();

    eventLog.addRoundSeparator(msg.roundNumber);
    showToast(`Round ${msg.roundNumber} starting!`, 'info');
    updateUI(true);
}

/** @param {object} msg */
function onPlayerDisconnected(msg) {
    showToast(`⚠️ ${msg.playerName} disconnected`, 'warning');
    showReconnectBanner(msg.playerName);
}

/** @param {object} msg */
function onPlayerReconnected(msg) {
    showToast(`✅ ${msg.playerName} reconnected`, 'success');
    hideReconnectBanner();
}

/** @param {object} msg */
function onActionError(msg) {
    sound.playError();
    showToast(msg.error, 'error');
}

/**
 * Handle game events for the log (multiplayer).
 * @param {object} msg
 */
function onNetworkGameEvent(msg) {
    const { eventType, playerName, playerIndex, details } = msg;
    let icon = 'ℹ️';
    let text = '';

    switch (eventType) {
        case 'draw':
            icon = '📥';
            text = details.source === 'stock'
                ? `${playerName} drew from stock`
                : `${playerName} drew ${details.card ? cardToString(details.card) : '?'} from discard`;
            break;
        case 'meld':
            icon = '✅';
            text = `${playerName} played meld: ${details.meldStr}`;
            break;
        case 'extend':
            icon = '➕';
            text = `${playerName} extended meld: ${details.cardStr}`;
            break;
        case 'discard':
            icon = '🗑️';
            text = `${playerName} discarded ${details.card ? cardToString(details.card) : '?'}`;
            break;
        case 'reshuffle':
            icon = '🔄';
            text = `Stock reshuffled (${details.count} cards)`;
            break;
        case 'reposition_joker':
            icon = '🃏';
            text = `${playerName} moved Joker from ${details.from} to ${details.to} of meld`;
            break;
    }

    if (text) {
        eventLog.addEntry(icon, text);
    }

    // Play sounds for opponent actions so everyone can hear what's happening
    if (eventType === 'reshuffle') {
        sound.playReshuffle();
    } else if (typeof playerIndex === 'number' && playerIndex !== myPlayerIndex) {
        switch (eventType) {
            case 'draw':    sound.playCardDraw(); break;
            case 'meld':    sound.playMeldSuccess(); break;
            case 'extend':  sound.playExtend(); break;
            case 'discard': sound.playDiscard(); break;
        }
    }
}

/**
 * Build the static board DOM structure with event log sidebar.
 */
function buildBoardDOM() {
    rootEl.innerHTML = `
    <div class="game-layout" id="game-layout">
      <div class="game-board" id="game-board">
        <!-- Top Bar -->
        <div class="top-bar">
          <span class="top-bar__round" id="round-label"></span>
          <div class="top-bar__scores" id="scores-display"></div>
          <div class="top-bar__actions">
            <button class="top-bar__stats-btn" id="btn-stats" title="View completed round stats">📊 Stats</button>
            <button class="top-bar__stats-btn" id="btn-rules" title="View game rules">📖 Rules</button>
            <button class="top-bar__stats-btn" id="btn-leaderboard" title="View PvP leaderboard">🏆 Ranks</button>
            <button class="top-bar__stats-btn" id="btn-theme" title="Toggle board theme">🎨 Theme</button>
            <div class="turn-indicator" id="turn-indicator"></div>
          </div>
        </div>

        <!-- Turn Timer -->
        <div class="turn-timer" id="turn-timer" style="display:none">
          <div class="turn-timer__bar" id="turn-timer-bar"></div>
          <span class="turn-timer__label" id="turn-timer-label">5:00</span>
        </div>

        <!-- Center: AI hand + piles + table melds -->
        <div class="center-area">
          <div class="ai-area" id="ai-hand"></div>

          <div class="piles">
            <div class="pile" id="stock-pile" title="Draw from stock">
              <div id="stock-card"></div>
              <span class="pile__label">Stock</span>
              <span class="pile__count" id="stock-count"></span>
            </div>
            <div class="pile" id="discard-pile" title="Draw from discard (must use in meld)">
              <div id="discard-card"></div>
              <span class="pile__label">Discard</span>
              <span class="pile__count" id="discard-count"></span>
            </div>
          </div>

          <div class="table-melds" id="table-melds"></div>

          <!-- Meld staging zone -->
          <div class="meld-staging" id="meld-staging" style="display:none;">
            <div class="meld-staging__zone" id="meld-staging-zone"></div>
          </div>
        </div>

        <!-- Status bar -->
        <div class="status-bar">
          <span class="status-bar__message" id="status-message"></span>
        </div>

        <!-- Player hand area -->
        <div class="hand-area">
          <div class="hand-controls" id="hand-controls"></div>
          <div class="hand" id="player-hand"></div>
        </div>
      </div>

      <!-- Event Log Sidebar -->
      <div class="event-log-panel" id="event-log-panel">
        <div class="event-log__header">
          <h3 class="event-log__title">📜 Event Log</h3>
        </div>
        <div class="event-log__entries" id="event-log-entries"></div>
      </div>
    </div>
  `;

    // Wire up pile click handlers
    document.getElementById('stock-pile').addEventListener('click', onStockClick);
    document.getElementById('discard-pile').addEventListener('click', onDiscardClick);

    // Stats button
    document.getElementById('btn-stats').addEventListener('click', () => {
        sound.playButtonClick();
        if (turnTracker.completedRounds.length === 0) {
            showToast('No completed rounds yet — finish a round first!', 'info');
            return;
        }
        showStatsViewer(turnTracker.completedRounds);
    });

    // Rulebook button
    document.getElementById('btn-rules').addEventListener('click', () => {
        sound.playButtonClick();
        showRulebook();
    });

    // Leaderboard button
    document.getElementById('btn-leaderboard').addEventListener('click', () => {
        sound.playButtonClick();
        showLeaderboard(currentPlayerName || '');
    });

    // Theme toggle button
    const boardEl = document.getElementById('game-board');
    if (localStorage.getItem('remik_theme') === 'grey') {
        boardEl.classList.add('game-board--grey-theme');
    }
    document.getElementById('btn-theme').addEventListener('click', () => {
        sound.playButtonClick();
        const isGrey = boardEl.classList.toggle('game-board--grey-theme');
        localStorage.setItem('remik_theme', isGrey ? 'grey' : 'green');
    });

    // Set up meld staging drop zone
    const stagingZone = document.getElementById('meld-staging-zone');
    stagingZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    });
    stagingZone.addEventListener('drop', onStagingDrop);

    // Initialize hand manager
    const handEl = document.getElementById('player-hand');
    handManager = new HandManager(handEl, {
        onReorder: handleReorder,
        onSelectionChange: handleSelectionChange
    });
}

/**
 * Update the entire UI from current game state.
 * @param {boolean} [dealAnim=false]
 */
function updateUI(dealAnim = false) {
    if (!gameState) return;

    const state = gameState;
    const humanPlayer = state.players[myPlayerIndex];
    const isHumanTurn = state.currentPlayerIndex === myPlayerIndex;

    // Round label
    document.getElementById('round-label').textContent = `Round ${state.roundNumber}`;

    // Scores
    const scoresEl = document.getElementById('scores-display');
    scoresEl.innerHTML = state.players.map((p, i) => {
        const active = state.currentPlayerIndex === i ? 'top-bar__score--active' : '';
        const openedTag = p.hasOpened ? ' ✓' : '';
        return `<span class="top-bar__score ${active}">${p.name}: ${p.score} pts${openedTag}</span>`;
    }).join('');

    // Turn indicator
    const turnEl = document.getElementById('turn-indicator');
    if (state.phase === PHASE.ROUND_OVER || state.phase === PHASE.GAME_OVER) {
        turnEl.innerHTML = '';
    } else if (isHumanTurn) {
        turnEl.className = 'turn-indicator turn-indicator--your-turn';
        turnEl.innerHTML = `<span class="turn-indicator__dot"></span> Your Turn — ${state.phase}`;
    } else {
        turnEl.className = 'turn-indicator turn-indicator--ai-turn';
        turnEl.innerHTML = `<span class="turn-indicator__dot"></span> ${state.players[state.currentPlayerIndex].name}'s Turn`;
    }

    // Stats button state
    const statsBtn = document.getElementById('btn-stats');
    if (statsBtn) {
        statsBtn.disabled = turnTracker.completedRounds.length === 0;
    }

    // Opponent hands (face-down cards)
    const aiHandEl = document.getElementById('ai-hand');
    aiHandEl.innerHTML = '';
    state.players.forEach((p, i) => {
        if (i === myPlayerIndex) return; // skip own hand
        const opponentDiv = document.createElement('div');
        opponentDiv.className = 'ai-area__opponent';
        const nameTag = document.createElement('span');
        nameTag.className = 'ai-area__name';
        nameTag.style.color = p.colour || '#ccc';
        nameTag.textContent = `${p.icon || '♠'} ${p.name} (${p.hand?.length || 0})`;
        opponentDiv.appendChild(nameTag);
        const cardsRow = document.createElement('div');
        cardsRow.className = 'ai-area__cards';
        const handLength = Array.isArray(p.hand) ? p.hand.filter(c => c !== null).length || p.hand.length : 0;
        for (let j = 0; j < handLength; j++) {
            cardsRow.appendChild(renderCardBack({ small: true }));
        }
        opponentDiv.appendChild(cardsRow);
        aiHandEl.appendChild(opponentDiv);
    });

    // Stock pile
    const stockCardEl = document.getElementById('stock-card');
    stockCardEl.innerHTML = '';
    const stockLen = isMultiplayer ? (state.stock.length || state.stock.count || 0) : state.stock.length;
    if (stockLen > 0) {
        stockCardEl.appendChild(renderCardBack());
    }
    document.getElementById('stock-count').textContent = `${stockLen} cards`;

    // Discard pile
    const discardCardEl = document.getElementById('discard-card');
    discardCardEl.innerHTML = '';
    if (state.discardPile.length > 0) {
        const topDiscard = state.discardPile[state.discardPile.length - 1];
        discardCardEl.appendChild(renderCard(topDiscard));
    }
    const discardLen = isMultiplayer
        ? (state.discardPile.length || 0)
        : state.discardPile.length;
    document.getElementById('discard-count').textContent = `${discardLen} cards`;

    // Pile highlighting — glow when clickable
    const stockPile = document.getElementById('stock-pile');
    const discardPile = document.getElementById('discard-pile');
    if (isHumanTurn && state.phase === PHASE.DRAW) {
        stockPile.classList.add('pile--clickable');
        if (state.discardPile.length > 0) {
            discardPile.classList.add('pile--clickable');
        } else {
            discardPile.classList.remove('pile--clickable');
        }
    } else {
        stockPile.classList.remove('pile--clickable');
        discardPile.classList.remove('pile--clickable');
    }

    // Table melds — SEPARATED BY PLAYER
    renderTableMelds();

    // Staging area (shown during meld phase on human turn)
    renderStagingArea();

    // Player hand
    const newCardId = state.drawnCard ? state.drawnCard.id : null;
    const newCardAnim = state.lastAction?.type === 'draw'
        ? (state.lastAction.source === 'stock' ? 'anim-draw-stock' : 'anim-draw-discard')
        : '';
    // Filter out nulls (multiplayer opponent hand stubs)
    const realHand = (humanPlayer.hand || []).filter(c => c !== null);
    handManager.render(realHand, {
        animate: dealAnim,
        newCardId: isHumanTurn ? newCardId : null,
        newCardAnimClass: newCardAnim,
        stagedIds: stagedCardIds
    });

    // Status message
    updateStatusMessage();

    // Controls
    renderControls();

    // Auto-save after every UI update (solo only)
    if (!isMultiplayer) {
        saveGame(gameState, turnTracker.toJSON(), eventLog.toJSON());
    }

    // Update turn timer display
    updateTimerBar();

    // Trigger AI turn if needed (solo only)
    if (!isMultiplayer && !isHumanTurn && state.phase !== PHASE.ROUND_OVER && state.phase !== PHASE.GAME_OVER) {
        scheduleAiTurn();
    }
}

/**
 * Render table melds GROUPED BY PLAYER (owner).
 */
function renderTableMelds() {
    const container = document.getElementById('table-melds');
    container.innerHTML = '';

    if (gameState.tableMelds.length === 0) return;

    // Group melds by owner
    const byOwner = {};
    gameState.tableMelds.forEach((meld, idx) => {
        const ownerIdx = meld.owner;
        if (!byOwner[ownerIdx]) byOwner[ownerIdx] = [];
        byOwner[ownerIdx].push({ meld, idx });
    });

    // Render each owner group
    for (const ownerIdx of Object.keys(byOwner).sort((a, b) => a - b)) {
        const group = byOwner[ownerIdx];
        const playerName = gameState.players[ownerIdx]?.name || `Player ${ownerIdx}`;

        const groupEl = document.createElement('div');
        groupEl.className = 'meld-group';

        const header = document.createElement('div');
        header.className = 'meld-group__header';
        header.textContent = `${playerName}'s Melds`;
        groupEl.appendChild(header);

        const meldsRow = document.createElement('div');
        meldsRow.className = 'meld-group__melds';

        for (const { meld, idx } of group) {
            const meldEl = document.createElement('div');
            meldEl.className = 'table-meld';
            meldEl.dataset.meldIndex = idx;

            // Make it a drop target
            meldEl.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                meldEl.classList.add('table-meld--drop-target');
            });
            meldEl.addEventListener('dragleave', () => {
                meldEl.classList.remove('table-meld--drop-target');
            });
            meldEl.addEventListener('drop', (e) => {
                e.preventDefault();
                meldEl.classList.remove('table-meld--drop-target');
                onTableMeldDrop(e, idx);
            });

            const isMyTurnMeld = gameState.currentPlayerIndex === myPlayerIndex
                && gameState.phase === PHASE.MELD
                && gameState.players[myPlayerIndex]?.hasOpened;

            meld.cards.forEach((card, cardIdx) => {
                const cardEl = renderCard(card, { table: true });

                // Make joker cards individual drop targets for swapping
                if (card.isJoker) {
                    cardEl.classList.add('table-meld__joker');
                    cardEl.dataset.jokerMeldIndex = idx;
                    cardEl.dataset.jokerCardIndex = cardIdx;

                    cardEl.addEventListener('dragover', (ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        ev.dataTransfer.dropEffect = 'move';
                        cardEl.classList.add('card--joker-drop-target');
                    });
                    cardEl.addEventListener('dragleave', () => {
                        cardEl.classList.remove('card--joker-drop-target');
                    });
                    cardEl.addEventListener('drop', (ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        cardEl.classList.remove('card--joker-drop-target');
                        onJokerSwapDrop(ev, idx, cardIdx);
                    });

                    // Repositioning: click a joker at the start or end to flip it to the other end
                    const isAtStart = cardIdx === 0;
                    const isAtEnd = cardIdx === meld.cards.length - 1;
                    if (isMyTurnMeld && (isAtStart || isAtEnd)) {
                        cardEl.classList.add('table-meld__joker--repositionable');
                        cardEl.title = `Click to move Joker to the ${isAtStart ? 'end' : 'start'} of this meld`;
                        cardEl.addEventListener('click', (ev) => {
                            ev.stopPropagation();
                            onRepositionJoker(idx, cardIdx);
                        });
                    }
                }

                meldEl.appendChild(cardEl);
            });

            meldsRow.appendChild(meldEl);
        }

        groupEl.appendChild(meldsRow);
        container.appendChild(groupEl);
    }
}

/**
 * Render hand control buttons.
 */
function renderControls() {
    const controlsEl = document.getElementById('hand-controls');
    const state = gameState;
    const isHumanTurn = state.currentPlayerIndex === myPlayerIndex;

    if (state.phase === PHASE.ROUND_OVER || state.phase === PHASE.GAME_OVER) {
        controlsEl.innerHTML = '';
        return;
    }

    // Only show selected IDs that are not already in the staging area
    const allSelected = handManager.getSelectedIds();
    const selected = allSelected.filter(id => !stagedCardIds.has(id));
    const hasSelection = selected.length > 0;
    const hasStagedMelds = stagedMelds.length > 0;

    let buttons = '';

    // Auto-organize button (always available)
    buttons += `<button class="hand-controls__btn" id="btn-auto-organize" title="Sort unlocked cards">
    🔄 Auto Organize (${handManager.getSortModeLabel()})
  </button>`;

    // Toggle sort mode
    buttons += `<button class="hand-controls__btn" id="btn-sort-mode" title="Switch sort order">
    ↕ Switch Sort
  </button>`;

    if (isHumanTurn) {
        if (state.phase === PHASE.MELD || state.phase === PHASE.DISCARD) {
            // Stage selected cards as one meld (validates individually)
            if (hasSelection && selected.length >= 3) {
                buttons += `<button class="hand-controls__btn hand-controls__btn--primary" id="btn-stage-meld" title="Validate and stage selected cards as one meld">
          + Stage as Meld (${selected.length} cards)
        </button>`;
            }

            // Play all staged melds at once
            if (hasStagedMelds) {
                const totalCards = stagedMelds.reduce((sum, m) => sum + m.length, 0);
                buttons += `<button class="hand-controls__btn hand-controls__btn--success" id="btn-play-staged" title="Play all staged melds">
          ✅ Play ${stagedMelds.length} Meld${stagedMelds.length > 1 ? 's' : ''} (${totalCards} cards)
        </button>`;
                buttons += `<button class="hand-controls__btn hand-controls__btn--warning" id="btn-clear-staged" title="Remove all staged melds">
          ✖ Clear Staged
        </button>`;
            }

            // Discard selected (only if exactly 1 selected and not staged)
            if (hasSelection && selected.length === 1) {
                buttons += `<button class="hand-controls__btn hand-controls__btn--danger" id="btn-discard" title="Discard selected card">
          🗑️ Discard
        </button>`;
            }

            // Skip meld button
            if (state.phase === PHASE.MELD) {
                buttons += `<button class="hand-controls__btn" id="btn-skip-meld" title="Skip melding and go to discard">
          ⏭ Skip to Discard
        </button>`;
            }
        }

        // Clear selection (only unstaged cards)
        if (hasSelection) {
            buttons += `<button class="hand-controls__btn" id="btn-clear-selection" title="Deselect all cards">
        ✖ Clear Selection
      </button>`;
        }
    }

    controlsEl.innerHTML = buttons;

    // Wire up button handlers
    document.getElementById('btn-auto-organize')?.addEventListener('click', () => { sound.playButtonClick(); onAutoOrganize(); });
    document.getElementById('btn-sort-mode')?.addEventListener('click', () => { sound.playButtonClick(); onToggleSortMode(); });
    document.getElementById('btn-stage-meld')?.addEventListener('click', () => { sound.playButtonClick(); onStageMeld(); });
    document.getElementById('btn-play-staged')?.addEventListener('click', () => { sound.playButtonClick(); onPlayStagedMelds(); });
    document.getElementById('btn-clear-staged')?.addEventListener('click', () => { sound.playButtonClick(); onClearStagedMelds(); });
    document.getElementById('btn-discard')?.addEventListener('click', () => { sound.playButtonClick(); onDiscard(); });
    document.getElementById('btn-skip-meld')?.addEventListener('click', () => { sound.playButtonClick(); onSkipMeld(); });
    document.getElementById('btn-clear-selection')?.addEventListener('click', () => { sound.playButtonClick(); handManager.clearSelection(); });
}

/**
 * Update the status message.
 */
function updateStatusMessage() {
    const el = document.getElementById('status-message');
    const state = gameState;
    const isHumanTurn = state.currentPlayerIndex === myPlayerIndex;

    if (state.phase === PHASE.ROUND_OVER || state.phase === PHASE.GAME_OVER) {
        el.textContent = '';
        return;
    }

    if (!isHumanTurn) {
        if (isMultiplayer) {
            const currentName = state.players[state.currentPlayerIndex].name;
            el.innerHTML = `<span class="ai-thinking"><span class="ai-thinking__dot"></span><span class="ai-thinking__dot"></span><span class="ai-thinking__dot"></span></span> ${currentName} is making a move…`;
        } else {
            el.innerHTML = `<span class="ai-thinking"><span class="ai-thinking__dot"></span><span class="ai-thinking__dot"></span><span class="ai-thinking__dot"></span></span> Computer is thinking…`;
        }
        return;
    }

    const player = state.players[myPlayerIndex];
    switch (state.phase) {
        case PHASE.DRAW:
            el.textContent = '📥 Draw a card — click the Stock or Discard pile';
            break;
        case PHASE.MELD:
            if (!player.hasOpened) {
                el.textContent = '🃏 Select cards to meld (need ≥51 pts with a pure sequence to open) — or skip to discard';
            } else {
                el.textContent = '🃏 Select cards to play melds, drag to existing melds, or skip to discard';
            }
            break;
        case PHASE.DISCARD:
            el.textContent = '🗑️ Select 1 card and click Discard to end your turn';
            break;
    }
}

// ═══════════════════════════════
// EVENT HANDLERS
// ═══════════════════════════════

function onStockClick() {
    if (gameState.currentPlayerIndex !== myPlayerIndex || gameState.phase !== PHASE.DRAW) return;
    sound.playCardClick();

    if (isMultiplayer) {
        net.send('game_action', { action: 'draw_stock' });
        return;
    }

    const result = drawFromStock(gameState);
    if (!result.success) {
        sound.playError();
        showToast(result.reason, 'error');
    } else {
        turnTracker.takeSnapshot(gameState, `${gameState.players[myPlayerIndex].name} drew from stock`);
    }
}

function onDiscardClick() {
    if (gameState.currentPlayerIndex !== myPlayerIndex || gameState.phase !== PHASE.DRAW) return;
    if (gameState.discardPile.length === 0) {
        sound.playError();
        showToast('Discard pile is empty', 'error');
        return;
    }
    sound.playCardClick();

    if (isMultiplayer) {
        net.send('game_action', { action: 'draw_discard' });
        return;
    }

    const result = drawFromDiscard(gameState);
    if (!result.success) {
        sound.playError();
        showToast(result.reason, 'error');
    } else {
        showToast('You drew from discard — you must use this card in a meld this turn!', 'info');
        turnTracker.takeSnapshot(gameState, `${gameState.players[myPlayerIndex].name} drew from discard`);
    }
}

function onAutoOrganize() {
    const player = gameState.players[myPlayerIndex];
    const realHand = (player.hand || []).filter(c => c !== null);
    player.hand = handManager.autoOrganize(realHand);
    handManager.render(player.hand);
    syncHandOrder();
}

function onToggleSortMode() {
    handManager.toggleSortMode();
    onAutoOrganize(); // re-sort with new mode
}

/**
 * Validate selected cards as one meld and move them into the staging area.
 * Cards stay visually in hand but are marked staged (dimmed).
 */
function onStageMeld() {
    const allSelected = handManager.getSelectedIds();
    // Exclude cards already staged
    const selected = allSelected.filter(id => !stagedCardIds.has(id));

    if (selected.length < 3) {
        sound.playError();
        showToast('Select at least 3 un-staged cards to stage as a meld', 'error');
        return;
    }

    const playerHand = gameState.players[myPlayerIndex].hand;
    const cards = selected.map(id => playerHand.find(c => c.id === id)).filter(Boolean);

    const meldType = classifyMeld(cards);
    if (!meldType) {
        sound.playError();
        // Provide a more specific reason
        const naturals = cards.filter(c => !c.isJoker);
        const allSameSuit = naturals.length > 0 && naturals.every(c => c.suit === naturals[0].suit);
        const allSameRank = naturals.length > 0 && naturals.every(c => c.rank === naturals[0].rank);
        let hint = '';
        if (allSameSuit) hint = ' (same suit — check they are consecutive and no two Jokers are adjacent)';
        else if (allSameRank) hint = ' (same rank — check for duplicate suits or too many Jokers)';
        else hint = ' (must be a sequence: same suit + consecutive, or a group: same rank + different suits)';
        showToast(`Not a valid meld${hint}`, 'error');
        return;
    }

    // Add to staging
    stagedMelds.push(cards);
    selected.forEach(id => stagedCardIds.add(id));

    // Deselect the staged cards
    selected.forEach(id => handManager.selectedIds.delete(id));

    const typeLabel = meldType === 'sequence' ? 'Sequence' : 'Group';
    showToast(`${typeLabel} staged ✅ — stage more or click "Play Melds"`, 'success');

    renderControls();
    renderStagingArea();

    // Re-render hand to show staged state
    const realHand = (playerHand || []).filter(c => c !== null);
    handManager.render(realHand, { stagedIds: stagedCardIds });
}

/**
 * Submit all staged melds to the game engine at once.
 */
function onPlayStagedMelds() {
    if (stagedMelds.length === 0) {
        sound.playError();
        showToast('No melds staged — use "Stage as Meld" first', 'error');
        return;
    }

    const meldIdArrays = stagedMelds.map(meld => meld.map(c => c.id));

    // Clear staging state before submitting
    const meldCount = stagedMelds.length;
    stagedMelds = [];
    stagedCardIds = new Set();
    handManager.selectedIds.clear();

    if (isMultiplayer) {
        net.send('game_action', { action: 'play_melds', meldCardIds: meldIdArrays });
        return;
    }

    const result = playMelds(gameState, meldIdArrays);
    if (!result.success) {
        sound.playError();
        showToast(result.reason, 'error');
        // Staging is already cleared — player must re-stage
    } else {
        showToast(`${meldCount} meld${meldCount > 1 ? 's' : ''} played! ✅`, 'success');
        turnTracker.takeSnapshot(gameState, `${gameState.players[myPlayerIndex].name} played ${meldCount} meld${meldCount > 1 ? 's' : ''}`);
    }
}

/**
 * Remove all staged melds and return cards to the hand.
 */
function onClearStagedMelds() {
    stagedMelds = [];
    stagedCardIds = new Set();
    renderControls();
    renderStagingArea();
    // Re-render hand to remove staged styling
    const playerHand = gameState.players[myPlayerIndex].hand;
    const realHand = (playerHand || []).filter(c => c !== null);
    handManager.render(realHand);
    showToast('Staged melds cleared', 'info');
}

/**
 * Remove one specific staged meld by index, returning its cards to the hand.
 * @param {number} meldIdx — index into stagedMelds
 */
function onRemoveStagedMeld(meldIdx) {
    if (meldIdx < 0 || meldIdx >= stagedMelds.length) return;
    const removed = stagedMelds.splice(meldIdx, 1)[0];
    removed.forEach(c => stagedCardIds.delete(c.id));
    renderControls();
    renderStagingArea();
    const playerHand = gameState.players[myPlayerIndex].hand;
    const realHand = (playerHand || []).filter(c => c !== null);
    handManager.render(realHand, { stagedIds: stagedCardIds });
}

/**
 * Render the staging area panel showing each staged meld with validity and a remove button.
 */
function renderStagingArea() {
    const stagingEl = document.getElementById('meld-staging');
    const zoneEl = document.getElementById('meld-staging-zone');
    if (!stagingEl || !zoneEl) return;

    const isHumanTurn = gameState && gameState.currentPlayerIndex === myPlayerIndex;
    const inMeldPhase = gameState && (gameState.phase === PHASE.MELD || gameState.phase === PHASE.DISCARD);

    if (!isHumanTurn || !inMeldPhase || stagedMelds.length === 0) {
        stagingEl.style.display = 'none';
        zoneEl.innerHTML = '';
        return;
    }

    stagingEl.style.display = '';
    zoneEl.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'meld-staging__header';
    header.textContent = 'Staged Melds:';
    zoneEl.appendChild(header);

    const meldsRow = document.createElement('div');
    meldsRow.className = 'meld-staging__melds';

    stagedMelds.forEach((meld, idx) => {
        const meldEl = document.createElement('div');
        meldEl.className = 'meld-staging__meld';

        // Cards
        const cardsEl = document.createElement('div');
        cardsEl.className = 'meld-staging__cards';
        meld.forEach(card => {
            cardsEl.appendChild(renderCard(card, { table: true }));
        });
        meldEl.appendChild(cardsEl);

        // Type badge
        const type = classifyMeld(meld);
        const badge = document.createElement('span');
        badge.className = `meld-staging__badge meld-staging__badge--${type || 'invalid'}`;
        badge.textContent = type === 'sequence' ? '↔ Sequence' : type === 'group' ? '≡ Group' : '❌ Invalid';
        meldEl.appendChild(badge);

        // Remove button
        const removeBtn = document.createElement('button');
        removeBtn.className = 'meld-staging__remove';
        removeBtn.textContent = '✖';
        removeBtn.title = 'Remove this meld from staging';
        removeBtn.addEventListener('click', () => { sound.playButtonClick(); onRemoveStagedMeld(idx); });
        meldEl.appendChild(removeBtn);

        meldsRow.appendChild(meldEl);
    });

    zoneEl.appendChild(meldsRow);
}

function onDiscard() {
    const selected = handManager.getSelectedIds();
    if (selected.length !== 1) {
        sound.playError();
        showToast('Select exactly 1 card to discard', 'error');
        return;
    }

    // Cannot discard a card that is staged
    if (stagedCardIds.has(selected[0])) {
        sound.playError();
        showToast('That card is staged in a meld — remove it from staging first', 'error');
        return;
    }

    if (isMultiplayer) {
        net.send('game_action', { action: 'discard', cardId: selected[0] });
        handManager.selectedIds.clear();
        return;
    }

    const result = discard(gameState, selected[0]);
    if (!result.success) {
        sound.playError();
        showToast(result.reason, 'error');
    } else {
        handManager.selectedIds.clear();
        // Clear staging after a successful discard (turn is ending)
        stagedMelds = [];
        stagedCardIds = new Set();
        turnTracker.takeSnapshot(gameState, `${gameState.players[myPlayerIndex].name} discarded`);
    }
}

function onSkipMeld() {
    sound.playButtonClick();
    if (isMultiplayer) {
        net.send('game_action', { action: 'skip_meld' });
        return;
    }
    skipMeld(gameState);
    updateUI();
}

function handleReorder(draggedId, targetId) {
    const player = gameState.players[myPlayerIndex];
    const hand = player.hand;
    const fromIdx = hand.findIndex(c => c && c.id === draggedId);
    const toIdx = hand.findIndex(c => c && c.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const [card] = hand.splice(fromIdx, 1);
    hand.splice(toIdx, 0, card);
    handManager.render(hand.filter(c => c !== null));
    syncHandOrder();
}

function handleSelectionChange() {
    renderControls();
    renderStagingArea();
}

function onStagingDrop(e) {
    e.preventDefault();
    // Drag-drop into staging zone — delegate to the stage-meld button logic
    onStageMeld();
}

function onTableMeldDrop(e, tableMeldIndex) {
    const rawIds = e.dataTransfer.getData('application/json');
    if (!rawIds) return;
    const cardIds = JSON.parse(rawIds);

    if (gameState.currentPlayerIndex !== myPlayerIndex) return;
    if (gameState.phase !== PHASE.MELD) {
        sound.playError();
        showToast('You can only add to melds during the meld phase', 'error');
        return;
    }

    const tableMeld = gameState.tableMelds[tableMeldIndex];
    if (!tableMeld) return;

    const playerHand = gameState.players[myPlayerIndex].hand;
    const cards = cardIds.map(id => playerHand.find(c => c.id === id)).filter(Boolean);
    if (cards.length === 0) return;

    // Determine position ('start' or 'end')
    let position = 'end';
    if (canExtendMeld(tableMeld.cards, cards, 'start')) {
        position = 'start';
    } else if (canExtendMeld(tableMeld.cards, cards, 'end')) {
        position = 'end';
    } else {
        sound.playError();
        showToast('Cards cannot extend this meld', 'error');
        return;
    }

    if (isMultiplayer) {
        console.log(`[Multiplayer] Extending meld ${tableMeldIndex} at ${position} with cards:`, cardIds);
        net.send('game_action', { action: 'extend_meld', tableMeldIndex, cardIds, position });
        handManager.selectedIds.clear();
        return;
    }

    // Solo mode
    const result = addToTableMeld(gameState, tableMeldIndex, cardIds, position);
    if (!result.success) {
        sound.playError();
        showToast(result.reason, 'error');
    } else {
        showToast('Card added to meld! ✅', 'success');
        handManager.selectedIds.clear();
        turnTracker.takeSnapshot(gameState, `${gameState.players[myPlayerIndex].name} extended a meld`);
    }
}

/**
 * Reposition a joker from one end of a table meld to the other.
 * @param {number} meldIndex
 * @param {number} jokerCardIndex — 0 (start) or last (end)
 */
function onRepositionJoker(meldIndex, jokerCardIndex) {
    if (gameState.currentPlayerIndex !== myPlayerIndex) return;
    if (gameState.phase !== PHASE.MELD) return;

    if (isMultiplayer) {
        net.send('game_action', { action: 'reposition_joker', meldIndex, jokerCardIndex });
        return;
    }

    // Solo mode — modify state directly
    const meld = gameState.tableMelds[meldIndex];
    if (!meld) return;

    const cards = meld.cards;
    const jokerCard = cards[jokerCardIndex];
    if (!jokerCard || !jokerCard.isJoker) return;

    const isAtStart = jokerCardIndex === 0;
    const newCards = isAtStart
        ? [...cards.slice(1), jokerCard]
        : [jokerCard, ...cards.slice(0, -1)];

    if (!classifyMeld(newCards)) {
        sound.playError();
        showToast('Cannot move Joker — would invalidate the meld', 'error');
        return;
    }

    meld.cards = newCards;
    showToast(`Joker moved to ${isAtStart ? 'end' : 'start'} ✅`, 'success');
    turnTracker.takeSnapshot(gameState, `${gameState.players[myPlayerIndex].name} repositioned a joker`);
    updateUI();
}

/**
 * Handle dropping a card from hand onto a joker in a table meld.
 * @param {DragEvent} e
 * @param {number} tableMeldIndex
 * @param {number} jokerCardIndex — position of the joker within the meld
 */
function onJokerSwapDrop(e, tableMeldIndex, jokerCardIndex) {
    const rawIds = e.dataTransfer.getData('application/json');
    if (!rawIds) return;
    const cardIds = JSON.parse(rawIds);

    if (cardIds.length !== 1) {
        showToast('Drop exactly one card to swap with the joker', 'error');
        return;
    }
    if (gameState.currentPlayerIndex !== myPlayerIndex) return;

    const cardId = cardIds[0];

    if (isMultiplayer) {
        net.send('game_action', { action: 'joker_swap', tableMeldIndex, jokerPositionInMeld: jokerCardIndex, cardId });
        handManager.selectedIds.clear();
        return;
    }

    const result = swapJoker(gameState, tableMeldIndex, jokerCardIndex, cardId);
    if (!result.success) {
        sound.playError();
        showToast(result.reason, 'error');
    } else {
        showToast('Joker swapped! 🃏 → hand', 'success');
        handManager.selectedIds.clear();
        turnTracker.takeSnapshot(gameState, `${gameState.players[myPlayerIndex].name} swapped a joker`);
    }
}

// ═══════════════════════════════
// AI TURN
// ═══════════════════════════════

function scheduleAiTurn() {
    if (aiTurnInProgress) return;
    aiTurnInProgress = true;

    // Add a delay so the human can see what's happening
    setTimeout(() => executeAiTurn(), 1200);
}

async function executeAiTurn() {
    if (gameState.phase === PHASE.ROUND_OVER || gameState.phase === PHASE.GAME_OVER) {
        aiTurnInProgress = false;
        return;
    }

    const aiName = gameState.players[1].name;

    try {
        // 1. AI decides draw source
        const drawActions = aiDecideTurn(gameState);
        const drawAction = drawActions[0];

        await delay(600);

        // If AI already has 14 cards (starting player), skip the draw
        if (gameState.phase === PHASE.MELD || gameState.phase === PHASE.DISCARD) {
            // Starting player — no draw needed
        } else {
            // Execute draw
            if (drawAction.source === 'discard') {
                drawFromDiscard(gameState);
            } else {
                drawFromStock(gameState);
            }
            turnTracker.takeSnapshot(gameState, `${aiName} drew from ${drawAction.source}`);
        }

        if (gameState.phase === PHASE.ROUND_OVER || gameState.phase === PHASE.GAME_OVER) {
            aiTurnInProgress = false;
            return;
        }

        await delay(800);

        // 2. AI decides melds and discard
        const meldActions = aiDecideMeldsAndDiscard(gameState);

        for (const action of meldActions) {
            await delay(700);

            if (action.type === 'meld') {
                const result = playMelds(gameState, action.meldCardIds);
                if (result.success) {
                    showToast(`${aiName} played a meld!`, 'info');
                    turnTracker.takeSnapshot(gameState, `${aiName} played a meld`);
                }
            } else if (action.type === 'extend') {
                addToTableMeld(gameState, action.tableMeldIndex, action.cardIds, action.position);
                turnTracker.takeSnapshot(gameState, `${aiName} extended a meld`);
            } else if (action.type === 'discard') {
                const card = gameState.players[1].hand.find(c => c.id === action.cardId);
                discard(gameState, action.cardId);
                if (card) {
                    showToast(`${aiName} discarded ${cardToString(card)}`, 'info');
                }
                turnTracker.takeSnapshot(gameState, `${aiName} discarded ${card ? cardToString(card) : '?'}`);
            }

            if (gameState.phase === PHASE.ROUND_OVER || gameState.phase === PHASE.GAME_OVER) {
                break;
            }
        }
    } catch (err) {
        console.error('AI turn error:', err);
        // Fallback: just draw and discard
        if (gameState.phase === PHASE.DRAW) {
            drawFromStock(gameState);
        }
        if (gameState.players[1].hand.length > 0 && gameState.phase !== PHASE.ROUND_OVER) {
            const lastCard = gameState.players[1].hand[gameState.players[1].hand.length - 1];
            discard(gameState, lastCard.id);
        }
    }

    aiTurnInProgress = false;

    // Notify human player that it's now their turn
    if (gameState.phase !== PHASE.ROUND_OVER && gameState.phase !== PHASE.GAME_OVER) {
        showTurnNotification();
    }
}

// ═══════════════════════════════
// ROUND / GAME END
// ═══════════════════════════════

function onRoundEnd(data) {
    console.log('[onRoundEnd] Received:', JSON.stringify(data));
    console.log('[onRoundEnd] isMultiplayer:', isMultiplayer, '| gameState.phase:', gameState?.phase, '| myPlayerIndex:', myPlayerIndex);

    // Finalize turn tracker for this round (non-fatal — overlay must always show)
    try {
        turnTracker.takeSnapshot(gameState, 'Round ended');
        turnTracker.finalizeRound();
    } catch (err) {
        console.error('[onRoundEnd] turnTracker error (non-fatal):', err);
    }

    // Play win/lose sound
    if (data.winnerIndex === myPlayerIndex) {
        sound.playRoundWin();
    } else if (data.winnerIndex !== null) {
        sound.playRoundLose();
    }

    setTimeout(() => showRoundOverlay(data), 600);
}

function showRoundOverlay(data) {
    console.log('[showRoundOverlay] Called. isMultiplayer:', isMultiplayer, '| isHost:', isHost, '| myPlayerIndex:', myPlayerIndex);
    console.log('[showRoundOverlay] data.gameOver:', data.gameOver, '| gameState.phase:', gameState?.phase);
    console.log('[showRoundOverlay] scores:', JSON.stringify(data.scores));

    // Use data.gameOver (reliable from server) falling back to local gameState.phase for solo mode
    const isGameOver = data.gameOver || gameState?.phase === PHASE.GAME_OVER;

    if (isGameOver) {
        showGameOverOverlay(data);
        return;
    }

    try {
    const { winnerIndex, isRemik, scores } = data;

    const overlay = document.createElement('div');
    overlay.className = 'overlay';

    const winnerName = winnerIndex !== null ? scores[winnerIndex].name : 'No one';
    const title = `Round ${gameState?.roundNumber ?? '?'} Complete`;
    const subtitle = isRemik
        ? `${winnerName} played REMIK! 🎉 (Penalties doubled)`
        : winnerIndex !== null
            ? `${winnerName} wins the round!`
            : 'Stock exhausted — no winner this round';

    // Build detailed stats for each player
    const playerStats = scores.map((s, i) => {
        const isWinner = i === winnerIndex;
        const cls = isWinner ? 'overlay__score-row--winner' : 'overlay__score-row--loser';
        const change = isWinner ? (isRemik ? -20 : -10) : 0;
        // In multiplayer, other players' hands are null-filled — use server-computed change directly
        // (server already applies Remik doubling). In solo mode, calculate from hand and apply doubling.
        const handPenalty = !isWinner
            ? (isMultiplayer ? Math.abs(scores[i].change) : calculateHandPenalty(i))
            : 0;
        const displayChange = isWinner
            ? change
            : (isMultiplayer ? `+${handPenalty}` : `+${isRemik ? handPenalty * 2 : handPenalty}`);
        const changeClass = isWinner ? 'overlay__score-change--negative' : 'overlay__score-change--positive';
        const elim = s.eliminated ? ' (ELIMINATED)' : '';

        // Cards remaining breakdown — filter nulls (other players' hands in multiplayer are null-filled)
        const rawHand = gameState?.players?.[i]?.hand ?? [];
        const remainingCards = rawHand.filter(c => c !== null);
        const handSize = s.handSize ?? remainingCards.length;
        console.log(`[showRoundOverlay] Player ${i} (${s.name}): handSize=${handSize}, visibleCards=${remainingCards.length}`);

        const cardBreakdown = handSize > 0
            ? `<div class="round-stats__cards">
                 <span class="round-stats__cards-label">${handSize} cards left${remainingCards.length > 0 ? ':' : ''}</span>
                 ${remainingCards.length > 0 ? `<div class="round-stats__cards-list">
                   ${remainingCards.map(c => renderCard(c, { table: true }).outerHTML).join('')}
                 </div>` : ''}
               </div>`
            : '<div class="round-stats__cards"><span class="round-stats__cards-label">🎉 No cards remaining!</span></div>';

        // "How close" metric — only for losers with known visible cards
        let closenessHTML = '';
        if (!isWinner && handSize > 0) {
            const totalCards = 14; // approximate starting hand
            const pctRemoved = Math.round(((totalCards - handSize) / totalCards) * 100);
            closenessHTML = `
                <div class="round-stats__closeness anim-stat-reveal">
                    <span class="round-stats__closeness-label">Progress to empty hand:</span>
                    <div class="round-stats__bar-bg">
                        <div class="round-stats__bar-fill" style="width: ${pctRemoved}%"></div>
                    </div>
                    <span class="round-stats__bar-pct">${pctRemoved}%</span>
                </div>
            `;
        }

        return `
      <div class="overlay__score-row ${cls} anim-stat-reveal" style="animation-delay: ${i * 0.15}s">
        <span>${s.name}${elim}</span>
        <span>
          <span class="overlay__score-change ${changeClass}">${displayChange}</span>
          → ${s.score} pts
        </span>
      </div>
      ${cardBreakdown}
      ${closenessHTML}
    `;
    }).join('');

    let buttonHTML = `<button class="overlay__btn" id="btn-next-round">Next Round</button>`;

    // Multiplayer: Only host can click Next Round
    if (isMultiplayer && !isHost) {
        buttonHTML = `<div class="overlay__waiting">Waiting for host to start next round... <span class="spinner"></span></div>`;
    }

    overlay.innerHTML = `
    <div class="overlay__panel overlay__panel--wide">
      <h2 class="overlay__title">${title}</h2>
      <p class="overlay__subtitle">${subtitle}</p>
      <div class="overlay__scores">${playerStats}</div>
      ${buttonHTML}
    </div>
  `;

    console.log('[showRoundOverlay] Appending overlay to DOM');
    document.body.appendChild(overlay);

    const btn = document.getElementById('btn-next-round');
    if (btn) {
        btn.addEventListener('click', () => {
            sound.playButtonClick();

            if (isMultiplayer) {
                // Host starting next round
                net.send('next_round', {});
                btn.disabled = true;
                btn.textContent = 'Starting...';
                return;
            }

            // Solo mode — advance to next round
            overlay.remove();
            nextRound(gameState);
            turnTracker.startNewRound();
            eventLog.addRoundSeparator(gameState.roundNumber);
            handManager.selectedIds.clear();
            handManager.lockedIds.clear();
            stagedMelds = [];
            stagedCardIds = new Set();
            updateUI(true);
        });
    }
    } catch (err) {
        console.error('[showRoundOverlay] CRASH:', err);
        showToast('Error displaying round summary — check console', 'error');
    }
}

/**
 * Full-screen dramatic win screen shown when the game is over.
 * Includes fireworks, falling card emojis, final scores, and a "Back to Menu" button.
 */
function showGameOverOverlay(data) {
    const { scores, winnerIndex } = data;

    // Determine overall winner: lowest score among non-eliminated players, or last standing
    const activePlayers = scores.filter(s => !s.eliminated);
    let overallWinner;
    if (activePlayers.length === 1) {
        overallWinner = activePlayers[0];
    } else if (winnerIndex !== null && winnerIndex !== undefined) {
        overallWinner = scores[winnerIndex];
    } else {
        overallWinner = scores.reduce((best, s) => s.score < best.score ? s : best, scores[0]);
    }

    const overlay = document.createElement('div');
    overlay.className = 'win-overlay';

    // Score table rows
    const scoreRows = scores.map((s, i) => {
        const isWinner = s === overallWinner;
        const medal = isWinner ? '🏆' : (s.eliminated ? '💀' : '');
        const rowClass = isWinner ? 'win-overlay__score-row--winner' : '';
        const changeSign = (s.change ?? 0) >= 0 ? '+' : '';
        return `
            <div class="win-overlay__score-row ${rowClass}">
                <span class="win-overlay__player-name">${medal} ${s.name}${s.eliminated ? ' (Eliminated)' : ''}</span>
                <span class="win-overlay__player-score">${s.score} pts</span>
            </div>`;
    }).join('');

    overlay.innerHTML = `
        <div class="win-overlay__content">
            <div class="win-overlay__title">🏆 Game Over!</div>
            <div class="win-overlay__winner">🎉 ${overallWinner.name} wins the game!</div>
            <div class="win-overlay__scores">${scoreRows}</div>
            <button class="win-overlay__btn" id="btn-game-over-menu">Back to Menu</button>
        </div>`;

    // Fireworks
    const fireworkCount = 6;
    for (let f = 0; f < fireworkCount; f++) {
        const fw = document.createElement('div');
        fw.className = 'firework';
        fw.style.left = `${10 + Math.random() * 80}%`;
        fw.style.top = `${5 + Math.random() * 60}%`;
        fw.style.animationDelay = `${(f * 0.4).toFixed(1)}s`;
        const hue = Math.floor(Math.random() * 360);
        fw.style.setProperty('--fw-color', `hsl(${hue}, 100%, 65%)`);
        overlay.appendChild(fw);
    }

    // Falling card emojis
    const cardEmojis = ['♠', '♥', '♦', '♣', '🃏'];
    for (let c = 0; c < 20; c++) {
        const card = document.createElement('div');
        card.className = 'falling-card';
        card.textContent = cardEmojis[c % cardEmojis.length];
        card.style.left = `${Math.random() * 100}%`;
        card.style.animationDuration = `${3 + Math.random() * 3}s`;
        card.style.animationDelay = `${Math.random() * 4}s`;
        overlay.appendChild(card);
    }

    document.body.appendChild(overlay);

    document.getElementById('btn-game-over-menu').addEventListener('click', () => {
        sound.playButtonClick();
        overlay.remove();
        if (isMultiplayer) {
            returnToLobbyFn?.();
        } else {
            saveScoreHistory({
                playerName: gameState.players[0].name,
                playerScore: gameState.players[0].score,
                aiScore: gameState.players[1].score,
                won: !gameState.players[0].eliminated
            });
            deleteSave();
            returnToLobbyFn?.();
        }
    });
}

/**
 * Calculate the raw hand penalty for a player (before Remik doubling).
 * @param {number} playerIdx
 * @returns {number}
 */
function calculateHandPenalty(playerIdx) {
    let penalty = 0;
    for (const card of gameState.players[playerIdx].hand) {
        penalty += getCardValue(card, false);
    }
    return penalty;
}

/**
 * Promisified delay.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════
// TURN NOTIFICATION HUD
// ═══════════════════════════════

/**
 * Show a "Your Turn!" heads-up display notification at the top of the screen.
 * Plays the turn-start chime and auto-dismisses after 3 seconds.
 */
function showTurnNotification() {
    // Remove any existing HUD before showing a new one
    const existing = document.getElementById('turn-hud');
    if (existing) existing.remove();

    const hud = document.createElement('div');
    hud.id = 'turn-hud';
    hud.className = 'turn-hud';
    hud.innerHTML = `<span class="turn-hud__icon">🎯</span><span class="turn-hud__text">Your Turn!</span>`;
    document.body.appendChild(hud);

    sound.playTurnStart();

    // Fade out after 3 seconds
    setTimeout(() => {
        hud.classList.add('turn-hud--out');
        setTimeout(() => hud.remove(), 400);
    }, 3000);
}

// ═══════════════════════════════
// TURN TIMER
// ═══════════════════════════════

/**
 * Update the turn timer bar display.
 */
function updateTimerBar() {
    const timerEl = document.getElementById('turn-timer');
    const barEl = document.getElementById('turn-timer-bar');
    const labelEl = document.getElementById('turn-timer-label');
    if (!timerEl || !barEl || !labelEl) return;

    if (!isMultiplayer || !gameState || gameState.phase === PHASE.ROUND_OVER || gameState.phase === PHASE.GAME_OVER) {
        timerEl.style.display = 'none';
        return;
    }

    timerEl.style.display = 'flex';
    const maxTime = gameState.config?.turnTimerSeconds || 300;
    const pct = Math.max(0, (timerRemaining / maxTime) * 100);

    barEl.style.width = `${pct}%`;

    // Colour transitions
    if (pct > 50) {
        barEl.style.background = 'var(--clr-accent, #2a9d8f)';
        timerEl.classList.remove('turn-timer--warning');
    } else if (pct > 20) {
        barEl.style.background = '#e9c46a';
        timerEl.classList.remove('turn-timer--warning');
    } else {
        barEl.style.background = '#e63946';
        timerEl.classList.add('turn-timer--warning');
    }

    const mins = Math.floor(timerRemaining / 60);
    const secs = timerRemaining % 60;
    labelEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ═══════════════════════════════
// RECONNECTION BANNER
// ═══════════════════════════════

/**
 * Show a reconnection warning banner.
 * @param {string} playerName
 */
function showReconnectBanner(playerName) {
    if (document.getElementById('reconnect-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'reconnect-banner';
    banner.className = 'reconnect-banner';
    banner.innerHTML = `
        <span class="reconnect-banner__spinner"></span>
        <span>${playerName} disconnected — waiting for reconnection…</span>
    `;
    document.body.appendChild(banner);
}

/**
 * Hide the reconnection banner.
 */
function hideReconnectBanner() {
    const banner = document.getElementById('reconnect-banner');
    if (banner) banner.remove();
}

/**
 * Synchronize the current hand order with the server.
 */
function syncHandOrder() {
    if (!isMultiplayer || !gameState) return;

    const player = gameState.players[myPlayerIndex];
    if (!player || !player.hand) return;

    // Extract IDs from the current hand (filtering out nulls just in case)
    const cardIds = player.hand.filter(c => c).map(c => c.id);

    // Send to server
    net.send('game_action', {
        action: 'reorder_hand',
        cardIds
    });
}
