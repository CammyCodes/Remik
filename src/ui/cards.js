/**
 * Card rendering — creates DOM elements for cards.
 * @module ui/cards
 */

import { SUIT_COLORS } from '../engine/card.js';

/**
 * Create a face-up card DOM element.
 * @param {{ id: number, rank: string, suit: string, isJoker: boolean }} card
 * @param {object} [options]
 * @param {boolean} [options.small=false] — mini size for AI hand
 * @param {boolean} [options.table=false] — medium size for table melds
 * @param {boolean} [options.selected=false]
 * @param {boolean} [options.locked=false]
 * @param {boolean} [options.draggable=false]
 * @param {number} [options.dealIndex] — stagger index for deal animation
 * @param {string} [options.animClass] — animation class to add
 * @returns {HTMLElement}
 */
export function renderCard(card, options = {}) {
    const el = document.createElement('div');
    el.dataset.cardId = card.id;

    const isRed = card.suit === '♥' || card.suit === '♦';
    const classes = ['card', 'card--face-up'];
    if (card.isJoker) classes.push('card--joker');
    else classes.push(isRed ? 'card--red' : 'card--black');
    if (options.small) classes.push('card--small');
    if (options.table) classes.push('card--table');
    if (options.selected) classes.push('card--selected');
    if (options.locked) classes.push('card--locked');
    if (options.staged) classes.push('card--staged');
    if (options.draggable) el.draggable = true;
    if (options.animClass) classes.push(options.animClass);
    if (typeof options.dealIndex === 'number') {
        classes.push('anim-deal');
        const stagger = Math.min(options.dealIndex + 1, 14);
        classes.push(`anim-deal-${stagger}`);
    }

    el.className = classes.join(' ');

    if (card.isJoker) {
        el.innerHTML = `<span class="card__joker-label">🃏</span>`;
    } else if (!options.small) {
        el.innerHTML = `
      <span class="card__corner">
        <span class="card__rank">${card.rank}</span>
        <span class="card__suit">${card.suit}</span>
      </span>
      <span class="card__center">${card.suit}</span>
      <span class="card__corner card__corner--bottom">
        <span class="card__rank">${card.rank}</span>
        <span class="card__suit">${card.suit}</span>
      </span>
    `;
    }

    return el;
}

/**
 * Create a face-down card element.
 * @param {object} [options]
 * @param {boolean} [options.small=false]
 * @returns {HTMLElement}
 */
export function renderCardBack(options = {}) {
    const el = document.createElement('div');
    const classes = ['card', 'card--face-down'];
    if (options.small) classes.push('card--small');
    el.className = classes.join(' ');
    return el;
}

/**
 * Show a toast notification.
 * @param {string} message
 * @param {'error'|'success'|'info'} [type='info']
 * @param {number} [duration=3000]
 */
export function showToast(message, type = 'info', duration = 3000) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), duration);
}
