import crypto from 'crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signAuthToken, requireAuth } from '../utils/auth.js';
import { query } from '../config/db.js';
import { sendOtpEmail } from '../utils/mailer.js';
import {
  createPlayer,
  findPlayerByGoogleSub,
  findPlayerByUsernameOrEmail,
  linkGoogleToPlayer,
  publicPlayer,
} from '../services/repository.js';

export const authRouter = express.Router();

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const JWT_SECRET = process.env.JWT_SECRET || 'uabt-latrut-dev-secret-change-me';
const OTP_PURPOSE_REGISTER = 'register';

const registerBaseSchema = {
  nama: z.string().min(2),
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9._-]+$/),
  gender: z.enum(['P', 'W']),
  grade: z.enum(['A', 'B', 'C']),
  email: z.string().email().refine((value) => value.toLowerCase().endsWith('@gmail.com'), {
    message: 'Email register manual harus menggunakan @gmail.com.',
  }),
  phone: z.string().optional().or(z.literal('')),
  password: z.string().min(6),
};

const registerOtpRequestSchema = z.object({
  ...registerBaseSchema,
});

const registerSchema = z.object({
  ...registerBaseSchema,
  otp: z.string().regex(/^\d{6}$/, 'OTP harus 6 digit.'),
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const googleCompleteProfileSchema = z.object({
  tempToken: z.string().min(1),
  nama: z.string().min(2),
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9._-]+$/),
  password: z.string().min(8, 'Password minimal 8 karakter.'),
  confirmPassword: z.string().min(1, 'Konfirmasi password wajib diisi.'),
  gender: z.enum(['P', 'W']),
  grade: z.enum(['A', 'B', 'C']),
  phone: z.string().optional().or(z.literal('')),
});

function authResponse(player) {
  const safe = publicPlayer(player);
  return { player: safe, token: signAuthToken(safe) };
}

