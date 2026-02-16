/**
 * Central game state management — turns, phases, round lifecycle.
 * @module engine/gameState
 */

import { createDeck, shuffleDeck, dealCards } from './deck.js';
import { classifyMeld, isValidOpening, canExtendMeld, calculateMeldsPoints } from './melds.js';
import { getCardValue } from './card.js';

/** Turn phases */
export const PHASE = {
    DRAW: 'DRAW',
    MELD: 'MELD',
    DISCARD: 'DISCARD',
    ROUND_OVER: 'ROUND_OVER',
    GAME_OVER: 'GAME_OVER'
};

/**
 * Simple event emitter for game state changes.
 */
class EventBus {
    constructor() {
        /** @type {Object<string, Function[]>} */
        this._listeners = {};
    }

    /**
     * @param {string} event
     * @param {Function} fn
     */
    on(event, fn) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(fn);
    }

    /**
     * @param {string} event
     * @param {*} data
     */
    emit(event, data) {
        (this._listeners[event] || []).forEach(fn => fn(data));
    }

    /** Remove all listeners */
    clear() {
        this._listeners = {};
    }
}

export const events = new EventBus();

/**
 * Create initial game state for a new game.
 * @param {string} playerName
 * @returns {object} gameState
 */
export function createGame(playerName) {
    return {
        players: [
            { name: playerName, hand: [], hasOpened: false, score: 0, isHuman: true, eliminated: false },
            { name: 'Computer', hand: [], hasOpened: false, score: 0, isHuman: false, eliminated: false }
        ],
        stock: [],
        discardPile: [],
        tableMelds: [],       // Array of { cards: [], owner: playerIndex }
        currentPlayerIndex: 0, // starting player gets 14 cards
        phase: PHASE.DRAW,
        roundNumber: 1,
        startingPlayerIndex: 0,
        stockReshuffleCount: 0,
        drawnFromDiscard: false, // track if current turn drew from discard
        drawnCard: null,         // the card drawn this turn (for animation reference)
        roundWinner: null,
        lastAction: null         // { type, playerIndex, cards, ... } for animations
    };
}

/**
 * Start a new round — shuffle, deal, reset hands.
 * @param {object} state
 */
