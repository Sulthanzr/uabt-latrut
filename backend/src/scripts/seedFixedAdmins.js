import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectDB, query } from '../config/db.js';

const admins = [
  {
    username: 'david',
    nama: 'David Juan',
    password: 'Djuan123',
    email: 'davidjuantaa@gmail.com',
  },
  {
    username: 'bagas',
    nama: 'Bagas setya',
    password: 'anakkucinghitamputih7007',
    email: 'dharmabagas0770@gmail.com',
  },
  {
    username: 'davy',
    nama: 'Valid Fridavy',
    password: 'hpkuanyar02',
    email: 'fridavyeldison123@gmail.com',
  },
  {
    username: 'sulthan',
    nama: 'Sulthan Zaki',
    password: 'Sulthanzaki01.',
    email: 'sulthanganz@gmail.com',
  },
];

async function ensureGoogleColumns() {
  await query(`
    ALTER TABLE players
    ADD COLUMN IF NOT EXISTS google_sub TEXT,
    ADD COLUMN IF NOT EXISTS avatar_url TEXT,
    ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'password',
    ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
  `);

  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_players_google_sub
    ON players(google_sub)
    WHERE google_sub IS NOT NULL;
  `);
}

async function upsertAdmin(admin) {
  const username = admin.username.trim().toLowerCase();
  const email = admin.email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(admin.password, 12);

  const existing = await query(
    `
    SELECT *
    FROM players
    WHERE LOWER(username) = LOWER($1)
       OR LOWER(email) = LOWER($2)
    LIMIT 1
    `,
    [username, email]
  );

  if (existing.rows[0]) {
    const updated = await query(
      `
      UPDATE players
      SET nama = $1,
          username = $2,
          email = $3,
          password_hash = $4,
          role = 'admin',
          status = CASE
            WHEN status IS NULL THEN 'registered'
            ELSE status
          END,
          auth_provider = CASE
            WHEN google_sub IS NOT NULL THEN auth_provider
            ELSE 'password'
          END,
          email_verified = TRUE,
          updated_at = now()
      WHERE id = $5
      RETURNING id, nama, username, email, role, google_sub
      `,
      [
        admin.nama,
        username,
        email,
        passwordHash,
        existing.rows[0].id,
      ]
    );

    return updated.rows[0];
  }

  const inserted = await query(
    `
    INSERT INTO players
      (
        nama,
        username,
        password_hash,
        gender,
        grade,
        status,
        email,
        role,
        jumlah_main,
        auth_provider,
        email_verified
      )
    VALUES
      (
        $1,
        $2,
        $3,
        'P',
        'A',
        'registered',
        $4,
        'admin',
        0,
        'password',
        TRUE
      )
    RETURNING id, nama, username, email, role, google_sub
    `,
    [
      admin.nama,
      username,
      passwordHash,
      email,
    ]
  );

  return inserted.rows[0];
}

async function main() {
  await connectDB();
  await ensureGoogleColumns();

  console.log('Membuat / update akun admin...');

  for (const admin of admins) {
    const result = await upsertAdmin(admin);
    console.log(`OK admin: ${result.username} | ${result.email} | role=${result.role}`);
  }

  console.log('Selesai. Akun admin sudah siap dipakai.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});