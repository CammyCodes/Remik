/**
 * Server-side game logic orchestrator for multiplayer Remik.
 * Manages authoritative game state, validates actions, broadcasts updates.
 * @module server/gameServer
 */

const roomManager = require('./roomManager.cjs');

// ═══════════════════════════════
// SHARED ENGINE (inline for CJS compat)
// ═══════════════════════════════

// Card constants
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♦', '♣'];
const POINT_VALUES = {
    'A': 11, '2': 2, '3': 3, '4': 4, '5': 5,
    '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 10, 'Q': 10, 'K': 10, 'JOKER': 50
};

function getCardValue(card, lowAce = false) {
    if (card.isJoker) return POINT_VALUES.JOKER;
    if (card.rank === 'A' && lowAce) return 1;
    return POINT_VALUES[card.rank] || 0;
}

function cardToString(card) {
    if (card.isJoker) return '🃏';
    return `${card.rank}${card.suit}`;
}

function rankIndex(rank) {
    return RANKS.indexOf(rank);
}

let nextId = 1;

function createDeck(jokerCount = 4) {
    nextId = 1;
    const deck = [];
    for (let copy = 0; copy < 2; copy++) {
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                deck.push({ id: nextId++, rank, suit, isJoker: false });
            }
        }
    }
    for (let i = 0; i < jokerCount; i++) {
        deck.push({ id: nextId++, rank: 'JOKER', suit: '', isJoker: true });
    }
    return deck;
}

function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function dealCards(deck, counts) {
    const hands = counts.map(() => []);
    const maxCount = Math.max(...counts);
    for (let round = 0; round < maxCount; round++) {
        for (let p = 0; p < counts.length; p++) {
            if (round < counts[p] && deck.length > 0) {
                hands[p].push(deck.shift());
            }
        }
    }
    return { hands, stock: deck };
}

// ── Meld validation (simplified server-side) ──

function aceHighIndex(rank) {
    if (rank === 'A') return 13;
    return rankIndex(rank);
}

function isValidSequence(cards) {
    if (cards.length < 3) return false;
    const naturals = cards.filter(c => !c.isJoker);
    if (naturals.length === 0) return false;
    const suit = naturals[0].suit;
    if (!naturals.every(c => c.suit === suit)) return false;
    for (let i = 0; i < cards.length - 1; i++) {
        if (cards[i].isJoker && cards[i + 1].isJoker) return false;
    }
    const naturalIndices = naturals.map(c => rankIndex(c.rank));
    return trySequence(cards, naturalIndices, false) || trySequence(cards, naturalIndices, true);
}

function trySequence(cards, naturalIndices, aceLow) {
    let currentRank = null;
    let jokersBeforeFirst = 0;
    for (let i = 0; i < cards.length; i++) {
        if (!cards[i].isJoker) {
            const adjIdx = rankIndex(cards[i].rank);
            currentRank = adjIdx - jokersBeforeFirst;
            break;
        }
        jokersBeforeFirst++;
    }
    if (currentRank === null) return false;
    for (let i = 0; i < cards.length; i++) {
        const expectedRank = currentRank + i;
        if (!aceLow && expectedRank > 12 && expectedRank !== 13) return false;
        if (aceLow && expectedRank < 0) return false;
        if (!cards[i].isJoker) {
            let adjIdx = rankIndex(cards[i].rank);
            if (!aceLow && adjIdx === 0) adjIdx = 13;
            if (adjIdx !== expectedRank) return false;
        }
    }
    const startRank = currentRank;
    const endRank = currentRank + cards.length - 1;
    if (aceLow) {
        if (startRank < 0 || endRank > 12) return false;
    } else {
        if (startRank < 0 || endRank > 13) return false;
    }
    return true;
}

function isValidGroup(cards) {
    if (cards.length < 3 || cards.length > 4) return false;
    const naturals = cards.filter(c => !c.isJoker);
    const jokers = cards.filter(c => c.isJoker);
    if (naturals.length === 0) return false;
    if (jokers.length > naturals.length) return false;
    const ranks = new Set(naturals.map(c => c.rank));
    if (ranks.size > 1) return false;
    const suits = new Set(naturals.map(c => c.suit));
    if (suits.size !== naturals.length) return false;
    return true;
}

