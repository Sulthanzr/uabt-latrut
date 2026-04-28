# Migrasi Backend ke PostgreSQL

Backend project ini sudah tidak memakai MongoDB/Mongoose. Database sekarang memakai PostgreSQL via package `pg`.

## 1. Buat database PostgreSQL lokal

Install PostgreSQL Windows, lalu buat database:

```sql
CREATE DATABASE uabt_ub_player_hub;
```

Default `.env` lokal:

```env
PORT=3000
POSTGRES_URL=postgres://postgres:postgres@127.0.0.1:5432/uabt_ub_player_hub
POSTGRES_SSL=false
CLIENT_ORIGIN=http://localhost:5173
DEFAULT_COURT=Court A
```

Ganti password `postgres` sesuai password PostgreSQL kamu.

## 2. Alternatif cloud PostgreSQL

Bisa pakai Supabase, Neon, Railway, atau Render PostgreSQL.

```env
POSTGRES_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
POSTGRES_SSL=true
```

## 3. Jalankan backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Saat backend start, schema akan otomatis dibuat:

- `sessions`
- `players`
- `matches`

Endpoint health check:

```txt
http://localhost:3000/health
```

## 4. Seed data opsional

```bash
npm run seed
```

Seed membuat sesi demo `UABT-1428` dan login demo `playerdemo / password`.

## 5. Flow tetap sama

Admin membuat sesi, player login/register, player hanya input kode sesi, backend mengambil data player dari PostgreSQL, lalu admin/player update realtime via Socket.IO.
