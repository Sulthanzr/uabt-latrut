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

const ACTION_LOCKS = new Map();

function setButtonBusy(button, isBusy, busyText = 'Memproses...') {
  if (!button) return;

  if (isBusy) {
    if (!button.dataset.originalHtml) {
      button.dataset.originalHtml = button.innerHTML;
    }

    button.disabled = true;
    button.classList.add('is-loading');
    button.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${busyText}`;
    return;
  }

  button.disabled = false;
  button.classList.remove('is-loading');

  if (button.dataset.originalHtml) {
    button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
  }
}

async function runActionOnce(actionKey, button, handler, options = {}) {
  const {
    busyText = 'Memproses...',
    cooldown = 1200,
    showDuplicateToast = false,
  } = options;

  if (ACTION_LOCKS.has(actionKey)) {
    if (showDuplicateToast) {
      toast('Permintaan sedang diproses. Tunggu sebentar.', 'info');
    }
    return null;
  }

  ACTION_LOCKS.set(actionKey, true);
  setButtonBusy(button, true, busyText);

  try {
    return await handler();
  } finally {
    setTimeout(() => {
      ACTION_LOCKS.delete(actionKey);
      setButtonBusy(button, false);
    }, cooldown);
  }
}

const VALID_PJ_NAMES = ['Davy', 'David', 'Bagas', 'Sulthan'];

function formatUsernameAsPj(username = '') {
  const clean = String(username || '').trim().toLowerCase();

  if (!clean) return '';

  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function getLoggedInAdminDisplayName() {
  return (
    CURRENT_USER?.nama ||
    CURRENT_USER?.name ||
    CURRENT_USER?.username ||
    'Admin'
  );
}

function getLoggedInPjName() {
  const pjName = formatUsernameAsPj(CURRENT_USER?.username);

  return VALID_PJ_NAMES.includes(pjName) ? pjName : '';
}

function getLoggedInAdminName() {
  return normalizeAdminName(
    CURRENT_USER?.nama ||
    CURRENT_USER?.name ||
    CURRENT_USER?.username ||
    'Admin'
  );
}

function getInitials(name = 'Admin') {
  return String(name)
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function renderLoggedInAdmin() {
  const adminDisplayName = getLoggedInAdminDisplayName();
  const pjName = getLoggedInPjName();

  const avatar = document.getElementById('adminAvatar');
  const displayName = document.getElementById('adminDisplayName');
  const roleLabel = document.getElementById('adminRoleLabel');
  const sessionPj = document.getElementById('sessionPj');

  if (avatar) avatar.textContent = getInitials(adminDisplayName);
  if (displayName) displayName.textContent = adminDisplayName;
  if (roleLabel) roleLabel.textContent = 'Administrator';

  if (sessionPj) {
    sessionPj.value = pjName || 'Username admin belum valid';
  }
}

renderLoggedInAdmin();

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

function showConfirmDialog({
  title = 'Konfirmasi!',
  message = '',
  confirmText = 'IYA',
  cancelText = 'TIDAK',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    document.querySelector('.confirm-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';

    overlay.innerHTML = `
      <div class="confirm-dialog" role="dialog" aria-modal="true">
        <h2>${title}</h2>
        <p>${message}</p>

        <div class="confirm-actions">
          <button type="button" class="${danger ? 'confirm-btn-danger' : 'confirm-btn-primary'}" data-confirm-yes>
            ${confirmText}
          </button>
          <button type="button" class="confirm-btn-cancel" data-confirm-no>
            ${cancelText}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = (value) => {
      overlay.classList.remove('show');
      setTimeout(() => {
        overlay.remove();
        resolve(value);
      }, 160);
    };

    requestAnimationFrame(() => {
      overlay.classList.add('show');
      overlay.querySelector('[data-confirm-no]')?.focus();
    });

    overlay.querySelector('[data-confirm-yes]')?.addEventListener('click', () => close(true));
    overlay.querySelector('[data-confirm-no]')?.addEventListener('click', () => close(false));

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close(false);
    });

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        document.removeEventListener('keydown', onKeyDown);
        close(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);
  });
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

  const text = await res.text();

  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }

  if (!res.ok) {
    throw new Error(body.message || `Request gagal (${res.status})`);
  }

  return body.data ?? body;
}