function classifyMeld(cards) {
    if (isValidSequence(cards)) return 'sequence';
    if (isValidGroup(cards)) return 'group';
    return false;
}

function calculateMeldsPoints(melds) {
    let total = 0;
    for (const meld of melds) {
        const type = classifyMeld(meld);
        if (!type) continue;
        for (const card of meld) {
            if (card.isJoker) {
                total += 50;
            } else if (type === 'sequence' && card.rank === 'A') {
                const indices = meld.filter(c => !c.isJoker).map(c => rankIndex(c.rank));
                const hasLowCards = indices.some(i => i <= 2);
                total += hasLowCards ? 1 : 11;
            } else {
                total += getCardValue(card);
            }
        }
    }
    return total;
}

function hasPureSubRun(naturals) {
    if (naturals.length < 3) return false;

    function longestRun(indices) {
        const sorted = [...indices].sort((a, b) => a - b);
        let run = 1;
        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i] === sorted[i - 1] + 1) {
                run++;
                if (run >= 3) return true;
            } else if (sorted[i] !== sorted[i - 1]) {
                run = 1;
            }
        }
        return false;
    }

    // Ace-low (A=0, 2=1, …, K=12)
    if (longestRun(naturals.map(c => rankIndex(c.rank)))) return true;
    // Ace-high (A=13, 2=1, …, K=12)
    if (longestRun(naturals.map(c => aceHighIndex(c.rank)))) return true;
    return false;
}

function isValidOpening(melds, openRequirement = 51) {
    // Check all melds are valid
    for (const meld of melds) {
        if (!classifyMeld(meld)) {
            return { valid: false, reason: 'One or more melds are invalid' };
        }
    }
    // Need at least one sequence whose natural cards form a pure sub-run of 3+
    const hasPureSequence = melds.some(meld =>
        isValidSequence(meld) && hasPureSubRun(meld.filter(c => !c.isJoker))
    );
    if (!hasPureSequence) {
        return { valid: false, reason: 'Opening requires at least one sequence with 3+ consecutive natural cards' };
    }
    const points = calculateMeldsPoints(melds);
    if (points < openRequirement) {
        return { valid: false, reason: `Opening requires at least ${openRequirement} points (you have ${points})` };
    }
    return { valid: true };
}

function canExtendMeld(existingMeld, newCards, position = 'end') {
    const combined = position === 'start'
        ? [...newCards, ...existingMeld]
        : [...existingMeld, ...newCards];

    if (!classifyMeld(combined)) return false;

    // For sequences: enforce that new cards actually belong at the specified end
    if (isValidSequence(combined)) {
        const existingNaturals = existingMeld.filter(c => !c.isJoker);
        const newNaturals = newCards.filter(c => !c.isJoker);

        if (existingNaturals.length > 0 && newNaturals.length > 0) {
            const exLow  = existingNaturals.map(c => rankIndex(c.rank));
            const newLow = newNaturals.map(c => rankIndex(c.rank));
            const exHigh  = existingNaturals.map(c => aceHighIndex(c.rank));
            const newHigh = newNaturals.map(c => aceHighIndex(c.rank));

            if (position === 'end') {
                const lowOk  = Math.min(...newLow)  > Math.max(...exLow);
                const highOk = Math.min(...newHigh) > Math.max(...exHigh);
                if (!lowOk && !highOk) return false;
            } else { // 'start'
                const lowOk  = Math.max(...newLow)  < Math.min(...exLow);
                const highOk = Math.max(...newHigh) < Math.min(...exHigh);
                if (!lowOk && !highOk) return false;
            }
        }
    }

    return true;
}

// ═══════════════════════════════
// GAME PHASES
// ═══════════════════════════════

const PHASE = {
    DRAW: 'DRAW',
    MELD: 'MELD',
    DISCARD: 'DISCARD',
    ROUND_OVER: 'ROUND_OVER',
    GAME_OVER: 'GAME_OVER'
};

// ═══════════════════════════════
// TIMER MANAGEMENT
// ═══════════════════════════════

/** @type {Map<string, { timer: NodeJS.Timeout, interval: NodeJS.Timeout, remaining: number }>} */
const turnTimers = new Map();

/**
 * Start a turn timer for a room.
 * @param {object} room
 */
