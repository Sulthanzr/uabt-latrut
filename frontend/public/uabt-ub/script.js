// ===== UABT UB — Player Dashboard Realtime =====
const API_BASE = localStorage.getItem('uabt-api-url') || 'https://uabt-latrut-production.up.railway.app';
const socket = window.io ? window.io(API_BASE, { transports: ['websocket', 'polling'] }) : null;
const AUTH_TOKEN = localStorage.getItem('uabt-auth-token');

let snapshot = null;
let currentPlayer = JSON.parse(localStorage.getItem('uabt-current-player') || localStorage.getItem('uabt-auth-player') || 'null');
let cropper = null;
if (!AUTH_TOKEN || !currentPlayer || currentPlayer?.role === 'admin') {
  window.location.href = '../uabt-ub-auth/login.html';
}

const app = document.querySelector('.app');
const toggleBtn = document.getElementById('toggleSidebar');
const isMobile = () => window.matchMedia('(max-width: 820px)').matches;
toggleBtn?.addEventListener('click', () => {
  if (isMobile()) app.classList.toggle('expanded');
  else app.classList.toggle('collapsed');
});

function formatDate(date) {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
}
function initials(name = '?') {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}
function gradePoint(grade) { return { A: 3, B: 2, C: 1 }[grade] || 0; }
function playerLabel(p) { return `${p.nama} (${p.grade}/${p.gender})`; }

let uabtLastPopupMatchId = localStorage.getItem('uabt-last-popup-match-id') || '';

function uabtPlayerId(player) {
  return String(player?._id || player?.id || player || '');
}

function uabtPlayerName(player) {
  return player?.nama || player?.username || 'Pemain';
}

function getCurrentPlayerMatchInfo(match) {
  const myId = uabtPlayerId(currentPlayer);

  if (!myId || !match) return null;

  const team1 = match.team1 || [];
  const team2 = match.team2 || [];

  const isInTeam1 = team1.some((p) => uabtPlayerId(p) === myId);
  const isInTeam2 = team2.some((p) => uabtPlayerId(p) === myId);

  if (!isInTeam1 && !isInTeam2) return null;

  const myTeam = isInTeam1 ? team1 : team2;
  const enemyTeam = isInTeam1 ? team2 : team1;

  const myTeamLabel = isInTeam1 ? 'Tim A' : 'Tim B';
  const enemyTeamLabel = isInTeam1 ? 'Tim B' : 'Tim A';

  const partner = myTeam.find((p) => uabtPlayerId(p) !== myId);

  return {
    myTeamLabel,
    enemyTeamLabel,
    partnerName: partner ? uabtPlayerName(partner) : '-',
    myTeamText: myTeam.map(uabtPlayerName).join(' + '),
    enemyTeamText: enemyTeam.map(uabtPlayerName).join(' + '),
  };
}

function showCurrentPlayerMatchPopup(match) {
  const matchId = String(match?._id || match?.id || '');

  if (!matchId) return;
  if (matchId === uabtLastPopupMatchId) return;

  const info = getCurrentPlayerMatchInfo(match);

  if (!info) return;

  uabtLastPopupMatchId = matchId;
  localStorage.setItem('uabt-last-popup-match-id', matchId);

  if (navigator.vibrate) {
    navigator.vibrate([250, 100, 250]);
  }

  openMatchNotificationModal({
    matchNo: match.matchNo || '-',
    gameType: match.gameType || 'Match',
    court: match.court || 'Court',
    myTeamLabel: info.myTeamLabel,
    partnerName: info.partnerName,
    myTeamText: info.myTeamText,
    enemyTeamText: info.enemyTeamText,
    enemyTeamLabel: info.enemyTeamLabel,
  });
}

function checkCurrentPlayerPlayingMatch() {
  const myId = uabtPlayerId(currentPlayer);

  if (!myId || !snapshot?.matches?.length) return;

  const playingMatch = snapshot.matches.find((match) => {
    if (match.status !== 'playing') return false;

    const allPlayers = [
      ...(match.team1 || []),
      ...(match.team2 || []),
    ];

    return allPlayers.some((p) => uabtPlayerId(p) === myId);
  });

  if (playingMatch) {
    showCurrentPlayerMatchPopup(playingMatch);
  }
}

