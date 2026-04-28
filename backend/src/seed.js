import 'dotenv/config';
import { connectDB } from './config/db.js';
import { generateQrCode } from './utils/code.js';
import { hashPassword } from './utils/password.js';
import { createPlayer, createSession, truncateAll } from './services/repository.js';

await connectDB(process.env.POSTGRES_URL);
await truncateAll();

const session = await createSession({
  code: 'UABT-1428',
  title: 'Sesi Reguler Sore',
  location: 'GOR UB',
  court: 'Court A',
  pj: 'Sulthan',
  isActive: true,
});

const waitingPlayers = [
  ['Budi', 'budi', 'P', 'A', 'waiting', '2026-04-25T19:00:00+07:00'],
  ['Andi', 'andi', 'P', 'C', 'waiting', '2026-04-25T19:01:00+07:00'],
  ['Joko', 'joko', 'P', 'B', 'waiting', '2026-04-25T19:02:00+07:00'],
  ['Tono', 'tono', 'P', 'B', 'waiting', '2026-04-25T19:05:00+07:00'],
  ['Rina', 'rina', 'W', 'C', 'waiting', '2026-04-25T19:06:00+07:00'],
  ['Salsa', 'salsa', 'W', 'B', 'waiting', '2026-04-25T19:07:00+07:00'],
];

for (const [nama, username, gender, grade, status, waktu] of waitingPlayers) {
  await createPlayer({
    nama,
    username,
    email: `${username}@student.ub.ac.id`,
    passwordHash: hashPassword('password'),
    gender,
    grade,
    status,
    waktu_hadir: waktu,
    session: session._id,
    qrCode: generateQrCode(),
    jumlah_main: 0,
  });
}

await createPlayer({
  nama: 'Admin UABT',
  username: process.env.ADMIN_USERNAME || 'admin',
  email: process.env.ADMIN_EMAIL || 'admin@uabt.local',
  passwordHash: hashPassword(process.env.ADMIN_PASSWORD || 'admin12345'),
  gender: 'P',
  grade: 'A',
  status: 'registered',
  jumlah_main: 0,
  role: 'admin',
});

await createPlayer({
  nama: 'Player Baru Demo',
  username: 'playerdemo',
  email: 'playerdemo@student.ub.ac.id',
  passwordHash: hashPassword('password'),
  gender: 'P',
  grade: 'B',
  status: 'registered',
  jumlah_main: 0,
});

console.log('Seed selesai. Session code:', session.code);
console.log('Login demo player: playerdemo / password');
console.log(`Login demo admin: ${process.env.ADMIN_USERNAME || 'admin'} / ${process.env.ADMIN_PASSWORD || 'admin12345'}`);
process.exit(0);
