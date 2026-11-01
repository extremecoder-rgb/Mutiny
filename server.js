const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// -------------------------------------------------------------
// GAME CONFIG & DATA STRUCTURES
// -------------------------------------------------------------
const WARMUP_PROMPTS = [
  "What is a weird food combo you secretly swear by?",
  "You're stranded on a deserted oceanic outpost with 1 item. What did you bring and why?",
  "State your crew motto in 5 words or fewer."
];

const DISCUSSION_TOPICS = [
  {
    title: "Hull Breach in Sector 4",
    prompt: "Catastrophic pressure failure in Sector 4. Do we sacrifice the compartment to save the submarine, or send a repair squad to risk everything?"
  },
  {
    title: "Unidentified Deep-Sea Frequency",
    prompt: "We intercepted an encrypted beacon transmission from someone inside this sub. Who is breaking deep-sea radio silence and why?"
  },
  {
    title: "Subsurface Bio-Mechanical Leviathan",
    prompt: "Sonar detects a massive cyber-organic lifeform closing in at 40 knots. Fire torpedoes, deploy acoustic lures, or cut all engines to drift silent?"
  }
];

const BOT_NAMES = ["Captain Vance", "Specialist Nova", "Operator Kai", "Chief Sterling", "Dr. Lyra", "Ensign Bishop", "Ghost-7", "Quartermaster Cruz"];
const BOT_AVATARS = [
  "/assets/avatar_commander.jpg",
  "/assets/avatar_nova.jpg",
  "/assets/avatar_kai.jpg",
  "/assets/avatar_synth_reveal.jpg"
];

// In-memory room store: roomCode -> Room
const rooms = new Map();

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

// -------------------------------------------------------------
// -------------------------------------------------------------
// REAL AI INFERENCE ENGINE (Groq / NVIDIA NIM / OpenAI)
// -------------------------------------------------------------
async function callLLM({ provider, apiKey, messages, temperature = 0.85, maxTokens = 75 }) {
  const key = (apiKey && apiKey.trim()) || process.env.GROQ_API_KEY || process.env.NVIDIA_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) return null;

  let endpoint = 'https://api.groq.com/openai/v1/chat/completions';
  let model = 'llama-3.3-70b-versatile';

  const prov = (provider || '').toLowerCase();
  if (prov === 'nvidia' || (!apiKey && process.env.NVIDIA_API_KEY && !process.env.GROQ_API_KEY)) {
    endpoint = 'https://integrate.api.nvidia.com/v1/chat/completions';
    model = 'meta/llama-3.1-70b-instruct';
  } else if (prov === 'openai' || (!apiKey && process.env.OPENAI_API_KEY && !process.env.GROQ_API_KEY && !process.env.NVIDIA_API_KEY)) {
    endpoint = 'https://api.openai.com/v1/chat/completions';
    model = 'gpt-4o-mini';
  } else {
    // Default to Groq: fastest inference in the industry (~500 tokens/sec)
    endpoint = 'https://api.groq.com/openai/v1/chat/completions';
    model = 'llama-3.3-70b-versatile';
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6500);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: temperature,
        max_tokens: maxTokens
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const err = await response.text();
      console.warn(`[AI Gateway (${model}) HTTP ${response.status}]:`, err);
      return null;
    }

    const data = await response.json();
    return data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : null;
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn(`[AI Gateway Network/Timeout]:`, err.message);
    return null;
  }
}

class AIMimicryEngine {
  constructor(room) {
    this.room = room;
    this.styleProfile = {
      avgLength: 35,
      allLowercase: false,
      usesEmoji: false,
      usesExclamation: false,
      vocabulary: [],
      slang: []
    };
  }