function openMatchNotificationModal({
  matchNo = '-',
  gameType = 'Match',
  court = 'Court',
  myTeamLabel = 'Tim A',
  partnerName = '-',
  myTeamText = '-',
  enemyTeamText = '-',
  enemyTeamLabel = 'Tim B',
}) {
  const overlay = document.getElementById('matchNotifOverlay');

  if (!overlay) return;

  const subtitle = document.getElementById('matchNotifSubtitle');
  const info = document.getElementById('matchNotifInfo');
  const team = document.getElementById('matchNotifTeam');
  const partner = document.getElementById('matchNotifPartner');
  const teamA = document.getElementById('matchNotifTeamA');
  const teamB = document.getElementById('matchNotifTeamB');

  if (subtitle) subtitle.textContent = `Match #${matchNo}`;
  if (info) info.textContent = `${gameType} · ${court}`;
  if (team) team.textContent = `Kamu di ${myTeamLabel}`;
  if (partner) partner.textContent = `Partner: ${partnerName}`;
  if (teamA) teamA.textContent = `${myTeamLabel}: ${myTeamText}`;
  if (teamB) teamB.textContent = `${enemyTeamLabel}: ${enemyTeamText}`;

  overlay.classList.remove('hidden');
  document.body.classList.add('modal-open');
}

function closeMatchNotificationModal() {
  const overlay = document.getElementById('matchNotifOverlay');

  if (!overlay) return;

  overlay.classList.add('hidden');
  document.body.classList.remove('modal-open');
}

