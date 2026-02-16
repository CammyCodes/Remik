/**
 * Game board — main game UI orchestrator.
 * Renders the entire board: AI hand, piles, table melds, player hand, controls.
 * Handles AI turn execution with animated delays.
 * Integrates: event log, sound, auto-save, turn tracker, stats viewer.
 * @module ui/gameBoard
 */

import { renderCard, renderCardBack, showToast } from './cards.js';
import { HandManager } from './hand.js';
import {
    PHASE, events,
    createGame, startRound, nextRound,
    drawFromStock, drawFromDiscard,
    playMelds, addToTableMeld,
    discard, skipMeld
} from '../engine/gameState.js';
import { aiDecideTurn, aiDecideMeldsAndDiscard } from '../engine/ai.js';
import { classifyMeld, autoSplitMelds } from '../engine/melds.js';
import { cardToString, getCardValue } from '../engine/card.js';
import { saveScoreHistory } from './lobby.js';
import { saveGame, deleteSave } from '../engine/saveManager.js';
import { TurnTracker } from '../engine/turnTracker.js';
import { EventLog } from './eventLog.js';
import { showStatsViewer } from './statsViewer.js';
import * as sound from '../engine/soundManager.js';

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
/** @type {Array<object>} staging area cards for new meld */
let meldStagingCards = [];
/** @type {TurnTracker} */
let turnTracker = new TurnTracker();
/** @type {EventLog} */
let eventLog = new EventLog();

/**
 * Initialize and render the game board.
 * @param {HTMLElement} root
 * @param {string} playerName
 * @param {Function} onReturnToLobby
 * @param {{ savedState?: object, savedTurnTracker?: object }} [resumeData]
 */
