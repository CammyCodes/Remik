# 🎴 Remik (Polish Rummy) — Game Guide

## Objective
The goal is to be the first player to get rid of all your cards by forming valid combinations (**Melds**). The game is played over multiple rounds.

- **Winner**: The player with the lowest total score after someone reaches the elimination limit.
- **Elimination**: Players are eliminated when they reach **501 points**.

---

## 1. Setup
- **Players**: 2 to 4 (Single Player vs AI or Online Multiplayer).
- **Decks**: 2 standard decks of 52 cards + 4 Jokers (108 cards total).

### The Deal
- **Starting Player**: Receives **14 cards**.
- **Other Players**: Receive **13 cards**.
- **Discard Pile**: Starts **empty**. (The first player begins the game by discarding a card).

---

## 2. Card Values
Points are used for **Opening** (need 51+ points) and **Scoring Penalties** at the end of a round.

| Card | Value | Notes |
| :--- | :--- | :--- |
| **Joker** | **50** | Wildcard |
| **Ace** | **11** | Counts as 1 if in a low sequence (A-2-3) |
| **Court Cards (K, Q, J)** | **10** | King, Queen, Jack |
| **Pip Cards (2-10)** | **Face Value** | e.g., 7 = 7 pts, 10 = 10 pts |

---

## 3. Valid Melds
You must form cards into valid sets to play them.

### A. Sequences (Runs)
Three or more consecutive cards of the **same suit**.
- **Valid**: `9♥, 10♥, J♥`
- **Ace High**: `Q, K, A` (Ace = 11 pts)
- **Ace Low**: `A, 2, 3` (Ace = 1 pt)
- **Invalid**: `K, A, 2` (No wrapping allowed)

### B. Groups (Sets)
Three or four cards of the **same rank** but **different suits**.
- **Valid**: `8♠, 8♥, 8♣`
- **Invalid**: `8♠, 8♠, 8♥` (Cannot have duplicate suits)

### C. Wildcards (Jokers)
Jokers can substitute for any card.
- **Sequence Rule**: You cannot have two Jokers next to each other.
- **Group Rule**: You must have at least as many natural cards as Jokers (e.g., `8♠, 8♥, Joker` is OK; `8♠, Joker, Joker` is NOT).
- **Repositioning**: A Joker at the start or end of a sequence can be shifted to the other end by clicking it.

---

## 4. Gameplay
Turns proceed clockwise:

1.  **Draw**:
    - Take the top card from the **Stock Pile**.
    - OR take the top card from the **Discard Pile** (ONLY if you immediately use it to meld this turn).

2.  **Meld (Optional)**:
    - Place valid Sequences or Groups face-up on the table.
    - **First Meld ("The Opening")**: Must meet specific criteria (see below).
    - **Adding Off**: Once opened, you can add cards to your own melds or opponents' melds.
    - **Joker Swapping**: If a meld on the table contains a Joker, you may swap it with the natural card it represents from your hand (must be opened).

3.  **Discard**:
    - End your turn by placing one card face-up on the Discard Pile.
    - **Note**: You may discard any card in your hand, including the one you just drew.

---

## 5. The Opening ("Wyłożenie")
To play your FIRST meld of the game, you must meet two strict requirements:

1.  **51 Points**: The total value of the cards you play must be **51 points or more**.
2.  **Qualifying Sequence**: You must play at least one sequence meld whose **natural (non-Joker) cards** include **3 or more consecutive cards**. A Joker may appear in the sequence, but it doesn't count toward the "pure" run of 3 natural cards.

> **Examples**:
> - `10♠, J♠, Q♠` (pure sequence, 30 pts) + `8♦, 8♣, 8♥` (Group, 24 pts) = 54 pts — **VALID** ✅
> - `4♠, 5♠, 6♠, JOKER, 8♠` (naturals 4,5,6 are consecutive) — **VALID** ✅
> - `4♠, JOKER, 6♠, JOKER, 8♠` (naturals 4,6,8 — no 3 consecutive) — **INVALID** ❌

---

## 6. Scoring
- **Winner**: Gets **-10 points**.
- **Remik Bonus**: If a player goes out all at once without having opened previously, they get **-20 points** and opponents' scores for that round are **doubled**.

- **Losers**: Sum of values of cards remaining in hand.
    - **Joker**: 50 pts
    - **Ace**: 11 pts
    - **Others**: Face Value / 10 for court cards.

---

*Verified Polish Rummy Ruleset v1.0.0*