import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectDB, query } from '../config/db.js';

async function main() {
  await connectDB();

  const username = 'sulthan';
  const email = 'sulthanganz@gmail.com';
  const newPassword = 'Sulthanzaki01.';

  const passwordHash = await bcrypt.hash(newPassword, 12);

  const result = await query(
    `
    UPDATE players
    SET
      username = $1,
      email = $2,
      role = 'admin',
      password_hash = $3,
      email_verified = TRUE,
      updated_at = now()
    WHERE LOWER(username) = 'sulthan'
       OR LOWER(email) = 'sulthanganz@gmail.com'
    RETURNING id, nama, username, email, role, password_hash
    `,
    [username, email, passwordHash]
  );

  if (!result.rows[0]) {
    console.log('Akun Sulthan tidak ditemukan.');
    process.exit(1);
  }

  console.log('Password Sulthan berhasil direset.');
  console.log({
    username: result.rows[0].username,
    email: result.rows[0].email,
    role: result.rows[0].role,
  });

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});