# UABT UB Player Hub — Backend Realtime PostgreSQL

Backend sekarang memakai **Express + Socket.IO + PostgreSQL**. Frontend player/admin tetap sama: data dummy diganti dengan API dan realtime socket.

## Stack

- Node.js + Express
- Socket.IO
- PostgreSQL via package `pg`
- Zod validation
- Vite static frontend

## Flow utama

1. Player register/login.
2. Data player tersimpan di PostgreSQL table `players`.
3. Admin membuat sesi dari dashboard admin.
4. Backend membuat kode sesi.
5. Player hanya input kode sesi di dashboard pemain.
6. Backend mencari akun player berdasarkan `playerId` login, lalu mengambil `nama`, `gender`, dan `grade` dari PostgreSQL.
7. Player masuk antrean `waiting`.
8. Admin menerima update realtime.
9. Admin generate match.
10. Backend menjalankan matchmaking dan update status player menjadi `playing`.

## Setup cepat

Masuk backend:

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Isi `.env` lokal:

```env
PORT=3000
POSTGRES_URL=postgres://postgres:postgres@127.0.0.1:5432/uabt_ub_player_hub
POSTGRES_SSL=false
CLIENT_ORIGIN=http://localhost:5173
DEFAULT_COURT=Court A
```

Ganti password `postgres` sesuai password PostgreSQL kamu.

Health check:

```txt
http://localhost:3000/health
```

## Database schema

Schema dibuat otomatis saat backend start.

Tables:

- `sessions`
- `players`
- `matches`

### players

Field utama:

- `id` UUID
- `nama`
- `username`
- `email`
- `password_hash`
- `gender`: `P` atau `W`
- `grade`: `A`, `B`, atau `C`
- `waktu_hadir`
- `jumlah_main`
- `status`: `registered`, `pending_scan`, `waiting`, `playing`, `resting`, `done`
- `session_id`
- `current_match_id`

### sessions

Field utama:

- `id` UUID
- `code`
- `title`
- `location`
- `court`
- `pj`: `Davy`, `David`, `Bagas`, `Sulthan`
- `start_at`
- `end_at`
- `is_active`

### matches

Field utama:

- `id` UUID
- `session_id`
- `match_no`
- `court`
- `game_type`: `MD`, `WD`, `XD`
- `team1_ids`
- `team2_ids`
- `team1_point`
- `team2_point`
- `tolerance_used`
- `status`
- `score`
- `winner`

## API penting

### Register

```http
POST /api/auth/register
```

### Login

```http
POST /api/auth/login
```

### Buat sesi

```http
POST /api/sessions
```

Body:

```json
{
  "title": "Latihan Jumat Malam",
  "location": "GOR UB",
  "court": "Court A",
  "pj": "Sulthan",
  "startAt": "2026-04-25T19:00:00.000Z",
  "isActive": true
}
```

### Ambil sesi aktif

```http
GET /api/sessions/active
```

### Player join sesi

```http
POST /api/players/join
```

Body:

```json
{
  "playerId": "PLAYER_ID_DARI_LOGIN",
  "sessionCode": "UABT-1428"
}
```

### Generate match

```http
POST /api/matches/generate
```

### Complete match

```http
PATCH /api/matches/:id/complete
```

## Realtime events

- `snapshot:update`
- `session:created`
- `session:activated`
- `player:joined`
- `match:generated`
- `match:completed`

## Matchmaking

Grade weight:

- A = 3
- B = 2
- C = 1

Queue sorting:

1. `jumlah_main` ascending
2. `waktu_hadir` ascending

Valid game:

- MD: 4 pria
- WD: 4 wanita
- XD: setiap tim berisi 1 pria + 1 wanita

Backend mencoba kombinasi 4 pemain, membagi menjadi 2 tim, lalu memilih match dengan selisih poin terkecil. Jika tidak ada match sempurna, backend bisa memakai fallback tolerance.

## Seed data

```bash
cd backend
npm run seed
```

Seed membuat sesi demo:

```txt
UABT-1428
```

Login demo:

```txt
playerdemo / password
```