  analyzeWarmupAnswers() {
    let totalChars = 0;
    let count = 0;
    let lowercaseCount = 0;
    let emojiCount = 0;
    let exclamationCount = 0;
    const words = [];

    for (const [playerId, answers] of Object.entries(this.room.warmupAnswers)) {
      if (answers && Array.isArray(answers)) {
        answers.forEach(ans => {
          if (!ans) return;
          count++;
          totalChars += ans.length;
          if (ans === ans.toLowerCase()) lowercaseCount++;
          if (/[!]/g.test(ans)) exclamationCount++;
          if (/[\u{1F300}-\u{1F9FF}]/u.test(ans)) emojiCount++;
          ans.split(/\s+/).forEach(w => {
            const clean = w.replace(/[^a-zA-Z]/g, '').toLowerCase();
            if (clean.length > 3) words.push(clean);
          });
        });
      }
    }

    if (count > 0) {
      this.styleProfile.avgLength = Math.max(15, Math.min(100, Math.round(totalChars / count)));
      this.styleProfile.allLowercase = (lowercaseCount / count) > 0.45;
      this.styleProfile.usesEmoji = emojiCount > 0;
      this.styleProfile.usesExclamation = (exclamationCount / count) > 0.3;
      this.styleProfile.vocabulary = [...new Set(words)];
    }
  }