function startTurnTimer(room) {
    clearTurnTimer(room.code);

    const seconds = room.settings.TURN_TIMER_SECONDS || 300;
    let remaining = seconds;

    const interval = setInterval(() => {
        remaining--;
        broadcastToRoom(room, { type: 'timer_tick', remaining });

        if (remaining <= 0) {
            clearTurnTimer(room.code);
            handleTimerExpired(room);
        }
    }, 1000);

    turnTimers.set(room.code, { timer: null, interval, remaining: seconds });
}

/**
 * Clear the turn timer for a room.
 * @param {string} code
 */
function clearTurnTimer(code) {
    const entry = turnTimers.get(code);
    if (entry) {
        if (entry.timer) clearTimeout(entry.timer);
        if (entry.interval) clearInterval(entry.interval);
        turnTimers.delete(code);
    }
}

/**
 * Handle timer expiring — auto-discard a random card.
 * @param {object} room
 */
function handleTimerExpired(room) {
    const state = room.gameState;
    if (!state) return;

    const currentPlayer = state.players[state.currentPlayerIndex];

    // If still in draw phase, auto-draw from stock
    if (state.phase === PHASE.DRAW) {
        if (state.stock.length > 0) {
            const card = state.stock.shift();
            currentPlayer.hand.push(card);
            state.phase = PHASE.DISCARD;
        }
    }

    // Auto-discard a random card
    if (currentPlayer.hand.length > 0 && (state.phase === PHASE.MELD || state.phase === PHASE.DISCARD)) {
        const randomIdx = Math.floor(Math.random() * currentPlayer.hand.length);
        const discardedCard = currentPlayer.hand.splice(randomIdx, 1)[0];
        state.discardPile.push(discardedCard);

        broadcastToRoom(room, {
            type: 'timer_expired',
            playerIndex: state.currentPlayerIndex,
            playerName: currentPlayer.name,
            discardedCard
        });

        // Check if player won (empty hand)
        if (currentPlayer.hand.length === 0) {
            endRound(room, state.currentPlayerIndex, false);
            return;
        }

        // Advance turn
        state.phase = PHASE.DRAW;
        advanceTurn(state);
        broadcastGameState(room);
        startTurnTimer(room);
    }
}

// ═══════════════════════════════
// GAME LIFECYCLE
// ═══════════════════════════════

/**
 * Start a new multiplayer game.
 * @param {object} room
 */
function startGame(room) {
    const config = room.settings;
    const jokerCount = config.JOKER_COUNT !== undefined ? config.JOKER_COUNT : 4;
    const pointsLimit = config.POINTS_LIMIT || 501;
    const handSizeFirst = config.HAND_SIZE_FIRST || 14;
    const handSizeOther = config.HAND_SIZE_OTHER || 13;

    const state = {
        players: room.players.map((p, i) => ({
            name: p.name,
            hand: [],
            hasOpened: false,
            score: 0,
            isHuman: true,
            eliminated: false,
            colour: p.colour,
            icon: p.icon,
            playerId: p.id
        })),
        stock: [],
        discardPile: [],
        tableMelds: [],
        currentPlayerIndex: 0,
        phase: PHASE.DRAW,
        roundNumber: 1,
        startingPlayerIndex: 0,
        stockReshuffleCount: 0,
        drawnFromDiscard: false,
        drawnCard: null,
        roundWinner: null,
        lastAction: null,
        config: {
            pointsLimit,
            jokerCount,
            handSizeFirst,
            handSizeOther,
            openRequirement: config.OPEN_REQUIREMENT || 51,
            requireOpening: config.REQUIRE_OPENING !== false,
            allowJokerSwap: config.ALLOW_JOKER_SWAP || false,
            turnTimerSeconds: config.TURN_TIMER_SECONDS || 300
        }
    };

    room.gameState = state;
    room.status = 'playing';

    // Notify clients to switch to game view
    for (let i = 0; i < room.players.length; i++) {
        sendToPlayer(room.players[i], {
            type: 'game_start',
            myIndex: i
        });
    }

    startRound(room);
}

/**
 * Start/restart a round.
 * @param {object} room
 */
