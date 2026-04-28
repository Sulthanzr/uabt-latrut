import express from 'express';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { asyncHandler } from '../utils/asyncHandler.js';
import { query } from '../config/db.js';
import { requireAuth, requireAdmin } from '../utils/auth.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { sendOtpEmail } from '../utils/mailer.js';
import { uploadProfilePhoto } from '../middlewares/uploadProfilePhoto.js';
import { getSessionSnapshot } from '../services/snapshot.js';
import { emitToSession } from '../socket/realtime.js';
import {
  approveQr,
  deletePlayer,
  findActiveSessionByCode,
  findPlayerById,
  findPlayers,
  joinPlayerToSession,
  publicPlayer,
  removePlayerProfilePhoto,
  updatePlayerProfilePhoto,
  updatePlayerStatus,
} from '../services/repository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '../..');

export const playerRouter = express.Router();

const joinSchema = z.object({
  sessionCode: z.string().min(3),
});

const resetPasswordSchema = z.object({
  oldPassword: z.string().optional().default(''),
  newPassword: z.string().min(8, 'Password baru minimal 8 karakter.'),
  confirmPassword: z.string().min(1, 'Konfirmasi password wajib diisi.'),
  otp: z.string().length(6, 'OTP harus 6 digit.'),
});

const updateProfileSchema = z.object({
  nama: z.string().min(2, 'Nama minimal 2 karakter.'),
  phone: z.string().max(30).optional().default(''),
  bio: z.string().max(300).optional().default(''),
});

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function validateNewPassword(password) {
  if (!password || password.length < 8) {
    return 'Password baru minimal 8 karakter.';
  }

  if (!/[A-Za-z]/.test(password)) {
    return 'Password baru harus mengandung huruf.';
  }

  if (!/[0-9]/.test(password)) {
    return 'Password baru harus mengandung angka.';
  }

  return null;
}

playerRouter.post('/join', requireAuth, asyncHandler(async (req, res) => {
  const payload = joinSchema.parse(req.body);
  const session = await findActiveSessionByCode(payload.sessionCode);
  if (!session) return res.status(404).json({ message: 'Kode sesi tidak ditemukan atau sesi belum aktif.' });

  const existing = await findPlayerById(req.user._id);
  if (!existing) return res.status(404).json({ message: 'Akun pemain tidak ditemukan. Silakan login ulang.' });

  if (existing.status === 'playing' && String(existing.session) !== String(session._id)) {
    return res.status(409).json({ message: 'Pemain masih tercatat bermain di sesi lain.' });
  }

  const player = await joinPlayerToSession(existing._id, session._id);
  const snapshot = await getSessionSnapshot(session._id);
  const safePlayer = publicPlayer(player);
  emitToSession(session._id, 'snapshot:update', snapshot);
  emitToSession(session._id, 'player:joined', safePlayer);
  res.status(200).json({ data: safePlayer, session });
}));