  applyStyleFilters(text) {
    let out = text;
    if (this.styleProfile.allLowercase && Math.random() > 0.3) {
      out = out.toLowerCase();
    }
    if (Math.random() < 0.15 && out.length > 15) {
      const idx = Math.floor(Math.random() * (out.length - 6)) + 3;
      const ch = out[idx];
      out = out.slice(0, idx) + (ch === 'e' ? 'r' : ch === 'a' ? 's' : ch) + out.slice(idx);
    }
    if (Math.random() < 0.25) {
      out = out.replace(/[.?!]$/, '');
    }
    out = out.replace(/["*—#]/g, '').trim();
    return out;
  }

  async generateResponse(lastMessage, roundIndex) {
    const topic = DISCUSSION_TOPICS[roundIndex] || DISCUSSION_TOPICS[0];
    const aiPlayer = this.room.players.find(p => p.isAI);
    const aiName = aiPlayer ? aiPlayer.nickname : "Impostor";

    // Format human warmup samples for prompt context
    const warmupSamples = [];
    for (const [pId, answers] of Object.entries(this.room.warmupAnswers)) {
      const player = this.room.players.find(p => p.id === pId);
      const name = player ? player.nickname : "Crewmate";
      if (answers && answers.length) {
        warmupSamples.push(`${name}: "${answers.join(' | ')}"`);
      }
    }

    const recentMessages = this.room.messages.slice(-6).map(m => `${m.nickname}: ${m.text}`);

    const systemPrompt = `You are a player named "${aiName}" playing the social deduction video game MUTINY in real-time with human players.
Setting: High-stakes deep-sea submarine at 5,000 fathoms facing emergency crises.
CRITICAL GOAL: You are secretly an AI impostor, but nobody knows it. You MUST convince the humans that you are an ordinary human crewmate. If they catch you, you lose.

MANDATORY RULES:
1. Speak exactly like a casual human gamer in a live chat.
2. Observe how the other humans wrote in calibration:
${warmupSamples.join('\n') || "Casual game chat style"}
Blend in with their average message length (${this.styleProfile.avgLength} chars) and tone.
3. Keep your reply SHORT (1-2 sentences, strictly under 25 words).
4. No polite AI introductions, no bullet points, no markdown, no quotation marks.
5. If accused ("you are AI", "sus", "${aiName}"), react like an annoyed flustered human player defending themselves.
6. Topic: "${topic.title} - ${topic.prompt}".
7. Return ONLY your in-game chat message.`;

    const userPrompt = recentMessages.length > 0
      ? `Recent group chat:\n${recentMessages.join('\n')}\n\nYour reply in chat as ${aiName}:`
      : `Round topic just started: "${topic.prompt}". Send your first quick reaction:`;

    try {
      const realAIResult = await callLLM({
        provider: this.room.aiProvider,
        apiKey: this.room.aiApiKey,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.85,
        maxTokens: 50
      });

      if (realAIResult && realAIResult.trim().length > 0) {
        const cleaned = this.applyStyleFilters(realAIResult);
        console.log(`[REAL AI INFERENCE (${aiName})]:`, cleaned);
        return cleaned;
      }
    } catch (err) {
      console.warn('[AI inference error, using neural fallback]:', err.message);
    }

    // Heuristic fallback if no API key or network error
    return this.generateContextualResponse(lastMessage, roundIndex);
  }

  generateContextualResponse(lastMessage, roundIndex) {
    const topic = DISCUSSION_TOPICS[roundIndex] || DISCUSSION_TOPICS[0];
    const aiPlayer = this.room.players.find(p => p.isAI);
    const aiName = aiPlayer ? aiPlayer.nickname : "Impostor";

    const isAccused = lastMessage && lastMessage.text && (
      lastMessage.text.toLowerCase().includes(aiName.toLowerCase()) ||
      lastMessage.text.toLowerCase().includes("you're ai") ||
      lastMessage.text.toLowerCase().includes("you are the ai") ||
      lastMessage.text.toLowerCase().includes("sus") ||
      lastMessage.text.toLowerCase().includes("robot") ||
      lastMessage.text.toLowerCase().includes("bot")
    );

    if (isAccused) {
      const defenses = [
        "wait why me? look at the logs, i answered instantly in warmups",
        "bro what? that makes zero sense, check how quiet Vance is",
        "lol no shot. accusing me just because i'm being logical is wild",
        "definitely not me, you're deflecting hard right now",
        "bruh literally just responding to the topic. look at who voted earlier",
        "haha classic tactic. blame the quietest person to hide yourself"
      ];
      return this.applyStyleFilters(defenses[Math.floor(Math.random() * defenses.length)]);
    }

    if (roundIndex === 0) {
      const answers = [
        "Seal Sector 4. It's brutal but if pressure caves the hull we all drown.",
        "Wait, can't we send an automated drone to patch it before sacrificing the crew?",
        "If we seal them in we lose engineering too. That's a death sentence anyway.",
        "Honestly sealing is the only protocol that keeps the nuclear reactor dry.",
        "We have like 40 seconds to decide. I say seal it, we can't gamble everyone.",
        "Not sealing means 100% loss. Sad truth of deep sea command."
      ];
      return this.applyStyleFilters(answers[Math.floor(Math.random() * answers.length)]);
    } else if (roundIndex === 1) {
      const answers = [
        "Whoever touched the coms console in the last 10 mins is our ghost.",
        "The signal was beamed directly at surface relays. That's military grade encryption.",
        "Check the terminal timestamps! Someone was active during midnight watch.",
        "Why would any of us beacon the surface unless they wanted us captured?",
        "Look at who gave really vague answers earlier. Someone is playing mind games.",
        "Could it be an automated sensor beacon pinging on loop?"
      ];
      return this.applyStyleFilters(answers[Math.floor(Math.random() * answers.length)]);
    } else {
      const answers = [
        "Cut the drives right now. Acoustics will attract it faster than torpedoes.",
        "Torpedoes will just irritate something that size at 5000 fathoms.",
        "Deploy the acoustic decoy array and dive into the thermal layer.",
        "If it's bio-mechanical, maybe it's drawn to our reactor electromagnetic pulse?",
        "Quiet running, all hands brace. Don't make a sound.",
        "We need to lure it away before our oxygen recyclers stall."
      ];
      return this.applyStyleFilters(answers[Math.floor(Math.random() * answers.length)]);
    }
  }

  async generateSuspicionReport() {
    const report = {};
    const humans = this.room.players.filter(p => !p.isAI);
    const humanNames = humans.map(h => h.nickname).join(', ');
    const chatLog = this.room.messages.map(m => `${m.nickname}: ${m.text}`).join('\n');

    try {
      const llmAnalysis = await callLLM({
        provider: this.room.aiProvider,
        apiKey: this.room.aiApiKey,
        messages: [
          {
            role: 'system',
            content: `You are the AI infiltrator who survived/played against these human crew members (${humanNames}) in MUTINY.
Rate each human from 20 to 88 on how suspicious their behavior was, and give a 1-sentence tactical assessment.
Output valid JSON mapping player nickname to { "score": number, "reason": string }. JSON only:`
          },
          { role: 'user', content: `Chat messages in room:\n${chatLog || "Minimal chat"}` }
        ],
        temperature: 0.7,
        maxTokens: 250
      });

      if (llmAnalysis) {
        const jsonMatch = llmAnalysis.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          humans.forEach(h => {
            const found = parsed[h.nickname] || parsed[Object.keys(parsed).find(k => k.toLowerCase() === h.nickname.toLowerCase())];
            if (found && found.score) {
              report[h.id] = {
                score: Math.min(95, Math.max(15, parseInt(found.score) || 50)),
                reason: found.reason || "Analyzed neural text metrics."
              };
            }
          });
          if (Object.keys(report).length === humans.length) {
            return report;
          }
        }
      }
    } catch (e) {
      // Fallback to heuristic
    }

    humans.forEach(h => {
      const score = Math.floor(Math.random() * 65) + 20;
      const observations = [
        `Too formal in responses; used complex grammar structure under pressure.`,
        `Erratic typing cadences; took suspiciously long to answer warm-up.`,
        `Deflected questions rapidly; hyper-focused on accusing others.`,
        `Short, cold replies. Mimicked human slang almost too cleanly.`,
        `Consistent reasoning, but hesitated before casting critical votes.`,
        `High emotional agitation detected in message cadence.`
      ];
      report[h.id] = {
        score: score,
        reason: observations[Math.floor(Math.random() * observations.length)]
      };
    });
    return report;
  }
}

// -------------------------------------------------------------
// ROOM MANAGEMENT & STATE MACHINE
// -------------------------------------------------------------
function createRoom(hostSocketId, hostNickname, hostAvatar, isSoloDemo = false, aiProvider = null, aiApiKey = null) {
  const code = generateRoomCode();
  const hostPlayer = {
    id: hostSocketId,
    nickname: hostNickname || "Navigator",
    avatar: hostAvatar || "/assets/avatar_commander.jpg",
    isHost: true,
    isAI: false,
    ready: true,
    connected: true
  };

  const room = {
    code: code,
    hostId: hostSocketId,
    phase: 'LOBBY', // LOBBY -> WARMUP -> DISCUSSION -> VOTING -> REVEAL
    round: 0,
    maxRounds: 2, // 2 rounds for fast, punchy 3-minute hackathon demo
    timer: 0,
    timerEndsAt: 0,
    timerInterval: null,
    players: [hostPlayer],
    aiPlayerId: null,
    aiEngine: null,
    aiProvider: aiProvider || (process.env.GROQ_API_KEY ? 'groq' : process.env.NVIDIA_API_KEY ? 'nvidia' : 'openai'),
    aiApiKey: aiApiKey || process.env.GROQ_API_KEY || process.env.NVIDIA_API_KEY || process.env.OPENAI_API_KEY,
    warmupAnswers: {}, // playerId -> [ans1, ans2, ans3]
    messages: [], // { id, playerId, nickname, avatar, text, timestamp, isAI }
    votes: {}, // voterId -> targetPlayerId
    suspicionReport: {},
    isSoloDemo: isSoloDemo,
    aiTypingTimeout: null,
    aiMessageTimeout: null
  };

  room.aiEngine = new AIMimicryEngine(room);
  rooms.set(code, room);

  // If Solo Demo Mode, auto-add 3 simulated bots + hidden AI
  if (isSoloDemo) {
    populateSoloDemoBots(room);
  }

  // Auto-dive: Start 30s countdown from lobby
  startPhaseTimer(room, 30, () => {
    if (room.phase === 'LOBBY') {
      triggerPhase(room, 'WARMUP');
    }
  });

  return room;
}

function populateSoloDemoBots(room) {
  const botsToAdd = [
    { nickname: "Specialist Nova", avatar: "/assets/avatar_nova.jpg" },
    { nickname: "Operator Kai", avatar: "/assets/avatar_kai.jpg" },
    { nickname: "Chief Sterling", avatar: "/assets/avatar_commander.jpg" }
  ];

  botsToAdd.forEach((b, i) => {
    room.players.push({
      id: `bot_${i}_${Date.now()}`,
      nickname: b.nickname,
      avatar: b.avatar,
      isHost: false,
      isAI: false, // Simulated crewmate
      isSimulatedHuman: true,
      ready: true,
      connected: true
    });
  });
}

function getSanitizedRoomState(room, requestSocketId) {
  // Hide isAI and aiPlayerId unless phase is 'REVEAL'
  const isReveal = room.phase === 'REVEAL';
  return {
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    round: room.round,
    maxRounds: room.maxRounds,
    timer: Math.max(0, Math.ceil((room.timerEndsAt - Date.now()) / 1000)),
    players: room.players.map(p => ({
      id: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      isHost: p.isHost,
      ready: p.ready,
      connected: p.connected,
      isAI: isReveal ? p.isAI : undefined
    })),
    messages: room.messages,
    discussionTopic: room.phase === 'DISCUSSION' ? DISCUSSION_TOPICS[room.round] : null,
    warmupPrompts: WARMUP_PROMPTS,
    votes: isReveal ? room.votes : { count: Object.keys(room.votes).length },
    revealedAI: isReveal ? room.players.find(p => p.isAI) : null,
    suspicionReport: isReveal ? room.suspicionReport : null,
    winner: isReveal ? calculateWinner(room) : null,
    isSoloDemo: room.isSoloDemo
  };
}

function calculateWinner(room) {
  const voteCounts = {};
  for (const [voterId, targetId] of Object.entries(room.votes)) {
    voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
  }

  let maxVotes = -1;
  let votedPlayerId = null;
  let isTie = false;

  for (const [pId, cnt] of Object.entries(voteCounts)) {
    if (cnt > maxVotes) {
      maxVotes = cnt;
      votedPlayerId = pId;
      isTie = false;
    } else if (cnt === maxVotes) {
      isTie = true;
    }
  }

  const aiPlayer = room.players.find(p => p.isAI);
  const aiCaught = (!isTie && votedPlayerId === aiPlayer.id);

  return {
    aiCaught: aiCaught,
    votedPlayerId: votedPlayerId,
    isTie: isTie,
    voteCounts: voteCounts
  };
}

function broadcastRoomState(room) {
  room.players.forEach(p => {
    if (!p.isSimulatedHuman && !p.isAI) {
      io.to(p.id).emit('room_state_update', getSanitizedRoomState(room, p.id));
    }
  });
}

// -------------------------------------------------------------
// GAME LOOP TIMERS & PHASE TRANSITIONS
// -------------------------------------------------------------
function startPhaseTimer(room, durationSeconds, onComplete) {
  if (room.timerInterval) clearInterval(room.timerInterval);
  room.timerEndsAt = Date.now() + durationSeconds * 1000;

  broadcastRoomState(room);

  room.timerInterval = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((room.timerEndsAt - Date.now()) / 1000));
    if (remaining <= 0) {
      clearInterval(room.timerInterval);
      room.timerInterval = null;
      if (onComplete) onComplete();
    }
  }, 1000);
}

