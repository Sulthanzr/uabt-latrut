import express from 'express';
import { z } from 'zod';
import { generateSessionCode } from '../utils/code.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAuth, requireAdmin } from '../utils/auth.js';
import { getSessionSnapshot } from '../services/snapshot.js';
import { emitGlobal, emitToSession } from '../socket/realtime.js';
import { activateSession, closeSession, createSessionWithRetry, findSessions } from '../services/repository.js';

export const sessionRouter = express.Router();

const createSessionSchema = z.object({
  title: z.string().min(2).default('Sesi Reguler'),
  location: z.string().min(2).default('GOR UB'),
  court: z.string().min(1).default('Court A'),
  pj: z.enum(['Davy', 'David', 'Bagas', 'Sulthan']).default('Sulthan'),
  code: z.string().optional(),
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().optional(),
  isActive: z.boolean().optional().default(true),
});

const recentSessionCreateLocks = new Map();
const SESSION_CREATE_LOCK_MS = 10000;

function makeSessionCreateKey(user, payload) {
  const userId = user?._id || user?.id || user?.username || 'unknown';

  return JSON.stringify({
    userId,
    title: payload.title,
    location: payload.location,
    court: payload.court,
    pj: payload.pj,
    startAt: payload.startAt ? new Date(payload.startAt).toISOString() : null,
  });
}

function getRecentSessionCreate(key) {
  const item = recentSessionCreateLocks.get(key);

  if (!item) return null;

  if (Date.now() - item.time > SESSION_CREATE_LOCK_MS) {
    recentSessionCreateLocks.delete(key);
    return null;
  }

  return item.session;
}

function rememberSessionCreate(key, session) {
  recentSessionCreateLocks.set(key, {
    time: Date.now(),
    session,
  });

  setTimeout(() => {
    recentSessionCreateLocks.delete(key);
  }, SESSION_CREATE_LOCK_MS);
}

sessionRouter.get('/', requireAuth, requireAdmin, asyncHandler(async (_req, res) => {
  const sessions = await findSessions();
  res.json({ data: sessions });
}));

sessionRouter.get('/active', asyncHandler(async (_req, res) => {
  const snapshot = await getSessionSnapshot();
  res.json({ data: snapshot });
}));

sessionRouter.post('/', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const payload = createSessionSchema.parse(req.body);

  const lockKey = makeSessionCreateKey(req.user, payload);
  const recentSession = getRecentSessionCreate(lockKey);

  if (recentSession) {
    return res.status(200).json({
      data: recentSession,
      duplicated: true,
      message: 'Sesi sudah dibuat. Request dobel diabaikan.',
    });
  }

  const session = await createSessionWithRetry({
    ...payload,
    code: payload.code ? payload.code.toUpperCase() : undefined,
  }, generateSessionCode);

  rememberSessionCreate(lockKey, session);

  const snapshot = await getSessionSnapshot(session._id);
  emitGlobal('session:created', session);
  emitGlobal('snapshot:update', snapshot);
  emitToSession(session._id, 'snapshot:update', snapshot);
  res.status(201).json({ data: session });
}));

sessionRouter.patch('/:id/activate', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const session = await activateSession(req.params.id);
  if (!session) return res.status(404).json({ message: 'Sesi tidak ditemukan.' });

  const snapshot = await getSessionSnapshot(session._id);
  emitGlobal('session:activated', session);
  emitGlobal('snapshot:update', snapshot);
  emitToSession(session._id, 'snapshot:update', snapshot);
  res.json({ data: session });
}));

sessionRouter.patch('/:id/close', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const session = await closeSession(req.params.id);
  if (!session) return res.status(404).json({ message: 'Sesi tidak ditemukan.' });

  const snapshot = await getSessionSnapshot(session._id);

  emitGlobal('session:closed', session);
  emitGlobal('snapshot:update', snapshot);
  emitToSession(session._id, 'snapshot:update', snapshot);

  res.json({ data: session });
}));

sessionRouter.get('/:id/snapshot', asyncHandler(async (req, res) => {
  const snapshot = await getSessionSnapshot(req.params.id);
  res.json({ data: snapshot });
}));