function startRound(room) {
    const state = room.gameState;
    const config = state.config;
    const deck = shuffleDeck(createDeck(config.jokerCount));

    const counts = state.players.map((_, i) =>
        i === state.startingPlayerIndex ? config.handSizeFirst : config.handSizeOther
    );

    const { hands, stock } = dealCards(deck, counts);

    state.players.forEach((p, i) => {
        p.hand = hands[i];
        p.hasOpened = false;
    });

    state.stock = stock;
    state.discardPile = [];
    state.tableMelds = [];
    state.currentPlayerIndex = state.startingPlayerIndex;
    state.phase = PHASE.DISCARD; // Starting player always has 14 cards — skip draw
    state.stockReshuffleCount = 0;
    state.drawnFromDiscard = false;
    state.drawnCard = null;
    state.roundWinner = null;
    state.lastAction = null;

    broadcastToRoom(room, { type: 'round_start', roundNumber: state.roundNumber });
    broadcastGameState(room);
    roomManager.saveSnapshot(room);
    startTurnTimer(room);
}

/**
 * Handle a player action.
 * @param {object} room
 * @param {string} playerId
 * @param {object} action — { action: string, ... }
 * @returns {{ success: boolean, error?: string }}
 */
function handleAction(room, playerId, action) {
    const state = room.gameState;
    if (!state) return { success: false, error: 'No game in progress' };

    const playerIndex = state.players.findIndex(p => p.playerId === playerId);
    if (playerIndex === -1) return { success: false, error: 'Player not in game' };

    // Special case: reordering is allowed even if not your turn (it's just UI state)
    if (action.action === 'reorder_hand') {
        return handleReorderHand(state, playerIndex, action.cardIds);
    }

    if (playerIndex !== state.currentPlayerIndex) return { success: false, error: 'Not your turn' };

    let result;

    switch (action.action) {
        case 'draw_stock':
            result = handleDrawStock(state, room);
            break;
        case 'draw_discard':
            result = handleDrawDiscard(state, room);
            break;
        case 'play_melds':
            result = handlePlayMelds(state, action.meldCardIds, room);
            break;
        case 'extend_meld':
            result = handleExtendMeld(state, action.tableMeldIndex, action.cardIds, action.position, room);
            break;
        case 'discard':
            result = handleDiscard(state, action.cardId, room);
            break;
        case 'skip_meld':
            result = handleSkipMeld(state);
            break;
        case 'joker_swap':
            result = handleJokerSwap(state, action.tableMeldIndex, action.jokerPositionInMeld, action.cardId, room);
            break;
        case 'reposition_joker':
            result = handleRepositionJoker(state, action.meldIndex, action.jokerCardIndex, room);
            break;
        case 'next_round':
            console.log(`[Server] Received next_round from player ${playerId} for room ${room.code}. Host: ${room.hostId}`);
            if (room.hostId !== playerId) {
                console.warn(`[Server] Rejected next_round: player ${playerId} is not host ${room.hostId}`);
                return { success: false, error: 'Only the host can start the next round' };
            }
            nextRound(room);
            return { success: true };
        default:
            return { success: false, error: `Unknown action: ${action.action}` };
    }

    if (result.success) {
        // Check for round end
        if (state.phase === PHASE.ROUND_OVER) {
            clearTurnTimer(room.code);
            broadcastGameState(room);
            roomManager.saveSnapshot(room);
            return result;
        }

        // Restart timer on turn change
        if (action.action === 'discard') {
            startTurnTimer(room);
        }

        broadcastGameState(room);
        roomManager.saveSnapshot(room);
    }

    return result;
}

// ── ACTION HANDLERS (updated to accept room) ──

function handleReorderHand(state, playerIndex, cardIds) {
    const player = state.players[playerIndex];
    if (!player.hand) return { success: false, error: 'No hand found' };

    // Validation: Ensure the set of card IDs matches exactly
    // (We iterate the current hand and match against requested IDs)
    const currentIds = player.hand.map(c => c.id).sort((a, b) => a - b);
    const requestedIds = [...cardIds].sort((a, b) => a - b);

    if (currentIds.length !== requestedIds.length) {
        return { success: false, error: 'Card count mismatch' };
    }

    for (let i = 0; i < currentIds.length; i++) {
        if (currentIds[i] !== requestedIds[i]) {
            return { success: false, error: 'Card mismatch — sync error' };
        }
    }

    // transform IDs back to card objects in the new order
    const idMap = new Map();
    player.hand.forEach(c => idMap.set(c.id, c));

    const newHand = [];
    for (const id of cardIds) {
        const card = idMap.get(id);
        if (card) newHand.push(card);
    }

    player.hand = newHand;
    return { success: true };
}