function fullPhotoUrl(url) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${API_BASE}${url}`;
}

function getPlayerPhotoUrl(player) {
  return player?.profilePhotoUrl || player?.profile_photo_url || '';
}

function renderProfilePhoto(player = currentPlayer) {
  const photoUrl = fullPhotoUrl(getPlayerPhotoUrl(player));
  const initial = initials(player?.nama || player?.username || 'PU');

  const targets = [
    {
      img: document.getElementById('heroAvatarImg'),
      fallback: document.getElementById('heroAvatarFallback'),
    },
    {
      img: document.getElementById('topAvatarImg'),
      fallback: document.getElementById('topAvatarFallback'),
    },
    {
      img: document.getElementById('profilePhotoPreview'),
      fallback: document.getElementById('profilePhotoFallback'),
    },
  ];

  targets.forEach(({ img, fallback }) => {
  if (photoUrl) {
    if (img) {
      img.onload = () => {
        img.style.display = 'block';
        if (fallback) fallback.style.display = 'none';
      };

      img.onerror = () => {
        img.removeAttribute('src');
        img.style.display = 'none';

        if (fallback) {
          fallback.textContent = initial;
          fallback.style.display = 'flex';
        }
      };

      img.src = photoUrl;
    }
  } else {
    if (img) {
      img.removeAttribute('src');
      img.style.display = 'none';
    }

    if (fallback) {
      fallback.textContent = initial;
      fallback.style.display = 'flex';
    }
  }
});
}

function setCount(el, value) {
  if (!el) return;
  el.dataset.count = String(value ?? 0);
  el.textContent = String(value ?? 0);
}
function animateCount(el) {
  const target = parseInt(el.dataset.count || '0', 10);
  const duration = 700;
  const start = performance.now();
  function step(now) {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(target * eased).toLocaleString('id-ID');
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
function runCounters(scope = document) {
  scope.querySelectorAll('[data-count]').forEach((el) => animateCount(el));
}

function ensurePlayerForm() {
  const nameInput = document.getElementById('profileNameInput');
  const emailInput = document.getElementById('profileEmailInput');
  const phoneInput = document.getElementById('profilePhoneInput');
  const gradeInput = document.getElementById('profileGradeInput');
  const bioInput = document.getElementById('profileBioInput');

  if (nameInput) {
    nameInput.value = currentPlayer?.nama || '';
  }

  if (emailInput) {
    emailInput.value = currentPlayer?.email || '';
    emailInput.readOnly = true;
  }

  if (phoneInput) {
    phoneInput.value = currentPlayer?.phone || '';
  }

  if (gradeInput) {
    const gradeText = {
      A: 'Jago',
      B: 'Menengah',
      C: 'Pemula',
    }[currentPlayer?.grade] || '';

    gradeInput.value = currentPlayer?.grade ? `${currentPlayer.grade} — ${gradeText}` : '';
    gradeInput.readOnly = true;
  }

  if (bioInput && !bioInput.dataset.userEdited) {
    bioInput.value = currentPlayer?.bio || 'Anggota UABT UB.';
  }
}

document.getElementById('profileBioInput')?.addEventListener('input', (e) => {
  e.target.dataset.userEdited = '1';
});

function renderAccountSecurityForm() {
  const usernameInput = document.getElementById('accountUsername');

  if (usernameInput) {
    usernameInput.value = currentPlayer?.username || '';
  }
}

function getQueuePosition() {
  if (!snapshot || !currentPlayer) return null;
  const idx = snapshot.queue.findIndex((p) => String(p._id) === String(currentPlayer._id));
  return idx >= 0 ? idx + 1 : null;
}

function renderChart() {
  const chart = document.getElementById('chart');
  const axis = document.getElementById('chartAxis');
  if (!chart || !axis) return;

  const values = playerStats.weekBars || [0, 0, 0, 0];
  const max = Math.max(1, ...values);

  chart.innerHTML = '';
  axis.innerHTML = '';

  values.forEach((v, i) => {
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.dataset.value = `${v} match`;
    chart.appendChild(bar);

    const label = document.createElement('span');
    label.textContent = `Mgg ${i + 1}`;
    axis.appendChild(label);

    setTimeout(() => {
      bar.style.height = `${(v / max) * 100}%`;
    }, 150 + i * 80);
  });
}

function renderDashboard() {
  if (!snapshot) return;

  const session = snapshot.session;
  const matches = snapshot.matches || [];
  const myId = String(currentPlayer?._id || '');

  const myMatches = matches.filter((m) =>
    [...(m.team1 || []), ...(m.team2 || [])].some((p) => String(p._id || p) === myId)
  );

  document.querySelector('.hello-name').textContent = currentPlayer?.nama || 'Pemain UABT';
  document.querySelector('.profile-name').textContent = currentPlayer?.nama || 'Pemain UABT';
  renderProfilePhoto(currentPlayer);
  document.querySelector('.profile-tags .tag').textContent = currentPlayer?.grade ? `Grade ${currentPlayer.grade}` : 'Grade -';

  const countEls = document.querySelectorAll('#page-dashboard [data-count]');

  // Urutan setelah card Posisi Antrean dihapus:
  // 0 = Main Bulan Ini
  // 1 = Jumlah Menang
  // 2 = Total Main di Sesi Ini
  // 3 = Match Sesi total
  setCount(countEls[0], playerStats.monthPlay || 0);
  setCount(countEls[1], playerStats.monthWins || 0);
  setCount(countEls[2], myMatches.length || 0);
  setCount(countEls[3], snapshot.stats?.totalMatches || matches.length || 0);

  const firstTrend = document.querySelector('#page-dashboard .stat-card:first-child .stat-trend');
  if (firstTrend) {
    firstTrend.textContent = 'Total bulan ini';
    firstTrend.classList.remove('up');
    firstTrend.classList.add('neutral');
  }

  const winTrend = document.querySelector('#page-dashboard .stat-card:nth-child(2) .stat-trend');
  if (winTrend) {
    winTrend.textContent = 'Total menang bulan ini';
    winTrend.classList.remove('up');
    winTrend.classList.add('neutral');
  }

  document.getElementById('sesiAktif').textContent = session ? session.title : 'Belum ada sesi';

  const sessionRows = document.querySelectorAll('.session-row strong');

  if (sessionRows[2]) {
    sessionRows[2].textContent = session ? `${session.location} — ${session.court}` : '-';
  }

  const fill = document.querySelector('.queue-fill');
  if (fill) {
    const totalMatches = snapshot.stats?.totalMatches || matches.length || 0;
    const targetMatches = 18;
    const pct = Math.min(100, Math.max(0, (totalMatches / targetMatches) * 100));
    fill.style.width = `${pct}%`;
  }

  const progressText = document.querySelector('.session-card > p.muted');
  if (progressText) {
    const totalMatches = snapshot.stats?.totalMatches || matches.length || 0;
    progressText.textContent = `Progres sesi: ${totalMatches} match`;
  }

  renderChart();
  renderMatchHistory();
  runCounters(document.getElementById('page-dashboard'));
}

const modal = document.getElementById('matchModal');
const modalContent = document.getElementById('modalContent');
const modalClose = document.getElementById('modalClose');
function openMatch(match) {
  const t1 = (match.team1 || []).map(playerLabel).join(' / ');
  const t2 = (match.team2 || []).map(playerLabel).join(' / ');
  modalContent.innerHTML = `
    <h3>Match #${match.matchNo} · ${match.gameType}</h3>
    <p class="muted">${formatDate(match.startedAt)} · ${match.court}</p>
    <div class="modal-meta">
      <div><span>Tim 1</span><strong>${t1}</strong></div>
      <div><span>Tim 2</span><strong>${t2}</strong></div>
      <div><span>Poin</span><strong>${match.team1Point} vs ${match.team2Point}</strong></div>
      <div><span>Status</span><strong>${match.status}</strong></div>
    </div>`;
  modal.classList.add('show');
}
modalClose?.addEventListener('click', () => modal.classList.remove('show'));
modal?.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('show'); });

function isSameMonth(value, baseDate = new Date()) {
  if (!value) return false;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return (
    date.getFullYear() === baseDate.getFullYear() &&
    date.getMonth() === baseDate.getMonth()
  );
}

function renderMatchHistory() {
  const tbody = document.getElementById('matchesBody');
  if (!tbody) return;

  const myId = String(currentPlayer?._id || '');

  const rows = (snapshot?.matches || [])
    .filter((m) => isSameMonth(m.startedAt || m.createdAt))
    .filter((m) =>
      !myId ||
      [...(m.team1 || []), ...(m.team2 || [])].some((p) => String(p._id || p) === myId)
    )
    .slice(0, 8);

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="td-empty">Belum ada riwayat match bulan ini.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((m, i) => {
    const myTeam = (m.team1 || []).some((p) => String(p._id || p) === myId) ? m.team1 : m.team2;
    const oppTeam = myTeam === m.team1 ? m.team2 : m.team1;
    const result = m.status === 'completed' ? (m.winner || 'selesai') : 'playing';

    return `<tr data-idx="${i}">
      <td><div class="opp"><div class="opp-avatar">${m.gameType}</div>${(oppTeam || []).map((p) => p.nama).join(' / ') || '-'}</div></td>
      <td>${formatDate(m.startedAt)}</td>
      <td><strong>${m.score || '-'}</strong></td>
      <td><span class="result-pill ${result === 'playing' ? 'win' : 'loss'}">${result === 'playing' ? 'Bermain' : result}</span></td>
    </tr>`;
  }).join('');

  tbody.onclick = (e) => {
    const tr = e.target.closest('tr[data-idx]');
    if (tr) openMatch(rows[Number(tr.dataset.idx)]);
  };
}

function renderSessions() {
  const sesList = document.getElementById('activeSessions');
  if (!sesList) return;
  const s = snapshot?.session;
  if (!s) {
    sesList.innerHTML = '<li><div class="info"><h4>Belum ada sesi aktif</h4><p>Tunggu admin membuat sesi.</p></div></li>';
    return;
  }
  const d = new Date(s.startAt || s.createdAt);
  sesList.innerHTML = `<li>
    <div class="date-block"><span class="day">${d.toLocaleDateString('id-ID', { day: '2-digit' })}</span><span class="mon">${d.toLocaleDateString('id-ID', { month: 'short' }).toUpperCase()}</span></div>
    <div class="info"><h4>${s.title}</h4><p><i class="fa-solid fa-location-dot"></i> ${s.location} · ${s.court} · PJ ${s.pj || '-'}</p></div>
    <span class="session-code-pill">Kode dari admin</span>
  </li>`;
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (AUTH_TOKEN) headers.Authorization = `Bearer ${AUTH_TOKEN}`;
  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || 'Request gagal');
  return body.data ?? body;
}

async function refreshLoggedInPlayer() {
  if (!currentPlayer?._id) return;
  try {
    const latestAccount = AUTH_TOKEN ? await api('/api/auth/me') : null;
    currentPlayer = { ...currentPlayer, ...latestAccount };
    localStorage.setItem('uabt-current-player', JSON.stringify(currentPlayer));
    localStorage.setItem('uabt-auth-player', JSON.stringify(currentPlayer));
    
    renderProfilePhoto(currentPlayer);
  } catch (err) {
    console.warn('Gagal refresh akun pemain:', err.message);
  }
}

let playerStats = {
  monthPlay: 0,
  monthWins: 0,
  weekDiff: 0,
  weekBars: [0, 0, 0, 0],
};

async function loadPlayerStats() {
  try {
    playerStats = await api('/api/players/me/stats');
  } catch (err) {
    console.warn('Gagal load statistik player:', err.message);
  }
}


async function loadSnapshot() {
  await refreshLoggedInPlayer();
  await loadPlayerStats();
  snapshot = await api('/api/sessions/active');

  if (snapshot.session?._id) socket?.emit('session:join', snapshot.session._id);

  if (currentPlayer?._id) {
    const latest = snapshot.players.find((p) => String(p._id) === String(currentPlayer._id));
    if (latest) {
      currentPlayer = latest;
      localStorage.setItem('uabt-current-player', JSON.stringify(currentPlayer));
      localStorage.setItem('uabt-auth-player', JSON.stringify(currentPlayer));

      renderProfilePhoto(currentPlayer);
    }
  }

  renderSessions();
  renderDashboard();
  renderProfilePhoto(currentPlayer);
  ensurePlayerForm();
  renderAccountSecurityForm();
}

const joinBtn = document.getElementById('joinBtn');
const sessionCode = document.getElementById('sessionCode');
const joinStatus = document.getElementById('joinStatus');
joinBtn?.addEventListener('click', async () => {
  const code = (sessionCode.value || '').trim().toUpperCase();
  if (!currentPlayer?._id) {
    joinStatus.innerHTML = '✗ Kamu belum login. <a href="../uabt-ub-auth/login.html">Login dulu</a>, lalu masukkan kode sesi.';
    joinStatus.className = 'join-status error';
    return;
  }
  if (!code) {
    joinStatus.textContent = 'Masukkan kode sesi dari admin.';
    joinStatus.className = 'join-status error';
    return;
  }
  try {
    const data = await api('/api/players/join', {
      method: 'POST',
      body: JSON.stringify({ sessionCode: code }),
    });
    currentPlayer = data;
    localStorage.setItem('uabt-current-player', JSON.stringify(currentPlayer));
    localStorage.setItem('uabt-auth-player', JSON.stringify(currentPlayer));
    renderProfilePhoto(currentPlayer);
    joinStatus.textContent = `✓ Berhasil masuk sesi sebagai ${currentPlayer.nama} (${currentPlayer.grade}/${currentPlayer.gender}). Nama kamu sudah muncul realtime di dashboard admin.`;
    joinStatus.className = 'join-status success';
    await loadSnapshot();
  } catch (err) {
    joinStatus.textContent = `✗ ${err.message}`;
    joinStatus.className = 'join-status error';
  }
});
sessionCode?.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinBtn.click(); });

function openCropperModal(file) {
  const img = document.getElementById('cropperImage');
  const modal = document.getElementById('cropperModal');

  if (!img || !modal) return;

  const reader = new FileReader();

  reader.onload = () => {
    img.src = reader.result;
    modal.style.display = 'flex';

    if (cropper) {
      cropper.destroy();
      cropper = null;
    }

    cropper = new Cropper(img, {
      aspectRatio: 1,
      viewMode: 1,
      dragMode: 'move',
      autoCropArea: 1,
      responsive: true,
      background: false,
    });
  };

  reader.readAsDataURL(file);
}

function closeCropperModal() {
  const modal = document.getElementById('cropperModal');
  const input = document.getElementById('profilePhotoInput');

  if (modal) modal.style.display = 'none';

  if (cropper) {
    cropper.destroy();
    cropper = null;
  }

  if (input) input.value = '';
}

async function uploadCroppedProfilePhoto() {
  if (!cropper) return;

  const canvas = cropper.getCroppedCanvas({
    width: 512,
    height: 512,
    imageSmoothingQuality: 'high',
  });

  if (!canvas) {
    alert('Gagal memproses foto.');
    return;
  }

  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.9);
  });

  if (!blob) {
    alert('Gagal membuat file foto.');
    return;
  }

  const formData = new FormData();
  formData.append('photo', blob, 'profile-photo.jpg');

  const res = await fetch(`${API_BASE}/api/players/me/profile-photo`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
    body: formData,
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(body.message || 'Gagal upload foto profil.');
  }

  const updatedPlayer = body.data || body.player || body;

  currentPlayer = {
    ...currentPlayer,
    ...updatedPlayer,
  };

  localStorage.setItem('uabt-current-player', JSON.stringify(currentPlayer));
  localStorage.setItem('uabt-auth-player', JSON.stringify(currentPlayer));

  renderProfilePhoto(currentPlayer);
  closeCropperModal();
  alert('Foto profil berhasil diupload.');
}

async function deleteProfilePhoto() {
  const yes = confirm('Hapus foto profil?');

  if (!yes) return;

  const res = await fetch(`${API_BASE}/api/players/me/profile-photo`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(body.message || 'Gagal hapus foto profil.');
  }

  const updatedPlayer = body.data || body.player || body;

  currentPlayer = {
    ...currentPlayer,
    ...updatedPlayer,
    profilePhotoUrl: null,
    profile_photo_url: null,
  };

  localStorage.setItem('uabt-current-player', JSON.stringify(currentPlayer));
  localStorage.setItem('uabt-auth-player', JSON.stringify(currentPlayer));

  renderProfilePhoto(currentPlayer);
  alert('Foto profil berhasil dihapus.');
}

document.getElementById('openProfileBtn')?.addEventListener('click', () => {
  goToPage('profile');
});

document.getElementById('heroAvatarBox')?.addEventListener('click', () => {
  goToPage('profile');
});

document.getElementById('chooseProfilePhotoBtn')?.addEventListener('click', () => {
  document.getElementById('profilePhotoInput')?.click();
});

document.getElementById('profilePhotoInput')?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];

  if (!file) return;

  if (!file.type.startsWith('image/')) {
    alert('File harus berupa gambar.');
    return;
  }

  openCropperModal(file);
});

document.getElementById('closeCropperBtn')?.addEventListener('click', closeCropperModal);
document.getElementById('cancelCropBtn')?.addEventListener('click', closeCropperModal);

document.getElementById('saveCropBtn')?.addEventListener('click', async () => {
  try {
    await uploadCroppedProfilePhoto();
  } catch (err) {
    console.error(err);
    alert(err.message || 'Gagal upload foto profil.');
  }
});

document.getElementById('deleteProfilePhotoBtn')?.addEventListener('click', async () => {
  try {
    await deleteProfilePhoto();
  } catch (err) {
    console.error(err);
    alert(err.message || 'Gagal hapus foto profil.');
  }
});

/* ===== RESET PASSWORD OTP ===== */
function setResetPasswordStatus(message = '', type = '') {
  const el = document.getElementById('resetPasswordStatus');

  if (!el) return;

  el.textContent = message;
  el.className = 'join-status';

  if (type) {
    el.classList.add(type);
  }
}

function clearResetPasswordInputs() {
  const ids = [
    'oldPasswordInput',
    'newPasswordInput',
    'confirmNewPasswordInput',
    'passwordOtpInput',
  ];

  ids.forEach((id) => {
    const input = document.getElementById(id);
    if (input) input.value = '';
  });
}

document.getElementById('openResetPasswordBtn')?.addEventListener('click', () => {
  const box = document.getElementById('resetPasswordBox');

  if (!box) return;

  box.classList.toggle('hidden');

  if (!box.classList.contains('hidden')) {
    setResetPasswordStatus('');
  }
});

document.getElementById('sendPasswordOtpBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('sendPasswordOtpBtn');

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Mengirim...';
    }

    setResetPasswordStatus('Mengirim OTP ke email akunmu...', '');

    await api('/api/players/me/password-otp', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    setResetPasswordStatus('✓ OTP sudah dikirim ke email akunmu.', 'success');
  } catch (err) {
    setResetPasswordStatus(`✗ ${err.message}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Kirim OTP';
    }
  }
});