function gradePoint(grade) { return { A: 3, B: 2, C: 1 }[grade] || 0; }
function playerText(p) { return `${p.nama} <span class="muted">${p.grade}/${p.gender} · ${p.jumlah_main}x</span>`; }
function teamText(team) { return (team || []).map((p) => `${p.nama} (${p.grade})`).join(' / '); }
function timeText(date) { return date ? new Date(date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'; }
function dateTimeText(date) { return date ? new Date(date).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-'; }

function parseCourtList(courtText = 'Court 1') {
  return String(courtText || 'Court 1')
    .split(',')
    .map((court) => court.trim())
    .filter(Boolean);
}

function buildCourtList(count) {
  const total = Math.max(1, Math.min(Number(count) || 1, 10));

  return Array.from({ length: total }, (_, index) => `Court ${index + 1}`).join(', ');
}

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
        <div class="session-actions">
          ${
            x.isActive
              ? '<button class="btn-danger sm" data-close-session="' + x._id + '">Tutup Sesi</button>'
              : '<button class="btn-primary sm" data-activate-session="' + x._id + '">Aktifkan</button>'
          }

          <button
            class="btn-danger sm"
            data-delete-session="${x._id}"
            data-session-code="${x.code || ''}"
            data-session-title="${x.title || ''}"
          >
            Hapus Sesi
          </button>
        </div>
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

  const queueCount = snapshot?.queue?.length || 0;
  const queuePreview = generateCard?.querySelector('.empty');

  if (queuePreview) {
    if (!queueCount) {
      queuePreview.innerHTML = `
        <i class="fa-solid fa-bullseye"></i>
        <p>Belum ada pemain</p>
      `;
    } else {
      const previewPlayers = (snapshot?.queue || []).slice(0, 6);

      queuePreview.innerHTML = `
        <i class="fa-solid fa-users"></i>
        <p><strong>${queueCount} pemain siap dimatchkan</strong></p>
        <p class="muted small">
          ${previewPlayers.map((p) => `${p.nama} (${p.grade}/${p.gender})`).join(' · ')}
          ${queueCount > previewPlayers.length ? ` · +${queueCount - previewPlayers.length} lainnya` : ''}
        </p>
      `;
    }
  }
  const activeMatches = (snapshot?.matches || []).filter((m) => m.status === 'playing');
  const courts = parseCourtList(snapshot?.session?.court || 'Court 1');

  const busyCourts = new Set(
    activeMatches
      .map((m) => String(m.court || '').trim())
      .filter(Boolean)
  );

  const availableCourts = courts.filter((court) => !busyCourts.has(court));
  const possibleMatches = Math.min(Math.floor(queueCount / 4), availableCourts.length);

  if (generateBtn) {
    generateBtn.disabled = !snapshot?.session || possibleMatches < 1;
  }

  if (note) {
    if (!snapshot?.session) {
      note.textContent = 'Belum ada sesi aktif';
    } else if (queueCount < 4) {
      note.textContent = `Kurang ${4 - queueCount} pemain`;
    } else if (!availableCourts.length) {
      note.textContent = 'Semua lapangan sedang dipakai';
    } else {
      note.textContent = `${queueCount} pemain siap · ${availableCourts.length} lapangan kosong → bisa generate ${possibleMatches} match`;
    }
  }

  const courtCard = document.querySelector('.court-card');

  if (courtCard) {
    const activeSorted = activeMatches
      .slice()
      .sort((a, b) => Number(a.matchNo || 0) - Number(b.matchNo || 0));

    courtCard.innerHTML = `
      <div class="card-head">
        <div>
          <p class="muted upper">MATCH AKTIF</p>
          <h3>${activeSorted.length ? `${activeSorted.length} Match` : '#—'}</h3>
        </div>
        <div class="status-block">
          <p class="muted upper">LAPANGAN</p>
          <strong>${availableCourts.length}/${courts.length} kosong</strong>
        </div>
      </div>

      ${
        activeSorted.length
          ? activeSorted.map((m) => `
            <div class="alur-item blue">
              <strong>${m.court || 'Court'} · Match #${m.matchNo} · ${m.gameType}</strong>
              <p>Tim A: ${teamText(m.team1)}</p>
              <p>Tim B: ${teamText(m.team2)}</p>
              <p>Poin: ${m.team1Point} - ${m.team2Point}</p>
              <button class="btn-primary sm" data-complete="${m._id}">
                Selesaikan & kembali antrean
              </button>
            </div>
          `).join('')
          : courts.map((court) => `
            <div class="alur-item green">
              <strong>${court}</strong>
              <p>Lapangan kosong. Generate match untuk mulai.</p>
            </div>
          `).join('')
      }
    `;
  }

  const logCard = document.querySelector('#page-generate .grid-stack .card:nth-child(2)');
  if (logCard) {
    const latest = (snapshot.matches || []).slice(0, 5);

    logCard.innerHTML = `
      <div class="card-head"><h3>Log Match</h3></div>
      ${
        latest.length
          ? `<ul class="log-list">
              ${latest.map((m) => `
                <li>
                  <span>#${m.matchNo} ${m.court || ''} ${m.gameType}: ${teamText(m.team1)} vs ${teamText(m.team2)}</span>
                  <span class="log-time">${m.status}</span>
                </li>
              `).join('')}
            </ul>`
          : '<p class="muted">Belum ada aktivitas...</p>'
      }
    `;
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

function excelText(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function safeFileName(value) {
  return String(value || 'riwayat-match')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

function sessionTimeLabel(session) {
  const date = session?.startAt ? new Date(session.startAt) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return 'Jam -';
  }

  return `Jam ${date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  }).replace('.', ':')}`;
}

async function exportMatchesToSpreadsheet() {
  const matches = snapshot?.matches || [];

  if (!matches.length) {
    toast('Belum ada riwayat match untuk diexport', 'info');
    return;
  }

  if (!window.ExcelJS) {
    toast('Library Excel belum siap. Refresh halaman lalu coba lagi.', 'error');
    return;
  }

  const session = snapshot?.session || {};
  const sortedMatches = matches
    .slice()
    .sort((a, b) => Number(a.matchNo || 0) - Number(b.matchNo || 0));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'UABT UB';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Riwayat Match', {
    views: [{ state: 'frozen', ySplit: 8 }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  sheet.columns = [
    { key: 'no', width: 11 },
    { key: 'gameType', width: 15 },
    { key: 'teamA', width: 46 },
    { key: 'vs', width: 6 },
    { key: 'teamB', width: 46 },
    { key: 'score', width: 18 },
    { key: 'winner', width: 24 },
    { key: 'status', width: 18 },
  ];

  sheet.mergeCells('A2:H2');
  sheet.mergeCells('A3:H3');
  sheet.mergeCells('A4:H4');
  sheet.mergeCells('A5:H5');
  sheet.mergeCells('A6:H6');

  sheet.getCell('A2').value = excelText(session.title || 'Nama Sesi');
  sheet.getCell('A3').value = excelText(sessionTimeLabel(session));
  sheet.getCell('A4').value = excelText(session.court || 'Court -');
  sheet.getCell('A5').value = excelText(`Kode Sesi ${session.code || '-'}`);
  sheet.getCell('A6').value = excelText(`PJ ${session.pj || '-'}`);

  ['A2', 'A3', 'A4', 'A5', 'A6'].forEach((cellRef) => {
    const cell = sheet.getCell(cellRef);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.font = {
      name: 'Calibri',
      bold: true,
      size: cellRef === 'A2' ? 14 : 12,
    };
  });

  sheet.getRow(1).height = 22;
  sheet.getRow(2).height = 24;
  sheet.getRow(3).height = 22;
  sheet.getRow(4).height = 22;
  sheet.getRow(5).height = 22;
  sheet.getRow(6).height = 22;
  sheet.getRow(7).height = 12;

  const headerRow = sheet.getRow(8);
  headerRow.values = [
    'No Match',
    'Tipe Game',
    'Tim A',
    'VS',
    'Tim B',
    'Skor',
    'Pemenang',
    'Status',
  ];

  headerRow.height = 22;
  headerRow.font = { name: 'Calibri', bold: true, size: 12 };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

  sortedMatches.forEach((m, index) => {
    const row = sheet.getRow(9 + index);

    row.values = [
      m.matchNo ? `#${m.matchNo}` : `#${index + 1}`,
      excelText(m.gameType || '-'),
      excelText(teamText(m.team1)),
      'vs',
      excelText(teamText(m.team2)),
      excelText(m.score || ''),
      excelText(winnerText(m.winner)),
      excelText(m.status || '-'),
    ];

    row.height = 22;
  });

  const lastRow = 8 + sortedMatches.length;

  for (let rowNumber = 8; rowNumber <= lastRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } },
      };

      cell.alignment = {
        vertical: 'middle',
        horizontal: colNumber === 3 || colNumber === 5 ? 'left' : 'center',
        wrapText: true,
      };

      cell.font = {
        name: 'Calibri',
        size: 11,
        bold: rowNumber === 8,
      };
    });
  }

  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFEAF4DD' },
    };
  });

  sheet.getCell('A2').border = {
    top: { style: 'thin', color: { argb: 'FF000000' } },
    left: { style: 'thin', color: { argb: 'FF000000' } },
    right: { style: 'thin', color: { argb: 'FF000000' } },
  };

  ['A2:H2', 'A3:H3', 'A4:H4', 'A5:H5', 'A6:H6'].forEach((rangeRef) => {
    sheet.getCell(rangeRef.split(':')[0]).alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };
  });

  sheet.eachRow((row) => {
    row.commit?.();
  });

  const buffer = await workbook.xlsx.writeBuffer();

  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  const today = new Date().toISOString().slice(0, 10);
  const code = session?.code || 'tanpa-sesi';
  const name = safeFileName(session?.title || 'riwayat-match');

  a.href = url;
  a.download = `${name}-${code}-${today}.xlsx`;

  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);

  toast('Riwayat match berhasil diexport ke Excel');
  addLog('Admin export riwayat match ke Excel', 'fa-file-export');
}

