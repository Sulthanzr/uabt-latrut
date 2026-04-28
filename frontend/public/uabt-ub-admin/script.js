// ===== UABT UB Admin Panel Realtime =====
const apiInput = document.querySelector('#page-pengaturan .input-block');
const API_BASE = localStorage.getItem('uabt-api-url') || apiInput?.value || 'https://uabt-latrut-production.up.railway.app';
if (apiInput) apiInput.value = API_BASE;
const socket = window.io ? window.io(API_BASE, { transports: ['websocket', 'polling'] }) : null;
const AUTH_TOKEN = localStorage.getItem('uabt-auth-token');
const CURRENT_USER = JSON.parse(localStorage.getItem('uabt-auth-player') || localStorage.getItem('uabt-current-player') || 'null');
if (!AUTH_TOKEN || CURRENT_USER?.role !== 'admin') {
  window.location.href = '../uabt-ub-auth/login.html';
}
let snapshot = null;
let sessions = [];

const app = document.querySelector('.app');
const toggleBtn = document.getElementById('toggleSidebar');
const isMobile = () => window.matchMedia('(max-width: 820px)').matches;
toggleBtn?.addEventListener('click', () => {
  if (isMobile()) app.classList.toggle('expanded');
  else app.classList.toggle('collapsed');
});

const pageMeta = {
  dashboard: { title: 'Dashboard', sub: 'Ringkasan sesi latihan' },
  scan: { title: 'Tambahkan Sesi', sub: 'Buat sesi aktif, tampilkan kode, dan monitor player join realtime' },
  antrean: { title: 'Antrean', sub: 'Pemain siap dimatchkan' },
  generate: { title: 'Generate Match', sub: 'Matchmaking otomatis berbasis count + level' },
  riwayat: { title: 'Riwayat Match', sub: 'Arsip pertandingan sesi aktif' },
  leaderboard: { title: 'Leaderboard', sub: 'Ranking pemain sesi ini' },
  pengaturan: { title: 'Pengaturan', sub: 'Konfigurasi sistem' },
};
function goToPage(name) {
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.getElementById(`page-${name}`)?.classList.add('active');
  document.querySelectorAll('.nav-item').forEach((i) => i.classList.toggle('active', i.dataset.page === name));
  if (pageMeta[name]) {
    document.getElementById('pageTitle').textContent = pageMeta[name].title;
    document.getElementById('pageSub').textContent = pageMeta[name].sub;
  }
  if (isMobile()) app.classList.remove('expanded');
}
document.querySelectorAll('[data-page]').forEach((item) => item.addEventListener('click', (e) => {
  e.preventDefault();
  goToPage(item.dataset.page);
}));
document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => goToPage(b.dataset.goto)));

document.getElementById('addSesi')?.addEventListener('click', () => goToPage('scan'));

