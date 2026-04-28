const API_BASE = localStorage.getItem('uabt-api-url') || 'http://localhost:3000';

async function api(path, options = {}) {
  const token = localStorage.getItem('uabt-auth-token');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { headers, ...options });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || 'Request gagal');
  return body.data ?? body;
}

function setButtonLoading(button, loading, text = 'Memproses...') {
  if (!button) return;
  button.disabled = loading;
  button.dataset.originalText ||= button.innerHTML;
  button.innerHTML = loading ? `<i class="fa-solid fa-spinner fa-spin"></i> ${text}` : button.dataset.originalText;
}

function showFormMessage(form, message, type = 'error') {
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

function normalizeGender(value) {
  const v = String(value || '').toLowerCase();
  if (v.includes('perempuan') || v === 'w') return 'W';
  return 'P';
}

function normalizeGmail(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  const localPart = raw.includes('@') ? raw.split('@')[0] : raw;
  return `${localPart.replace(/\s+/g, '')}@gmail.com`;
}

function saveAuthSession(auth) {
  const player = auth.player || auth;
  if (auth.token) localStorage.setItem('uabt-auth-token', auth.token);
  localStorage.setItem('uabt-auth-player', JSON.stringify(player));
  localStorage.setItem('uabt-current-player', JSON.stringify(player));
}

function redirectByRole(player) {
  window.location.href = player?.role === 'admin' ? '../uabt-ub-admin/index.html' : '../uabt-ub/index.html';
}

function getGoogleClientId() {
  return String(window.UABT_GOOGLE_CLIENT_ID || '').trim();
}

function initGoogleButton() {
  const target = document.getElementById('googleAuthButton');
  if (!target) return;

  const clientId = getGoogleClientId();
  if (!clientId || clientId.startsWith('GANTI_DENGAN_')) {
    target.innerHTML = '<button type="button" class="btn-google" disabled><span>Google Client ID belum diisi</span></button>';
    return;
  }

  if (!window.google?.accounts?.id) {
    setTimeout(initGoogleButton, 300);
    return;
  }

  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: window.handleGoogleCredential,
  });

  target.innerHTML = '';
  window.google.accounts.id.renderButton(target, {
    type: 'standard',
    size: 'large',
    theme: 'outline',
    text: target.dataset.googleText || 'continue_with',
    shape: 'rectangular',
    logo_alignment: 'left',
  });
}

window.addEventListener('load', initGoogleButton);

document.querySelectorAll('[data-toggle-pass]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const id = btn.getAttribute('data-toggle-pass');
    const input = document.getElementById(id);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
    const icon = btn.querySelector('i');
    if (icon) {
      icon.classList.toggle('fa-eye');
      icon.classList.toggle('fa-eye-slash');
    }
  });
});

const loginForm = document.getElementById('loginForm');
const registerSuccessFlash = localStorage.getItem('uabt-register-success');
if (loginForm && registerSuccessFlash) {
  showFormMessage(loginForm, registerSuccessFlash, 'success');
  localStorage.removeItem('uabt-register-success');
}

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const username = (document.getElementById('username')?.value || '').trim();
  const password = document.getElementById('password')?.value || '';
  const button = loginForm.querySelector('button[type="submit"]');
  setButtonLoading(button, true);
  try {
    const auth = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    saveAuthSession(auth);
    redirectByRole(auth.player);
  } catch (err) {
    showFormMessage(loginForm, err.message || 'Login gagal.');
  } finally {
    setButtonLoading(button, false);
  }
});

const registerForm = document.getElementById('registerForm');

function collectRegisterPayload() {
  return {
    nama: (document.getElementById('fullname')?.value || '').trim(),
    username: (document.getElementById('reg-username')?.value || '').trim().toLowerCase(),
    gender: normalizeGender(document.getElementById('gender')?.value),
    grade: document.getElementById('grade')?.value,
    email: normalizeGmail(document.getElementById('email')?.value),
    password: document.getElementById('reg-password')?.value || '',
    otp: (document.getElementById('reg-otp')?.value || '').trim(),
  };
}

function validateBeforeOtp(payload) {
  if (!payload.nama || !payload.username || !payload.gender || !payload.grade || !payload.email || !payload.password) {
    throw new Error('Lengkapi data register dulu sebelum kirim OTP.');
  }
}

const sendOtpButton = document.getElementById('sendOtp');
sendOtpButton?.addEventListener('click', async () => {
  if (!registerForm) return;
  const payload = collectRegisterPayload();
  setButtonLoading(sendOtpButton, true, 'Mengirim...');
  try {
    validateBeforeOtp(payload);
    const result = await api("/api/auth/register/request-otp", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    showFormMessage(registerForm, result.message || `Kode OTP dikirim ke ${payload.email}. Masukkan kode lalu tekan Register.`, "success");
    document.getElementById('reg-otp')?.focus();
  } catch (err) {
    showFormMessage(registerForm, err.message || 'Gagal mengirim OTP.');
  } finally {
    setButtonLoading(sendOtpButton, false);
  }
});

registerForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = collectRegisterPayload();
  const button = registerForm.querySelector('button[type="submit"]');

  setButtonLoading(button, true, 'Mendaftarkan...');

  try {
    if (!payload.otp) {
      throw new Error('Masukkan kode OTP email dulu. Klik Kirim OTP kalau belum punya kode.');
    }

    await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    localStorage.setItem('uabt-register-success', 'Akun berhasil dibuat. Silakan login.');
    window.location.href = './login.html';
  } catch (err) {
    showFormMessage(registerForm, err.message || 'Register gagal.');
  } finally {
    setButtonLoading(button, false);
  }
});

window.handleGoogleCredential = async function handleGoogleCredential(response) {
  try {
    if (!response?.credential) {
      throw new Error('Credential Google tidak ditemukan.');
    }

    const auth = await api('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential: response.credential }),
    });

    if (auth.requiresProfile) {
      localStorage.setItem('uabt-google-temp-token', auth.tempToken);
      localStorage.setItem('uabt-google-profile', JSON.stringify(auth.profile || {}));
      window.location.href = './complete-profile.html';
      return;
    }

    saveAuthSession(auth);
    redirectByRole(auth.player);
  } catch (err) {
    if (loginForm) {
      showFormMessage(loginForm, err.message || 'Login Google gagal.');
    } else if (registerForm) {
      showFormMessage(registerForm, err.message || 'Register Google gagal.');
    } else {
      alert(err.message || 'Google authentication gagal.');
    }
  }
};
