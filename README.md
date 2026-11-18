# 🐭 Zodiac Tower 🚀

**▶ Play now: [https://meetrick.github.io/zodiac-tower/](https://meetrick.github.io/zodiac-tower/)**

A one-button animal stacking game where you pile up the 12 Zodiac animals (🐭🐮🐯🐰🐲🐍🐴🐑🐵🐔🐶🐷) from the meadow, through the sunset, and into the stars.
Made for kids to play in portrait mode on a phone with a single tap.

## How to play

- Watch the animal block slide left and right, then **tap the screen** to drop it.
- Land on the center of the block below for a **Perfect!** — the wobbling tower steadies.
- Stack off-center and the tower leans. Lean too far and it all comes crashing down.
- Floors 1–50 are the meadow, 51–120 are sunset, and 121+ are space. The higher you go, the faster it gets.

## Difficulty modes

- **🐣 Toddling Stroll** — Beginner pace
- **🐯 Zooming Dash** — Faster blocks, tighter Perfects
- **🔥 Fire Hell** — Maximum speed

## Global ranking (Firebase Realtime Database)

Each difficulty has its own global leaderboard. After a run you can submit a name, see your rank, and open the top 20 board from the 🏆 button.

### Setup

1. Open the [Firebase Console](https://console.firebase.google.com/), create a project, then **Build → Realtime Database → Create database**. Asia (Singapore) is a good region. Any starting mode is fine.
2. Copy the database URL (example: `https://PROJECT-ID-default-rtdb.asia-southeast1.firebasedatabase.app`).
3. Open the **Rules** tab, paste the contents of `database.rules.json`, and publish.
4. Put that URL into `script.js`:

```js
const RANK_DB_URL = 'https://PROJECT-ID-default-rtdb.asia-southeast1.firebasedatabase.app';
```

Rules summary:

- Anyone can **read** scores under `/tower/{easy|expert|hell}`.
- Anyone can **add** a new score (`POST`), but cannot edit or delete existing ones.
- Only `easy` / `expert` / `hell` mode paths are allowed.
- Each record must include `name` (1–10 chars), `score` (0–100000), `mode` (must match the path), and `ts`.
- Scores are indexed by `score` for top-N queries.

This is the same client-side submit pattern as Stick Brawl: convenient for friends and family, but determined players can still post fake scores because there is no auth server.

Name search is intentionally **not** included. Realtime Database has no substring search, so a real search would mean downloading large chunks of data or adding Cloud Functions / an external search index. For this game, top 20 + “my rank” after submit is enough.

## Local run

```bash
python3 -m http.server 8000
# open http://localhost:8000
```