export function renderGameBoard(root, playerName, onReturnToLobby, resumeData = null) {
    rootEl = root;
    returnToLobbyFn = onReturnToLobby;

    // Reset modules
    turnTracker = new TurnTracker();
    eventLog = new EventLog();

    if (resumeData && resumeData.savedState) {
        gameState = resumeData.savedState;
        if (resumeData.savedTurnTracker) {
            turnTracker.fromJSON(resumeData.savedTurnTracker);
        }
    } else {
        gameState = createGame(playerName);
        startRound(gameState);
    }

    buildBoardDOM();

    // Subscribe event log to EventBus
    eventLog.subscribe(events, gameState.players);

    // Mount event log
    const logContainer = document.getElementById('event-log-entries');
    eventLog.mount(logContainer);

    if (resumeData && resumeData.savedEventLog) {
        // Restore event log from save
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
            <div class="turn-indicator" id="turn-indicator"></div>
          </div>
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
    const humanPlayer = state.players[0];
    const aiPlayer = state.players[1];
    const isHumanTurn = state.currentPlayerIndex === 0;

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
        turnEl.innerHTML = `<span class="turn-indicator__dot"></span> ${aiPlayer.name}'s Turn`;
    }

    // Stats button state
    const statsBtn = document.getElementById('btn-stats');
    if (statsBtn) {
        statsBtn.disabled = turnTracker.completedRounds.length === 0;
    }

    // AI hand (face-down cards)
    const aiHandEl = document.getElementById('ai-hand');
    aiHandEl.innerHTML = '';
    for (let i = 0; i < aiPlayer.hand.length; i++) {
        aiHandEl.appendChild(renderCardBack({ small: true }));
    }

    // Stock pile
    const stockCardEl = document.getElementById('stock-card');
    stockCardEl.innerHTML = '';
    if (state.stock.length > 0) {
        stockCardEl.appendChild(renderCardBack());
    }
    document.getElementById('stock-count').textContent = `${state.stock.length} cards`;

    // Discard pile
    const discardCardEl = document.getElementById('discard-card');
    discardCardEl.innerHTML = '';
    if (state.discardPile.length > 0) {
        const topDiscard = state.discardPile[state.discardPile.length - 1];
        discardCardEl.appendChild(renderCard(topDiscard));
    }
    document.getElementById('discard-count').textContent = `${state.discardPile.length} cards`;

    // Table melds — SEPARATED BY PLAYER
    renderTableMelds();

    // Player hand
    const newCardId = state.drawnCard ? state.drawnCard.id : null;
    const newCardAnim = state.lastAction?.type === 'draw'
        ? (state.lastAction.source === 'stock' ? 'anim-draw-stock' : 'anim-draw-discard')
        : '';
    handManager.render(humanPlayer.hand, {
        animate: dealAnim,
        newCardId: isHumanTurn ? newCardId : null,
        newCardAnimClass: newCardAnim
    });

    // Status message
    updateStatusMessage();

    // Controls
    renderControls();

    // Auto-save after every UI update (includes event log)
    saveGame(gameState, turnTracker.toJSON(), eventLog.toJSON());

    // Trigger AI turn if needed
    if (!isHumanTurn && state.phase !== PHASE.ROUND_OVER && state.phase !== PHASE.GAME_OVER) {
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

            meld.cards.forEach(card => {
                meldEl.appendChild(renderCard(card, { table: true }));
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
    const isHumanTurn = state.currentPlayerIndex === 0;
    const player = state.players[0];

    if (state.phase === PHASE.ROUND_OVER || state.phase === PHASE.GAME_OVER) {
        controlsEl.innerHTML = '';
        return;
    }

    const selected = handManager.getSelectedIds();
    const hasSelection = selected.length > 0;

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
            // Play selected as meld
            if (hasSelection && selected.length >= 3) {
                buttons += `<button class="hand-controls__btn hand-controls__btn--primary" id="btn-play-meld" title="Play selected cards as a meld">
          ✅ Play Meld (${selected.length} cards)
        </button>`;
            }

            // Discard selected (only if exactly 1 selected)
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

        // Clear selection
        if (hasSelection) {
            buttons += `<button class="hand-controls__btn" id="btn-clear-selection" title="Deselect all cards">
        ✖ Clear Selection
      </button>`;
        }
    }

    controlsEl.innerHTML = buttons;

    // Wire up button handlers — all with sound
    document.getElementById('btn-auto-organize')?.addEventListener('click', () => { sound.playButtonClick(); onAutoOrganize(); });
    document.getElementById('btn-sort-mode')?.addEventListener('click', () => { sound.playButtonClick(); onToggleSortMode(); });
    document.getElementById('btn-play-meld')?.addEventListener('click', () => { sound.playButtonClick(); onPlayMeld(); });
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
    const isHumanTurn = state.currentPlayerIndex === 0;

    if (state.phase === PHASE.ROUND_OVER || state.phase === PHASE.GAME_OVER) {
        el.textContent = '';
        return;
    }

    if (!isHumanTurn) {
        el.innerHTML = `<span class="ai-thinking"><span class="ai-thinking__dot"></span><span class="ai-thinking__dot"></span><span class="ai-thinking__dot"></span></span> Computer is thinking…`;
        return;
    }

    const player = state.players[0];
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
    if (gameState.currentPlayerIndex !== 0 || gameState.phase !== PHASE.DRAW) return;
    sound.playCardClick();
    const result = drawFromStock(gameState);
    if (!result.success) {
        sound.playError();
        showToast(result.reason, 'error');
    } else {
        // Take snapshot after human draw
        turnTracker.takeSnapshot(gameState, `${gameState.players[0].name} drew from stock`);
    }
}

function onDiscardClick() {
    if (gameState.currentPlayerIndex !== 0 || gameState.phase !== PHASE.DRAW) return;
    if (gameState.discardPile.length === 0) {
        sound.playError();
        showToast('Discard pile is empty', 'error');
        return;
    }
    sound.playCardClick();
    const result = drawFromDiscard(gameState);
    if (!result.success) {
        sound.playError();
        showToast(result.reason, 'error');
    } else {
        showToast('You drew from discard — you must use this card in a meld this turn!', 'info');
        turnTracker.takeSnapshot(gameState, `${gameState.players[0].name} drew from discard`);
    }
}

function onAutoOrganize() {
    const player = gameState.players[0];
    player.hand = handManager.autoOrganize(player.hand);
    handManager.render(player.hand);
}

function onToggleSortMode() {
    handManager.toggleSortMode();
    onAutoOrganize(); // re-sort with new mode
}

function onPlayMeld() {
    const selected = handManager.getSelectedIds();
    if (selected.length < 3) {
        sound.playError();
        showToast('A meld needs at least 3 cards', 'error');
        return;
    }

    // Resolve selected card IDs to card objects
    const cards = selected.map(id => gameState.players[0].hand.find(c => c.id === id)).filter(Boolean);

    // Try as a single meld first
    const meldType = classifyMeld(cards);
    if (meldType) {
        const result = playMelds(gameState, [selected]);
        if (!result.success) {
            sound.playError();
            showToast(result.reason, 'error');
        } else {
            showToast('Meld played! ✅', 'success');
            handManager.clearSelection();
            turnTracker.takeSnapshot(gameState, `${gameState.players[0].name} played a meld`);
        }
        return;
    }

    // Try auto-splitting into multiple melds
    const splitMelds = autoSplitMelds(cards);
    if (splitMelds) {
        const meldIdArrays = splitMelds.map(meld => meld.map(c => c.id));
        const result = playMelds(gameState, meldIdArrays);
        if (!result.success) {
            sound.playError();
            showToast(result.reason, 'error');
        } else {
            const count = splitMelds.length;
            showToast(`${count} melds played! ✅`, 'success');
            handManager.clearSelection();
            turnTracker.takeSnapshot(gameState, `${gameState.players[0].name} played ${count} melds`);
        }
        return;
    }

    sound.playError();
    showToast('Not a valid meld — needs to be a sequence (run) or group (set)', 'error');
}

function onDiscard() {
    const selected = handManager.getSelectedIds();
    if (selected.length !== 1) {
        sound.playError();
        showToast('Select exactly 1 card to discard', 'error');
        return;
    }
    const result = discard(gameState, selected[0]);
    if (!result.success) {
        sound.playError();
        showToast(result.reason, 'error');
    } else {
        handManager.selectedIds.clear();
        turnTracker.takeSnapshot(gameState, `${gameState.players[0].name} discarded`);
    }
}

function onSkipMeld() {
    sound.playButtonClick();
    skipMeld(gameState);
    updateUI();
}

function handleReorder(draggedId, targetId) {
    const player = gameState.players[0];
    const hand = player.hand;
    const fromIdx = hand.findIndex(c => c.id === draggedId);
    const toIdx = hand.findIndex(c => c.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const [card] = hand.splice(fromIdx, 1);
    hand.splice(toIdx, 0, card);
    handManager.render(hand);
}

function handleSelectionChange() {
    renderControls();
}

function onStagingDrop(e) {
    e.preventDefault();
    // Handle drop into staging zone (future enhancement)
}

function onTableMeldDrop(e, tableMeldIndex) {
    const rawIds = e.dataTransfer.getData('application/json');
    if (!rawIds) return;
    const cardIds = JSON.parse(rawIds);

    if (gameState.currentPlayerIndex !== 0) return;
    if (gameState.phase !== PHASE.MELD) {
        sound.playError();
        showToast('You can only add to melds during the meld phase', 'error');
        return;
    }

    // Try end first, then start
    let result = addToTableMeld(gameState, tableMeldIndex, cardIds, 'end');
    if (!result.success) {
        result = addToTableMeld(gameState, tableMeldIndex, cardIds, 'start');
    }
    if (!result.success) {
        sound.playError();
        showToast(result.reason, 'error');
    } else {
        showToast('Card added to meld! ✅', 'success');
        handManager.selectedIds.clear();
        turnTracker.takeSnapshot(gameState, `${gameState.players[0].name} extended a meld`);
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

        // Execute draw
        if (drawAction.source === 'discard') {
            drawFromDiscard(gameState);
        } else {
            drawFromStock(gameState);
        }

        turnTracker.takeSnapshot(gameState, `${aiName} drew from ${drawAction.source}`);

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
}

// ═══════════════════════════════
// ROUND / GAME END
// ═══════════════════════════════

function onRoundEnd(data) {
    // Finalize turn tracker for this round
    turnTracker.takeSnapshot(gameState, 'Round ended');
    turnTracker.finalizeRound();

    // Play win/lose sound
    if (data.winnerIndex === 0) {
        sound.playRoundWin();
    } else if (data.winnerIndex !== null) {
        sound.playRoundLose();
    }

    setTimeout(() => showRoundOverlay(data), 600);
}

function showRoundOverlay(data) {
    const { winnerIndex, isRemik, scores } = data;
    const overlay = document.createElement('div');
    overlay.className = 'overlay';

    const winnerName = winnerIndex !== null ? scores[winnerIndex].name : 'No one';
    const title = gameState.phase === PHASE.GAME_OVER ? '🏆 Game Over!' : `Round ${gameState.roundNumber} Complete`;
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
        const handPenalty = !isWinner ? calculateHandPenalty(i) : 0;
        const displayChange = isWinner ? change : `+${isRemik ? handPenalty * 2 : handPenalty}`;
        const changeClass = isWinner ? 'overlay__score-change--negative' : 'overlay__score-change--positive';
        const elim = s.eliminated ? ' (ELIMINATED)' : '';

        // Cards remaining breakdown
        const remainingCards = gameState.players[i].hand;
        const cardBreakdown = remainingCards.length > 0
            ? `<div class="round-stats__cards">
                 <span class="round-stats__cards-label">${remainingCards.length} cards left:</span>
                 <div class="round-stats__cards-list">
                   ${remainingCards.map(c => renderCard(c, { table: true }).outerHTML).join('')}
                 </div>
               </div>`
            : '<div class="round-stats__cards"><span class="round-stats__cards-label">🎉 No cards remaining!</span></div>';

        // "How close" metric — only for losers
        let closenessHTML = '';
        if (!isWinner && remainingCards.length > 0) {
            const totalCards = 14; // approximate starting hand
            const pctRemoved = Math.round(((totalCards - remainingCards.length) / totalCards) * 100);
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

    const btnLabel = gameState.phase === PHASE.GAME_OVER ? 'Back to Menu' : 'Next Round';

    overlay.innerHTML = `
    <div class="overlay__panel overlay__panel--wide">
      <h2 class="overlay__title">${title}</h2>
      <p class="overlay__subtitle">${subtitle}</p>
      <div class="overlay__scores">${playerStats}</div>
      <button class="overlay__btn" id="btn-next-round">${btnLabel}</button>
    </div>
  `;

    document.body.appendChild(overlay);

    document.getElementById('btn-next-round').addEventListener('click', () => {
        sound.playButtonClick();
        overlay.remove();
        if (gameState.phase === PHASE.GAME_OVER) {
            // Save result
            saveScoreHistory({
                playerName: gameState.players[0].name,
                playerScore: gameState.players[0].score,
                aiScore: gameState.players[1].score,
                won: !gameState.players[0].eliminated
            });
            deleteSave();
            returnToLobbyFn?.();
        } else {
            nextRound(gameState);
            turnTracker.startNewRound();
            eventLog.addRoundSeparator(gameState.roundNumber);
            handManager.selectedIds.clear();
            handManager.lockedIds.clear();
            meldStagingCards = [];
            updateUI(true);
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
