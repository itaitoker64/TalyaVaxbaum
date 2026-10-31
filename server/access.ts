// Server-side permission checks. Every route that touches client data resolves the owning
// client id and passes it through `requireClientAccess`. Inaccessible resources respond 404 so
// that one client can't even learn whether another client's record exists.
import { HTTPException } from 'hono/http-exception';
import type { Context } from 'hono';
import { get, all, type DB } from './db.ts';
import type { AuthUser, Env } from './auth.ts';

export class ApiError extends HTTPException {}

export const notFound = () => new HTTPException(404, { message: 'not_found' });
export const forbidden = () => new HTTPException(403, { message: 'forbidden' });
export const badRequest = (message = 'bad_request') => new HTTPException(400, { message });

export function requireUser(c: Context<Env>): AuthUser {
  const u = c.get('user');
  if (!u) throw new HTTPException(401, { message: 'unauthenticated' });
  return u;
}

export function requireCoach(c: Context<Env>): AuthUser {
  const u = requireUser(c);
  if (u.role !== 'coach') throw forbidden();
  return u;
}

export function isCoachOf(db: DB, coachId: string, clientId: string): boolean {
  return !!get(db, "SELECT 1 FROM coach_clients WHERE coach_id = ? AND client_id = ? AND status != 'ended'", coachId, clientId);
}

export function canAccessClient(db: DB, user: AuthUser, clientId: string): boolean {
  if (user.role === 'client') return user.id === clientId;
  return isCoachOf(db, user.id, clientId);
}

/** Throws 404 unless the user is the client or one of the client's assigned coaches. */
export function requireClientAccess(c: Context<Env>, clientId: string | null | undefined): AuthUser {
  const u = requireUser(c);
  if (!clientId || !canAccessClient(c.get('db'), u, clientId)) throw notFound();
  return u;
}

/** Coaches of a client (normally one). */
export function coachIdsOf(db: DB, clientId: string): string[] {
  return all<{ coach_id: string }>(db, "SELECT coach_id FROM coach_clients WHERE client_id = ? AND status != 'ended'", clientId).map(
    (r) => r.coach_id,
  );
}

/** Library content (exercises, library media, recipes, foods) belongs to a coach and is visible
 *  to that coach and their active clients. */
export function canSeeCoachLibrary(db: DB, user: AuthUser, coachId: string): boolean {
  if (user.role === 'coach') return user.id === coachId;
  return isCoachOf(db, coachId, user.id);
}

export function requireLibraryAccess(c: Context<Env>, coachId: string | null | undefined): AuthUser {
  const u = requireUser(c);
  if (!coachId || !canSeeCoachLibrary(c.get('db'), u, coachId)) throw notFound();
  return u;
}

/** The coach whose library a user sees: themselves, or the client's (first) coach. */
export function libraryCoachId(db: DB, user: AuthUser): string | null {
  if (user.role === 'coach') return user.id;
  return coachIdsOf(db, user.id)[0] ?? null;
}

export function canAccessMedia(db: DB, user: AuthUser, m: { scope: string; coach_id: string | null; client_id: string | null }): boolean {
  if (m.scope === 'library') return !!m.coach_id && canSeeCoachLibrary(db, user, m.coach_id);
  return !!m.client_id && canAccessClient(db, user, m.client_id);
}