function issueGoogleTempToken(profile) {
  return jwt.sign(
    {
      type: 'google_profile',
      googleSub: profile.googleSub,
      email: profile.email,
      nama: profile.nama || '',
      avatarUrl: profile.avatarUrl || '',
      emailVerified: true,
    },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function otpHash(email, otp) {
  return crypto
    .createHash('sha256')
    .update(`${normalizeEmail(email)}:${otp}:${JWT_SECRET}`)
    .digest('hex');
}

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

async function createRegisterOtp(email) {
  const otp = generateOtp();
  const minutes = Number(process.env.OTP_EXPIRES_MINUTES || 10);
  await query(
    `INSERT INTO email_otps (email, purpose, otp_hash, expires_at)
     VALUES ($1, $2, $3, now() + ($4::text || ' minutes')::interval)`,
    [normalizeEmail(email), OTP_PURPOSE_REGISTER, otpHash(email, otp), minutes]
  );
  return sendOtpEmail({ to: normalizeEmail(email), otp, purpose: OTP_PURPOSE_REGISTER });
}

async function verifyRegisterOtp(email, otp) {
  const normalizedEmail = normalizeEmail(email);
  const { rows } = await query(
    `SELECT *
     FROM email_otps
     WHERE email = $1
       AND purpose = $2
       AND consumed_at IS NULL
       AND expires_at > now()
     ORDER BY created_at DESC
     LIMIT 1`,
    [normalizedEmail, OTP_PURPOSE_REGISTER]
  );

  const row = rows[0];
  if (!row) {
    return { ok: false, message: 'OTP tidak ditemukan atau sudah kedaluwarsa. Kirim ulang OTP.' };
  }

  if (row.attempts >= 5) {
    return { ok: false, message: 'OTP sudah terlalu sering dicoba. Kirim ulang OTP.' };
  }

  if (row.otp_hash !== otpHash(normalizedEmail, otp)) {
    await query('UPDATE email_otps SET attempts = attempts + 1 WHERE id = $1', [row.id]);
    return { ok: false, message: 'Kode OTP salah.' };
  }

  await query('UPDATE email_otps SET consumed_at = now() WHERE id = $1', [row.id]);
  return { ok: true };
}

async function ensureRegisterIdentityAvailable({ email, username }) {
  const byEmail = await findPlayerByUsernameOrEmail(email);
  if (byEmail) {
    const err = new Error('Email sudah terdaftar. Silakan login.');
    err.status = 409;
    throw err;
  }

  const byUsername = await findPlayerByUsernameOrEmail(username);
  if (byUsername) {
    const err = new Error('Username sudah terdaftar. Pakai username lain.');
    err.status = 409;
    throw err;
  }
}

authRouter.post('/register/request-otp', asyncHandler(async (req, res) => {
  const payload = registerOtpRequestSchema.parse(req.body);
  const username = payload.username.trim().toLowerCase();
  const email = normalizeEmail(payload.email);
  if (payload.password !== payload.confirmPassword) {
    return res.status(400).json({ message: 'Konfirmasi password tidak cocok.' });
  }

  if (!/[A-Za-z]/.test(payload.password)) {
    return res.status(400).json({ message: 'Password harus mengandung huruf.' });
  }

  if (!/[0-9]/.test(payload.password)) {
    return res.status(400).json({ message: 'Password harus mengandung angka.' });
  }

  await ensureRegisterIdentityAvailable({ email, username });
  const delivery = await createRegisterOtp(email);
  const message = delivery?.delivered
  ? 'Kode OTP sudah dikirim ke email. Masukkan kode OTP untuk menyelesaikan registrasi.'
  : 'OTP dibuat. Untuk testing lokal, cek kode OTP di terminal backend karena SMTP email belum berhasil.';

  res.json({
    data: {
      message,
      email,
      deliveryMode: delivery?.mode || 'unknown',
    },
  });
}));

authRouter.post('/register', asyncHandler(async (req, res) => {
  const payload = registerSchema.parse(req.body);
  const username = payload.username.trim().toLowerCase();
  const email = normalizeEmail(payload.email);

  await ensureRegisterIdentityAvailable({ email, username });

  const otpResult = await verifyRegisterOtp(email, payload.otp);
  if (!otpResult.ok) {
    return res.status(400).json({ message: otpResult.message });
  }

  const player = await createPlayer({
    nama: payload.nama.trim(),
    username,
    gender: payload.gender,
    grade: payload.grade,
    email,
    phone: payload.phone || null,
    passwordHash: hashPassword(payload.password),
    status: 'registered',
    session: null,
    currentMatch: null,
    jumlah_main: 0,
    role: 'player',
    authProvider: 'password',
    emailVerified: true,
  });

  res.status(201).json({ data: authResponse(player) });
}));

authRouter.post('/login', asyncHandler(async (req, res) => {
  const payload = loginSchema.parse(req.body);
  const player = await findPlayerByUsernameOrEmail(payload.username);

  if (!player || !player.passwordHash || !verifyPassword(payload.password, player.passwordHash)) {
    return res.status(401).json({ message: 'Username/email atau password salah.' });
  }

  res.json({ data: authResponse(player) });
}));

authRouter.post('/google', asyncHandler(async (req, res) => {
  const { credential } = req.body;

  if (!credential) {
    return res.status(400).json({ message: 'Credential Google wajib dikirim.' });
  }

  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(500).json({ message: 'GOOGLE_CLIENT_ID belum diatur di backend/.env.' });
  }

  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();

  if (!payload?.sub || !payload?.email) {
    return res.status(401).json({ message: 'Token Google tidak valid.' });
  }

  if (!payload.email_verified) {
    return res.status(401).json({ message: 'Email Google belum terverifikasi.' });
  }

  const email = normalizeEmail(payload.email);
  const existingPlayer =
    await findPlayerByGoogleSub(payload.sub) ||
    await findPlayerByUsernameOrEmail(email);

  if (existingPlayer) {
    const linkedPlayer = await linkGoogleToPlayer(existingPlayer._id, {
      googleSub: payload.sub,
      avatarUrl: payload.picture || null,
      emailVerified: true,
    });

    return res.json({ data: { ...authResponse(linkedPlayer), requiresProfile: false } });
  }

  const profile = {
    googleSub: payload.sub,
    email,
    nama: payload.name || '',
    avatarUrl: payload.picture || '',
  };

  return res.status(202).json({
    data: {
      requiresProfile: true,
      tempToken: issueGoogleTempToken(profile),
      profile: {
        nama: profile.nama,
        email: profile.email,
        avatarUrl: profile.avatarUrl,
      },
    },
  });
}));

authRouter.post('/google/complete-profile', asyncHandler(async (req, res) => {
  const payload = googleCompleteProfileSchema.parse(req.body);
  const googleProfile = jwt.verify(payload.tempToken, JWT_SECRET);

  if (googleProfile.type !== 'google_profile' || !googleProfile.googleSub || !googleProfile.email) {
    return res.status(401).json({ message: 'Token profil Google tidak valid.' });
  }

  const username = payload.username.trim().toLowerCase();
  const email = normalizeEmail(googleProfile.email);
  if (payload.password !== payload.confirmPassword) {
    return res.status(400).json({ message: 'Konfirmasi password tidak cocok.' });
  }

  if (!/[A-Za-z]/.test(payload.password)) {
    return res.status(400).json({ message: 'Password harus mengandung huruf.' });
  }

  if (!/[0-9]/.test(payload.password)) {
    return res.status(400).json({ message: 'Password harus mengandung angka.' });
  }
  const existing =
    await findPlayerByGoogleSub(googleProfile.googleSub) ||
    await findPlayerByUsernameOrEmail(email) ||
    await findPlayerByUsernameOrEmail(username);

  if (existing) {
    return res.status(409).json({ message: 'Email atau username sudah terdaftar.' });
  }

  const player = await createPlayer({
    nama: payload.nama.trim(),
    username,
    passwordHash: hashPassword(payload.password),
    gender: payload.gender,
    grade: payload.grade,
    email,
    phone: payload.phone || null,
    status: 'registered',
    role: 'player',
    jumlah_main: 0,
    googleSub: googleProfile.googleSub,
    avatarUrl: googleProfile.avatarUrl || null,
    authProvider: 'google',
    emailVerified: true,
  });

  return res.status(201).json({ data: authResponse(player) });
}));

authRouter.get('/me', requireAuth, asyncHandler(async (req, res) => {
  res.json({ data: req.user });
}));