playerRouter.get('/me/stats', requireAuth, asyncHandler(async (req, res) => {
  const playerId = req.user._id;

  const now = new Date();

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const day = now.getDay() || 7;
  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(now.getDate() - day + 1);
  thisWeekStart.setHours(0, 0, 0, 0);

  const nextWeekStart = new Date(thisWeekStart);
  nextWeekStart.setDate(thisWeekStart.getDate() + 7);

  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(thisWeekStart.getDate() - 7);

  const summary = await query(
    `
    SELECT
      COUNT(*) FILTER (
        WHERE started_at >= $2 AND started_at < $3
      )::int AS month_play,

      COUNT(*) FILTER (
        WHERE started_at >= $4 AND started_at < $5
      )::int AS this_week_play,

      COUNT(*) FILTER (
        WHERE started_at >= $6 AND started_at < $4
      )::int AS last_week_play,

      COUNT(*) FILTER (
        WHERE started_at >= $2
          AND started_at < $3
          AND status = 'completed'
          AND (
            (winner = 'team1' AND $1::uuid = ANY(team1_ids))
            OR
            (winner = 'team2' AND $1::uuid = ANY(team2_ids))
          )
      )::int AS month_wins
    FROM matches
    WHERE $1::uuid = ANY(team1_ids)
       OR $1::uuid = ANY(team2_ids)
    `,
    [playerId, monthStart, nextMonthStart, thisWeekStart, nextWeekStart, lastWeekStart]
  );

  const bars = await query(
    `
    SELECT started_at
    FROM matches
    WHERE ($1::uuid = ANY(team1_ids) OR $1::uuid = ANY(team2_ids))
      AND started_at >= $2
      AND started_at < $3
    `,
    [playerId, monthStart, nextMonthStart]
  );

  const weekBars = [0, 0, 0, 0];

  for (const row of bars.rows) {
    const d = new Date(row.started_at);
    const idx = Math.min(3, Math.floor((d.getDate() - 1) / 7));
    weekBars[idx] += 1;
  }

  const s = summary.rows[0] || {};

  res.json({
    data: {
      monthPlay: Number(s.month_play || 0),
      monthWins: Number(s.month_wins || 0),
      thisWeekPlay: Number(s.this_week_play || 0),
      lastWeekPlay: Number(s.last_week_play || 0),
      weekDiff: Number(s.this_week_play || 0) - Number(s.last_week_play || 0),
      weekBars,
    },
  });
}));


playerRouter.post(
  '/me/profile-photo',
  requireAuth,
  uploadProfilePhoto.single('photo'),
  asyncHandler(async (req, res) => {
    const playerId = req.user?._id || req.user?.id;

    if (!playerId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'File foto belum dipilih.' });
    }

    const profileDir = path.join(backendRoot, 'uploads', 'profile');
    fs.mkdirSync(profileDir, { recursive: true });

    const filename = `${playerId}-${Date.now()}.jpg`;
    const filepath = path.join(profileDir, filename);

    await sharp(req.file.buffer)
      .resize(512, 512, {
        fit: 'cover',
        position: 'center',
      })
      .jpeg({ quality: 85 })
      .toFile(filepath);

    const photoUrl = `/uploads/profile/${filename}`;
    const player = await updatePlayerProfilePhoto(playerId, photoUrl);

    res.json({
      message: 'Foto profil berhasil diupload.',
      data: publicPlayer(player),
    });
  })
);

