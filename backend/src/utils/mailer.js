import nodemailer from 'nodemailer';

function hasSmtpConfig() {
  return Boolean(process.env.MAIL_HOST && process.env.MAIL_USER && process.env.MAIL_PASS);
}

function logOtpToConsole({ to, otp, purpose, reason }) {
  console.log(`[otp:${purpose}] ${to} -> ${otp}`);
  if (reason) console.log(`[mail] ${reason}`);
}

export async function sendOtpEmail({ to, otp, purpose = 'register' }) {
  const subject = purpose === 'register'
    ? 'Kode OTP Registrasi UABT LATRUT'
    : 'Kode OTP UABT LATRUT';

  const text = [
    'Halo,',
    '',
    `Kode OTP kamu adalah: ${otp}`,
    '',
    `Kode ini berlaku selama ${process.env.OTP_EXPIRES_MINUTES || 10} menit.`,
    'Jangan bagikan kode ini kepada siapa pun.',
    '',
    'UABT LATRUT',
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <h2>Kode OTP UABT LATRUT</h2>
      <p>Halo,</p>
      <p>Kode OTP kamu:</p>
      <p style="font-size:28px;font-weight:800;letter-spacing:6px">${otp}</p>
      <p>Kode ini berlaku selama ${process.env.OTP_EXPIRES_MINUTES || 10} menit.</p>
      <p>Jangan bagikan kode ini kepada siapa pun.</p>
    </div>
  `;

  if (!hasSmtpConfig()) {
    logOtpToConsole({
      to,
      otp,
      purpose,
      reason: 'MAIL_HOST/MAIL_USER/MAIL_PASS belum lengkap. OTP hanya ditampilkan di terminal backend.',
    });
    return { delivered: false, mode: 'console' };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT || 587),
    secure: process.env.MAIL_SECURE === 'true',
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });

  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.MAIL_USER,
      to,
      subject,
      text,
      html,
    });

    return { delivered: true, mode: 'smtp' };
  } catch (err) {
    logOtpToConsole({
      to,
      otp,
      purpose,
      reason: `SMTP gagal (${err?.message || 'unknown error'}). Untuk testing lokal, pakai OTP dari terminal ini. Kalau mau email benar-benar terkirim, pakai Gmail App Password, bukan password login Gmail biasa.`,
    });

    return {
      delivered: false,
      mode: 'console-fallback',
      error: err?.message,
    };
  }
}