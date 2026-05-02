import { query, pool } from '../config/db.js';
import { findBestMatch } from './matchmaking.js';

export function gradePoint(grade) {
  return { A: 3, B: 2, C: 1 }[grade] ?? 0;
}

function camelDate(row, snake, camel) {
  return row[snake] ? new Date(row[snake]).toISOString() : row[snake];
}

export function toPlayer(row) {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    nama: row.nama,
    username: row.username,
    passwordHash: row.password_hash,
    gender: row.gender,
    grade: row.grade,
    gradePoint: gradePoint(row.grade),
    waktu_hadir: row.waktu_hadir,
    jumlah_main: row.jumlah_main,
    status: row.status,
    qrCode: row.qr_code,
    session: row.session_id,
    currentMatch: row.current_match_id,
    email: row.email,
    phone: row.phone,
    bio: row.bio,
    role: row.role || 'player',
    googleSub: row.google_sub,
    avatarUrl: row.avatar_url,

    profilePhotoUrl: row.profile_photo_url || null,
    profile_photo_url: row.profile_photo_url || null,

    authProvider: row.auth_provider || 'password',
    emailVerified: row.email_verified || false,
    createdAt: camelDate(row, 'created_at'),
    updatedAt: camelDate(row, 'updated_at'),
  };
}

export function toSession(row) {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    code: row.code,
    title: row.title,
    location: row.location,
    court: row.court,
    pj: row.pj,
    startAt: row.start_at,
    endAt: row.end_at,
    isActive: row.is_active,
    createdAt: camelDate(row, 'created_at'),
    updatedAt: camelDate(row, 'updated_at'),
  };
}

export function toMatch(row) {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    session: row.session_id,
    matchNo: row.match_no,
    court: row.court,
    gameType: row.game_type,
    team1: row.team1_ids || [],
    team2: row.team2_ids || [],
    team1Point: row.team1_point,
    team2Point: row.team2_point,
    toleranceUsed: row.tolerance_used,
    status: row.status,
    score: row.score,
    winner: row.winner,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: camelDate(row, 'created_at'),
    updatedAt: camelDate(row, 'updated_at'),
  };
}

export function publicPlayer(player) {
  if (!player) return null;
  const copy = { ...player };
  delete copy.passwordHash;
  return copy;
}

export async function findPlayerById(id) {
  const { rows } = await query('SELECT * FROM players WHERE id = $1', [id]);
  return toPlayer(rows[0]);
}

export async function findPlayerByUsernameOrEmail(login) {
  const normalized = String(login).trim().toLowerCase();
  const { rows } = await query('SELECT * FROM players WHERE username = $1 OR email = $1 LIMIT 1', [normalized]);
  return toPlayer(rows[0]);
}

export async function createPlayer(data) {
  const { rows } = await query(
    `INSERT INTO players (
       nama, username, password_hash, gender, grade, status, email, phone,
       jumlah_main, session_id, current_match_id, qr_code, waktu_hadir, role,
       google_sub, avatar_url, auth_provider, email_verified
     )
     VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,
       $9,$10,$11,$12,COALESCE($13, now()),$14,
       $15,$16,$17,$18
     )
     RETURNING *`,
    [
      data.nama,
      data.username || null,
      data.passwordHash || null,
      data.gender,
      data.grade,
      data.status || 'registered',
      data.email || null,
      data.phone || null,
      data.jumlah_main ?? 0,
      data.session || null,
      data.currentMatch || null,
      data.qrCode || null,
      data.waktu_hadir || null,
      data.role || 'player',
      data.googleSub || null,
      data.avatarUrl || null,
      data.authProvider || (data.googleSub ? 'google' : 'password'),
      data.emailVerified || false,
    ]
  );
  return toPlayer(rows[0]);
}

export async function findPlayerByGoogleSub(googleSub) {
  if (!googleSub) return null;
  const { rows } = await query('SELECT * FROM players WHERE google_sub = $1 LIMIT 1', [googleSub]);
  return toPlayer(rows[0]);
}