export function startRound(state) {
    const deck = shuffleDeck(createDeck());

    // Starting player gets 14 cards, other gets 13
    const counts = state.players.map((_, i) =>
        i === state.startingPlayerIndex ? 14 : 13
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
    state.phase = state.startingPlayerIndex === 0 ? PHASE.DISCARD : PHASE.DRAW;
    state.stockReshuffleCount = 0;
    state.drawnFromDiscard = false;
    state.drawnCard = null;
    state.roundWinner = null;
    state.lastAction = null;

    events.emit('roundStart', { roundNumber: state.roundNumber });
    events.emit('stateChange', state);

    // If starting player has 14 cards, they must discard first (no draw)
    // This is already handled by setting phase to DISCARD for player 0
}

/**
 * Draw a card from the stock pile.
 * @param {object} state
 * @returns {{ success: boolean, card?: object, reason?: string }}
 */
export function drawFromStock(state) {
    if (state.phase !== PHASE.DRAW) {
        return { success: false, reason: 'Not in draw phase.' };
    }

    reshuffleIfNeeded(state);

    if (state.stock.length === 0) {
        // Stock depleted twice → round ends
        endRound(state, null);
        return { success: false, reason: 'Stock exhausted — round over.' };
    }

    const card = state.stock.pop();
    const player = state.players[state.currentPlayerIndex];
    player.hand.push(card);

    state.drawnFromDiscard = false;
    state.drawnCard = card;
    state.phase = PHASE.MELD;
    state.lastAction = { type: 'draw', source: 'stock', playerIndex: state.currentPlayerIndex, card };

    events.emit('draw', state.lastAction);
    events.emit('stateChange', state);

    return { success: true, card };
}

/**
 * Draw the top card from the discard pile.
 * Rule: can only pick from discard if you immediately use it in a meld this turn.
 * @param {object} state
 * @returns {{ success: boolean, card?: object, reason?: string }}
 */
export function drawFromDiscard(state) {
    if (state.phase !== PHASE.DRAW) {
        return { success: false, reason: 'Not in draw phase.' };
    }
    if (state.discardPile.length === 0) {
        return { success: false, reason: 'Discard pile is empty.' };
    }

    const card = state.discardPile.pop();
    const player = state.players[state.currentPlayerIndex];
    player.hand.push(card);

    state.drawnFromDiscard = true;
    state.drawnCard = card;
    state.phase = PHASE.MELD;
    state.lastAction = { type: 'draw', source: 'discard', playerIndex: state.currentPlayerIndex, card };

    events.emit('draw', state.lastAction);
    events.emit('stateChange', state);

    return { success: true, card };
}

/**
 * Play melds from the player's hand onto the table.
 * @param {object} state
 * @param {Array<Array<number>>} meldCardIds — array of arrays of card IDs forming each meld
 * @returns {{ success: boolean, reason?: string }}
 */
export function playMelds(state, meldCardIds) {
    if (state.phase !== PHASE.MELD) {
        return { success: false, reason: 'Not in meld phase.' };
    }

    const playerIdx = state.currentPlayerIndex;
    const player = state.players[playerIdx];

    // Resolve card IDs to card objects
    const melds = meldCardIds.map(ids =>
        ids.map(id => player.hand.find(c => c.id === id)).filter(Boolean)
    );

    // Validate each meld
    for (let i = 0; i < melds.length; i++) {
        if (!classifyMeld(melds[i])) {
            return { success: false, reason: `Meld ${i + 1} is not valid.` };
        }
    }

    // If player hasn't opened, check opening requirements
    if (!player.hasOpened) {
        const openCheck = isValidOpening(melds);
        if (!openCheck.valid) {
            return { success: false, reason: openCheck.reason };
        }
        player.hasOpened = true;
    }

    // If drew from discard, at least one meld must contain the drawn card
    if (state.drawnFromDiscard && state.drawnCard) {
        const drawnId = state.drawnCard.id;
        const usesDrawnCard = melds.some(meld => meld.some(c => c.id === drawnId));
        if (!usesDrawnCard) {
            return { success: false, reason: 'You drew from the discard pile — you must use that card in a meld this turn.' };
        }
    }

    // Remove cards from hand and add melds to table
    const allMeldCardIds = new Set(melds.flat().map(c => c.id));
    player.hand = player.hand.filter(c => !allMeldCardIds.has(c.id));

    for (const meld of melds) {
        state.tableMelds.push({ cards: [...meld], owner: playerIdx });
    }

    state.lastAction = { type: 'meld', playerIndex: playerIdx, melds };

    events.emit('meld', state.lastAction);
    events.emit('stateChange', state);

    // Check if player went out
    if (player.hand.length === 0) {
        // Player goes out on discard — but they haven't discarded yet.
        // If hand is empty, they can go out without discarding? 
        // Per rules: must discard to end. If hand = 0 after melding, they win (Remik).
        // Actually, they need 1 card left to discard. If 0 cards, that's Remik (all cards played).
        endRound(state, playerIdx);
        return { success: true };
    }

    return { success: true };
}

/**
 * Add cards from hand to an existing table meld.
 * @param {object} state
 * @param {number} tableMeldIndex — index into state.tableMelds
 * @param {number[]} cardIds — card IDs from player's hand
 * @param {'start'|'end'} position
 * @returns {{ success: boolean, reason?: string }}
 */
export function addToTableMeld(state, tableMeldIndex, cardIds, position = 'end') {
    if (state.phase !== PHASE.MELD) {
        return { success: false, reason: 'Not in meld phase.' };
    }

    const playerIdx = state.currentPlayerIndex;
    const player = state.players[playerIdx];

    if (!player.hasOpened) {
        return { success: false, reason: 'You must open before adding to existing melds.' };
    }

    if (tableMeldIndex < 0 || tableMeldIndex >= state.tableMelds.length) {
        return { success: false, reason: 'Invalid meld index.' };
    }

    const cards = cardIds.map(id => player.hand.find(c => c.id === id)).filter(Boolean);
    if (cards.length !== cardIds.length) {
        return { success: false, reason: 'Some cards not found in hand.' };
    }

    const existing = state.tableMelds[tableMeldIndex].cards;
    if (!canExtendMeld(existing, cards, position)) {
        return { success: false, reason: 'Adding these cards would make the meld invalid.' };
    }

    // Add cards
    if (position === 'start') {
        state.tableMelds[tableMeldIndex].cards = [...cards, ...existing];
    } else {
        state.tableMelds[tableMeldIndex].cards = [...existing, ...cards];
    }

    // Remove from hand
    const idsToRemove = new Set(cardIds);
    player.hand = player.hand.filter(c => !idsToRemove.has(c.id));

    state.lastAction = { type: 'extend', playerIndex: playerIdx, tableMeldIndex, cards, position };

    events.emit('extend', state.lastAction);
    events.emit('stateChange', state);

    if (player.hand.length === 0) {
        endRound(state, playerIdx);
    }

    return { success: true };
}

/**
 * Discard a card to end the turn.
 * @param {object} state
 * @param {number} cardId
 * @returns {{ success: boolean, reason?: string }}
 */
export function discard(state, cardId) {
    if (state.phase !== PHASE.MELD && state.phase !== PHASE.DISCARD) {
        return { success: false, reason: 'Not in meld/discard phase.' };
    }

    const playerIdx = state.currentPlayerIndex;
    const player = state.players[playerIdx];

    const cardIndex = player.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) {
        return { success: false, reason: 'Card not in hand.' };
    }

    const card = player.hand.splice(cardIndex, 1)[0];
    state.discardPile.push(card);

    state.lastAction = { type: 'discard', playerIndex: playerIdx, card };

    events.emit('discard', state.lastAction);

    // Check if player goes out (Remik — last card discarded)
    if (player.hand.length === 0) {
        endRound(state, playerIdx);
        events.emit('stateChange', state);
        return { success: true };
    }

    // Advance to next player's turn
    advanceTurn(state);
    events.emit('stateChange', state);

    return { success: true };
}