const toastEl = document.getElementById('toast');
let toastTimer;
function toast(msg, type = 'success') {
  clearTimeout(toastTimer);
  const icon = type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-circle-xmark' : 'fa-circle-info';
  toastEl.className = `toast show ${type}`;
  toastEl.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${msg}</span>`;
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

const logList = document.getElementById('logList');
function addLog(text, icon = 'fa-bolt') {
  if (!logList) return;
  logList.querySelector('.log-empty')?.remove();
  const li = document.createElement('li');
  const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  li.innerHTML = `<i class="fa-solid ${icon} log-icon"></i><span>${text}</span><span class="log-time">${time}</span>`;
  logList.prepend(li);
  while (logList.children.length > 12) logList.lastElementChild.remove();
}
document.getElementById('clearLog')?.addEventListener('click', () => {
  logList.innerHTML = '<li class="log-empty">Belum ada aktivitas...</li>';
  toast('Log dibersihkan');
});

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
function gradePoint(grade) { return { A: 3, B: 2, C: 1 }[grade] || 0; }
function playerText(p) { return `${p.nama} <span class="muted">${p.grade}/${p.gender} · ${p.jumlah_main}x</span>`; }
function teamText(team) { return (team || []).map((p) => `${p.nama} (${p.grade})`).join(' / '); }
function timeText(date) { return date ? new Date(date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'; }
function dateTimeText(date) { return date ? new Date(date).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-'; }

function winnerText(winner) {
  if (winner === 'team1') return 'Tim A menang';
  if (winner === 'team2') return 'Tim B menang';
  if (winner === 'draw') return 'Draw';
  return 'Belum diisi';
}

function renderStats() {
  if (!snapshot) return;
  document.getElementById('statQueue').textContent = snapshot.stats.queue;
  document.getElementById('statPending').textContent = snapshot.stats.totalPlayers;
  document.getElementById('statMatch').textContent = snapshot.stats.totalMatches;
  document.getElementById('statActive').textContent = snapshot.stats.playing;
  const badge = document.getElementById('antreanBadge');
  if (badge) badge.textContent = snapshot.stats.queue;
}

function renderDashboardCards() {
  const sessionCard = document.querySelector('#page-dashboard .grid-2 .card');
  if (sessionCard) {
    sessionCard.querySelector('.empty')?.remove();

    let box = sessionCard.querySelector('#sessionMini');
    if (!box) {
      box = document.createElement('div');
      box.id = 'sessionMini';
      box.className = 'alur-item green';
      sessionCard.appendChild(box);
    }

    const s = snapshot.session;
    box.innerHTML = s
      ? `<strong>${s.title}</strong><p><b>Kode:</b> ${s.code} · ${s.location} · ${s.court} · PJ ${s.pj || '-'}</p>`
      : '<strong>Belum ada sesi</strong><p>Buat sesi baru di menu Tambahkan Sesi.</p>';
  }
}

  const sessionCard = document.querySelector('#page-dashboard .grid-2 .card:nth-child(2)');
  if (sessionCard) {
    sessionCard.querySelector('.empty')?.remove();
    let box = sessionCard.querySelector('#sessionMini');
    if (!box) {
      box = document.createElement('div');
      box.id = 'sessionMini';
      box.className = 'alur-item green';
      sessionCard.appendChild(box);
    }
    const s = snapshot.session;
    box.innerHTML = s ? `<strong>${s.title}</strong><p><b>Kode:</b> ${s.code} · ${s.location} · ${s.court} · PJ ${s.pj || '-'}</p>` : '<strong>Belum ada sesi</strong><p>Buat sesi baru di menu Tambahkan Sesi.</p>';
  }


function renderSessionManagement() {
  const detail = document.getElementById('activeSessionDetail');
  const list = document.getElementById('sessionList');
  const joined = document.getElementById('joinedPlayersBox');
  const s = snapshot?.session;

  if (detail) {
    detail.innerHTML = s ? `
      <p class="muted upper">KODE SESI</p>
      <strong style="font-size:32px; letter-spacing:1px;">${s.code}</strong>
      <p>${s.title} · ${dateTimeText(s.startAt)}<br>${s.location} · ${s.court} · PJ ${s.pj || '-'}</p>` : '<strong>Belum ada sesi aktif</strong><p>Buat sesi baru terlebih dahulu.</p>';
  }

  if (list) {
  const rows = sessions.length ? sessions : (s ? [s] : []);
  list.innerHTML = rows.length ? `<table><thead><tr><th>Sesi</th><th>Jam</th><th>Tempat</th><th>PJ</th><th>Kode</th><th>Status</th></tr></thead><tbody>${rows.map((x) => `
    <tr data-session-id="${x._id}">
      <td><strong>${x.title}</strong></td>
      <td>${dateTimeText(x.startAt)}</td>
      <td>${x.location} · ${x.court}</td>
      <td>${x.pj || '-'}</td>
      <td><strong>${x.code}</strong></td>
      <td>
        ${
          x.isActive
            ? '<button class="btn-danger sm" data-close-session="' + x._id + '">Tutup Sesi</button>'
            : '<button class="btn-primary sm" data-activate-session="' + x._id + '">Aktifkan</button>'
        }
      </td>
    </tr>`).join('')}</tbody></table>` : '<p class="muted small">Belum ada sesi tersimpan.</p>';
}

  if (joined) {
    const players = snapshot?.players || [];
    joined.innerHTML = players.length ? `<table><thead><tr><th>Nama</th><th>Gender</th><th>Grade</th><th>Status</th><th>Join</th></tr></thead><tbody>${players.map((p) => `<tr><td>${p.nama}</td><td>${p.gender === 'P' ? 'Pria' : 'Wanita'}</td><td>${p.grade}</td><td>${p.status}</td><td>${timeText(p.waktu_hadir)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted small">Belum ada player yang join sesi ini.</p>';
  }
}

function renderQueue() {
  const card = document.querySelector('#page-antrean .card');
  if (!card) return;
  card.querySelector('.empty')?.remove();
  let wrap = card.querySelector('#queueWrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'queueWrap';
    wrap.className = 'table-wrap';
    card.appendChild(wrap);
  }
  if (!snapshot.queue.length) {
    wrap.innerHTML = '<div class="empty"><i class="fa-solid fa-users"></i><p>Belum ada pemain di antrean</p></div>';
    return;
  }
  wrap.innerHTML = `<table><thead><tr><th>#</th><th>Nama</th><th>Gender</th><th>Grade</th><th>Jumlah Main</th><th>Waktu Hadir</th></tr></thead><tbody>
    ${snapshot.queue.map((p, i) => `<tr><td>${i + 1}</td><td>${p.nama}</td><td>${p.gender === 'P' ? 'Pria' : 'Wanita'}</td><td>${p.grade}</td><td>${p.jumlah_main}</td><td>${timeText(p.waktu_hadir)}</td></tr>`).join('')}
  </tbody></table>`;
}

function renderGenerate() {
  const generateBtn = document.getElementById('generateBtn');
  const generateCard = document.querySelector('#page-generate .card');
  const note = generateCard?.querySelector('.muted.center.small');
  if (generateBtn) generateBtn.disabled = snapshot.queue.length < 4;
  if (note) note.textContent = snapshot.queue.length < 4 ? `Kurang ${4 - snapshot.queue.length} pemain` : `${snapshot.queue.length} pemain siap dimatchkan`;

  const courtCard = document.querySelector('.court-card');
  const active = snapshot.matches.find((m) => m.status === 'playing');
  if (courtCard) {
    courtCard.querySelector('.empty')?.remove();
    const h3 = courtCard.querySelector('h3');
    const status = courtCard.querySelector('.status-block strong');
    if (h3) h3.textContent = active ? `#${active.matchNo}` : '#—';
    if (status) status.textContent = active ? 'Bermain' : 'Menunggu';
    let box = courtCard.querySelector('#activeMatchBox');
    if (!box) {
      box = document.createElement('div');
      box.id = 'activeMatchBox';
      box.className = 'alur-item blue';
      courtCard.appendChild(box);
    }
    box.innerHTML = active ? `
      <strong>${active.gameType} · ${active.team1Point} vs ${active.team2Point} poin</strong>
      <p>Tim 1: ${teamText(active.team1)}</p><p>Tim 2: ${teamText(active.team2)}</p>
      <button class="btn-primary sm" data-complete="${active._id}">Selesaikan & kembali antrean</button>` : '<strong>Belum ada match aktif</strong><p>Generate match untuk mulai.</p>';
  }

  const logCard = document.querySelector('#page-generate .grid-stack .card:nth-child(2)');
  if (logCard) {
    const latest = snapshot.matches.slice(0, 5);
    logCard.innerHTML = `<div class="card-head"><h3>Log Match</h3></div>${latest.length ? `<ul class="log-list">${latest.map((m) => `<li><span>#${m.matchNo} ${m.gameType}: ${teamText(m.team1)} vs ${teamText(m.team2)}</span><span class="log-time">${m.status}</span></li>`).join('')}</ul>` : '<p class="muted">Belum ada aktivitas...</p>'}`;
  }
}

function renderHistory() {
  const tbody = document.querySelector('#page-riwayat tbody');
  if (!tbody) return;

  const matches = snapshot.matches || [];

  tbody.innerHTML = matches.length
    ? matches.map((m) => `
      <tr>
        <td>#${m.matchNo} · ${m.gameType}</td>
        <td>${teamText(m.team1)}</td>
        <td>${m.team1Point} - ${m.team2Point}</td>
        <td>${teamText(m.team2)}</td>
        <td>
          <strong>${m.score || '-'}</strong><br>
          <span class="muted small">${winnerText(m.winner)}</span>
        </td>
        <td>
          <input
            class="input-block sm-score"
            data-score-input="${m._id}"
            placeholder="21-17, 21-18"
            value="${m.score || ''}"
          />
          <select class="input-block sm-winner" data-winner-input="${m._id}">
            <option value="" ${!m.winner ? 'selected' : ''}>Belum ada</option>
            <option value="team1" ${m.winner === 'team1' ? 'selected' : ''}>Tim A menang</option>
            <option value="team2" ${m.winner === 'team2' ? 'selected' : ''}>Tim B menang</option>
            <option value="draw" ${m.winner === 'draw' ? 'selected' : ''}>Draw</option>
          </select>
          <button class="btn-primary sm" data-save-result="${m._id}">
            Simpan
          </button>
        </td>
      </tr>
    `).join('')
    : '<tr><td colspan="6" class="td-empty">Belum ada riwayat</td></tr>';
}

function renderLeaderboard() {
  const card = document.querySelector('#page-leaderboard .card:first-child');
  if (card) {
    card.querySelector('.empty')?.remove();
    let box = card.querySelector('#leaderboardTable');
    if (!box) {
      box = document.createElement('div');
      box.id = 'leaderboardTable';
      box.className = 'table-wrap';
      card.appendChild(box);
    }
    const players = [...snapshot.players].sort((a, b) => b.jumlah_main - a.jumlah_main || a.nama.localeCompare(b.nama));
    box.innerHTML = players.length ? `<table><thead><tr><th>Rank</th><th>Nama</th><th>Grade</th><th>Status</th><th>Main</th></tr></thead><tbody>${players.map((p, i) => `<tr><td>#${i + 1}</td><td>${p.nama}</td><td>${p.grade}/${p.gender}</td><td>${p.status}</td><td>${p.jumlah_main}</td></tr>`).join('')}</tbody></table>` : '<div class="empty"><i class="fa-solid fa-trophy"></i><p>Belum ada data</p></div>';
  }
  const bars = document.querySelectorAll('#page-leaderboard .stat-bar strong');
  if (bars[0]) bars[0].textContent = snapshot.stats.totalMatches;
  if (bars[1]) bars[1].textContent = snapshot.stats.totalPlayers;
  if (bars[2]) bars[2].textContent = snapshot.stats.avgPlay;
}

function renderAll() {
  if (!snapshot) return;
  renderStats();
  renderDashboardCards();
  renderSessionManagement();
  renderQueue();
  renderGenerate();
  renderHistory();
  renderLeaderboard();
}

async function loadSessions() {
  sessions = await api('/api/sessions');
}
async function loadSnapshot() {
  snapshot = await api('/api/sessions/active');
  if (snapshot.session?._id) socket?.emit('session:join', snapshot.session._id);
  await loadSessions();
  renderAll();
}

function csvSafe(value) {
  const raw = value === null || value === undefined ? '' : String(value);

  // Mencegah formula injection saat CSV dibuka di Excel/Sheets
  const protectedValue = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;

  return `"${protectedValue.replace(/"/g, '""')}"`;
}

function exportMatchesToSpreadsheet() {
  const matches = snapshot?.matches || [];

  if (!matches.length) {
    toast('Belum ada riwayat match untuk diexport', 'info');
    return;
  }

  const session = snapshot?.session;

  const headers = [
    'No Match',
    'Tipe Game',
    'Tim A',
    'VS',
    'Tim B',
    'Skor',
    'Pemenang',
    'Status',
    'Kode Sesi',
    'Nama Sesi',
    'Court',
    'PJ',
  ];

  const rows = matches
    .slice()
    .sort((a, b) => Number(a.matchNo || 0) - Number(b.matchNo || 0))
    .map((m) => [
      m.matchNo ? `#${m.matchNo}` : '-',
      m.gameType || '-',
      teamText(m.team1),
      'vs',
      teamText(m.team2),
      m.score || '',
      winnerText(m.winner),
      m.status || '-',
      session?.code || '',
      session?.title || '',
      session?.court || '',
      session?.pj || '',
    ]);

  const csv = [headers, ...rows]
    .map((row) => row.map(csvSafe).join(','))
    .join('\r\n');

  const blob = new Blob([`\uFEFF${csv}`], {
    type: 'text/csv;charset=utf-8;',
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  const today = new Date().toISOString().slice(0, 10);
  const code = session?.code || 'tanpa-sesi';

  a.href = url;
  a.download = `riwayat-match-${code}-${today}.csv`;

  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);

  toast('Riwayat match berhasil diexport');
  addLog('Admin export riwayat match ke spreadsheet', 'fa-file-export');
}

document.addEventListener('click', (e) => {
  if (e.target.closest('#exportSpreadsheetBtn')) {
    exportMatchesToSpreadsheet();
  }
});


function defaultLocalDateTime() {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  d.setMinutes(0, 0, 0);
  return d.toISOString().slice(0, 16);
}
const sessionStartAt = document.getElementById('sessionStartAt');
if (sessionStartAt && !sessionStartAt.value) sessionStartAt.value = defaultLocalDateTime();

async function createSessionFromForm() {
  const title = document.getElementById('sessionTitle')?.value.trim();
  const startAt = document.getElementById('sessionStartAt')?.value;
  const location = document.getElementById('sessionLocation')?.value.trim() || 'GOR UB';
  const court = document.getElementById('sessionCourt')?.value.trim() || 'Court A';
  const pj = document.getElementById('sessionPj')?.value || 'Sulthan';
  if (!title) return toast('Nama sesi wajib diisi', 'error');
  if (!startAt) return toast('Jam sesi wajib diisi', 'error');
  try {
    const session = await api('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ title, startAt, location, court, pj, isActive: true }),
    });
    document.getElementById('sessionTitle').value = '';
    toast(`Sesi aktif dibuat. Kode: ${session.code}`);
    addLog(`Sesi ${session.title} dibuat dengan kode ${session.code}`, 'fa-calendar-plus');
    await loadSnapshot();
  } catch (err) { toast(err.message, 'error'); }
}
document.getElementById('saveSessionBtn')?.addEventListener('click', createSessionFromForm);

document.addEventListener('click', async (e) => {
  const closeSessionBtn = e.target.closest('[data-close-session]');
  const activate = e.target.closest('[data-activate-session]');
  const saveResult = e.target.closest('[data-save-result]');
  const complete = e.target.closest('[data-complete]');
  const row = e.target.closest('[data-session-id]');

  if (closeSessionBtn) {
    e.stopPropagation();

    if (!confirm('Tutup sesi ini? Data match dan pemain tetap tersimpan.')) return;

    try {
      const session = await api(`/api/sessions/${closeSessionBtn.dataset.closeSession}/close`, {
        method: 'PATCH',
      });

      toast(`Sesi ${session.code} ditutup`);
      addLog(`Sesi ${session.code} ditutup`, 'fa-calendar-xmark');
      await loadSnapshot();
    } catch (err) {
      toast(err.message, 'error');
    }

    return;
  }

  if (activate) {
    e.stopPropagation();

    try {
      const session = await api(`/api/sessions/${activate.dataset.activateSession}/activate`, {
        method: 'PATCH',
      });

      toast(`Sesi ${session.code} diaktifkan`);
      await loadSnapshot();
    } catch (err) {
      toast(err.message, 'error');
    }

    return;
  }

  if (saveResult) {
    e.stopPropagation();

    const matchId = saveResult.dataset.saveResult;
    const score = document.querySelector(`[data-score-input="${matchId}"]`)?.value.trim() || '';
    const winner = document.querySelector(`[data-winner-input="${matchId}"]`)?.value || '';

    try {
      await api(`/api/matches/${matchId}/result`, {
        method: 'PATCH',
        body: JSON.stringify({
          score,
          winner,
        }),
      });

      toast('Hasil pertandingan disimpan');
      addLog('Admin update hasil pertandingan', 'fa-pen-to-square');
      await loadSnapshot();
    } catch (err) {
      toast(err.message, 'error');
    }

    return;
  }

  if (complete) {
    e.stopPropagation();
    completeMatch(complete.dataset.complete);
    return;
  }

  if (row) {
    const s = sessions.find((x) => String(x._id) === String(row.dataset.sessionId));

    if (s) {
      const detail = document.getElementById('activeSessionDetail');
      detail.innerHTML = `
        <p class="muted upper">KODE SESI</p>
        <strong style="font-size:32px; letter-spacing:1px;">${s.code}</strong>
        <p>${s.title} · ${dateTimeText(s.startAt)}<br>${s.location} · ${s.court} · PJ ${s.pj || '-'}</p>
      `;
    }
  }
});

document.getElementById('resetAntrean')?.addEventListener('click', async () => {
  toast('Reset antrean perlu endpoint khusus bila ingin menghapus semua pemain.', 'info');
  addLog('Admin mencoba reset antrean', 'fa-rotate');
});

document.getElementById('generateBtn')?.addEventListener('click', async () => {
  try {
    const match = await api('/api/matches/generate', { method: 'POST', body: JSON.stringify({ sessionId: snapshot.session?._id, tolerance: 0, fallbackTolerance: 2 }) });
    toast(`Match #${match.matchNo} dibuat`);
    addLog(`Match #${match.matchNo}: ${teamText(match.team1)} vs ${teamText(match.team2)}`, 'fa-bolt');
    await loadSnapshot();
  } catch (err) { toast(err.message, 'error'); }
});

async function completeMatch(matchId) {
  try {
    const match = await api(`/api/matches/${matchId}/complete`, { method: 'PATCH', body: JSON.stringify({ returnToQueue: true }) });
    toast(`Match #${match.matchNo} selesai`);
    addLog(`Match #${match.matchNo} selesai`, 'fa-flag-checkered');
    await loadSnapshot();
  } catch (err) { toast(err.message, 'error'); }
}

document.querySelector('.user-logout')?.addEventListener('click', () => {
  localStorage.removeItem('uabt-auth-token');
  localStorage.removeItem('uabt-auth-player');
  localStorage.removeItem('uabt-current-player');
});

// Settings
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-toggle]');
  if (t) {
    t.classList.toggle('on');
    toast(t.classList.contains('on') ? 'Diaktifkan' : 'Dimatikan');
  }
});
apiInput?.parentElement?.querySelector('.btn-primary')?.addEventListener('click', () => {
  localStorage.setItem('uabt-api-url', apiInput.value.trim());
  window.location.reload();
});
apiInput?.parentElement?.querySelector('.btn-ghost')?.addEventListener('click', async () => {
  try { await api('/health'); toast('Backend tersambung'); } catch (err) { toast(err.message, 'error'); }
});