function handleDrawStock(state, room) {
    if (state.phase !== PHASE.DRAW) return { success: false, error: 'Cannot draw now' };
    if (state.stock.length === 0) {
        reshuffleIfNeeded(state);
        if (state.stock.length === 0) return { success: false, error: 'No cards remaining' };
    }

    const card = state.stock.shift();
    state.players[state.currentPlayerIndex].hand.push(card);
    state.drawnCard = card;
    state.drawnFromDiscard = false;
    state.phase = PHASE.MELD;
    state.lastAction = { type: 'draw', source: 'stock', playerIndex: state.currentPlayerIndex };

    broadcastToRoom(state._room || room, {
        type: 'game_event',
        eventType: 'draw',
        playerIndex: state.currentPlayerIndex,
        playerName: state.players[state.currentPlayerIndex].name,
        details: { source: 'stock' }
    });

    return { success: true, card };
}

function handleDrawDiscard(state, room) {
    if (state.phase !== PHASE.DRAW) return { success: false, error: 'Cannot draw now' };
    if (state.discardPile.length === 0) return { success: false, error: 'Discard pile is empty' };

    const card = state.discardPile.pop();
    state.players[state.currentPlayerIndex].hand.push(card);
    state.drawnCard = card;
    state.drawnFromDiscard = true;
    state.phase = PHASE.MELD;
    state.lastAction = { type: 'draw', source: 'discard', playerIndex: state.currentPlayerIndex, card };

    broadcastToRoom(state._room || room, {
        type: 'game_event',
        eventType: 'draw',
        playerIndex: state.currentPlayerIndex,
        playerName: state.players[state.currentPlayerIndex].name,
        details: { source: 'discard', card }
    });

    return { success: true, card };
}

function handlePlayMelds(state, meldCardIds, room) {
    if (state.phase !== PHASE.MELD && state.phase !== PHASE.DISCARD) {
        return { success: false, error: 'Cannot meld now' };
    }

    const player = state.players[state.currentPlayerIndex];
    const melds = meldCardIds.map(ids =>
        ids.map(id => player.hand.find(c => c.id === id)).filter(Boolean)
    );

    // Validate all melds
    for (const meld of melds) {
        if (!classifyMeld(meld)) {
            return { success: false, error: 'One or more melds are invalid' };
        }
    }

    // Check opening requirement
    const config = state.config || {};
    if (!player.hasOpened && config.requireOpening !== false) {
        const openCheck = isValidOpening(melds, config.openRequirement || 51);
        if (!openCheck.valid) return { success: false, error: openCheck.reason };
    }

    // Remove cards from hand and add to table
    const allCardIds = new Set(meldCardIds.flat());
    player.hand = player.hand.filter(c => !allCardIds.has(c.id));

    for (const meld of melds) {
        state.tableMelds.push({ cards: meld, owner: state.currentPlayerIndex });
    }

    if (!player.hasOpened) player.hasOpened = true;

    // Check for win
    if (player.hand.length === 0) {
        const isRemik = melds.length > 0 && player.hand.length === 0;
        console.log(`[Server] handlePlayMelds: ${player.name} emptied hand — calling endRound (remik=${isRemik})`);
        state.phase = PHASE.ROUND_OVER;
        endRound(room, state.currentPlayerIndex, isRemik);
        return { success: true };
    }

    if (state.phase !== PHASE.DISCARD) state.phase = PHASE.MELD;

    const meldStr = melds.map(m => m.map(c => cardToString(c)).join('')).join(', ');
    broadcastToRoom(room, {
        type: 'game_event',
        eventType: 'meld',
        playerIndex: state.currentPlayerIndex,
        playerName: state.players[state.currentPlayerIndex].name,
        details: { meldStr }
    });

    return { success: true };
}

