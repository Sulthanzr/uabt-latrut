import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function connectDB(uri = process.env.POSTGRES_URL) {
  if (!uri) throw new Error('POSTGRES_URL belum diisi. Cek file backend/.env');
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    await initSchema(client);
    console.log('[db] PostgreSQL connected');
  } finally {
    client.release();
  }
}

async function initSchema(client) {
  await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await client.query(`
    DO $$ BEGIN
      CREATE TYPE gender_type AS ENUM ('P', 'W');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  await client.query(`
    DO $$ BEGIN
      CREATE TYPE grade_type AS ENUM ('A', 'B', 'C');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  await client.query(`
    DO $$ BEGIN
      CREATE TYPE player_status AS ENUM ('registered', 'pending_scan', 'waiting', 'playing', 'resting', 'done');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  await client.query(`
    DO $$ BEGIN
      CREATE TYPE game_type AS ENUM ('MD', 'WD', 'XD', 'FREE');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  await client.query(`
    DO $$ BEGIN
      CREATE TYPE match_status AS ENUM ('playing', 'completed', 'cancelled');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT 'GOR UB',
      court TEXT NOT NULL DEFAULT 'Court A',
      pj TEXT NOT NULL DEFAULT 'Sulthan' CHECK (pj IN ('Davy', 'David', 'Bagas', 'Sulthan')),
      start_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      end_at TIMESTAMPTZ,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS players (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nama TEXT NOT NULL,
      username TEXT UNIQUE,
      password_hash TEXT,
      gender gender_type NOT NULL,
      grade grade_type NOT NULL,
      waktu_hadir TIMESTAMPTZ NOT NULL DEFAULT now(),
      jumlah_main INTEGER NOT NULL DEFAULT 0,
      status player_status NOT NULL DEFAULT 'registered',
      qr_code TEXT UNIQUE,
      session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
      current_match_id UUID,
      email TEXT UNIQUE,
      phone TEXT,
      role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'admin')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS email_otps (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL,
      purpose TEXT NOT NULL DEFAULT 'register',
      otp_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS matches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      match_no INTEGER NOT NULL,
      court TEXT NOT NULL DEFAULT 'Court A',
      game_type game_type NOT NULL,
      team1_ids UUID[] NOT NULL,
      team2_ids UUID[] NOT NULL,
      team1_point INTEGER NOT NULL,
      team2_point INTEGER NOT NULL,
      tolerance_used INTEGER NOT NULL DEFAULT 0,
      status match_status NOT NULL DEFAULT 'playing',
      score TEXT NOT NULL DEFAULT '',
      winner TEXT NOT NULL DEFAULT '' CHECK (winner IN ('team1', 'team2', 'draw', '')),
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(session_id, match_no)
    );
  `);

  await client.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'player'`);
  await client.query('ALTER TABLE players ADD COLUMN IF NOT EXISTS google_sub TEXT');
  await client.query('ALTER TABLE players ADD COLUMN IF NOT EXISTS avatar_url TEXT');
  await client.query("ALTER TABLE players ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'password'");
  await client.query('ALTER TABLE players ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false');
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_players_google_sub ON players(google_sub) WHERE google_sub IS NOT NULL');
  await client.query(`
    DO $$ BEGIN
      ALTER TABLE players ADD CONSTRAINT players_role_check CHECK (role IN ('player', 'admin'));
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  await client.query(`
    DO $$ BEGIN
      ALTER TABLE players ADD CONSTRAINT players_current_match_fk
      FOREIGN KEY (current_match_id) REFERENCES matches(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  await client.query(`
    CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  for (const tableName of ['sessions', 'players', 'matches']) {
    await client.query(`DROP TRIGGER IF EXISTS trg_${tableName}_updated_at ON ${tableName}`);
    await client.query(`
      CREATE TRIGGER trg_${tableName}_updated_at
      BEFORE UPDATE ON ${tableName}
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `);
  }

  await client.query('CREATE INDEX IF NOT EXISTS idx_players_session_status ON players(session_id, status)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_players_queue ON players(session_id, status, jumlah_main, waktu_hadir)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active, created_at DESC)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_matches_session_no ON matches(session_id, match_no DESC)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_email_otps_lookup ON email_otps(email, purpose, consumed_at, expires_at, created_at DESC)');
}
