import { findActiveSession, findSessionById, findPlayers, findMatches } from './repository.js';
import { sortQueue } from './matchmaking.js';

export async function getSessionSnapshot(sessionId = null) {
  const session = sessionId ? await findSessionById(sessionId) : await findActiveSession();

  if (!session) {
    return {
      session: null,
      players: [],
      queue: [],
      pending: [],
      playing: [],
      matches: [],
      stats: { queue: 0, pending: 0, playing: 0, totalPlayers: 0, totalMatches: 0, avgPlay: 0 },
    };
  }

  const [players, matches] = await Promise.all([
    findPlayers({ sessionId: session._id }),
    findMatches({ sessionId: session._id }),
  ]);

  const queue = sortQueue(players.filter((p) => p.status === 'waiting'));
  const pending = players.filter((p) => p.status === 'pending_scan');
  const playing = players.filter((p) => p.status === 'playing');
  const totalPlay = players.reduce((sum, p) => sum + (p.jumlah_main ?? 0), 0);

  return {
    session,
    players,
    queue,
    pending,
    playing,
    matches,
    stats: {
      queue: queue.length,
      pending: pending.length,
      playing: playing.length,
      totalPlayers: players.length,
      totalMatches: matches.length,
      avgPlay: players.length ? Number((totalPlay / players.length).toFixed(1)) : 0,
    },
  };
}
