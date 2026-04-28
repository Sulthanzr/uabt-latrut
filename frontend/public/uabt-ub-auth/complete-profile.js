const API_BASE = localStorage.getItem('uabt-api-url') || 'https://uabt-latrut-production.up.railway.app';
const tempToken = localStorage.getItem('uabt-google-temp-token');
const profile = JSON.parse(localStorage.getItem('uabt-google-profile') || '{}');
const form = document.getElementById('completeProfileForm');

function showMessage(message, type = 'error') {
  let el = form.querySelector('.auth-message');
  if (!el) {
    el = document.createElement('p');
    el.className = 'auth-message';
    form.appendChild(el);
  }
  el.textContent = message;
  el.style.marginTop = '10px';
  el.style.fontSize = '13px';
  el.style.fontWeight = '700';
  el.style.color = type === 'success' ? '#16a34a' : '#dc2626';
}

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || 'Request gagal');
  return body.data ?? body;
}

function usernameFromEmail(email) {
  return String(email || '').split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '').toLowerCase().slice(0, 32);
}

function saveAuthSession(auth) {
  const player = auth.player || auth;
  if (auth.token) localStorage.setItem('uabt-auth-token', auth.token);
  localStorage.setItem('uabt-auth-player', JSON.stringify(player));
  localStorage.setItem('uabt-current-player', JSON.stringify(player));
}

if (!tempToken) {
  window.location.href = './login.html';
}

document.getElementById('profile-nama').value = profile.nama || '';
document.getElementById('profile-username').value = usernameFromEmail(profile.email);

document.getElementById('backToLogin')?.addEventListener('click', () => {
  localStorage.removeItem('uabt-google-temp-token');
  localStorage.removeItem('uabt-google-profile');
});

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  const originalText = button.innerHTML;
  button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';

  try {
    const auth = await api('/api/auth/google/complete-profile', {
      method: 'POST',
      body: JSON.stringify({
        tempToken,
        nama: document.getElementById('profile-nama').value.trim(),
        username: document.getElementById('profile-username').value.trim().toLowerCase(),
        gender: document.getElementById('profile-gender').value,
        grade: document.getElementById('profile-grade').value,
        phone: document.getElementById('profile-phone').value.trim(),
      }),
    });

    localStorage.removeItem('uabt-google-temp-token');
    localStorage.removeItem('uabt-google-profile');
    saveAuthSession(auth);
    window.location.href = '../uabt-ub/index.html';
  } catch (err) {
    showMessage(err.message || 'Gagal melengkapi profil.');
  } finally {
    button.disabled = false;
    button.innerHTML = originalText;
  }
});