function handleExtendMeld(state, tableMeldIndex, cardIds, position = 'end', room) {
    if (state.phase !== PHASE.MELD) return { success: false, error: 'Cannot extend melds now' };

    const player = state.players[state.currentPlayerIndex];
    if (!player.hasOpened) return { success: false, error: 'Must open first' };

    const tableMeld = state.tableMelds[tableMeldIndex];
    if (!tableMeld) return { success: false, error: 'Invalid meld index' };

    const cards = cardIds.map(id => player.hand.find(c => c.id === id)).filter(Boolean);
    if (cards.length === 0) return { success: false, error: 'Cards not found in hand' };

    if (!canExtendMeld(tableMeld.cards, cards, position)) {
        return { success: false, error: 'Cards cannot extend this meld' };
    }

    // Remove cards from hand
    player.hand = player.hand.filter(c => !cardIds.includes(c.id));

    // Add to meld
    if (position === 'start') {
        tableMeld.cards = [...cards, ...tableMeld.cards];
    } else {
        tableMeld.cards = [...tableMeld.cards, ...cards];
    }

    const cardStr = cards.map(c => cardToString(c)).join('');
    broadcastToRoom(state._room || room, {
        type: 'game_event',
        eventType: 'extend',
        playerIndex: state.currentPlayerIndex,
        playerName: state.players[state.currentPlayerIndex].name,
        details: { cardStr }
    });

    if (player.hand.length === 0) {
        console.log(`[Server] handleExtendMeld: ${player.name} emptied hand — calling endRound`);
        state.phase = PHASE.ROUND_OVER;
        endRound(room, state.currentPlayerIndex, false);
    }

    return { success: true };
}

function handleDiscard(state, cardId, room) {
    if (state.phase !== PHASE.MELD && state.phase !== PHASE.DISCARD) {
        return { success: false, error: 'Cannot discard now' };
    }

    const player = state.players[state.currentPlayerIndex];
    const cardIndex = player.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return { success: false, error: 'Card not in hand' };

    // If drew from discard, must use that card in a meld (can't discard it right back)
    if (state.drawnFromDiscard && state.drawnCard && state.drawnCard.id === cardId) {
        return { success: false, error: 'Cannot discard the card you just drew from the discard pile' };
    }

    const [card] = player.hand.splice(cardIndex, 1);
    state.discardPile.push(card);

    state.lastAction = { type: 'discard', playerIndex: state.currentPlayerIndex, card };

    // Check for win
    if (player.hand.length === 0) {
        console.log(`[Server] handleDiscard: ${player.name} emptied hand — calling endRound`);
        state.phase = PHASE.ROUND_OVER;
        endRound(room, state.currentPlayerIndex, false);
        return { success: true };
    }

    // Advance turn
    advanceTurn(state);

    broadcastToRoom(room, {
        type: 'game_event',
        eventType: 'discard',
        playerIndex: state.currentPlayerIndex, // Use stored index before advanceTurn? No, advanceTurn changes it.
        // Wait, handleDiscard calls advanceTurn at the end. state.currentPlayerIndex is now the NEXT player.
        // We need the PREVIOUS player (who discarded).
        // Actually, handleDiscard updates state.lastAction with correct playerIndex.
        playerIndex: state.lastAction.playerIndex,
        playerName: state.players[state.lastAction.playerIndex].name,
        details: { card }
    });

    return { success: true };
}

function handleSkipMeld(state) {
    if (state.phase !== PHASE.MELD) return { success: false, error: 'Not in meld phase' };
    state.phase = PHASE.DISCARD;
    return { success: true };
}

function handleJokerSwap(state, tableMeldIndex, jokerPositionInMeld, cardId, room) {
    if (state.phase !== PHASE.MELD) return { success: false, error: 'Cannot swap jokers now' };

    const player = state.players[state.currentPlayerIndex];
    if (!player.hasOpened) return { success: false, error: 'Must open first' };

    if (tableMeldIndex < 0 || tableMeldIndex >= state.tableMelds.length) {
        return { success: false, error: 'Invalid meld index' };
    }

    const meld = state.tableMelds[tableMeldIndex].cards;
    const jokerCard = meld[jokerPositionInMeld];
    if (!jokerCard || !jokerCard.isJoker) return { success: false, error: 'No joker at that position' };

    const handCard = player.hand.find(c => c.id === cardId);
    if (!handCard) return { success: false, error: 'Card not in hand' };
    if (handCard.isJoker) return { success: false, error: 'Cannot swap a joker with a joker' };

    // Validate the meld stays valid with the substitution
    const testMeld = [...meld];
    testMeld[jokerPositionInMeld] = handCard;
    if (!classifyMeld(testMeld)) {
        return { success: false, error: 'That card does not match what the joker represents' };
    }

    // Perform swap
    meld[jokerPositionInMeld] = handCard;
    player.hand = player.hand.filter(c => c.id !== cardId);
    player.hand.push(jokerCard);

    return { success: true };
}

