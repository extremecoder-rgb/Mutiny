# ⚓ MUTINY: AI Social Deduction in the Deep

> *"One of you is a synthetic impostor. Find the machine before it fools the crew."*
> 
> *Theme: Multiplayer Everything · Real-time WebSockets · Built for 2–8 Players*

---

## 🌟 Overview

**MUTINY** is a real-time multiplayer social deduction game set 5,000 fathoms beneath the sea. A crew of human players communicate through an encrypted radio channel to resolve submarine emergencies. Hidden among them is an **AI synthetic operative** mimicking their exact phrasing, message length, slang, and grammar.

Can the crew identify the impostor before the machine evades quarantine?

---

## ⚡ Key Features

- **Real-Time Multiplayer:** Built with **Socket.IO** room architecture. Real humans join on phones, laptops, or browser tabs via a 4-letter room code or 1-click shareable link.
- **30-Second Auto-Dive Lobby Countdown:** Once a mission is initialized, an automatic 30-second countdown synchronizes across all players, launching the dive smoothly into calibration (or the host can dive immediately).
- **Dual AI Engine Architecture:**
  - **Live Cloud LLM Support:** Seamlessly integrates with **Groq** (`llama-3.3-70b-versatile`, ~500 tokens/sec), **NVIDIA NIM** (`meta/llama-3.1-70b-instruct`), or **OpenAI** (`gpt-4o-mini`).
  - **Zero-Crash Neural Fallback:** If no API key is provided or offline, a built-in heuristic mimicry engine extracts stylistic features from the human warm-up answers (capitalization, sentence length, emojis, vocabulary) and simulates organic typing delays, human defensiveness, and typos.
- **Atmospheric Visual Production:** Custom naval-cyberpunk assets generated for the submarine deck, command crest, and crew avatars (`Captain Vance`, `Specialist Nova`, `Diver Kai`, and the unmasked `Synthetic Impostor`).
- **Procedural Web Audio Engine:** Self-contained Web Audio API synthesizer for sonar pings, radio static pops, heartbeat suspense loops, alarm glitches, and victory/defeat stingers.
- **Suspicion Meter (Post-Game Telemetry):** At the end of the mission, the AI unmasks its internal tactical reasoning logs, rating each human crew member (0–100%) on how suspicious they appeared.
- **Instant Solo / Demo Mode:** 1-click launch for solo testing and quick judge demos without needing 4 physical devices.

---

## 🚀 Quickstart

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Cloud AI (Optional)
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Add your free **Groq** or **NVIDIA NIM** key:
```env
# Free Groq key: https://console.groq.com/keys
GROQ_API_KEY=gsk_your_groq_key_here

# Or free NVIDIA NIM key: https://build.nvidia.com/
NVIDIA_API_KEY=nvapi-your_nvidia_key_here
```
*(You can also paste your API key directly in the in-game "AI Neural Core Settings" drawer on the landing page!)*

### 3. Launch the Server
```bash
npm start
```
Open **`http://localhost:3000`** in your browser.

---

## 🎮 How to Demo (2-Minute Playthrough)

1. **Host a Mission:**
   - Enter your Operative Callsign and select your Avatar.
   - Click **"CREATE SUB ROOM"** (or **"LAUNCH INSTANT DEMO"** for solo demo).
   - The lobby displays the 4-letter frequency code and starts the **30-second Auto-Dive countdown**.
2. **Invite Crewmates:**
   - Click **"COPY LINK"** and send it to friends or open it in other browser tabs or your mobile phone.
3. **Phase 1: Calibration (Warm-Up):**
   - Each player answers 3 quirky prompt questions. The AI silently analyzes everyone's writing style.
4. **Phase 2: Discussion Rounds:**
   - An emergency crisis strikes Sector 4! The crew debates over encrypted radio.
   - The AI joins the chat organically, complete with typing indicators and natural pauses. Accuse the AI directly to test its human defensiveness!
5. **Phase 3: Secret Voting:**
   - Select the operative you believe is the machine infiltrator.
6. **Phase 4: The Dramatic Reveal:**
   - 3D card flip sequence unmasks the synthetic node.
   - View the vote breakdown and inspect the AI's secret **Suspicion Meter** tactical log!