export async function linkGoogleToPlayer(playerId, { googleSub, avatarUrl, emailVerified = true }) {
  const { rows } = await query(
    `UPDATE players
     SET google_sub = COALESCE(google_sub, $1),
         avatar_url = COALESCE($2, avatar_url),
         email_verified = $3,
         auth_provider = CASE
           WHEN auth_provider = 'password' AND password_hash IS NOT NULL THEN auth_provider
           ELSE 'google'
         END,
         updated_at = now()
     WHERE id = $4
     RETURNING *`,
    [googleSub, avatarUrl || null, emailVerified, playerId]
  );
  return toPlayer(rows[0]);
}

export async function updatePlayerProfilePhoto(playerId, photoUrl) {
  const { rows } = await query(
    `UPDATE players
     SET profile_photo_url = $2,
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [playerId, photoUrl]
  );

  return toPlayer(rows[0]);
}

export async function removePlayerProfilePhoto(playerId) {
  const { rows } = await query(
    `UPDATE players
     SET profile_photo_url = NULL,
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [playerId]
  );

  return toPlayer(rows[0]);
}


export async function findPlayers({ sessionId, status } = {}) {
  const clauses = [];
  const params = [];
  if (sessionId) { params.push(sessionId); clauses.push(`session_id = $${params.length}`); }
  if (status) { params.push(status); clauses.push(`status = $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await query(`SELECT * FROM players ${where} ORDER BY jumlah_main ASC, waktu_hadir ASC`, params);
  return rows.map(toPlayer).map(publicPlayer);
}

export async function findWaitingPlayers(sessionId) {
  const { rows } = await query(
    `SELECT * FROM players WHERE session_id = $1 AND status = 'waiting' ORDER BY jumlah_main ASC, waktu_hadir ASC`,
    [sessionId]
  );
  return rows.map(toPlayer);
}

export async function joinPlayerToSession(playerId, sessionId) {
  const { rows } = await query(
    `UPDATE players
     SET session_id = $1,
         status = CASE
           WHEN status = 'playing'::player_status THEN 'playing'::player_status
           ELSE 'waiting'::player_status
         END,
         waktu_hadir = CASE
           WHEN session_id = $1 AND status = 'waiting'::player_status THEN waktu_hadir
           ELSE now()
         END,
         current_match_id = CASE
           WHEN status = 'playing'::player_status THEN current_match_id
           ELSE NULL
         END,
         updated_at = now()
     WHERE id = $2
     RETURNING *`,
    [sessionId, playerId]
  );

  return toPlayer(rows[0]);
}

export async function approveQr(qrCode) {
  const { rows } = await query(
    `UPDATE players SET status = 'waiting', waktu_hadir = now(), updated_at = now()
     WHERE qr_code = $1 AND status = 'pending_scan'
     RETURNING *`,
    [qrCode]
  );
  return toPlayer(rows[0]);
}

export async function updatePlayerStatus(id, status) {
  const { rows } = await query(
    'UPDATE players SET status = $1::player_status, updated_at = now() WHERE id = $2 RETURNING *',
    [status, id]
  );

  return toPlayer(rows[0]);
}

export async function deletePlayer(id) {
  const { rows } = await query('DELETE FROM players WHERE id = $1 RETURNING *', [id]);
  return toPlayer(rows[0]);
}

export async function findSessions() {
  const { rows } = await query('SELECT * FROM sessions ORDER BY created_at DESC');
  return rows.map(toSession);
}

export async function findSessionById(id) {
  const { rows } = await query('SELECT * FROM sessions WHERE id = $1', [id]);
  return toSession(rows[0]);
}

export async function findActiveSession() {
  const { rows } = await query('SELECT * FROM sessions WHERE is_active = true ORDER BY created_at DESC LIMIT 1');
  return toSession(rows[0]);
}

export async function findActiveSessionByCode(code) {
  const { rows } = await query('SELECT * FROM sessions WHERE code = $1 AND is_active = true LIMIT 1', [String(code).toUpperCase()]);
  return toSession(rows[0]);
}

export async function createSession(data) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (data.isActive !== false) {
      await client.query('UPDATE sessions SET is_active = false, end_at = now(), updated_at = now() WHERE is_active = true');
    }
    const { rows } = await client.query(
      `INSERT INTO sessions (code, title, location, court, pj, start_at, end_at, is_active)
       VALUES ($1,$2,$3,$4,$5,COALESCE($6, now()),$7,$8)
       RETURNING *`,
      [
        String(data.code).toUpperCase(),
        data.title,
        data.location || 'GOR UB',
        data.court || 'Court A',
        data.pj || 'Sulthan',
        data.startAt || null,
        data.endAt || null,
        data.isActive !== false,
      ]
    );
    await client.query('COMMIT');
    return toSession(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function activateSession(id) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query('SELECT * FROM sessions WHERE id = $1', [id]);
    if (!found.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query('UPDATE sessions SET is_active = false, end_at = now(), updated_at = now() WHERE id <> $1 AND is_active = true', [id]);
    const { rows } = await client.query('UPDATE sessions SET is_active = true, end_at = NULL, updated_at = now() WHERE id = $1 RETURNING *', [id]);
    await client.query('COMMIT');
    return toSession(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closeSession(id) {
  const { rows } = await query(
    `UPDATE sessions
     SET is_active = false,
         end_at = COALESCE(end_at, now()),
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id]
  );

  return toSession(rows[0]);
}