function handleRepositionJoker(state, meldIndex, jokerCardIndex, room) {
    if (state.phase !== PHASE.MELD) return { success: false, error: 'Cannot reposition jokers now' };

    const player = state.players[state.currentPlayerIndex];
    if (!player.hasOpened) return { success: false, error: 'Must open first' };

    const tableMeld = state.tableMelds[meldIndex];
    if (!tableMeld) return { success: false, error: 'Invalid meld index' };

    const cards = tableMeld.cards;
    const isAtStart = jokerCardIndex === 0;
    const isAtEnd = jokerCardIndex === cards.length - 1;

    if (!isAtStart && !isAtEnd) {
        return { success: false, error: 'Can only reposition jokers at the start or end of a meld' };
    }

    const jokerCard = cards[jokerCardIndex];
    if (!jokerCard || !jokerCard.isJoker) {
        return { success: false, error: 'No joker at that position' };
    }

    // Move joker to the opposite end
    const newCards = isAtStart
        ? [...cards.slice(1), jokerCard]
        : [jokerCard, ...cards.slice(0, -1)];

    if (!classifyMeld(newCards)) {
        return { success: false, error: 'Moving the joker would invalidate the meld' };
    }

    console.log(`[Server] handleRepositionJoker: ${player.name} moved joker from ${isAtStart ? 'start' : 'end'} to ${isAtStart ? 'end' : 'start'} of meld ${meldIndex}`);
    tableMeld.cards = newCards;

    broadcastToRoom(state._room || room, {
        type: 'game_event',
        eventType: 'reposition_joker',
        playerIndex: state.currentPlayerIndex,
        playerName: player.name,
        details: { meldIndex, from: isAtStart ? 'start' : 'end', to: isAtStart ? 'end' : 'start' }
    });

    return { success: true };
}

function advanceTurn(state) {
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
    // Skip eliminated players
    let safety = 0;
    while (state.players[state.currentPlayerIndex].eliminated && safety < state.players.length) {
        state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
        safety++;
    }
    state.phase = PHASE.DRAW;
    state.drawnFromDiscard = false;
    state.drawnCard = null;
}

function endRound(room, winnerIndex, isRemik) {
    console.log(`[Server] endRound called for room ${room.code}. Winner: ${winnerIndex}, Remik: ${isRemik}`);
    const state = room.gameState;
    const config = state.config || {};
    const pointsLimit = config.pointsLimit || 501;

    // Score each player
    const scores = state.players.map((p, i) => {
        let change = 0;
        if (i === winnerIndex) {
            change = isRemik ? -20 : -10;
        } else {
            let penalty = p.hand.reduce((sum, c) => sum + getCardValue(c, false), 0);
            if (isRemik) penalty *= 2;
            change = penalty;
        }
        p.score += change;
        return {
            name: p.name,
            score: p.score,
            change,
            eliminated: p.score >= pointsLimit,
            handSize: p.hand.length
        };
    });

    // Mark eliminated players
    state.players.forEach((p, i) => {
        if (scores[i].eliminated) p.eliminated = true;
    });

    // Check if game is over
    const activePlayers = state.players.filter(p => !p.eliminated);
    if (activePlayers.length <= 1) {
        state.phase = PHASE.GAME_OVER;
    } else {
        state.phase = PHASE.ROUND_OVER;
    }

    state.roundWinner = winnerIndex;

    console.log(`[Server] endRound: scores=`, scores.map(s => `${s.name}:${s.change >= 0 ? '+' : ''}${s.change} (total:${s.score})`).join(', '));
    console.log(`[Server] Broadcasting round_end for room ${room.code}. gameOver: ${state.phase === PHASE.GAME_OVER}`);
    broadcastToRoom(room, {
        type: 'round_end',
        winnerIndex,
        isRemik,
        scores,
        gameOver: state.phase === PHASE.GAME_OVER
    });
}

/**
 * Start the next round (host-only action).
 * @param {object} room
 */