playerRouter.delete(
  '/me/profile-photo',
  requireAuth,
  asyncHandler(async (req, res) => {
    const playerId = req.user?._id || req.user?.id;

    if (!playerId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const player = await removePlayerProfilePhoto(playerId);

    res.json({
      message: 'Foto profil berhasil dihapus.',
      data: publicPlayer(player),
    });
  })
);

playerRouter.patch('/me/profile', requireAuth, asyncHandler(async (req, res) => {
  const playerId = req.user?._id || req.user?.id;

  if (!playerId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const payload = updateProfileSchema.parse(req.body || {});

  await query(
    `UPDATE players
     SET nama = $2,
         phone = $3,
         bio = $4,
         updated_at = now()
     WHERE id = $1`,
    [playerId, payload.nama, payload.phone || null, payload.bio || null]
  );

  const player = await findPlayerById(playerId);

  res.json({
    message: 'Profil berhasil diperbarui.',
    data: publicPlayer(player),
  });
}));

playerRouter.post('/me/password-otp', requireAuth, asyncHandler(async (req, res) => {
  const playerId = req.user?._id || req.user?.id;

  if (!playerId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const player = await findPlayerById(playerId);

  if (!player?.email) {
    return res.status(400).json({ message: 'Email akun tidak ditemukan.' });
  }

  const otp = generateOtp();
  const expiresMinutes = Number(process.env.OTP_EXPIRES_MINUTES || 10);
  const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000);

  await query(
    `INSERT INTO password_reset_otps (player_id, otp_code, expires_at)
     VALUES ($1, $2, $3)`,
    [playerId, otp, expiresAt]
  );

  await sendOtpEmail({
    to: player.email,
    otp,
    purpose: 'reset-password',
    name: player.nama || player.username || 'Pemain UABT',
    expiresMinutes,
  });

  res.json({
    message: 'OTP reset password sudah dikirim ke email.',
  });
}));

playerRouter.patch('/me/password', requireAuth, asyncHandler(async (req, res) => {
  const playerId = req.user?._id || req.user?.id;
  const payload = resetPasswordSchema.parse(req.body || {});

  if (!playerId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { oldPassword, newPassword, confirmPassword, otp } = payload;

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ message: 'Konfirmasi password baru tidak cocok.' });
  }

  const passwordError = validateNewPassword(newPassword);

  if (passwordError) {
    return res.status(400).json({ message: passwordError });
  }

  const player = await findPlayerById(playerId);

  const hasLocalPassword = Boolean(player?.passwordHash);

  if (hasLocalPassword) {
    if (!oldPassword) {
      return res.status(400).json({ message: 'Password lama wajib diisi.' });
    }

    const oldPasswordValid = await verifyPassword(oldPassword, player.passwordHash);

    if (!oldPasswordValid) {
      return res.status(400).json({ message: 'Password lama salah.' });
    }
  }

  const otpResult = await query(
    `SELECT *
     FROM password_reset_otps
     WHERE player_id = $1
       AND otp_code = $2
       AND used_at IS NULL
       AND expires_at > now()
     ORDER BY created_at DESC
     LIMIT 1`,
    [playerId, otp]
  );

  const otpRow = otpResult.rows[0];

  if (!otpRow) {
    return res.status(400).json({ message: 'OTP salah atau sudah expired.' });
  }

  const newHash = await hashPassword(newPassword);

  await query(
    `UPDATE players
     SET password_hash = $2,
         updated_at = now()
     WHERE id = $1`,
    [playerId, newHash]
  );

  await query(
    `UPDATE password_reset_otps
     SET used_at = now()
     WHERE id = $1`,
    [otpRow.id]
  );

  res.json({
    message: hasLocalPassword
      ? 'Password berhasil diubah.'
      : 'Password lokal berhasil dibuat. Kamu sekarang bisa login manual dengan password ini.',
  });
}));

playerRouter.get('/', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const players = await findPlayers({ sessionId: req.query.sessionId, status: req.query.status });
  res.json({ data: players });
}));

playerRouter.post('/scan', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const qrCode = String(req.body.qrCode || '').trim().toUpperCase();
  if (!qrCode) return res.status(400).json({ message: 'qrCode wajib diisi.' });

  const player = await approveQr(qrCode);
  if (!player) return res.status(404).json({ message: 'QR tidak ditemukan atau sudah discan.' });

  const snapshot = await getSessionSnapshot(player.session);
  emitToSession(player.session, 'snapshot:update', snapshot);
  emitToSession(player.session, 'player:approved', publicPlayer(player));
  res.json({ data: publicPlayer(player) });
}));

playerRouter.patch('/:id/status', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const status = z.enum(['registered', 'pending_scan', 'waiting', 'playing', 'resting', 'done']).parse(req.body.status);
  const player = await updatePlayerStatus(req.params.id, status);
  if (!player) return res.status(404).json({ message: 'Pemain tidak ditemukan.' });
  const snapshot = await getSessionSnapshot(player.session);
  emitToSession(player.session, 'snapshot:update', snapshot);
  res.json({ data: publicPlayer(player) });
}));

playerRouter.delete('/:id', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const player = await deletePlayer(req.params.id);
  if (!player) return res.status(404).json({ message: 'Pemain tidak ditemukan.' });
  if (player.session) {
    const snapshot = await getSessionSnapshot(player.session);
    emitToSession(player.session, 'snapshot:update', snapshot);
  }
  res.json({ data: publicPlayer(player) });
}));