document.getElementById('updatePasswordBtn')?.addEventListener('click', async () => {
  const oldPassword = document.getElementById('oldPasswordInput')?.value || '';
  const newPassword = document.getElementById('newPasswordInput')?.value || '';
  const confirmPassword = document.getElementById('confirmNewPasswordInput')?.value || '';
  const otp = document.getElementById('passwordOtpInput')?.value || '';

  if (!newPassword || !confirmPassword || !otp) {
    setResetPasswordStatus('✗ Password baru, konfirmasi password, dan OTP wajib diisi.', 'error');
    return;
  }

  if (newPassword !== confirmPassword) {
    setResetPasswordStatus('✗ Konfirmasi password baru tidak cocok.', 'error');
    return;
  }

  if (newPassword.length < 8) {
    setResetPasswordStatus('✗ Password baru minimal 8 karakter.', 'error');
    return;
  }

  const btn = document.getElementById('updatePasswordBtn');

  try {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memproses...';
    }

    setResetPasswordStatus('Memproses update password...', '');

    await api('/api/players/me/password', {
      method: 'PATCH',
      body: JSON.stringify({
        oldPassword,
        newPassword,
        confirmPassword,
        otp,
      }),
    });

    setResetPasswordStatus('✓ Password berhasil diubah. Gunakan password baru saat login berikutnya.', 'success');
    clearResetPasswordInputs();
  } catch (err) {
    setResetPasswordStatus(`✗ ${err.message}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Update Password';
    }
  }
});

// Navigation
const pageMeta = {
  dashboard: { title: 'UABT UB', sub: 'Unit Aktivitas Bulutangkis Universitas Brawijaya' },
  profile: { title: 'Profil Saya', sub: 'Kelola informasi pribadi dan grade-mu.' },
  join: { title: 'Bergabung Sesi', sub: 'Cukup masukkan kode sesi; data pemain diambil otomatis dari akunmu.' },
  settings: { title: 'Pengaturan', sub: 'Atur notifikasi, tampilan, dan akun.' },
};

function goToPage(name) {
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  const target = document.getElementById(`page-${name}`);
  target?.classList.add('active');

  document.querySelectorAll('.nav-item').forEach((i) => {
    i.classList.toggle('active', i.dataset.page === name);
  });

  if (pageMeta[name]) {
    document.getElementById('pageTitle').textContent = pageMeta[name].title;
    document.getElementById('pageSub').textContent = pageMeta[name].sub;
  }

  if (name === 'dashboard') renderDashboard();

  if (name === 'settings') {
    renderAccountSecurityForm();
  }

  if (isMobile()) app.classList.remove('expanded');
}

document.querySelectorAll('.nav-item').forEach((item) => item.addEventListener('click', (e) => {
  e.preventDefault();
  if (item.dataset.page) goToPage(item.dataset.page);
}));

document.getElementById('openProfileBtn')?.addEventListener('click', () => {
  goToPage('profile');
});

document.getElementById('heroAvatarBox')?.addEventListener('click', () => {
  goToPage('profile');
});

document.querySelector('.logout')?.addEventListener('click', () => {
  localStorage.removeItem('uabt-auth-token');
  localStorage.removeItem('uabt-auth-player');
  localStorage.removeItem('uabt-current-player');
});

document.addEventListener('click', (e) => {
  if (e.target.id === 'cropperModal') {
  closeCropperModal();
  return;
  }
  
  if (
    e.target.id === 'matchNotifOverlay' ||
    e.target.id === 'matchNotifClose' ||
    e.target.id === 'matchNotifOk'
  ) {
    closeMatchNotificationModal();
    return;
  }

  const chip = e.target.closest('.chip');
  if (chip && chip.parentElement?.classList.contains('chip-group')) {
    chip.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
  }

  const t = e.target.closest('[data-toggle]');
  if (t) t.classList.toggle('on');

  const s = e.target.closest('.swatch');
  if (s) {
    s.parentElement.querySelectorAll('.swatch').forEach((x) => x.classList.remove('selected'));
    s.classList.add('selected');
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeMatchNotificationModal();
  }
});

function bindSpotlight() {
  document.querySelectorAll('.stat-card').forEach((card) => {
    if (card.dataset.spot) return;
    card.dataset.spot = '1';
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  });
}
bindSpotlight();

socket?.on('snapshot:update', async () => {
  try {
    await loadSnapshot();
    checkCurrentPlayerPlayingMatch();
  } catch (err) {
    console.warn('Gagal refresh snapshot:', err.message);
  }
});

socket?.on('match:generated', (match) => {
  showCurrentPlayerMatchPopup(match);
});

socket?.on('match:updated', (match) => {
  if (match?.status === 'playing') {
    showCurrentPlayerMatchPopup(match);
  }
});

socket?.on('connect', () => {
  if (snapshot?.session?._id) {
    socket.emit('session:join', snapshot.session._id);
  }
});

loadSnapshot().catch((err) => {
  console.error(err);
  const sesList = document.getElementById('activeSessions');
  if (sesList) sesList.innerHTML = `<li><div class="info"><h4>Backend belum tersambung</h4><p>${err.message}</p></div></li>`;
});
