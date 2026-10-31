// Creates a coach account: npm run create-coach -- email@example.com "Talya" 'a-long-password'
import { openDb, insert, now, newId, get } from '../server/db.ts';
import { hashPassword } from '../server/auth.ts';

const [email, name, password] = process.argv.slice(2);
if (!email || !name || !password || password.length < 10) {
  console.error('Usage: npm run create-coach -- <email> <name> <password (min 10 chars)>');
  process.exit(1);
}
const db = openDb(process.env.DB_FILE ?? `${process.env.DATA_DIR ?? './data'}/movement.db`);
if (get(db, 'SELECT 1 FROM users WHERE email = ?', email)) {
  console.error('A user with this email already exists.');
  process.exit(1);
}
const id = newId();
insert(db, 'users', { id, email, name, password_hash: await hashPassword(password), role: 'coach', locale: 'he', created_at: now() });
insert(db, 'coach_settings', { coach_id: id, response_expectation: null, whatsapp_url: null, week_start_day: 0, updated_at: now() });
console.log(`Coach created: ${email}`);