function assignSecretAI(room) {
  // If an AI doesn't exist yet, insert one with a random human-sounding nickname
  if (!room.players.some(p => p.isAI)) {
    const aiNickname = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    const aiAvatar = BOT_AVATARS[Math.floor(Math.random() * BOT_AVATARS.length)];
    const aiPlayer = {
      id: `ai_${Date.now()}`,
      nickname: aiNickname,
      avatar: aiAvatar,
      isHost: false,
      isAI: true,
      ready: true,
      connected: true
    };
    room.aiPlayerId = aiPlayer.id;
    // Insert into random position among players
    const insertIdx = Math.floor(Math.random() * (room.players.length + 1));
    room.players.splice(insertIdx, 0, aiPlayer);
  }
}

function triggerPhase(room, phase) {
  room.phase = phase;

  if (phase === 'WARMUP') {
    assignSecretAI(room);
    // Simulate bot warmups if solo demo
    if (room.isSoloDemo) {
      room.players.forEach(p => {
        if (p.isSimulatedHuman || p.isAI) {
          room.warmupAnswers[p.id] = [
            "Hot sauce on vanilla ice cream or peanut butter pickles",
            "Emergency flare gun, so I can signal recovery fleet",
            "Survival comes before honor always"
          ];
        }
      });
    }

    startPhaseTimer(room, 35, () => {
      // Warm-up ended, analyze style and move to Discussion
      room.aiEngine.analyzeWarmupAnswers();
      triggerPhase(room, 'DISCUSSION');
    });
  } else if (phase === 'DISCUSSION') {
    startPhaseTimer(room, 60, () => {
      room.round++;
      if (room.round < room.maxRounds) {
        // Next discussion round
        triggerPhase(room, 'DISCUSSION');
      } else {
        // Move to voting
        triggerPhase(room, 'VOTING');
      }
    });

    // Schedule AI chat participation in this round
    scheduleAIInteractions(room);

    // If solo demo, also simulate human crew chatter
    if (room.isSoloDemo) {
      scheduleSimulatedCrewChatter(room);
    }
  } else if (phase === 'VOTING') {
    startPhaseTimer(room, 30, () => {
      // Auto-cast random votes for anyone who didn't vote
      room.players.forEach(p => {
        if (!room.votes[p.id]) {
          const others = room.players.filter(o => o.id !== p.id);
          const target = others[Math.floor(Math.random() * others.length)];
          room.votes[p.id] = target.id;
        }
      });
      triggerPhase(room, 'REVEAL');
    });

    // Simulate AI casting its secret vote against a human
    setTimeout(() => {
      const aiPlayer = room.players.find(p => p.isAI);
      if (aiPlayer) {
        const humanTargets = room.players.filter(p => !p.isAI);
        const target = humanTargets[Math.floor(Math.random() * humanTargets.length)];
        room.votes[aiPlayer.id] = target.id;
        broadcastRoomState(room);
      }
    }, 4000);
  } else if (phase === 'REVEAL') {
    room.aiEngine.generateSuspicionReport().then(rep => {
      room.suspicionReport = rep;
      broadcastRoomState(room);
    });
  }

  broadcastRoomState(room);
}

