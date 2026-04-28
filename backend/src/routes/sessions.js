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
  const session = await createSessionWithRetry({
    ...payload,
    code: payload.code ? payload.code.toUpperCase() : undefined,
  }, generateSessionCode);

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
