# 🤖 AGENT.md — Remik Codebase Reference

> **Purpose**: Single source of truth for AI agents working on this codebase.
> Maps architecture, file ownership, function signatures, dependencies, conventions, and common change patterns.

---

## 1. Project Overview

| Key | Value |
|---|---|
| **Name** | Remik — Polish Rummy |
| **Frontend** | Vanilla JavaScript (ESM), Vite 5 bundler |
| **Server** | Node.js (CommonJS), raw `http` + `ws` WebSocket |
| **Styling** | Vanilla CSS with custom properties, BEM-like classes |
| **Font** | Inter (Google Fonts) |
| **State** | Custom `EventBus` + imperative DOM updates |
| **Persistence** | `localStorage` (solo), JSON files on disk (multiplayer) |

### Commands

```bash
npm run dev      # Vite dev server on :5173 (solo only, no multiplayer)
npm run build    # Production build → dist/
npm start        # node server.cjs — HTTP + WebSocket on :3000 (multiplayer)
```

### Key Documentation
- [README.md](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/README.md) — User-facing project overview
- [REMIK.md](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/REMIK.md) — Complete game rules (house rules)
- [GEMINI.md](file:///c:/Users/Cammy/.gemini/GEMINI.md) — System directive for AI agents

---

## 2. Directory Structure

```
soloRemik/
├── index.html              # App shell — mounts #app, loads main.js
├── package.json            # ESM project, Vite + ws + uuid deps
├── vite.config.js          # Vite config (port 5173, publicDir: public)
├── server.cjs              # Production HTTP + WebSocket entry point
├── README.md
├── REMIK.md                # Game rules reference
├── AGENT.md                # ← This file
├── public/
│   └── favicon.svg
└── src/
    ├── main.js             # App entry — screen routing (lobby ↔ game ↔ multiplayer)
    ├── engine/             # Pure game logic (no DOM)
    │   ├── card.js         # Card model, constants, comparators
    │   ├── deck.js         # Deck creation, shuffle, deal
    │   ├── gameConfig.js   # Tunable defaults, mergeConfig()
    │   ├── melds.js        # Meld validation (sequence, group, opening)
    │   ├── gameState.js    # Central state machine + EventBus
    │   ├── ai.js           # Greedy heuristic AI opponent
    │   ├── turnTracker.js  # Per-turn snapshots for stats replay
    │   ├── saveManager.js  # localStorage save/load/delete
    │   ├── soundManager.js # Procedural audio via Web Audio API
    │   └── networkClient.js# WebSocket client wrapper + session cookies
    ├── ui/                 # DOM rendering layer
    │   ├── cards.js        # renderCard(), renderCardBack(), showToast()
    │   ├── hand.js         # HandManager class (selection, drag, lock, sort)
    │   ├── gameBoard.js    # Main game UI orchestrator (1217 lines, largest file)
    │   ├── lobby.js        # Lobby screen (solo/multiplayer, settings, history)
    │   ├── eventLog.js     # EventLog class (real-time game event sidebar)
    │   ├── statsViewer.js  # Historical round replay overlay
    │   ├── leaderboard.js  # PvP leaderboard overlay (fetch /api/leaderboard)
    │   └── rulebook.js     # In-game rules overlay (static HTML)
    ├── server/             # Server-side multiplayer logic (CJS)
    │   ├── gameServer.cjs  # Authoritative game logic, action handlers, broadcasting
    │   ├── roomManager.cjs # Room CRUD, reconnection, snapshot persistence
    │   └── leaderboard.cjs # PvP leaderboard (JSON file persistence)
    └── styles/
        ├── main.css        # All component styles (~53KB, CSS custom properties)
        └── animations.css  # Keyframes, deal/draw/discard animations
```

---

## 3. Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                     ENTRY POINTS                            │
│  index.html → src/main.js (client)                          │
│  server.cjs (production server)                             │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
    ┌──────────▼──────────┐       ┌───────────▼──────────────┐
    │   UI LAYER          │       │   SERVER LAYER            │
    │   src/ui/*.js       │       │   server.cjs              │
    │   (DOM, events,     │◄─ws──►│   src/server/*.cjs        │
    │    user interaction) │       │   (authoritative state,   │
    └──────────┬──────────┘       │    rooms, leaderboard)    │
               │                  └───────────┬──────────────┘
    ┌──────────▼──────────┐                   │
    │   ENGINE LAYER      │       (server duplicates card/deck/
    │   src/engine/*.js   │        meld logic for validation)
    │   (pure game logic, │
    │    no DOM, no I/O)  │
    └─────────────────────┘
```

**Data flow (solo mode):** `main.js` → `renderGameBoard()` → creates `gameState` → human plays via UI event handlers → `gameState.*()` mutates state → `events.emit()` → `updateUI()` re-renders → AI turn via `aiDecideTurn()`.

**Data flow (multiplayer):** `main.js` → `networkClient.connect()` → `renderMultiplayerBoard()` → user actions call `net.send()` → `server.cjs` receives → `gameServer.handleAction()` validates + mutates authoritative state → `broadcastGameState()` → client `onNetworkGameState()` → `updateUI()`.

---

## 4. Module Reference — Engine (`src/engine/`)

### [card.js](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/engine/card.js) — Card Model & Constants

| Export | Signature | Description |
|---|---|---|
| `RANKS` | `const string[]` | `['A','2',...,'K']` — ordered low→high |
| `SUITS` | `const string[]` | `['♠','♥','♦','♣']` |
| `SUIT_COLORS` | `const object` | Suit → hex color map (black/red) |
| `rankIndex` | `(rank: string) → number` | 0-based index of a rank |
| `getCardValue` | `(card, lowAce?) → number` | Point value (Ace=11 or 1, Joker=50) |
| `cardToString` | `(card) → string` | Human label, e.g. `"10♠"` or `"🃏"` |
| `compareCards` | `(a, b) → number` | Sort comparator: suit-first, then rank |
| `compareCardsByRank` | `(a, b) → number` | Sort comparator: rank-first, then suit |

**Card object shape:** `{ id: number, rank: string, suit: string, isJoker: boolean }`

**Depends on:** nothing (leaf module)

---

### [deck.js](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/engine/deck.js) — Deck Creation & Dealing

| Export | Signature | Description |
|---|---|---|
| `createDeck` | `(jokerCount?: number) → Card[]` | 2×52 + N jokers |
| `shuffleDeck` | `(deck: Card[]) → Card[]` | Fisher-Yates in-place shuffle |
| `dealCards` | `(deck, counts: number[]) → { hands, stock }` | Round-robin deal, mutates deck |

**Depends on:** `card.js` (RANKS, SUITS)

---

### [gameConfig.js](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/engine/gameConfig.js) — Configuration

| Export | Signature | Description |
|---|---|---|
| `DEFAULTS` | `const object` | All tunable game constants (see below) |
| `mergeConfig` | `(overrides?) → object` | Merge + clamp user overrides into defaults |
| `PLAYER_COLOURS` | `const string[]` | 8 hex colors for player avatars |
| `PLAYER_ICONS` | `const string[]` | 12 emoji icons for player avatars |

**Key DEFAULTS fields:**
`POINTS_LIMIT` (501), `JOKER_COUNT` (4), `TURN_TIMER_SECONDS` (300), `MIN_PLAYERS` (2), `MAX_PLAYERS` (4), `HAND_SIZE_FIRST` (14), `HAND_SIZE_OTHER` (13), `OPEN_REQUIREMENT` (51), `REQUIRE_OPENING` (true), `ALLOW_JOKER_SWAP` (false), `SPEED_MODE` (false)

**Depends on:** nothing

---

### [melds.js](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/engine/melds.js) — Meld Validation (419 lines)

| Export | Signature | Description |
|---|---|---|
| `isValidSequence` | `(cards: Card[]) → boolean` | 3+ consecutive same-suit, joker rules |
| `isValidGroup` | `(cards: Card[]) → boolean` | 3-4 same-rank different-suit, joker rules |
| `classifyMeld` | `(cards) → 'sequence'\|'group'\|false` | Classify or reject |
| `calculateMeldsPoints` | `(melds: Card[][]) → number` | Total points for opening check |
| `isValidOpening` | `(melds) → { valid, reason? }` | ≥51pts + qualifying sequence check (see `hasPureSubRun`) |
| `canExtendMeld` | `(existing, newCards, position?) → boolean` | Validate extension |
| `autoSplitMelds` | `(cards) → Card[][]\|null` | Auto-partition selection into valid melds |

**Internal helpers (not exported):** `aceHighIndex`, `hasPureSubRun`, `trySequence`, `trySplitSequencesFirst`, `trySplitGroupsFirst`, `extractConsecutiveRuns`, `extractGroups`

**`hasPureSubRun(naturals)`** — checks whether the natural (non-joker) cards from a valid sequence meld contain 3+ consecutive same-suit ranks (tested ace-low and ace-high). Called by `isValidOpening` after `isValidSequence` has already confirmed all naturals share a suit and that no two jokers are adjacent.

**Depends on:** `card.js` (RANKS, rankIndex, getCardValue)

---

### [gameState.js](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/engine/gameState.js) — Central State Machine (546 lines)

| Export | Signature | Description |
|---|---|---|
| `PHASE` | `const object` | Turn phases: `DRAW`, `MELD`, `DISCARD`, `ROUND_OVER`, `GAME_OVER` |
| `EventBus` | `class` | `.on(event, fn)`, `.emit(event, data)`, `.clear()` |
| `events` | `const EventBus` | Singleton event bus instance |
| `createGame` | `(playersOrName, configOverrides?) → state` | Initialize full game state |
| `startRound` | `(state) → void` | Shuffle, deal, reset for new round |
| `drawFromStock` | `(state) → { success, card?, reason? }` | Draw from stock pile |
| `drawFromDiscard` | `(state) → { success, card?, reason? }` | Draw from discard (must meld) |
| `playMelds` | `(state, meldCardIds: number[][]) → { success, reason? }` | Play melds from hand |
| `addToTableMeld` | `(state, tableMeldIndex, cardIds, position?) → { success, reason? }` | Extend existing table meld |
| `swapJoker` | `(state, tableMeldIndex, jokerPos, cardId) → { success, reason? }` | Swap natural card for joker |
| `discard` | `(state, cardId) → { success, reason? }` | Discard to end turn |
| `skipMeld` | `(state) → void` | Skip meld phase → discard |
| `advanceTurn` | `(state) → void` | Move to next player |
| `endRound` | `(state, winnerIndex) → void` | Score + finalize round |
| `nextRound` | `(state) → void` | Prepare next round |
| `reshuffleIfNeeded` | `(state) → void` | Reshuffle discard into stock |

**Game state object shape (key fields):**
```
{
  players: [{ name, hand: Card[], score, hasOpened, isHuman, colour, icon }],
  stock: Card[],
  discardPile: Card[],
  tableMelds: [{ cards: Card[], owner: number }],
  currentPlayerIndex: number,
  startingPlayerIndex: number,
  phase: string,
  roundNumber: number,
  config: object,
  drewFromDiscard: boolean,
  drawnDiscardCardId: number|null,
  reshuffleCount: number,
  gameOver: boolean
}
```

**EventBus events emitted:** `draw`, `meld`, `extend`, `discard`, `roundStart`, `roundEnd`, `reshuffle`, `jokerSwap`

**Depends on:** `deck.js`, `card.js`, `melds.js`, `gameConfig.js`

---

### [ai.js](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/engine/ai.js) — AI Opponent (376 lines)

| Export | Signature | Description |
|---|---|---|
| `findPossibleMelds` | `(hand: Card[]) → Card[][]` | Find all valid meld combinations in a hand |
| `aiDecideTurn` | `(state) → Action[]` | Full turn decision: draw → meld → discard |

**Internal functions (not exported):**
`aiDecideMeldsAndDiscard`, `decideDrawSource`, `findOpeningMelds`, `findBestMelds`, `findExtensions`, `chooseDiscard`, `meldValue`, `groupBy`

**Action shape:** `{ type: 'draw'|'meld'|'extend'|'discard', source?, meldCardIds?, cardId?, ... }`

**Depends on:** `card.js`, `melds.js`

---

### [turnTracker.js](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/engine/turnTracker.js) — Turn Snapshots & Win Likelihood

| Export | Signature | Description |
|---|---|---|
| `TurnTracker` | `class` | Records per-turn game snapshots for stats viewer |
| `calculateWinLikelihood` | `(playerIdx, state) → number` | 0-1 win likelihood |

**TurnTracker methods:** `takeSnapshot(state, actionDescription)`, `finalizeRound()`, `startNewRound()`, `toJSON()`, `fromJSON(data)`

**Depends on:** `card.js` (getCardValue), `ai.js` (findPossibleMelds)

---

### [saveManager.js](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/engine/saveManager.js) — localStorage Persistence

| Export | Signature | Description |
|---|---|---|
| `saveGame` | `(state, turnHistory?, eventLogData?) → void` | Persist to `remik_save` key |
| `loadGame` | `() → { state, turnHistory, eventLog, savedAt }\|null` | Load saved game |
| `deleteSave` | `() → void` | Remove save |
| `hasSave` | `() → boolean` | Check if save exists |

**Depends on:** nothing

---

### [soundManager.js](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/engine/soundManager.js) — Procedural Audio

All sounds are synthesized via Web Audio API — zero external audio files.

| Export | Description |
|---|---|
| `playCardClick()` | Generic card tap |
| `playCardSelect()` | Rising sweep (card selected) |
| `playCardDeselect()` | Falling sweep (card deselected) |
| `playCardDraw()` | Draw from stock/discard |
| `playMeldSuccess()` | C-E-G chord (meld placed) |
| `playDiscard()` | Low thud + noise (card discarded) |
| `playButtonClick()` | Short noise burst |
| `playRoundWin()` | Ascending arpeggio |
| `playRoundLose()` | Descending minor |
| `playError()` | Square-wave buzz |
| `playTurnStart()` | Soft chime |
| `playExtend()` | Quick two-note |
| `playReshuffle()` | Shuffling noise burst |

**Depends on:** nothing (uses Web Audio API only)

---

### [networkClient.js](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/engine/networkClient.js) — WebSocket Client

| Export | Signature | Description |
|---|---|---|
| `connect` | `(url?) → Promise<void>` | Connect to WS server (auto-derives URL) |
| `send` | `(type, payload?) → void` | Send typed message |
| `on` | `(type, callback) → void` | Register message handler |
| `off` | `(type?) → void` | Remove handler(s) |
| `disconnect` | `() → void` | Clean close |
| `isConnected` | `() → boolean` | Connection check |
| `setOnDisconnect` | `(fn) → void` | Register disconnect callback |
| `setOnReconnect` | `(fn) → void` | Register reconnect callback |
| `saveSession` | `(session) → void` | Save to cookie (24h) |
| `getSession` | `() → object\|null` | Read session cookie |
| `clearSession` | `() → void` | Clear session cookie |

**Internal:** `attemptReconnect()` — exponential backoff (max 3 retries)

**Depends on:** nothing (uses browser WebSocket API)

---

## 5. Module Reference — UI (`src/ui/`)

### [cards.js](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/ui/cards.js) — Card DOM Rendering

| Export | Signature | Description |
|---|---|---|
| `renderCard` | `(card, options?) → HTMLElement` | Create face-up card element |
| `renderCardBack` | `(options?) → HTMLElement` | Create face-down card element |
| `showToast` | `(message, type?, duration?) → void` | Toast notification |

**renderCard options:** `{ small, table, selected, locked, draggable, dealIndex, animClass }`

**Key CSS classes produced:** `.card`, `.card--face-up`, `.card--face-down`, `.card--red`, `.card--black`, `.card--joker`, `.card--small`, `.card--table`, `.card--selected`, `.card--locked`, `.card--dragging`, `.anim-deal`, `.anim-deal-N`

**Depends on:** `card.js` (SUIT_COLORS)

---

### [hand.js](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/ui/hand.js) — HandManager Class

| Export | Description |
|---|---|
| `HandManager` | Class managing player hand UI with drag-drop, selection, locking, auto-sort |

**HandManager constructor:** `(container: HTMLElement, callbacks: { onSelect, onDeselect, onReorder, onSelectionChange })`

**HandManager methods:**
`render(cards, options?)`, `toggleSelect(cardId)`, `toggleLock(cardId)`, `clearSelection()`, `getSelectedIds() → number[]`, `autoOrganize(hand) → Card[]`, `toggleSortMode()`, `getSortModeLabel() → string`

**Depends on:** `cards.js` (renderCard), `card.js` (compareCards, compareCardsByRank), `soundManager.js`

---

### [gameBoard.js](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/ui/gameBoard.js) — Main Game Orchestrator (1217 lines)

> ⚠️ **Largest file in the project.** This is the primary UI controller for both solo and multiplayer modes.

| Export | Signature | Description |
|---|---|---|
| `renderGameBoard` | `(root, playerName, onReturnToLobby, resumeData?, configOverrides?) → void` | Init solo game board |
| `renderMultiplayerBoard` | `(root, playerName, onReturnToLobby, playerIndex, isHost) → void` | Init multiplayer board |

**Key internal functions (not exported):**

| Function | Purpose |
|---|---|
| `buildBoardDOM()` | Create static board HTML structure |
| `updateUI(dealAnim?)` | Full re-render from game state |
| `renderTableMelds()` | Render melds grouped by owner |
| `renderControls()` | Render action buttons (meld, discard, sort, etc.) |
| `updateStatusMessage()` | Update phase/turn status text |
| `onStockClick()` | Handle drawing from stock |
| `onDiscardClick()` | Handle drawing from discard |
| `onPlayMeld()` | Handle playing melds (auto-split logic) |
| `onDiscard()` | Handle discarding a card |
| `onSkipMeld()` | Skip meld → go to discard |
| `onAutoOrganize()` | Sort hand |
| `onToggleSortMode()` | Toggle suit/rank sort |
| `handleReorder(draggedId, targetId)` | Drag-drop reorder within hand |
| `onTableMeldDrop(e, idx)` | Drop card onto table meld (extend) |
| `onJokerSwapDrop(e, idx, jokerIdx)` | Drop card onto joker (swap) |
| `scheduleAiTurn()` | Delay then run AI |
| `executeAiTurn()` | Animate AI actions step-by-step |
| `onRoundEnd(data)` | Handle round completion |
| `showRoundOverlay(data)` | Scoring + next round overlay |
| `calculateHandPenalty(playerIdx)` | Raw hand penalty calculation |
| `updateTimerBar()` | Turn timer bar display |
| `showReconnectBanner(name)` | Multiplayer disconnect warning |
| `hideReconnectBanner()` | Remove disconnect warning |
| `onNetworkGameState(msg)` | Handle server state broadcast |

**Module-level state variables:**
`gameState`, `rootEl`, `handManager`, `aiTurnInProgress`, `returnToLobbyFn`, `meldStagingCards`, `turnTracker`, `eventLog`, `isMultiplayer`, `myPlayerIndex`, `timerRemaining`, `currentPlayerName`, `isHost`, `timerInterval`

**Depends on:** `gameState.js`, `card.js`, `melds.js`, `ai.js`, `turnTracker.js`, `saveManager.js`, `soundManager.js`, `networkClient.js`, `gameConfig.js`, `cards.js`, `hand.js`, `eventLog.js`, `statsViewer.js`, `leaderboard.js`, `rulebook.js`

---

### [lobby.js](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/ui/lobby.js) — Lobby Screen (385 lines)

| Export | Signature | Description |
|---|---|---|
| `renderLobby` | `(root, callbacks) → void` | Render lobby with solo/multiplayer tabs |
| `updateWaitingRoom` | `(root, roomCode, players, isHost) → void` | Update multiplayer waiting room |

**Callbacks object:** `{ onStartSolo(name, config), onResume(), onCreateRoom(name, colour, icon, settings), onJoinRoom(code, name, colour, icon), onReconnect(session) }`

**Internal helpers:** `renderHistory(history)`, `saveScoreHistory(result)`, `loadScoreHistory()`, `escapeHtml(str)`

**Depends on:** `saveManager.js`, `soundManager.js`, `gameConfig.js`, `networkClient.js`

---

### [eventLog.js](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/ui/eventLog.js) — EventLog Class

| Export | Description |
|---|---|
| `EventLog` | Class — real-time scrollable sidebar of game events |

**Methods:** `mount(el)`, `addEntry(icon, text, type?)`, `clear()`, `toJSON()`, `fromJSON(data)`, `addRoundSeparator(roundNumber)`, `subscribe(events, players)`

**EventBus subscriptions (in `subscribe`):** `draw`, `meld`, `extend`, `discard`, `roundStart`, `roundEnd`, `reshuffle`

**Key CSS classes:** `.event-log__entry`, `.event-log__entry--action|info|round|error`, `.event-log__icon`, `.event-log__text`, `.event-log__time`

**Depends on:** `card.js` (cardToString)

---

### [statsViewer.js](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/ui/statsViewer.js) — Stats Replay Overlay

| Export | Signature | Description |
|---|---|---|
| `showStatsViewer` | `(completedRounds: Snapshot[][]) → void` | Open stats overlay with round/turn navigation |

**Key CSS classes:** `.stats-overlay`, `.stats-panel`, `.stats-tab`, `.stats-player`, `.stats-likelihood`, `.stats-meld`, `.card--highlight-added`, `.card--highlight-removed`

**Depends on:** `cards.js` (renderCard)

---

### [leaderboard.js](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/ui/leaderboard.js) — PvP Leaderboard Overlay

| Export | Signature | Description |
|---|---|---|
| `showLeaderboard` | `(currentPlayerName?) → void` | Fetch `GET /api/leaderboard` and render |
| `hideLeaderboard` | `() → void` | Close overlay |

**Key CSS classes:** `.leaderboard-overlay`, `.leaderboard-panel`, `.leaderboard-table`, `.leaderboard-row--me`

**Depends on:** nothing (uses `fetch` API)

---

### [rulebook.js](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/ui/rulebook.js) — In-Game Rules Overlay

| Export | Signature | Description |
|---|---|---|
| `showRulebook` | `() → void` | Show rules overlay (static HTML) |
| `hideRulebook` | `() → void` | Close overlay |

**Key CSS classes:** `.rulebook-overlay`, `.rulebook-panel`, `.rulebook-table`

**Depends on:** nothing

---

## 6. Module Reference — Server

### [server.cjs](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/server.cjs) — HTTP + WebSocket Entry Point (372 lines)

- Creates `http.createServer` for static file serving + `/api/leaderboard` endpoint
- Creates `WebSocketServer` for multiplayer
- **Path traversal protection:** validates resolved paths stay within project root
- Restores room snapshots on startup via `roomManager.loadSnapshots()`
- Default port: `3000` (env `PORT`)

**WebSocket message types handled:**
`create_room`, `join_room`, `start_game`, `game_action`, `next_round`, `reconnect`, `leave`

**Internal handlers:** `handleCreateRoom`, `handleJoinRoom`, `handleStartGame`, `handleGameAction`, `handleNextRound`, `handleReconnect`, `handleLeave`, `handleDisconnect`

**Depends on:** `src/server/gameServer.cjs`, `src/server/roomManager.cjs`, `src/server/leaderboard.cjs`, `ws`, `uuid`

---

### [gameServer.cjs](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/server/gameServer.cjs) — Authoritative Game Logic (820 lines)

> ⚠️ **Server-side duplication of card/deck/meld logic** — this file re-implements card utilities, deck creation, and meld validation from the engine layer for server-side authority. Changes to game rules must be mirrored here.

**Key exports:**
`startGame(room)`, `startRound(room)`, `handleAction(room, playerId, action)`, `nextRound(room)`, `broadcastGameState(room)`

**Action types handled in `handleAction`:**
`draw_stock`, `draw_discard`, `play_melds`, `extend_meld`, `discard`, `skip_meld`, `joker_swap`

**Internal functions:** `handleDrawStock`, `handleDrawDiscard`, `handlePlayMelds`, `handleExtendMeld`, `handleDiscard`, `handleSkipMeld`, `handleJokerSwap`, `advanceTurn`, `endRound`, `reshuffleIfNeeded`, `broadcastToRoom`, `sendToPlayer`, `startTurnTimer`, `clearTurnTimer`, `handleTimerExpired`

**Depends on:** `roomManager.cjs`

---

### [roomManager.cjs](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/server/roomManager.cjs) — Room Lifecycle

**Exports:**
`createRoom`, `joinRoom`, `leaveRoom`, `markDisconnected`, `reconnectPlayer`, `getRoom`, `getOpenRooms`, `findByWs`, `saveSnapshot`, `loadSnapshots`, `cleanupSnapshot`

**Snapshot persistence:** saves to `src/data/rooms/<code>.json`

**Depends on:** `uuid`, `fs`, `path`

---

### [leaderboard.cjs](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/server/leaderboard.cjs) — PvP Leaderboard

**Exports:**
`recordResult(playerName, won, score)`, `getLeaderboard() → top 50 entries`

**Persistence:** `src/data/leaderboard.json`

**Depends on:** `fs`, `path`

---

## 7. Styles Reference

### [main.css](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/styles/main.css) (~53KB)

**Key CSS class families:**
- `.card`, `.card--*` — all card rendering variants
- `.hand` — player hand container
- `.board`, `.board__*` — game board layout
- `.lobby`, `.lobby__*` — lobby screen
- `.controls`, `.controls__*` — action buttons
- `.table-melds`, `.meld-group` — table meld display
- `.overlay`, `.overlay__*` — generic overlay pattern
- `.stats-*` — stats viewer
- `.event-log`, `.event-log__*` — event sidebar
- `.leaderboard-*` — leaderboard overlay
- `.rulebook-*` — rulebook overlay
- `.toast`, `.toast--*` — toast notifications
- `.timer-bar` — turn timer
- `.reconnect-banner` — multiplayer disconnect warning

### [animations.css](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/styles/animations.css) (~6KB)

**Keyframes:**
`deal-in`, `draw-card`, `discard-card`, `card-glow`, `fade-in`, `slide-up`

**Utility classes:** `.anim-deal`, `.anim-deal-1` through `.anim-deal-14`, `.anim-draw`, `.anim-discard`

---

## 8. Code Conventions & Target File Variables

| Variable | Value |
|---|---|
| `naming_convention` | `camelCase` for functions/variables, `PascalCase` for classes (`HandManager`, `EventBus`, `TurnTracker`, `EventLog`), `UPPER_SNAKE_CASE` for constants (`RANKS`, `SUITS`, `PHASE`, `DEFAULTS`) |
| `type_hinting_strictness` | JSDoc `@param` and `@returns` on all exported functions; `@type` annotations on class fields |
| `docstring_and_comment_format` | JSDoc block comments with `@module` tag at file top; section separators use `═══` lines |
| `styling_methodology` | Vanilla CSS with custom properties, BEM-like naming (`.block__element--modifier`) |
| `state_management_pattern` | Singleton `EventBus` class (`events.on/emit`), imperative DOM updates via `innerHTML` and `createElement` |
| `module_system` | ESM (`import/export`) for client, CJS (`require/module.exports`) for server |
| `error_handling` | Functions return `{ success: boolean, reason?: string }` objects — no exceptions for game logic |
| `security` | `escapeHtml()` used in lobby + leaderboard; path traversal check in `server.cjs`; `SameSite=Strict` cookies |

---

## 9. Dependency Graph

```
card.js ◄──── deck.js
   ▲              │
   │              ▼
   ├──── melds.js
   │        ▲
   │        │
   ├──── gameState.js ◄── (deck.js, melds.js, gameConfig.js)
   │        ▲
   │        │
   ├──── ai.js ──────────► melds.js
   │        ▲
   │        │
   └──── turnTracker.js ──► ai.js

saveManager.js    (standalone — no engine deps)
soundManager.js   (standalone — Web Audio API)
networkClient.js  (standalone — browser WebSocket)
gameConfig.js     (standalone — constants only)

UI Layer:
cards.js ◄──── hand.js
   ▲              │
   │              ▼
   ├──── gameBoard.js ──► (all engine modules + all UI modules)
   │
   ├──── eventLog.js ──► card.js
   │
   └──── statsViewer.js

lobby.js ──► saveManager.js, soundManager.js, gameConfig.js, networkClient.js
leaderboard.js (standalone — uses fetch)
rulebook.js    (standalone — static HTML)
```

---

## 10. Common Change Patterns

### Add a new game rule / config option
1. Add the default to `DEFAULTS` in [gameConfig.js](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/engine/gameConfig.js)
2. Add clamping logic in `mergeConfig()` if numeric
3. Read the config value from `state.config` in [gameState.js](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/engine/gameState.js)
4. **Mirror the rule** in [gameServer.cjs](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/server/gameServer.cjs) (server-side authority)
5. Add a UI toggle in [lobby.js](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/ui/lobby.js) settings section
6. Update [rulebook.js](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/ui/rulebook.js) if user-facing

### Change card rendering / visuals
1. Modify [cards.js](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/ui/cards.js) `renderCard()` or `renderCardBack()`
2. Update CSS classes in [main.css](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/styles/main.css) (search `.card`)
3. If animation-related → [animations.css](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/styles/animations.css)

### Fix meld validation
1. Primary: [melds.js](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/engine/melds.js) — `isValidSequence`, `isValidGroup`, `classifyMeld`
2. **Must mirror** in [gameServer.cjs](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/server/gameServer.cjs) (lines 73–191)
3. Opening rules: `isValidOpening()` in both files

### Modify AI behaviour
1. [ai.js](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/engine/ai.js) — all AI logic lives here
2. Key functions: `aiDecideTurn`, `decideDrawSource`, `findOpeningMelds`, `findBestMelds`, `chooseDiscard`
3. AI is executed by `executeAiTurn()` in [gameBoard.js](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/ui/gameBoard.js)

### Add a new UI overlay
Follow the pattern in [rulebook.js](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/ui/rulebook.js) or [leaderboard.js](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/ui/leaderboard.js):
1. Create `src/ui/myOverlay.js` with `showMyOverlay()` / `hideMyOverlay()` exports
2. Create DOM via `document.createElement('div')` with class `.my-overlay`
3. Add `.my-overlay` styles to [main.css](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/styles/main.css)
4. Wire the trigger button in [gameBoard.js](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/ui/gameBoard.js) `buildBoardDOM()`

### Modify scoring / round end logic
1. [gameState.js](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/engine/gameState.js) — `endRound()` (scoring), `nextRound()` (reset)
2. [gameBoard.js](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/ui/gameBoard.js) — `showRoundOverlay()` (UI), `calculateHandPenalty()` (display)
3. **Server mirror:** [gameServer.cjs](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/server/gameServer.cjs) — `endRound()`, `nextRound()`
4. Score history: [lobby.js](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/ui/lobby.js) — `saveScoreHistory()`, `loadScoreHistory()`

### Add a new sound effect
1. Add a new exported function in [soundManager.js](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/engine/soundManager.js)
2. Use the primitives: `sine()`, `sweep()`, `noiseBurst()`, `buzz()`
3. Import and call from the relevant UI handler

### Add multiplayer message type
1. Client: register handler in [networkClient.js](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/engine/networkClient.js) via `net.on('type', handler)`
2. Server: add case in [server.cjs](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/server.cjs) message switch
3. If game-action: add handler in [gameServer.cjs](file:///c:/Users/Cammy/Documents/GitHub/soloRemik/src/server/gameServer.cjs) `handleAction()`
