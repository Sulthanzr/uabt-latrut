import express from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAuth, requireAdmin } from '../utils/auth.js';
import { getSessionSnapshot } from '../services/snapshot.js';
import { emitToSession } from '../socket/realtime.js';
import {
  completeMatchTransactional,
  findMatches,
  generateMatchTransactional,
  generateMatchesBatchTransactional,
  populateMatch,
  updateMatchResult,
} from '../services/repository.js';

export const matchRouter = express.Router();

matchRouter.post('/generate', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const body = z.object({
    sessionId: z.string().optional(),
    tolerance: z.number().int().min(0).max(2).optional().default(0),
    fallbackTolerance: z.number().int().min(0).max(2).optional().default(2),
    court: z.string().optional(),
  }).parse(req.body ?? {});

  const generated = await generateMatchTransactional(body);
  if (generated.error) return res.status(generated.error.status).json({ message: generated.error.message });

  const populated = await populateMatch(generated.match);
  const snapshot = await getSessionSnapshot(generated.session._id);
  emitToSession(generated.session._id, 'match:generated', populated);
  emitToSession(generated.session._id, 'snapshot:update', snapshot);
  res.status(201).json({ data: populated, snapshot });
}));

matchRouter.patch('/:id/complete', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const body = z.object({
    score: z.string().optional().default(''),
    winner: z.enum(['team1', 'team2', 'draw', '']).optional().default(''),
    returnToQueue: z.boolean().optional().default(true),
  }).parse(req.body ?? {});

  const match = await completeMatchTransactional(req.params.id, body);
  if (!match) return res.status(409).json({ message: 'Match sudah selesai, tidak ditemukan, atau tidak bisa diselesaikan lagi.' });

  const snapshot = await getSessionSnapshot(match.session);
  const populated = await populateMatch(match);
  emitToSession(match.session, 'match:completed', populated);
  emitToSession(match.session, 'snapshot:update', snapshot);
  res.json({ data: populated, snapshot });
}));

matchRouter.patch('/:id/result', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const body = z.object({
    score: z.string().optional().default(''),
    winner: z.enum(['team1', 'team2', 'draw', '']).optional().default(''),
  }).parse(req.body ?? {});

  const match = await updateMatchResult(req.params.id, body);
  if (!match) return res.status(404).json({ message: 'Match tidak ditemukan.' });

  const populated = await populateMatch(match);
  const snapshot = await getSessionSnapshot(match.session);

  emitToSession(match.session, 'match:updated', populated);
  emitToSession(match.session, 'snapshot:update', snapshot);

  res.json({ data: populated, snapshot });
}));

matchRouter.get('/', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const matches = await findMatches({ sessionId: req.query.sessionId });
  res.json({ data: matches });
}));
