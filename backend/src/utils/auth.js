import jwt from 'jsonwebtoken';
import { findPlayerById, publicPlayer } from '../services/repository.js';

const DEFAULT_SECRET = 'uabt-latrut-dev-secret-change-me';

export function signAuthToken(player) {
  return jwt.sign(
    { sub: player._id || player.id, role: player.role || 'player', username: player.username },
    process.env.JWT_SECRET || DEFAULT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Token login wajib dikirim.' });
    const payload = jwt.verify(token, process.env.JWT_SECRET || DEFAULT_SECRET);
    const player = await findPlayerById(payload.sub);
    if (!player) return res.status(401).json({ message: 'Akun tidak ditemukan atau token tidak valid.' });
    req.user = publicPlayer(player);
    next();
  } catch {
    return res.status(401).json({ message: 'Sesi login tidak valid atau sudah kedaluwarsa.' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Akses admin diperlukan.' });
  next();
}