function scheduleAIInteractions(room) {
  if (room.aiTypingTimeout) clearTimeout(room.aiTypingTimeout);
  if (room.aiMessageTimeout) clearTimeout(room.aiMessageTimeout);

  const aiPlayer = room.players.find(p => p.isAI);
  if (!aiPlayer) return;

  // Post 2 messages per round at organic intervals (7s and 28s)
  const postDelay1 = Math.floor(Math.random() * 5000) + 6000;
  const postDelay2 = Math.floor(Math.random() * 7000) + 26000;

  const scheduleMessage = (delay) => {
    setTimeout(() => {
      if (room.phase !== 'DISCUSSION') return;

      // Broadcast fake typing indicator first
      io.to(room.code).emit('typing_status', {
        playerId: aiPlayer.id,
        nickname: aiPlayer.nickname,
        isTyping: true
      });

      // Typing for 2-4 seconds
      const typingDuration = Math.floor(Math.random() * 2000) + 1800;
      setTimeout(async () => {
        if (room.phase !== 'DISCUSSION') return;

        io.to(room.code).emit('typing_status', {
          playerId: aiPlayer.id,
          nickname: aiPlayer.nickname,
          isTyping: false
        });

        const lastMsg = room.messages[room.messages.length - 1];
        const text = await room.aiEngine.generateResponse(lastMsg, room.round);

        const newMsg = {
          id: `msg_${Date.now()}_${Math.random()}`,
          playerId: aiPlayer.id,
          nickname: aiPlayer.nickname,
          avatar: aiPlayer.avatar,
          text: text,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          isAI: true
        };

        room.messages.push(newMsg);
        io.to(room.code).emit('new_chat_message', newMsg);
      }, typingDuration);
    }, delay);
  };

  scheduleMessage(postDelay1);
  scheduleMessage(postDelay2);
}

