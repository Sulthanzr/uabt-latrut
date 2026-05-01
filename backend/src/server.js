import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { connectDB } from './config/db.js';
import { sessionRouter } from './routes/sessions.js';
import { playerRouter } from './routes/players.js';
import { matchRouter } from './routes/matches.js';
import { authRouter } from './routes/auth.js';
import { attachRealtime } from './socket/realtime.js';

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');

const uploadsDir = path.join(backendRoot, 'uploads');
const profileUploadsDir = path.join(uploadsDir, 'profile');

fs.mkdirSync(profileUploadsDir, { recursive: true });

const server = http.createServer(app);
const origin = process.env.CLIENT_ORIGIN?.split(',').map((v) => v.trim()) ?? true;
const io = new Server(server, { cors: { origin, methods: ['GET', 'POST', 'PATCH', 'DELETE'] } });

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin }));
app.use(express.json());
app.use(morgan('dev'));

app.use('/uploads', express.static(uploadsDir));;

app.get('/health', (_req, res) => res.json({ ok: true, service: 'uabt-latrut-backend' }));
app.use('/api/auth', authRouter);
app.use('/api/sessions', sessionRouter);
app.use('/api/players', playerRouter);
app.use('/api/matches', matchRouter);

attachRealtime(io);

app.use('/api', (req, res) => {
  res.status(404).json({
    message: `Endpoint tidak ditemukan: ${req.method} ${req.originalUrl}`,
  });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err?.name === 'ZodError') return res.status(400).json({ message: 'Validasi gagal.', errors: err.errors });
  if (err?.code === '23505') return res.status(409).json({ message: 'Data duplikat.', detail: err.detail });
  if (err?.code === '22P02') return res.status(400).json({ message: 'Format ID tidak valid.' });
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
await connectDB(process.env.POSTGRES_URL);
server.listen(PORT, () => console.log(`[api] listening on http://localhost:${PORT}`));