document.addEventListener('click', async (e) => {
  if (e.target.closest('#exportSpreadsheetBtn')) {
    try {
      await exportMatchesToSpreadsheet();
    } catch (err) {
      console.error(err);
      toast(err.message || 'Gagal export Excel', 'error');
    }
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
  const courtCount = document.getElementById('sessionCourtCount')?.value || 1;
  const court = buildCourtList(courtCount);
  const pj = getLoggedInPjName();

  if (!title) return toast('Nama sesi wajib diisi', 'error');
  if (!startAt) return toast('Jam sesi wajib diisi', 'error');
  if (!pj) {
    return toast('Username admin belum sesuai untuk PJ. Gunakan username: davy, david, bagas, atau sulthan.', 'error');
  }
  try {
    const session = await api('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ title, startAt, location, court, pj, isActive: true }),
    });

    document.getElementById('sessionTitle').value = '';
    toast(`Sesi aktif dibuat. Kode: ${session.code}`);
    addLog(`Sesi ${session.title} dibuat dengan kode ${session.code}`, 'fa-calendar-plus');
    await loadSnapshot();
  } catch (err) {
    toast(err.message, 'error');
  }
}

document.getElementById('saveSessionBtn')?.addEventListener('click', (event) => {
  runActionOnce(
    'create-session',
    event.currentTarget,
    createSessionFromForm,
    {
      busyText: 'Menyimpan sesi...',
      cooldown: 1800,
      showDuplicateToast: true,
    }
  );
});

document.addEventListener('click', async (e) => {
  const closeSessionBtn = e.target.closest('[data-close-session]');
  const activate = e.target.closest('[data-activate-session]');
  const deleteSessionBtn = e.target.closest('[data-delete-session]');
  const saveResult = e.target.closest('[data-save-result]');
  const complete = e.target.closest('[data-complete]');
  const row = e.target.closest('[data-session-id]');

  if (closeSessionBtn) {
    e.stopPropagation();

    const ok = await showConfirmDialog({
      title: 'Konfirmasi!',
      message: 'Apakah kamu yakin ingin menutup sesi ini? Data match dan pemain tetap tersimpan.',
      confirmText: 'IYA, TUTUP',
      cancelText: 'TIDAK',
      danger: false,
    });

    if (!ok) return;

    runActionOnce(
      `close-session-${closeSessionBtn.dataset.closeSession}`,
      closeSessionBtn,
      async () => {
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
      },
      {
        busyText: 'Menutup...',
        cooldown: 1500,
        showDuplicateToast: true,
      }
    );

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

    if (deleteSessionBtn) {
      e.stopPropagation();

      const sessionId = deleteSessionBtn.dataset.deleteSession;
      const sessionCode = deleteSessionBtn.dataset.sessionCode || '-';
      const sessionTitle = deleteSessionBtn.dataset.sessionTitle || 'sesi ini';

      const ok = await showConfirmDialog({
        title: 'Konfirmasi!',
        message:
          `Apakah kamu yakin ingin menghapus ${sessionTitle} (${sessionCode})? ` +
          'Tindakan ini akan menghapus sesi dan seluruh match pada sesi tersebut. ' +
          'Player yang join sesi ini akan di-reset keluar dari sesi. ' +
          'Tindakan ini tidak bisa dibatalkan.',
        confirmText: 'IYA, HAPUS',
        cancelText: 'TIDAK',
        danger: true,
      });

      if (!ok) return;

      runActionOnce(
        `delete-session-${sessionId}`,
        deleteSessionBtn,
        async () => {
          try {
            const result = await api(`/api/sessions/${sessionId}`, {
              method: 'DELETE',
            });

            const deletedSession = result.session || {};
            const code = deletedSession.code || sessionCode;

            toast(`Sesi ${code} berhasil dihapus`);
            addLog(
              `Sesi ${code} dihapus. ${result.deletedMatches || 0} match dihapus, ${result.resetPlayers || 0} player di-reset.`,
              'fa-trash'
            );

            await loadSnapshot();
          } catch (err) {
            toast(err.message, 'error');
          }
        },
        {
          busyText: 'Menghapus...',
          cooldown: 1800,
          showDuplicateToast: true,
        }
      );

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

    const matchId = complete.dataset.complete;

    runActionOnce(
      `complete-match-${matchId}`,
      complete,
      () => completeMatch(matchId),
      {
        busyText: 'Menyelesaikan...',
        cooldown: 1500,
        showDuplicateToast: true,
      }
    );

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

document.getElementById('generateBtn')?.addEventListener('click', (event) => {
  runActionOnce(
    'generate-match',
    event.currentTarget,
    async () => {
      try {
        const result = await api('/api/matches/generate-batch', {
          method: 'POST',
          body: JSON.stringify({
            sessionId: snapshot.session?._id,
            tolerance: 0,
            fallbackTolerance: 2,
          }),
        });

        const matches = result.matches || [];

        if (!matches.length) {
          toast('Tidak ada match yang dibuat', 'info');
          return;
        }

        toast(`${matches.length} match berhasil dibuat`);

        addLog(
          `Generate ${matches.length} match: ${matches.map((m) => `#${m.matchNo} ${m.court || ''}`).join(', ')}`,
          'fa-bolt'
        );

        await loadSnapshot();
      } catch (err) {
        toast(err.message, 'error');
      }
    },
    {
      busyText: 'Generate...',
      cooldown: 1500,
      showDuplicateToast: true,
    }
  );
});

async function completeMatch(matchId) {
  try {
    const match = await api(`/api/matches/${matchId}/complete`, {
      method: 'PATCH',
      body: JSON.stringify({ returnToQueue: true }),
    });

    toast(`Match #${match.matchNo} selesai`);
    addLog(`Match #${match.matchNo} selesai`, 'fa-flag-checkered');
    await loadSnapshot();
  } catch (err) {
    toast(err.message, 'error');
  }
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