const themeBtn = document.getElementById('themeBtn');
const savedTheme = localStorage.getItem('uabt-admin-theme');
if (savedTheme === 'light') document.body.classList.add('light');
function syncThemeIcon() {
  const i = themeBtn?.querySelector('i');
  if (i) i.className = document.body.classList.contains('light') ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
}
syncThemeIcon();
themeBtn?.addEventListener('click', () => {
  document.body.classList.toggle('light');
  localStorage.setItem('uabt-admin-theme', document.body.classList.contains('light') ? 'light' : 'dark');
  syncThemeIcon();
});

socket?.on('snapshot:update', async (next) => { snapshot = next; await loadSessions(); renderAll(); });
socket?.on('session:created', async (s) => { addLog(`Sesi ${s.code} dibuat`, 'fa-calendar-plus'); await loadSessions(); renderAll(); });
socket?.on('player:joined', (p) => {
  addLog(`${p.nama} join sesi dan masuk antrean`, 'fa-user-plus');
  toast(`${p.nama} baru join sesi`, 'info');
});
socket?.on('match:generated', (m) => addLog(`Match #${m.matchNo} generated`, 'fa-shuttlecock'));
socket?.on('connect', () => snapshot?.session?._id && socket.emit('session:join', snapshot.session._id));

loadSnapshot().then(() => addLog('Admin login ke panel UABT', 'fa-right-to-bracket')).catch((err) => {
  toast(`Backend belum tersambung: ${err.message}`, 'error');
});
