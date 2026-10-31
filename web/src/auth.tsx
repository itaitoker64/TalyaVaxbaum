import { createContext, useContext, type ReactNode } from 'react';
import { useApi, POST } from './api.ts';
import type { NutritionConfig } from '../../shared/types.ts';

export interface Me {
  user: { id: string; email: string; name: string; role: 'coach' | 'client'; locale: 'he' | 'en'; is_demo: boolean } | null;
  coachId: string | null;
  coachName?: string | null;
  weekStartDay: number;
  responseExpectation: string | null;
  whatsappUrl: string | null;
  onboardingDone?: boolean;
  nutrition?: NutritionConfig;
}

interface AuthCtx {
  me: Me | null;
  loading: boolean;
  error: unknown;
  reload: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, loading, error, reload } = useApi<Me>('/auth/me');
  const logout = async () => {
    await POST('/auth/logout');
    localStorage.removeItem('drafts');
    window.location.href = '/login';
  };
  return <Ctx.Provider value={{ me: data, loading, error, reload, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('AuthProvider missing');
  return v;
}

/** The signed-in user; only use below an authenticated route. */
export function useUser() {
  const { me } = useAuth();
  return me!.user!;
}