export async function deleteSessionTransactional(sessionId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const sessionResult = await client.query(
      'SELECT * FROM sessions WHERE id = $1 FOR UPDATE',
      [sessionId]
    );

    const sessionRow = sessionResult.rows[0];

    if (!sessionRow) {
      await client.query('ROLLBACK');
      return null;
    }

    const resetPlayers = await client.query(
      `UPDATE players
       SET session_id = NULL,
           current_match_id = NULL,
           status = 'registered',
           jumlah_main = 0,
           updated_at = now()
       WHERE session_id = $1
       RETURNING id`,
      [sessionId]
    );

    const deletedMatches = await client.query(
      `DELETE FROM matches
       WHERE session_id = $1
       RETURNING id`,
      [sessionId]
    );

    await client.query(
      `DELETE FROM sessions
       WHERE id = $1`,
      [sessionId]
    );

    await client.query('COMMIT');

    return {
      session: toSession(sessionRow),
      resetPlayers: resetPlayers.rowCount,
      deletedMatches: deletedMatches.rowCount,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function countMatches(sessionId) {
  const { rows } = await query('SELECT COUNT(*)::int AS count FROM matches WHERE session_id = $1', [sessionId]);
  return rows[0]?.count ?? 0;
}

export async function createMatch(data) {
  const { rows } = await query(
    `INSERT INTO matches (session_id, match_no, court, game_type, team1_ids, team2_ids, team1_point, team2_point, tolerance_used, status, started_at)
     VALUES ($1,$2,$3,$4,$5::uuid[],$6::uuid[],$7,$8,$9,'playing',now())
     RETURNING *`,
    [data.session, data.matchNo, data.court, data.gameType, data.team1, data.team2, data.team1Point, data.team2Point, data.toleranceUsed ?? 0]
  );
  return toMatch(rows[0]);
}

export async function markPlayersPlaying(playerIds, matchId) {
  const { rows } = await query(
    `UPDATE players
     SET jumlah_main = jumlah_main + 1, status = 'playing', current_match_id = $2, updated_at = now()
     WHERE id = ANY($1::uuid[]) AND status = 'waiting'
     RETURNING *`,
    [playerIds, matchId]
  );
  return rows.map(toPlayer);
}

export async function completeMatch(id, { score = '', winner = '' }) {
  const { rows } = await query(
    `UPDATE matches
     SET status = 'completed', completed_at = now(), score = $2, winner = $3, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, score, winner]
  );
  return toMatch(rows[0]);
}

export async function returnMatchPlayersToStatus(playerIds, status) {
  await query(
    `UPDATE players
     SET status = $2::player_status,
         current_match_id = NULL,
         updated_at = now()
     WHERE id = ANY($1::uuid[])`,
    [playerIds, status]
  );
}

export async function findMatchById(id) {
  const { rows } = await query('SELECT * FROM matches WHERE id = $1', [id]);
  return toMatch(rows[0]);
}

export async function updateMatchResult(id, { score = '', winner = '' }) {
  const { rows } = await query(
    `UPDATE matches
     SET score = $2,
         winner = $3,
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, score, winner]
  );

  return toMatch(rows[0]);
}

export async function findMatches({ sessionId } = {}) {
  const params = [];
  const where = sessionId ? 'WHERE session_id = $1' : '';
  if (sessionId) params.push(sessionId);
  const { rows } = await query(`SELECT * FROM matches ${where} ORDER BY match_no DESC`, params);
  const matches = rows.map(toMatch);
  return Promise.all(matches.map(populateMatch));
}

export async function findPlayersByIds(ids) {
  if (!ids?.length) return [];
  const { rows } = await query('SELECT * FROM players WHERE id = ANY($1::uuid[])', [ids]);
  const byId = new Map(rows.map((r) => [r.id, publicPlayer(toPlayer(r))]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

export async function populateMatch(match) {
  if (!match) return null;
  return {
    ...match,
    team1: await findPlayersByIds(match.team1),
    team2: await findPlayersByIds(match.team2),
  };
}

export async function truncateAll() {
  await query('TRUNCATE TABLE matches, players, sessions RESTART IDENTITY CASCADE');
}


export async function createSessionWithRetry(data, generateCode, maxAttempts = 5) {
  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await createSession({ ...data, code: String(data.code || generateCode()).toUpperCase() });
    } catch (err) {
      lastError = err;
      if (err.code !== '23505' || data.code) throw err;
    }
  }
  const err = new Error('Gagal membuat kode sesi unik. Coba lagi.');
  err.status = 409;
  err.cause = lastError;
  throw err;
}

export async function generateMatchTransactional({ sessionId, tolerance = 0, fallbackTolerance = 2, court }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sessionResult = sessionId
      ? await client.query('SELECT * FROM sessions WHERE id = $1 FOR UPDATE', [sessionId])
      : await client.query('SELECT * FROM sessions WHERE is_active = true ORDER BY created_at DESC LIMIT 1 FOR UPDATE');
    const session = toSession(sessionResult.rows[0]);
    if (!session) {
      await client.query('ROLLBACK');
      return { error: { status: 404, message: 'Sesi aktif tidak ditemukan.' } };
    }

    const waitingResult = await client.query(
      `SELECT * FROM players
       WHERE session_id = $1 AND status = 'waiting'
       ORDER BY jumlah_main ASC, waktu_hadir ASC
       FOR UPDATE SKIP LOCKED`,
      [session._id]
    );
    const waitingPlayers = waitingResult.rows.map(toPlayer);
    if (waitingPlayers.length < 4) {
      await client.query('ROLLBACK');
      return { error: { status: 422, message: `Kurang pemain. Butuh 4, tersedia ${waitingPlayers.length}.` } };
    }

    const recentMatchesResult = await client.query(
      `SELECT *
      FROM matches
      WHERE session_id = $1
      ORDER BY match_no DESC
      LIMIT 30`,
      [session._id]
    );

    const recentMatches = recentMatchesResult.rows.map(toMatch);

    let result = findBestMatch(waitingPlayers, {
      tolerance,
      recentMatches,
    });

    let toleranceUsed = tolerance;

    if (!result && fallbackTolerance > tolerance) {
      result = findBestMatch(waitingPlayers, {
        tolerance: fallbackTolerance,
        recentMatches,
      });

      toleranceUsed = fallbackTolerance;
    }
    if (!result) {
      await client.query('ROLLBACK');
      return { error: { status: 422, message: 'Belum ada kombinasi match valid. Sistem sudah mencoba skip anchor antrean dan fallback toleransi.' } };
    }

    const nextNoResult = await client.query(
      'SELECT COALESCE(MAX(match_no), 0) + 1 AS next_no FROM matches WHERE session_id = $1',
      [session._id]
    );
    const nextNo = nextNoResult.rows[0].next_no;
    const playerIds = [...result.team1, ...result.team2].map((p) => p._id);

    const matchResult = await client.query(
      `INSERT INTO matches (session_id, match_no, court, game_type, team1_ids, team2_ids, team1_point, team2_point, tolerance_used, status, started_at)
       VALUES ($1,$2,$3,$4,$5::uuid[],$6::uuid[],$7,$8,$9,'playing',now())
       RETURNING *`,
      [session._id, nextNo, court || session.court, result.gameType, result.team1.map((p) => p._id), result.team2.map((p) => p._id), result.team1Point, result.team2Point, toleranceUsed]
    );
    const match = toMatch(matchResult.rows[0]);

    const updated = await client.query(
      `UPDATE players
       SET jumlah_main = jumlah_main + 1, status = 'playing', current_match_id = $2, updated_at = now()
       WHERE id = ANY($1::uuid[]) AND status = 'waiting'
       RETURNING *`,
      [playerIds, match._id]
    );
    if (updated.rowCount !== 4) {
      throw Object.assign(new Error('Sebagian pemain sudah tidak tersedia untuk match ini.'), { status: 409 });
    }

    await client.query('COMMIT');
    return { session, match };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function parseCourts(courtText = 'Court 1') {
  return String(courtText || 'Court 1')
    .split(',')
    .map((court) => court.trim())
    .filter(Boolean);
}

function removePlayersByIds(players, usedIds) {
  const used = new Set(usedIds.map(String));
  return players.filter((player) => !used.has(String(player._id || player.id)));
}

export async function createManualMatchTransactional({
  sessionId,
  court,
  gameType = 'Manual Request',
  team1Ids = [],
  team2Ids = [],
} = {}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const allIds = [...team1Ids, ...team2Ids].map(String);
    const uniqueIds = [...new Set(allIds)];

    if (allIds.length !== 4 || uniqueIds.length !== 4) {
      await client.query('ROLLBACK');
      return {
        error: {
          status: 400,
          message: 'Manual match harus berisi 4 pemain berbeda.',
        },
      };
    }

    const sessionResult = sessionId
      ? await client.query('SELECT * FROM sessions WHERE id = $1 FOR UPDATE', [sessionId])
      : await client.query('SELECT * FROM sessions WHERE is_active = true ORDER BY created_at DESC LIMIT 1 FOR UPDATE');

    const session = toSession(sessionResult.rows[0]);

    if (!session) {
      await client.query('ROLLBACK');
      return {
        error: {
          status: 404,
          message: 'Sesi aktif tidak ditemukan.',
        },
      };
    }

    const courts = parseCourts(session.court);
    const selectedCourt = String(court || courts[0] || session.court || 'Court 1').trim();

    if (!selectedCourt) {
      await client.query('ROLLBACK');
      return {
        error: {
          status: 400,
          message: 'Court wajib dipilih.',
        },
      };
    }

    if (courts.length && !courts.includes(selectedCourt)) {
      await client.query('ROLLBACK');
      return {
        error: {
          status: 400,
          message: 'Court tidak valid untuk sesi ini.',
        },
      };
    }

    const busyCourtResult = await client.query(
      `SELECT id
       FROM matches
       WHERE session_id = $1
         AND status = 'playing'
         AND court = $2
       LIMIT 1`,
      [session._id, selectedCourt]
    );

    if (busyCourtResult.rows.length) {
      await client.query('ROLLBACK');
      return {
        error: {
          status: 409,
          message: `${selectedCourt} sedang dipakai. Selesaikan match aktif dulu.`,
        },
      };
    }

    const playersResult = await client.query(
      `SELECT *
       FROM players
       WHERE id = ANY($1::uuid[])
       FOR UPDATE`,
      [uniqueIds]
    );

    const players = playersResult.rows.map(toPlayer);
    const playersById = new Map(players.map((player) => [String(player._id), player]));

    if (players.length !== 4) {
      await client.query('ROLLBACK');
      return {
        error: {
          status: 404,
          message: 'Sebagian pemain tidak ditemukan.',
        },
      };
    }

    const invalidPlayer = players.find((player) =>
      String(player.session) !== String(session._id) || player.status !== 'waiting'
    );

    if (invalidPlayer) {
      await client.query('ROLLBACK');
      return {
        error: {
          status: 409,
          message: `${invalidPlayer.nama} sudah tidak tersedia di antrean.`,
        },
      };
    }

    const nextNoResult = await client.query(
      'SELECT COALESCE(MAX(match_no), 0) + 1 AS next_no FROM matches WHERE session_id = $1',
      [session._id]
    );

    const nextNo = Number(nextNoResult.rows[0].next_no || 1);

    const pointOf = (ids) => ids.reduce((sum, id) => {
      const player = playersById.get(String(id));
      return sum + gradePoint(player?.grade);
    }, 0);

    const team1Point = pointOf(team1Ids);
    const team2Point = pointOf(team2Ids);

    const matchResult = await client.query(
      `INSERT INTO matches (
         session_id,
         match_no,
         court,
         game_type,
         team1_ids,
         team2_ids,
         team1_point,
         team2_point,
         tolerance_used,
         status,
         started_at
       )
       VALUES ($1,$2,$3,$4,$5::uuid[],$6::uuid[],$7,$8,$9,'playing',now())
       RETURNING *`,
      [
        session._id,
        nextNo,
        selectedCourt,
        gameType || 'Manual Request',
        team1Ids,
        team2Ids,
        team1Point,
        team2Point,
        0,
      ]
    );

    const match = toMatch(matchResult.rows[0]);

    const updatedPlayers = await client.query(
      `UPDATE players
       SET jumlah_main = jumlah_main + 1,
           status = 'playing',
           current_match_id = $2,
           updated_at = now()
       WHERE id = ANY($1::uuid[])
         AND status = 'waiting'
       RETURNING *`,
      [uniqueIds, match._id]
    );

    if (updatedPlayers.rowCount !== 4) {
      throw Object.assign(
        new Error('Sebagian pemain sudah tidak tersedia untuk manual match ini.'),
        { status: 409 }
      );
    }

    await client.query('COMMIT');

    return {
      session,
      match,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function generateMatchesBatchTransactional({
  sessionId,
  tolerance = 0,
  fallbackTolerance = 2,
  maxMatches,
} = {}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const sessionResult = sessionId
      ? await client.query('SELECT * FROM sessions WHERE id = $1 FOR UPDATE', [sessionId])
      : await client.query('SELECT * FROM sessions WHERE is_active = true ORDER BY created_at DESC LIMIT 1 FOR UPDATE');

    const session = toSession(sessionResult.rows[0]);

    if (!session) {
      await client.query('ROLLBACK');
      return { error: { status: 404, message: 'Sesi aktif tidak ditemukan.' } };
    }

    const courts = parseCourts(session.court);

    const playingCourtResult = await client.query(
      `SELECT DISTINCT court
       FROM matches
       WHERE session_id = $1
         AND status = 'playing'`,
      [session._id]
    );

    const busyCourts = new Set(
      playingCourtResult.rows.map((row) => String(row.court || '').trim())
    );

    const availableCourts = courts.filter((court) => !busyCourts.has(court));

    if (!availableCourts.length) {
      await client.query('ROLLBACK');
      return {
        error: {
          status: 422,
          message: 'Semua lapangan masih terpakai. Selesaikan match aktif dulu sebelum generate lagi.',
        },
      };
    }

    const waitingResult = await client.query(
      `SELECT *
       FROM players
       WHERE session_id = $1
         AND status = 'waiting'
       ORDER BY jumlah_main ASC, waktu_hadir ASC
       FOR UPDATE SKIP LOCKED`,
      [session._id]
    );

    let waitingPlayers = waitingResult.rows.map(toPlayer);

    if (waitingPlayers.length < 4) {
      await client.query('ROLLBACK');
      return {
        error: {
          status: 422,
          message: `Kurang pemain. Butuh minimal 4, tersedia ${waitingPlayers.length}.`,
        },
      };
    }

    const recentMatchesResult = await client.query(
      `SELECT *
      FROM matches
      WHERE session_id = $1
      ORDER BY match_no DESC
      LIMIT 30`,
      [session._id]
    );

    const recentMatches = recentMatchesResult.rows.map(toMatch);

    const maxByPlayers = Math.floor(waitingPlayers.length / 4);
    const maxByCourts = availableCourts.length;
    const requestedMax = Number.isInteger(maxMatches) && maxMatches > 0
      ? maxMatches
      : Number.MAX_SAFE_INTEGER;

    const targetMatchCount = Math.min(maxByPlayers, maxByCourts, requestedMax);

    const nextNoResult = await client.query(
      'SELECT COALESCE(MAX(match_no), 0) + 1 AS next_no FROM matches WHERE session_id = $1',
      [session._id]
    );

    let nextNo = Number(nextNoResult.rows[0].next_no || 1);
    const createdMatches = [];

    for (let index = 0; index < targetMatchCount; index += 1) {
      let result = findBestMatch(waitingPlayers, {
        tolerance,
        recentMatches,
      });

      let toleranceUsed = tolerance;

      if (!result && fallbackTolerance > tolerance) {
        result = findBestMatch(waitingPlayers, {
          tolerance: fallbackTolerance,
          recentMatches,
        });

        toleranceUsed = fallbackTolerance;
      }

      if (!result) {
        break;
      }

      const playerIds = [...result.team1, ...result.team2].map((player) => player._id);
      const court = availableCourts[index] || session.court || 'Court 1';

      const matchResult = await client.query(
        `INSERT INTO matches (
           session_id,
           match_no,
           court,
           game_type,
           team1_ids,
           team2_ids,
           team1_point,
           team2_point,
           tolerance_used,
           status,
           started_at
         )
         VALUES ($1,$2,$3,$4,$5::uuid[],$6::uuid[],$7,$8,$9,'playing',now())
         RETURNING *`,
        [
          session._id,
          nextNo,
          court,
          result.gameType,
          result.team1.map((player) => player._id),
          result.team2.map((player) => player._id),
          result.team1Point,
          result.team2Point,
          toleranceUsed,
        ]
      );

      const match = toMatch(matchResult.rows[0]);

      const updated = await client.query(
        `UPDATE players
         SET jumlah_main = jumlah_main + 1,
             status = 'playing',
             current_match_id = $2,
             updated_at = now()
         WHERE id = ANY($1::uuid[])
           AND status = 'waiting'
         RETURNING *`,
        [playerIds, match._id]
      );

      if (updated.rowCount !== 4) {
        throw Object.assign(
          new Error('Sebagian pemain sudah tidak tersedia untuk match ini.'),
          { status: 409 }
        );
      }

      createdMatches.push(match);
      recentMatches.unshift(match);
      waitingPlayers = removePlayersByIds(waitingPlayers, playerIds);
      nextNo += 1;
    }

    if (!createdMatches.length) {
      await client.query('ROLLBACK');
      return {
        error: {
          status: 422,
          message: 'Belum ada kombinasi match valid untuk dibuat.',
        },
      };
    }

    await client.query('COMMIT');

    return {
      session,
      matches: createdMatches,
      meta: {
        createdCount: createdMatches.length,
        waitingBefore: waitingResult.rows.length,
        remainingWaiting: waitingPlayers.length,
        availableCourts,
        usedCourts: createdMatches.map((match) => match.court),
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function completeMatchTransactional(id, { score = '', winner = '', returnToQueue = true }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const matchResult = await client.query(
      `UPDATE matches
       SET status = 'completed',
           completed_at = now(),
           score = $2,
           winner = $3,
           updated_at = now()
       WHERE id = $1 AND status = 'playing'
       RETURNING *`,
      [id, score, winner]
    );

    const match = toMatch(matchResult.rows[0]);

    if (!match) {
      await client.query('ROLLBACK');
      return null;
    }

    const nextStatus = returnToQueue ? 'waiting' : 'resting';

    await client.query(
      `UPDATE players
       SET status = $2::player_status,
           current_match_id = NULL,
           updated_at = now()
       WHERE id = ANY($1::uuid[])
         AND current_match_id = $3`,
      [[...match.team1, ...match.team2], nextStatus, match._id]
    );

    await client.query('COMMIT');

    return match;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