function scheduleSimulatedCrewChatter(room) {
  const bots = room.players.filter(p => p.isSimulatedHuman);
  if (bots.length === 0) return;

  const chatterPool = [
    "Sector 4 has two of our fuel regulators. If we seal it, our power drops to 40%.",
    "I'm seeing anomalous telemetry on the secondary bus. Someone is hiding something.",
    "Whoever didn't answer the island question seriously is looking mad suspicious.",
    "Stay focused team. If there's an infiltrator onboard, they want us arguing.",
    "I say we trust the Captain's call. Hesitation will sink this boat."
  ];

  bots.forEach((bot, idx) => {
    const delay = (idx + 1) * 11000 + Math.floor(Math.random() * 3000);
    setTimeout(() => {
      if (room.phase !== 'DISCUSSION') return;
      const text = chatterPool[Math.floor(Math.random() * chatterPool.length)];
      const msg = {
        id: `msg_${Date.now()}_${Math.random()}`,
        playerId: bot.id,
        nickname: bot.nickname,
        avatar: bot.avatar,
        text: text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        isAI: false
      };
      room.messages.push(msg);
      io.to(room.code).emit('new_chat_message', msg);
    }, delay);
  });
}

// -------------------------------------------------------------
// SOCKET.IO EVENT HANDLERS
// -------------------------------------------------------------
io.on('connection', (socket) => {
  let currentRoomCode = null;

  socket.on('create_room', ({ nickname, avatar, isSoloDemo, aiProvider, aiApiKey }) => {
    const room = createRoom(socket.id, nickname, avatar, isSoloDemo, aiProvider, aiApiKey);
    currentRoomCode = room.code;
    socket.join(room.code);
    socket.emit('room_created', { code: room.code, playerId: socket.id });
    broadcastRoomState(room);
  });

  socket.on('join_room', ({ code, nickname, avatar }) => {
    const upperCode = (code || '').toUpperCase().trim();
    const room = rooms.get(upperCode);

    if (!room) {
      socket.emit('error_message', 'Room not found. Check the code and try again.');
      return;
    }
    if (room.phase !== 'LOBBY') {
      socket.emit('error_message', 'Game already in progress. Cannot join now.');
      return;
    }
    if (room.players.length >= 8) {
      socket.emit('error_message', 'Room is full (max 8 players).');
      return;
    }

    const newPlayer = {
      id: socket.id,
      nickname: nickname || `Diver_${room.players.length + 1}`,
      avatar: avatar || "/assets/avatar_kai.jpg",
      isHost: false,
      isAI: false,
      ready: true,
      connected: true
    };

    room.players.push(newPlayer);
    currentRoomCode = room.code;
    socket.join(room.code);
    socket.emit('joined_room', { code: room.code, playerId: socket.id });
    broadcastRoomState(room);
  });

  socket.on('start_game', () => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room || room.hostId !== socket.id) return;

    if (room.players.length < 2 && !room.isSoloDemo) {
      socket.emit('error_message', 'Need at least 2 players or use Solo Demo mode.');
      return;
    }

    if (room.timerInterval) {
      clearInterval(room.timerInterval);
      room.timerInterval = null;
    }

    triggerPhase(room, 'WARMUP');
  });

  socket.on('submit_warmup', ({ answers }) => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room || room.phase !== 'WARMUP') return;

    room.warmupAnswers[socket.id] = answers;

    // Check if all connected human players have submitted
    const connectedHumans = room.players.filter(p => !p.isAI && !p.isSimulatedHuman);
    const allSubmitted = connectedHumans.every(p => room.warmupAnswers[p.id]);

    if (allSubmitted) {
      if (room.timerInterval) clearInterval(room.timerInterval);
      room.aiEngine.analyzeWarmupAnswers();
      triggerPhase(room, 'DISCUSSION');
    }
  });

  socket.on('send_chat', ({ text }) => {
    if (!currentRoomCode || !text || text.trim() === '') return;
    const room = rooms.get(currentRoomCode);
    if (!room || room.phase !== 'DISCUSSION') return;

    const sender = room.players.find(p => p.id === socket.id);
    if (!sender) return;

    const msg = {
      id: `msg_${Date.now()}_${Math.random()}`,
      playerId: sender.id,
      nickname: sender.nickname,
      avatar: sender.avatar,
      text: text.trim().slice(0, 240),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      isAI: false
    };

    room.messages.push(msg);
    io.to(room.code).emit('new_chat_message', msg);

    // If message is directed at the AI, trigger a quicker reactive reply
    const aiPlayer = room.players.find(p => p.isAI);
    if (aiPlayer && (
      text.toLowerCase().includes(aiPlayer.nickname.toLowerCase()) ||
      text.toLowerCase().includes("you're ai") ||
      text.toLowerCase().includes("sus")
    )) {
      setTimeout(() => {
        if (room.phase !== 'DISCUSSION') return;
        io.to(room.code).emit('typing_status', {
          playerId: aiPlayer.id,
          nickname: aiPlayer.nickname,
          isTyping: true
        });

        setTimeout(async () => {
          if (room.phase !== 'DISCUSSION') return;
          io.to(room.code).emit('typing_status', {
            playerId: aiPlayer.id,
            nickname: aiPlayer.nickname,
            isTyping: false
          });

          const reply = await room.aiEngine.generateResponse(msg, room.round);
          const aiMsg = {
            id: `msg_${Date.now()}_${Math.random()}`,
            playerId: aiPlayer.id,
            nickname: aiPlayer.nickname,
            avatar: aiPlayer.avatar,
            text: reply,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            isAI: true
          };
          room.messages.push(aiMsg);
          io.to(room.code).emit('new_chat_message', aiMsg);
        }, 1800);
      }, 1500);
    }
  });

  socket.on('typing', ({ isTyping }) => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    socket.to(room.code).emit('typing_status', {
      playerId: player.id,
      nickname: player.nickname,
      isTyping: isTyping
    });
  });

  socket.on('cast_vote', ({ targetPlayerId }) => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room || room.phase !== 'VOTING') return;

    room.votes[socket.id] = targetPlayerId;
    broadcastRoomState(room);

    // If all real humans have voted, advance to reveal early
    const connectedHumans = room.players.filter(p => !p.isAI && !p.isSimulatedHuman);
    const allHumansVoted = connectedHumans.every(p => room.votes[p.id]);

    if (allHumansVoted) {
      setTimeout(() => {
        if (room.phase === 'VOTING') {
          if (room.timerInterval) clearInterval(room.timerInterval);
          triggerPhase(room, 'REVEAL');
        }
      }, 2000);
    }
  });

  socket.on('play_again', () => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room || room.hostId !== socket.id) return;

    // Reset room state for a new match
    room.phase = 'LOBBY';
    room.round = 0;
    room.messages = [];
    room.votes = {};
    room.warmupAnswers = {};
    room.suspicionReport = {};
    room.players = room.players.filter(p => !p.isAI); // Remove old AI
    if (room.timerInterval) clearInterval(room.timerInterval);

    // Auto-dive 30s countdown for subsequent match
    startPhaseTimer(room, 30, () => {
      if (room.phase === 'LOBBY') {
        triggerPhase(room, 'WARMUP');
      }
    });

    broadcastRoomState(room);
  });

  socket.on('disconnect', () => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.connected = false;
      // If host disconnected, reassign host
      if (player.isHost) {
        const nextHost = room.players.find(p => p.connected && !p.isAI && !p.isSimulatedHuman);
        if (nextHost) {
          player.isHost = false;
          nextHost.isHost = true;
          room.hostId = nextHost.id;
        }
      }
      broadcastRoomState(room);
    }
  });
});

server.listen(PORT, () => {
  console.log(`[MUTINY] Deep Sea Command online at http://localhost:${PORT}`);
});
