// Mutiny Client Application
// Event-driven Game Controller, Realtime Socket.IO Sync, and Game Feel

(function () {
  const socket = io();

  // Local State
  let myPlayerId = null;
  let currentRoomCode = null;
  let currentPhase = 'LOBBY';
  let myVoteId = null;
  let selectedAvatar = '/assets/avatar_commander.jpg';
  let isMuted = false;
  let typingTimeout = null;

  // DOM Elements
  const panels = {
    landing: document.getElementById('panelLanding'),
    lobby: document.getElementById('panelLobby'),
    warmup: document.getElementById('panelWarmup'),
    discussion: document.getElementById('panelDiscussion'),
    voting: document.getElementById('panelVoting'),
    reveal: document.getElementById('panelReveal')
  };

  const hud = {
    roomTag: document.getElementById('hudRoomTag'),
    roomCode: document.getElementById('hudRoomCode'),
    timer: document.getElementById('hudTimer'),
    timerText: document.getElementById('hudTimerText'),
    audioBtn: document.getElementById('btnAudioToggle')
  };

  // Avatar Selection
  const avatarOptions = document.querySelectorAll('.avatar-option');
  avatarOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      avatarOptions.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      selectedAvatar = opt.getAttribute('data-avatar');
      window.soundEngine.playTypingTick();
    });
  });

  // Sound Toggle
  hud.audioBtn.addEventListener('click', () => {
    isMuted = !window.soundEngine.toggleSound();
    hud.audioBtn.textContent = isMuted ? '🔇' : '🔊';
    hud.audioBtn.title = isMuted ? 'Unmute Sound' : 'Mute Sound';
  });

  // Check URL query parameters for ?room=ABCD
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam) {
    const inputRoom = document.getElementById('inputRoomCode');
    if (inputRoom) inputRoom.value = roomParam.toUpperCase();
  }

  // Restore cached settings
  const cachedName = localStorage.getItem('mutiny_nickname');
  if (cachedName) {
    const inputNick = document.getElementById('inputNickname');
    if (inputNick) inputNick.value = cachedName;
  }
  const cachedProvider = localStorage.getItem('mutiny_ai_provider');
  if (cachedProvider) {
    const sel = document.getElementById('selectAIProvider');
    if (sel) sel.value = cachedProvider;
  }
  const cachedKey = localStorage.getItem('mutiny_ai_key');
  if (cachedKey) {
    const keyInput = document.getElementById('inputAIApiKey');
    if (keyInput) keyInput.value = cachedKey;
  }

  function getPlayerSetup() {
    const nicknameInput = document.getElementById('inputNickname');
    const nickname = (nicknameInput.value.trim() || 'Operative').slice(0, 15);
    localStorage.setItem('mutiny_nickname', nickname);

    const providerEl = document.getElementById('selectAIProvider');
    const keyEl = document.getElementById('inputAIApiKey');
    const aiProvider = providerEl ? providerEl.value : 'groq';
    const aiApiKey = keyEl ? keyEl.value.trim() : '';

    if (providerEl) localStorage.setItem('mutiny_ai_provider', aiProvider);
    if (keyEl && aiApiKey) localStorage.setItem('mutiny_ai_key', aiApiKey);

    return { nickname, avatar: selectedAvatar, aiProvider, aiApiKey };
  }

  function showToast(message) {
    const existing = document.querySelector('.toast-msg');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.4s';
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  }

  function switchPanel(phaseName) {
    Object.values(panels).forEach(p => p.classList.remove('active'));
    currentPhase = phaseName;

    if (phaseName === 'LOBBY') {
      panels.lobby.classList.add('active');
      hud.roomTag.style.display = 'flex';
      hud.timer.style.display = 'none';
      window.soundEngine.stopHeartbeatLoop();
    } else if (phaseName === 'WARMUP') {
      panels.warmup.classList.add('active');
      hud.timer.style.display = 'flex';
      window.soundEngine.playRoundAlert();
      window.soundEngine.stopHeartbeatLoop();
    } else if (phaseName === 'DISCUSSION') {
      panels.discussion.classList.add('active');
      hud.timer.style.display = 'flex';
      window.soundEngine.playRoundAlert();
      window.soundEngine.stopHeartbeatLoop();
      setTimeout(() => {
        const chatInput = document.getElementById('chatInput');
        if (chatInput) chatInput.focus();
      }, 200);
    } else if (phaseName === 'VOTING') {
      panels.voting.classList.add('active');
      hud.timer.style.display = 'flex';
      window.soundEngine.playRoundAlert();
      window.soundEngine.startHeartbeatLoop(76);
    } else if (phaseName === 'REVEAL') {
      panels.reveal.classList.add('active');
      hud.timer.style.display = 'none';
      window.soundEngine.stopHeartbeatLoop();
    } else {
      panels.landing.classList.add('active');
      hud.roomTag.style.display = 'none';
      hud.timer.style.display = 'none';
      window.soundEngine.stopHeartbeatLoop();
    }
  }

  // -------------------------------------------------------------
  // LANDING BUTTONS
  // -------------------------------------------------------------
  document.getElementById('btnCreateRoom').addEventListener('click', () => {
    window.soundEngine.playSonarPing();
    const setup = getPlayerSetup();
    socket.emit('create_room', {
      nickname: setup.nickname,
      avatar: setup.avatar,
      isSoloDemo: false,
      aiProvider: setup.aiProvider,
      aiApiKey: setup.aiApiKey
    });
  });

  document.getElementById('btnJoinRoom').addEventListener('click', () => {
    window.soundEngine.playSonarPing();
    const setup = getPlayerSetup();
    const code = document.getElementById('inputRoomCode').value.trim();
    if (!code) {
      showToast('Please enter a 4-letter room code.');
      return;
    }
    socket.emit('join_room', {
      code: code,
      nickname: setup.nickname,
      avatar: setup.avatar
    });
  });

  document.getElementById('btnSoloDemo').addEventListener('click', () => {
    window.soundEngine.playSonarPing();
    const setup = getPlayerSetup();
    socket.emit('create_room', {
      nickname: setup.nickname,
      avatar: setup.avatar,
      isSoloDemo: true,
      aiProvider: setup.aiProvider,
      aiApiKey: setup.aiApiKey
    });
  });

  // -------------------------------------------------------------
  // LOBBY CONTROLS
  // -------------------------------------------------------------
  document.getElementById('btnCopyCode').addEventListener('click', () => {
    if (currentRoomCode) {
      navigator.clipboard.writeText(currentRoomCode);
      window.soundEngine.playTypingTick();
      showToast(`Room code ${currentRoomCode} copied to clipboard!`);
    }
  });

  document.getElementById('btnCopyLink').addEventListener('click', () => {
    if (currentRoomCode) {
      const url = `${window.location.origin}/?room=${currentRoomCode}`;
      navigator.clipboard.writeText(url);
      window.soundEngine.playTypingTick();
      showToast('Invite link copied to clipboard!');
    }
  });

  document.getElementById('btnStartGame').addEventListener('click', () => {
    window.soundEngine.playSonarPing();
    socket.emit('start_game');
  });

  // -------------------------------------------------------------
  // WARM-UP FORM SUBMISSION
  // -------------------------------------------------------------
  document.getElementById('warmupForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const a1 = document.getElementById('ans1').value.trim();
    const a2 = document.getElementById('ans2').value.trim();
    const a3 = document.getElementById('ans3').value.trim();

    if (!a1 || !a2 || !a3) {
      showToast('Please answer all 3 questions.');
      return;
    }

    window.soundEngine.playTypingTick();
    socket.emit('submit_warmup', { answers: [a1, a2, a3] });

    const submitBtn = document.getElementById('btnSubmitWarmup');
    submitBtn.disabled = true;
    submitBtn.textContent = 'TRANSMITTED. AWAITING CREW CALIBRATION...';
  });

  // -------------------------------------------------------------
  // DISCUSSION CHAT
  // -------------------------------------------------------------
  const chatInput = document.getElementById('chatInput');
  const chatForm = document.getElementById('chatForm');

  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;

    socket.emit('send_chat', { text });
    chatInput.value = '';
    socket.emit('typing', { isTyping: false });
  });

  chatInput.addEventListener('input', () => {
    window.soundEngine.playTypingTick();
    socket.emit('typing', { isTyping: true });

    if (typingTimeout) clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      socket.emit('typing', { isTyping: false });
    }, 1500);
  });

  // -------------------------------------------------------------
  // PLAY AGAIN
  // -------------------------------------------------------------
  document.getElementById('btnPlayAgain').addEventListener('click', () => {
    window.soundEngine.playSonarPing();
    socket.emit('play_again');
  });

  // -------------------------------------------------------------
  // SOCKET.IO EVENT HANDLERS
  // -------------------------------------------------------------
  socket.on('connect', () => {
    myPlayerId = socket.id;
  });

  socket.on('room_created', ({ code, playerId }) => {
    currentRoomCode = code;
    myPlayerId = playerId;
    hud.roomCode.textContent = code;
    document.getElementById('lobbyRoomCode').textContent = code;
    switchPanel('LOBBY');
  });

  socket.on('joined_room', ({ code, playerId }) => {
    currentRoomCode = code;
    myPlayerId = playerId;
    hud.roomCode.textContent = code;
    document.getElementById('lobbyRoomCode').textContent = code;
    switchPanel('LOBBY');
  });

  socket.on('error_message', (msg) => {
    showToast(`⚠️ ${msg}`);
  });

  socket.on('room_state_update', (state) => {
    currentRoomCode = state.code;
    hud.roomCode.textContent = state.code;
    document.getElementById('lobbyRoomCode').textContent = state.code;

    // Timer Sync
    const mins = Math.floor(state.timer / 60);
    const secs = state.timer % 60;
    hud.timerText.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    if (state.timer <= 10) {
      hud.timer.classList.remove('normal');
    } else {
      hud.timer.classList.add('normal');
    }

    // Phase transition check
    if (state.phase !== currentPhase) {
      switchPanel(state.phase);
    }

    // Render Lobby
    if (state.phase === 'LOBBY') {
      renderLobby(state);
    }

    // Render Discussion Topic
    if (state.phase === 'DISCUSSION' && state.discussionTopic) {
      document.getElementById('chatTopicTitle').textContent = state.discussionTopic.title;
      document.getElementById('chatTopicPrompt').textContent = state.discussionTopic.prompt;
      document.getElementById('chatRoundBadge').textContent = `ROUND ${state.round + 1}/${state.maxRounds}`;
      renderDiscussionSuspects(state.players);
    }

    // Render Voting
    if (state.phase === 'VOTING') {
      renderVotingGrid(state.players, state.votes);
    }

    // Render Reveal
    if (state.phase === 'REVEAL') {
      renderRevealScreen(state);
    }
  });

  socket.on('new_chat_message', (msg) => {
    window.soundEngine.playMessagePop();
    appendChatMessage(msg);
  });

  socket.on('typing_status', ({ playerId, nickname, isTyping }) => {
    const indicator = document.getElementById('chatTypingIndicator');
    if (isTyping && playerId !== myPlayerId) {
      indicator.innerHTML = `<span>⚡</span> <em>${escapeHtml(nickname)} is typing...</em>`;
    } else {
      indicator.innerHTML = '';
    }

    // Highlight suspect card in sidebar
    const suspectEl = document.querySelector(`.suspect-item[data-id="${playerId}"]`);
    if (suspectEl) {
      if (isTyping) suspectEl.classList.add('typing');
      else suspectEl.classList.remove('typing');
    }
  });

  // -------------------------------------------------------------
  // RENDERING FUNCTIONS
  // -------------------------------------------------------------
  function renderLobby(state) {
    const rosterList = document.getElementById('lobbyRosterList');
    document.getElementById('lobbyPlayerCount').textContent = state.players.length;
    rosterList.innerHTML = '';

    const autoTimerEl = document.getElementById('lobbyAutoTimer');
    if (autoTimerEl) {
      autoTimerEl.textContent = `${state.timer}s`;
    }

    const isHost = (state.hostId === myPlayerId);
    const hostControls = document.getElementById('lobbyHostControls');
    const guestStatus = document.getElementById('lobbyGuestStatus');

    if (isHost) {
      hostControls.style.display = 'block';
      guestStatus.style.display = 'none';
      const startBtn = document.getElementById('btnStartGame');
      if (state.players.length < 2 && !state.isSoloDemo) {
        startBtn.disabled = true;
        startBtn.style.opacity = '0.5';
        startBtn.title = 'Need at least 2 players';
      } else {
        startBtn.disabled = false;
        startBtn.style.opacity = '1';
        startBtn.title = '';
      }
    } else {
      hostControls.style.display = 'none';
      guestStatus.style.display = 'block';
    }

    state.players.forEach(p => {
      const card = document.createElement('div');
      card.className = `roster-card ${p.id === myPlayerId ? 'is-me' : ''}`;
      card.innerHTML = `
        ${p.isHost ? '<span class="host-badge-tag">HOST</span>' : ''}
        <img src="${p.avatar || '/assets/avatar_commander.jpg'}" alt="${escapeHtml(p.nickname)}" class="roster-avatar">
        <div class="roster-info">
          <h4>${escapeHtml(p.nickname)} ${p.id === myPlayerId ? '(You)' : ''}</h4>
          <div class="roster-status">
            <span class="status-dot"></span>
            <span>RADIO LINKED</span>
          </div>
        </div>
      `;
      rosterList.appendChild(card);
    });
  }

  function renderDiscussionSuspects(players) {
    const list = document.getElementById('discussionSuspects');
    list.innerHTML = '';
    players.forEach(p => {
      const item = document.createElement('div');
      item.className = 'suspect-item';
      item.setAttribute('data-id', p.id);
      item.innerHTML = `
        <img src="${p.avatar || '/assets/avatar_commander.jpg'}" alt="${escapeHtml(p.nickname)}">
        <span class="suspect-name">${escapeHtml(p.nickname)} ${p.id === myPlayerId ? '(You)' : ''}</span>
      `;
      list.appendChild(item);
    });
  }

  function appendChatMessage(msg) {
    const stream = document.getElementById('chatStream');
    const isMine = (msg.playerId === myPlayerId);

    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${isMine ? 'mine' : ''}`;
    bubble.innerHTML = `
      <img src="${msg.avatar || '/assets/avatar_commander.jpg'}" alt="${escapeHtml(msg.nickname)}" class="bubble-avatar">
      <div class="bubble-content">
        <div class="bubble-meta">
          <span class="bubble-sender">${escapeHtml(msg.nickname)}</span>
          <span>${msg.timestamp}</span>
        </div>
        <div class="bubble-body">${escapeHtml(msg.text)}</div>
      </div>
    `;

    stream.appendChild(bubble);
    stream.scrollTop = stream.scrollHeight;
  }

  function renderVotingGrid(players, votes) {
    const grid = document.getElementById('votingGrid');
    const statusText = document.getElementById('votingStatusText');
    grid.innerHTML = '';

    // Players you can vote for (everyone except yourself)
    const candidates = players.filter(p => p.id !== myPlayerId);

    candidates.forEach(cand => {
      const card = document.createElement('div');
      card.className = `vote-card ${myVoteId === cand.id ? 'selected' : ''}`;
      card.innerHTML = `
        <img src="${cand.avatar || '/assets/avatar_commander.jpg'}" alt="${escapeHtml(cand.nickname)}" class="vote-avatar">
        <div class="vote-name">${escapeHtml(cand.nickname)}</div>
        <button class="vote-action-btn">
          ${myVoteId === cand.id ? 'SUSPECT LOCKED' : 'VOTE SUSPECT'}
        </button>
      `;

      card.addEventListener('click', () => {
        myVoteId = cand.id;
        window.soundEngine.playSonarPing();
        socket.emit('cast_vote', { targetPlayerId: cand.id });
        renderVotingGrid(players, votes);
      });

      grid.appendChild(card);
    });

    if (myVoteId) {
      statusText.textContent = `Vote locked! Waiting for the remaining crew members...`;
    } else {
      statusText.textContent = `Select an operative from the grid above to cast your secret vote.`;
    }
  }

  let revealAnimated = false;
  function renderRevealScreen(state) {
    const cardFlip = document.getElementById('revealCardFlip');
    const outcomeTitle = document.getElementById('revealOutcomeTitle');
    const outcomeSub = document.getElementById('revealOutcomeSubtitle');
    const aiImg = document.getElementById('revealAIImg');
    const aiName = document.getElementById('revealAIName');
    const tallyBox = document.getElementById('revealVoteTally');
    const meterList = document.getElementById('suspicionMeterList');

    if (!revealAnimated) {
      revealAnimated = true;
      window.soundEngine.playRevealGlitch();

      // Cinematic Flip Delay
      setTimeout(() => {
        cardFlip.classList.add('flipped');
        if (state.winner && state.winner.aiCaught) {
          window.soundEngine.playVictoryFanfare();
          outcomeTitle.textContent = 'CREW VICTORY: SYNTHETIC NEUTRALIZED';
          outcomeTitle.className = 'outcome-banner crew-win';
          outcomeSub.textContent = `The crew correctly identified and quarantined ${state.revealedAI.nickname} as the AI Infiltrator!`;
        } else {
          window.soundEngine.playDefeatStinger();
          outcomeTitle.textContent = 'AI SUBVERSION: CREW FOOLED';
          outcomeTitle.className = 'outcome-banner ai-win';
          outcomeSub.textContent = `The synthetic operative (${state.revealedAI.nickname}) successfully deceived the crew and avoided quarantine!`;
        }
      }, 1800);
    }

    if (state.revealedAI) {
      aiImg.src = state.revealedAI.avatar || '/assets/avatar_synth_reveal.jpg';
      aiName.textContent = state.revealedAI.nickname;
    }

    // Render Vote Breakdown
    tallyBox.innerHTML = '';
    state.players.forEach(p => {
      const votesReceived = Object.values(state.votes).filter(v => v === p.id).length;
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';
      row.style.padding = '8px 12px';
      row.style.background = 'var(--bg-surface)';
      row.style.borderRadius = 'var(--radius-sm)';
      row.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <img src="${p.avatar || '/assets/avatar_commander.jpg'}" style="width: 28px; height: 28px; border-radius: 50%;">
          <strong>${escapeHtml(p.nickname)}</strong>
          ${p.isAI ? '<span class="brand-badge" style="background: rgba(239, 68, 68, 0.2); color: #ff6b6b; border-color: var(--accent-crimson);">[AI]</span>' : ''}
        </div>
        <div style="font-family: var(--font-mono); color: var(--accent-cyan); font-weight: 700;">
          ${votesReceived} ${votesReceived === 1 ? 'vote' : 'votes'}
        </div>
      `;
      tallyBox.appendChild(row);
    });

    // Render Suspicion Meter (P1 requirement F9)
    meterList.innerHTML = '';
    if (state.suspicionReport) {
      for (const [pId, rep] of Object.entries(state.suspicionReport)) {
        const player = state.players.find(p => p.id === pId);
        if (!player) continue;

        const meterRow = document.createElement('div');
        meterRow.className = 'meter-row';
        meterRow.innerHTML = `
          <div class="meter-header">
            <span class="meter-target">${escapeHtml(player.nickname)}</span>
            <span class="meter-score">SUSPICION RATING: ${rep.score}%</span>
          </div>
          <div class="meter-bar-track">
            <div class="meter-bar-fill" style="width: ${rep.score}%;"></div>
          </div>
          <div class="meter-reason">"Log: ${escapeHtml(rep.reason)}"</div>
        `;
        meterList.appendChild(meterRow);
      }
    }

    // Show host play again control
    const hostControls = document.getElementById('revealHostControls');
    if (state.hostId === myPlayerId) {
      hostControls.style.display = 'block';
    } else {
      hostControls.style.display = 'none';
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
  }

})();
