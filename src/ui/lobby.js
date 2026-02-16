/**
 * Lobby screen — name entry + score history + resume game.
 * @module ui/lobby
 */

import { hasSave, deleteSave } from '../engine/saveManager.js';
import { playButtonClick } from '../engine/soundManager.js';

/**
 * Render the lobby screen.
 * @param {HTMLElement} root — container element
 * @param {Function} onStart — called with playerName when game starts
 * @param {Function} onResume — called when resuming a saved game
 */
export function renderLobby(root, onStart, onResume) {
  const history = loadScoreHistory();
  const canResume = hasSave();

  root.innerHTML = `
    <div class="lobby">
      <span class="lobby__cards-deco lobby__cards-deco--left">♠♥</span>
      <span class="lobby__cards-deco lobby__cards-deco--right">♦♣</span>

      <h1 class="lobby__title">Remik</h1>
      <p class="lobby__subtitle">Polish Rummy — Solo Edition</p>

      <form class="lobby__form" id="lobby-form">
        <input
          type="text"
          class="lobby__input"
          id="player-name"
          placeholder="Enter your name…"
          maxlength="20"
          autocomplete="off"
          required
        />
        <button type="submit" class="lobby__btn">New Game</button>
        ${canResume ? '<button type="button" class="lobby__btn lobby__btn--resume" id="btn-resume">▶ Resume Game</button>' : ''}
      </form>

      ${history.length > 0 ? renderHistory(history) : ''}
    </div>
  `;

  // Restore last used name
  const nameInput = root.querySelector('#player-name');
  const savedName = localStorage.getItem('remik_playerName');
  if (savedName) nameInput.value = savedName;

  // Focus the input
  setTimeout(() => nameInput.focus(), 100);

  root.querySelector('#lobby-form').addEventListener('submit', (e) => {
    e.preventDefault();
    playButtonClick();
    const name = nameInput.value.trim() || 'Player';
    localStorage.setItem('remik_playerName', name);
    deleteSave(); // clear any existing save for a new game
    onStart(name);
  });

  // Resume button
  if (canResume) {
    root.querySelector('#btn-resume')?.addEventListener('click', () => {
      playButtonClick();
      onResume?.();
    });
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
  // Keep only last 20 entries
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
