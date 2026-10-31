import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, cpSync, existsSync, chmodSync } from 'node:fs';
import { resolve, join } from 'node:path';
const source = resolve(process.env.DATA_DIR ?? './data');
const destination = process.argv[2];
if (!destination) throw new Error('Usage: node --import tsx scripts/backup.ts /path/to/new-backup-directory');
const target = resolve(destination);
if (target === source || target.startsWith(source + '/')) throw new Error('Backup must be outside DATA_DIR');
if (existsSync(target)) throw new Error('Destination already exists; use a new directory');
mkdirSync(target, { recursive: true, mode: 0o700 });
chmodSync(target, 0o700);
const db = new DatabaseSync(process.env.DB_FILE ?? join(source, 'movement.db'), { readOnly: true });
try { db.exec(`VACUUM INTO '${join(target, 'movement.db').replaceAll("'", "''")}'`); } finally { db.close(); }
const uploads = process.env.UPLOAD_DIR ?? join(source, 'uploads');
if (existsSync(uploads)) cpSync(uploads, join(target, 'uploads'), { recursive: true, errorOnExist: true });
const check = new DatabaseSync(join(target, 'movement.db'), { readOnly: true });
try { if ((check.prepare('PRAGMA quick_check').get() as any).quick_check !== 'ok') throw new Error('Backup integrity check failed'); } finally { check.close(); }
console.log('Backup created. Copy this directory to separate durable storage. Pause uploads during backup for a coordinated file snapshot.');
