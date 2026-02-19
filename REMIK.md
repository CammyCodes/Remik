# 🎴 Remik (Polish Rummy) — Game Guide

## Objective
The goal is to be the first player to get rid of all your cards by forming valid combinations (**Melds**). The game is played over multiple rounds.

- **Winner**: The last player remaining in the game.
- **Elimination**: Players are eliminated when they reach **501 points**.

---

## 1. Setup
- **Players**: 2 to 4 (Single Player vs AI in this version).
- **Decks**: 2 standard decks of 52 cards + 4 Jokers (108 cards total).

### The Deal
- **Dealer**: Chosen randomly, then rotates clockwise.
- **Starting Player**: Receives **14 cards**.
- **Other Players**: Receive **13 cards**.
- **Stock Pile**: Remaining cards placed face-down.
- **Discard Pile**: Starts **empty** (House Rule: No card is turned over to start).

---

## 2. Card Values
Points are used for **Opening** (need 51+ points) and **Scoring Penalties** at the end of a round.

| Card | Value | Notes |
| :--- | :--- | :--- |
| **Joker** | **50** | Wildcard |
| **Ace** | **11** | Counts as 1 if in a low sequence (A-2-3) |
| **Ambit (K, Q, J)** | **10** | Court cards |
| **Pip Cards (2-10)** | **Face Value** | e.g., 7 = 7 pts, 10 = 10 pts |

---

## 3. Valid Melds
You must form cards into valid sets to play them.

### A. Sequences (Runs)
Three or more consecutive cards of the **same suit**.
- **Valid**: `9♥`, `10♥`, `J♥`
- **Ace High**: `Q`, `K`, `A` (Ace = 11 pts)
- **Ace Low**: `A`, `2`, `3` (Ace = 1 pt)
- **Invalid**: `K`, `A`, `2` (No wrapping allowed)

### B. Groups (Sets)
Three or four cards of the **same rank** but **different suits**.
- **Valid**: `8♠`, `8♥`, `8♣`
- **Invalid**: `8♠`, `8♠`, `8♥` (Cannot have duplicate suits)

### C. Wildcards (Jokers)
Jokers can substitute for any card.
- **Sequence Rule**: You cannot have two Jokers next to each other.
- **Group Rule**: You must have at least as many natural cards as Jokers (e.g., `8♠`, `8♥`, `Joker` is OK; `8♠`, `Joker`, `Joker` is NOT).

---

## 4. Gameplay
The **Starting Player** begins by discarding one card to start the discard pile. Turns then proceed clockwise:

1.  **Draw**:
    - Take the top card from the **Stock Pile**.
    - OR take the top card from the **Discard Pile** (ONLY if you immediately use it to meld this turn).

2.  **Meld (Optional)**:
    - Place valid Sequences or Groups face-up on the table.
    - **First Meld ("The Opening")**: Must meet specific criteria (see below).
    - **Adding Off**: Once opened, you can add cards to your own melds or opponents' melds.

3.  **Discard**:
    - End your turn by placing one card face-up on the Discard Pile.

---

## 5. The Opening ("Wyłożenie")
To play your FIRST meld of the game, you must meet two strict requirements:

1.  **51 Points**: The total value of the cards you play must be **51 points or more**.
2.  **Qualifying Sequence**: You must play at least one sequence meld whose **natural (non-Joker) cards** include **3 or more consecutive cards of the same suit**. A Joker may appear in the sequence (filling a gap), but the natural cards themselves must contain a run of 3+. Two Jokers may **not** appear next to one another.

> **Examples**:
> - `10♠, J♠, Q♠` (pure sequence, no Jokers, 30 pts) + `8♦, 8♣, 8♥` (Group, 24 pts) → **Total 54 pts — VALID OPENING** ✅
> - `4♠, 5♠, 6♠, JOKER, 8♠` (naturals 4,5,6 are consecutive, 33 pts) + `K♠, K♥, K♦` (Group, 30 pts) → **Total 63 pts — VALID OPENING** ✅
> - `4♠, JOKER, 6♠, JOKER, 8♠` (naturals 4,6,8 — no 3 consecutive) → **NOT a qualifying sequence** ❌

---

## 6. Ending the Round
The round ends when:
1.  **Remik (Gin)**: A player melds all their cards and discards their final card.
2.  **Stock Depleted**: The stock runs out twice (after one reshuffle).

---

## 7. Scoring
- **Winner**: Gets **-10 points** (negative is good).
- **Remik Bonus**: If a player goes out all at once without having opened previously, they get **-20 points**.

- **Losers**: Sum of values of cards remaining in hand.
    - **Joker**: 50 pts
    - **Ace**: 11 pts
    - **Others**: Face Value / 10 for court cards.
    - **Doubling**: If the winner played "Remik", losers' points are **doubled**.

### Elimination
If a player's total score reaches **501**, they are eliminated from the game.