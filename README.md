# 🎴 Remik — The Ultimate Polish Rummy Experience

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/CammyCodes/Remik)
[![License](https://img.shields.io/badge/license-Educational-green.svg)](LICENSE)
[![Stack](https://img.shields.io/badge/stack-Vite%20%7C%20Vanilla%20JS%20%7C%20Node.js-orange.svg)](https://vitejs.dev/)

A premium, high-performance digital implementation of **Polish Rummy (Remik)**. Built with meticulous attention to detail, smooth animations, and a robust multiplayer engine, this is the definitive way to play Remik online or against a challenging AI.

---

## ✨ Features

### 🤝 Seamless Multiplayer
Experience real-time gameplay with friends via a dedicated WebSocket server.
- **Room System**: Create or join rooms with unique 6-digit codes.
- **Persistence**: Reconnect to active games if your connection drops.
- **Live Event Log**: Track every move with a detailed, scrollable game history.

### 🤖 Advanced AI Opponent
No friends online? Challenge our strategic AI that utilizes heuristic analysis to simulate realistic human play.

### 🎨 Premium Visuals & UX
- **Fluid Animations**: Smooth card movements for dealing, drawing, and discarding.
- **Dynamic Board**: Interactive card organization, locking mechanisms, and drag-and-drop extensions.
- **Real-time Stats**: Analyze your performance with round-by-round replay and win-likelihood charts.
- **Customizable Themes**: Switch between classic green and sleek slate themes.

### 📜 Authenticity
- **Strict Rule Enforcement**: Full implementation of Polish Remik rules, including the **51-point Opening** and **Pure Sequence** requirements.
- **Joker Management**: Dynamic Joker swapping and repositioning within melds.

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Vanilla JavaScript (ESM), Vite 5 |
| **Backend** | Node.js, WebSocket (`ws`), Case-Authoritative State |
| **Styling** | Modern CSS (Custom Properties, BEM Architecture) |
| **Audio** | Procedural Web Audio API (Zero external assets) |

---

## 📦 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)

### Installation
1.  **Clone the repository:**
    ```bash
    git clone https://github.com/CammyCodes/Remik.git
    cd Remik
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```

### Running the App
For the full multiplayer experience, you need to run the server:
```bash
npm start
```
*The server will start on `http://localhost:3000`.*

For local frontend development (solo mode only):
```bash
npm run dev
```

---

## 📖 Game Rules
Polish Remik is played with two 52-card decks and 4 Jokers. For a comprehensive guide on house rules, scoring, and opening requirements, see **[REMIK.md](./REMIK.md)**.

## 🏆 PvP Leaderboard
Compete for the top spot! Win games in multiplayer mode to climb the global ranks, viewable directly from the game lobby.

---

*Handcrafted with ❤️ by Cammy. Remik Version 1.0.0 "Stable Baseline".*
