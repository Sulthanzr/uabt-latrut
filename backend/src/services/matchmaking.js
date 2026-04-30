const GRADE_POINT = { A: 3, B: 2, C: 1 };

export function gradePoint(grade) {
  return GRADE_POINT[grade] ?? 0;
}

export function sortQueue(players) {
  return [...players].sort((a, b) => {
    const countDiff = (a.jumlah_main ?? 0) - (b.jumlah_main ?? 0);
    if (countDiff !== 0) return countDiff;
    return new Date(a.waktu_hadir).getTime() - new Date(b.waktu_hadir).getTime();
  });
}

function combinations(items, k, start = 0, bucket = [], out = []) {
  if (bucket.length === k) {
    out.push([...bucket]);
    return out;
  }
  for (let i = start; i <= items.length - (k - bucket.length); i += 1) {
    bucket.push(items[i]);
    combinations(items, k, i + 1, bucket, out);
    bucket.pop();
  }
  return out;
}

function partitionsOfFour(players) {
  const [a, b, c, d] = players;
  return [
    { team1: [a, b], team2: [c, d] },
    { team1: [a, c], team2: [b, d] },
    { team1: [a, d], team2: [b, c] },
  ];
}

function pairHasOneMaleOneFemale(pair) {
  const genders = pair.map((p) => p.gender).sort().join('');
  return genders === 'PW';
}

function getGameType(team1, team2) {
  const all = [...team1, ...team2];

  if (all.every((p) => p.gender === 'P')) return 'MD';
  if (all.every((p) => p.gender === 'W')) return 'WD';

  if (pairHasOneMaleOneFemale(team1) && pairHasOneMaleOneFemale(team2)) {
    return 'XD';
  }

  // Supaya komposisi seperti 3 pria + 1 wanita tetap bisa main.
  // Ini penting agar pemain dengan jumlah main lebih rendah tidak selalu terskip.
  return 'FREE';
}

function scoreTeam(team) {
  return team.reduce((sum, p) => sum + gradePoint(p.grade), 0);
}

function playerId(playerOrId) {
  if (!playerOrId) return '';
  if (typeof playerOrId === 'string') return playerOrId;
  return String(playerOrId._id || playerOrId.id || '');
}

function pairKey(a, b) {
  return [playerId(a), playerId(b)].sort().join(':');
}

function teamPairPenalty(team, pairWeights) {
  if (!team || team.length < 2) return 0;

  const key = pairKey(team[0], team[1]);
  return pairWeights.get(key) || 0;
}

function matchTeamIds(team = []) {
  return team.map(playerId).filter(Boolean);
}

function buildRecentPairWeights(recentMatches = [], limit = 20) {
  const pairWeights = new Map();

  recentMatches.slice(0, limit).forEach((match, index) => {
    const weight = Math.max(1, limit - index);

    const team1 = matchTeamIds(match.team1 || match.team1_ids || []);
    const team2 = matchTeamIds(match.team2 || match.team2_ids || []);

    if (team1.length >= 2) {
      const key = pairKey(team1[0], team1[1]);
      pairWeights.set(key, (pairWeights.get(key) || 0) + weight);
    }

    if (team2.length >= 2) {
      const key = pairKey(team2[0], team2[1]);
      pairWeights.set(key, (pairWeights.get(key) || 0) + weight);
    }
  });

  return pairWeights;
}

function candidateRank(candidate, queue, pairWeights) {
  const ids = new Set([...candidate.team1, ...candidate.team2].map((p) => playerId(p)));

  const maxQueueIndex = Math.max(
    ...queue.map((p, i) => (ids.has(playerId(p)) ? i : -1))
  );

  const totalWaitAge = [...candidate.team1, ...candidate.team2].reduce(
    (sum, p) => sum + new Date(p.waktu_hadir).getTime(),
    0
  );

  const totalPlayCount = [...candidate.team1, ...candidate.team2].reduce(
    (sum, p) => sum + (p.jumlah_main ?? 0),
    0
  );

  const repeatPairPenalty =
    teamPairPenalty(candidate.team1, pairWeights) +
    teamPairPenalty(candidate.team2, pairWeights);

  return {
    maxQueueIndex,
    totalWaitAge,
    totalPlayCount,
    repeatPairPenalty,
  };
}

/**
 * Mencari 4 pemain paling adil:
 * 1. queue disortir jumlah_main ASC, waktu_hadir ASC
 * 2. anchor dicoba dari urutan teratas; jika tidak bisa, anchor berikutnya dicoba
 * 3. kombinasi 3 pemain lain dicari, lalu dibagi menjadi 2 tim
 * 4. diff poin terkecil menang; diff 0 diprioritaskan
 */
export function findBestMatch(players, options = {}) {
  const tolerance = Number.isInteger(options.tolerance) ? options.tolerance : 0;
  const maxSearchPlayers = options.maxSearchPlayers ?? 16;
  const queue = sortQueue(players).slice(0, maxSearchPlayers);
  if (queue.length < 4) return null;

  const pairWeights = buildRecentPairWeights(
    options.recentMatches || [],
    options.recentHistoryLimit ?? 20
  );

  const validCandidates = [];

  for (let anchorIndex = 0; anchorIndex < queue.length; anchorIndex += 1) {
    const anchor = queue[anchorIndex];
    const others = queue.filter((_, idx) => idx !== anchorIndex);
    const triples = combinations(others, 3);

    for (const triple of triples) {
      const group = [anchor, ...triple];
      for (const partition of partitionsOfFour(group)) {
        const gameType = getGameType(partition.team1, partition.team2);
        if (!gameType) continue;

        const team1Point = scoreTeam(partition.team1);
        const team2Point = scoreTeam(partition.team2);
        const diff = Math.abs(team1Point - team2Point);
        if (diff > tolerance) continue;

        const rank = candidateRank(partition, queue, pairWeights);

        validCandidates.push({
          ...partition,
          gameType,
          team1Point,
          team2Point,
          diff,
          anchorIndex,
          randomTie: Math.random(),
          ...rank,
        });
      }
    }

    // Fairness: kalau anchor paling prioritas sudah punya kombinasi pas, jangan lompat ke anchor bawah.
    if (validCandidates.some((c) => c.anchorIndex === anchorIndex && c.diff === 0)) break;
  }

  validCandidates.sort((a, b) => {
    if (a.diff !== b.diff) return a.diff - b.diff;
    if (a.anchorIndex !== b.anchorIndex) return a.anchorIndex - b.anchorIndex;

    if (a.repeatPairPenalty !== b.repeatPairPenalty) {
      return a.repeatPairPenalty - b.repeatPairPenalty;
    }

    if (a.maxQueueIndex !== b.maxQueueIndex) return a.maxQueueIndex - b.maxQueueIndex;
    if (a.totalPlayCount !== b.totalPlayCount) return a.totalPlayCount - b.totalPlayCount;
    if (a.totalWaitAge !== b.totalWaitAge) return a.totalWaitAge - b.totalWaitAge;

    return a.randomTie - b.randomTie;
  });

  return validCandidates[0] ?? null;
}
