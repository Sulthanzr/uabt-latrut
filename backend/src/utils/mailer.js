import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'UABT LATRUT <onboarding@resend.dev>';

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

function logOtpToConsole({ to, otp, purpose, reason }) {
  console.log(`[otp:${purpose}] ${to} -> ${otp}`);
  if (reason) console.log(`[mail] ${reason}`);
}

function getOtpSubject(purpose = 'register') {
  if (purpose === 'register') return 'Kode OTP Registrasi UABT LATRUT';
  if (purpose === 'reset-password') return 'Kode OTP Reset Password UABT LATRUT';
  return 'Kode OTP UABT LATRUT';
}

function getOtpHtml({ otp, name = 'Pemain UABT', expiresMinutes }) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:520px;margin:0 auto;padding:24px">
      <h2 style="margin:0 0 12px;color:#1f3320">Kode OTP UABT LATRUT</h2>
      <p>Halo ${name},</p>
      <p>Gunakan kode OTP berikut untuk melanjutkan proses akun kamu:</p>
      <div style="font-size:32px;font-weight:800;letter-spacing:8px;color:#1f3320;background:#f1f9e6;border:1px solid #dceccc;border-radius:14px;padding:18px;text-align:center;margin:18px 0">
        ${otp}
      </div>
      <p>Kode ini berlaku selama <strong>${expiresMinutes} menit</strong>.</p>
      <p>Jangan bagikan kode ini kepada siapa pun.</p>
      <p style="margin-top:22px;color:#6b7d6c;font-size:13px">UABT LATRUT</p>
    </div>
  `;
}

function getOtpText({ otp, expiresMinutes }) {
  return [
    'Halo,',
    '',
    `Kode OTP kamu adalah: ${otp}`,
    '',
    `Kode ini berlaku selama ${expiresMinutes} menit.`,
    'Jangan bagikan kode ini kepada siapa pun.',
    '',
    'UABT LATRUT',
  ].join('\n');
}

export async function sendOtpEmail({
  to,
  otp,
  purpose = 'register',
  name = 'Pemain UABT',
  expiresMinutes = Number(process.env.OTP_EXPIRES_MINUTES || 10),
}) {
  if (!to) {
    throw new Error('Email tujuan OTP belum tersedia.');
  }

  if (!resend) {
    logOtpToConsole({
      to,
      otp,
      purpose,
      reason: 'RESEND_API_KEY belum diset. OTP hanya ditampilkan di terminal backend.',
    });

    return { delivered: false, mode: 'console' };
  }

  const subject = getOtpSubject(purpose);
  const text = getOtpText({ otp, expiresMinutes });
  const html = getOtpHtml({ otp, name, expiresMinutes });

  const { data, error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: [to],
    subject,
    text,
    html,
    headers: {
      'X-Entity-Ref-ID': `${purpose}-${Date.now()}`,
    },
  });

  if (error) {
    logOtpToConsole({
      to,
      otp,
      purpose,
      reason: `Resend gagal (${error?.message || 'unknown error'}).`,
    });

    return {
      delivered: false,
      mode: 'resend-error',
      error: error?.message || 'Gagal mengirim OTP email.',
    };
  }

  return {
    delivered: true,
    mode: 'resend',
    id: data?.id,
  };
}