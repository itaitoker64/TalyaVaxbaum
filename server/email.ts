/** Server-only Resend transport. Never include private coaching content in notification email. */
export function emailConfigured() { return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM && process.env.APP_URL?.startsWith('https://')); }
export async function sendEmail(to: string, subject: string, text: string) {
  if (!emailConfigured()) throw new Error('email_not_configured');
  const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text }), signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error('email_delivery_failed');
}

export async function notifyUser(db: import('./db.ts').DB, userId: string) {
  if (!emailConfigured() || process.env.EMAIL_NOTIFICATIONS !== '1') return;
  const { get } = await import('./db.ts');
  const u = get(db, 'SELECT email, locale FROM users WHERE id = ? AND disabled = 0 AND is_demo = 0', userId);
  if (!u) return;
  try { await sendEmail(u.email, u.locale === 'he' ? 'עדכון חדש ב־Movement by Talya' : 'New update in Movement by Talya', (u.locale === 'he' ? 'מחכה לך הודעה חדשה באפליקציה.\n' : 'You have a new message in the app.\n') + new URL('/', process.env.APP_URL!).href); }
  catch { console.error('Notification email delivery failed'); }
}