/**
 * Skip the meld phase and go straight to discard.
 * @param {object} state
 */
export function skipMeld(state) {
    if (state.phase === PHASE.MELD) {
        state.phase = PHASE.DISCARD;
        events.emit('stateChange', state);
    }
}

/**
 * Advance to the next player's turn.
 * @param {object} state
 */
function advanceTurn(state) {
    const numPlayers = state.players.length;
    let next = (state.currentPlayerIndex + 1) % numPlayers;

    // Skip eliminated players
    while (state.players[next].eliminated && next !== state.currentPlayerIndex) {
        next = (next + 1) % numPlayers;
    }

    state.currentPlayerIndex = next;
    state.phase = PHASE.DRAW;
    state.drawnFromDiscard = false;
    state.drawnCard = null;
}

/**
 * End the current round.
 * @param {object} state
 * @param {number|null} winnerIndex — null if stock depleted
 */
function endRound(state, winnerIndex) {
    state.roundWinner = winnerIndex;
    state.phase = PHASE.ROUND_OVER;

    // Determine if this is a "Remik" (player went out without having opened before this turn)
    const isRemik = winnerIndex !== null && !state.players[winnerIndex].hasOpened;
    // Note: if they just opened and went out in the same turn, hasOpened is already true
    // "Remik" means they put ALL cards down in one turn without having previously opened

    // Score the round
    for (let i = 0; i < state.players.length; i++) {
        if (i === winnerIndex) {
            state.players[i].score += isRemik ? -20 : -10;
        } else {
            let penalty = 0;
            for (const card of state.players[i].hand) {
                penalty += getCardValue(card, false);
            }
            if (isRemik) penalty *= 2; // doubled if opponent played Remik
            state.players[i].score += penalty;
        }
    }

    // Check for 501 elimination
    for (const p of state.players) {
        if (p.score >= 501) {
            p.eliminated = true;
        }
    }

    // Check if game is over (only 1 player remaining or all humans eliminated)
    const activePlayers = state.players.filter(p => !p.eliminated);
    if (activePlayers.length <= 1) {
        state.phase = PHASE.GAME_OVER;
    }

    events.emit('roundEnd', {
        winnerIndex,
        isRemik,
        scores: state.players.map(p => ({ name: p.name, score: p.score, eliminated: p.eliminated }))
    });
}

/**
 * Start the next round.
 * @param {object} state
 */
export function nextRound(state) {
    if (state.phase === PHASE.GAME_OVER) return;

    state.roundNumber++;
    // Rotate starting player
    state.startingPlayerIndex = (state.startingPlayerIndex + 1) % state.players.length;

    // Skip eliminated starting players
    while (state.players[state.startingPlayerIndex].eliminated) {
        state.startingPlayerIndex = (state.startingPlayerIndex + 1) % state.players.length;
    }

    startRound(state);
}

/**
 * Reshuffle the discard pile into the stock if stock is empty.
 * @param {object} state
 */
function reshuffleIfNeeded(state) {
    if (state.stock.length === 0 && state.discardPile.length > 1) {
        state.stockReshuffleCount++;
        if (state.stockReshuffleCount >= 2) {
            // Second depletion — round ends
            endRound(state, null);
            return;
        }
        // Keep the top discard card, shuffle rest into stock
        const topDiscard = state.discardPile.pop();
        state.stock = shuffleDeck([...state.discardPile]);
        state.discardPile = [topDiscard];
        events.emit('reshuffle', { stockCount: state.stock.length });
    }
}
