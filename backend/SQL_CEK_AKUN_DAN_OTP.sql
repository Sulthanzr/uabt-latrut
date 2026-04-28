-- Cek akun Google / manual yang masuk database
SELECT
  id,
  nama,
  username,
  email,
  role,
  google_sub,
  auth_provider,
  email_verified,
  created_at
FROM players
ORDER BY created_at DESC;

-- Cek akun Google saja
SELECT nama, username, email, google_sub, auth_provider, email_verified, created_at
FROM players
WHERE google_sub IS NOT NULL OR auth_provider = 'google'
ORDER BY created_at DESC;

-- Jadikan akun tertentu sebagai admin
-- UPDATE players SET role = 'admin', updated_at = now() WHERE email = 'emailkamu@gmail.com';

-- Cek OTP terbaru untuk development/debugging
SELECT email, purpose, expires_at, consumed_at, attempts, created_at
FROM email_otps
ORDER BY created_at DESC
LIMIT 20;