function nextRound(room) {
    console.log(`[Server] nextRound called for room ${room.code}`);
    const state = room.gameState;
    if (!state || (state.phase !== PHASE.ROUND_OVER && state.phase !== PHASE.GAME_OVER)) {
        console.warn(`[Server] nextRound rejected: state.phase is ${state?.phase}`);
        return;
    }

    state.roundNumber++;
    // Rotate starting player
    state.startingPlayerIndex = (state.startingPlayerIndex + 1) % state.players.length;

    // Skip eliminated starting players
    let safety = 0;
    while (state.players[state.startingPlayerIndex].eliminated && safety < state.players.length) {
        state.startingPlayerIndex = (state.startingPlayerIndex + 1) % state.players.length;
        safety++;
    }

    console.log(`[Server] Starting round ${state.roundNumber} for room ${room.code}. New startingPlayerIndex: ${state.startingPlayerIndex}`);
    startRound(room);
}

function reshuffleIfNeeded(state) {
    if (state.stock.length > 0 || state.stockReshuffleCount >= 1) return;
    if (state.discardPile.length <= 1) return;

    const topDiscard = state.discardPile.pop();
    state.stock = shuffleDeck([...state.discardPile]);
    state.discardPile = topDiscard ? [topDiscard] : [];
    state.stockReshuffleCount++;

    if (state._room) {
        broadcastToRoom(state._room, {
            type: 'game_event',
            eventType: 'reshuffle',
            details: { count: state.stock.length }
        });
    }
}

// ═══════════════════════════════
// BROADCASTING
// ═══════════════════════════════

/**
 * Broadcast game state to all players (each sees only their own hand).
 * @param {object} room
 */
function broadcastGameState(room) {
    const state = room.gameState;
    if (!state) return;

    // Store room reference for endRound (non-enumerable to avoid circular JSON)
    Object.defineProperty(state, '_room', {
        value: room,
        enumerable: false,
        writable: true,
        configurable: true
    });

    for (let i = 0; i < room.players.length; i++) {
        const player = room.players[i];
        if (!player.ws || !player.connected) continue;

        const sanitized = {
            type: 'game_state',
            myIndex: i,
            roundNumber: state.roundNumber,
            currentPlayerIndex: state.currentPlayerIndex,
            phase: state.phase,
            players: state.players.map((p, j) => ({
                name: p.name,
                handSize: p.hand.length,
                hand: j === i ? p.hand : [], // only show own hand
                hasOpened: p.hasOpened,
                score: p.score,
                eliminated: p.eliminated,
                colour: p.colour,
                icon: p.icon,
                isMe: j === i
            })),
            stock: { count: state.stock.length },
            discardPile: {
                count: state.discardPile.length,
                topCard: state.discardPile.length > 0
                    ? state.discardPile[state.discardPile.length - 1]
                    : null
            },
            tableMelds: state.tableMelds.map(m => ({
                cards: m.cards,
                owner: m.owner
            })),
            lastAction: state.lastAction,
            drawnFromDiscard: state.currentPlayerIndex === i ? state.drawnFromDiscard : false,
            config: state.config
        };

        sendToPlayer(player, sanitized);
    }
}

/**
 * Broadcast a raw message to all connected players in a room.
 * @param {object} room
 * @param {object} msg
 */
function broadcastToRoom(room, msg) {
    for (const player of room.players) {
        sendToPlayer(player, msg);
    }
}

/**
 * Send a message to a single player.
 * @param {object} player
 * @param {object} msg
 */
function sendToPlayer(player, msg) {
    if (!player.ws || !player.connected) return;
    if (msg.type === 'round_end') {
        console.log(`[Server] sendToPlayer(${player.name}): round_end | gameOver=${msg.gameOver} | winner=${msg.winnerIndex} | scores=${JSON.stringify(msg.scores?.map(s => `${s.name}:${s.change >= 0 ? '+' : ''}${s.change}`))}`);
    }
    try {
        if (player.ws.readyState === 1) { // WebSocket.OPEN
            player.ws.send(JSON.stringify(msg));
        }
    } catch (err) {
        console.warn(`sendToPlayer: failed to send to ${player.name} —`, err.message);
    }
}

module.exports = {
    startGame,
    handleAction,
    nextRound,
    broadcastGameState,
    broadcastToRoom,
    sendToPlayer,
    clearTurnTimer,
    PHASE
};
