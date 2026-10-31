import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { STRINGS, type StringKey } from './strings.ts';

export type Locale = 'he' | 'en';

interface I18n {
  locale: Locale;
  dir: 'rtl' | 'ltr';
  setLocale: (l: Locale) => void;
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
  fmtDate: (iso: string, opts?: Intl.DateTimeFormatOptions) => string;
  fmtNum: (n: number | null | undefined, digits?: number) => string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children, initial }: { children: ReactNode; initial?: Locale }) {
  const [locale, setLocale] = useState<Locale>(() => (localStorage.getItem('locale') as Locale) || initial || 'he');
  const dir = locale === 'he' ? 'rtl' : 'ltr';
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
    localStorage.setItem('locale', locale);
  }, [locale, dir]);
  const value = useMemo<I18n>(() => {
    const idx = locale === 'he' ? 0 : 1;
    const intlLocale = locale === 'he' ? 'he-IL' : 'en-GB';
    return {
      locale,
      dir,
      setLocale,
      t: (key, vars) => {
        let s: string = STRINGS[key]?.[idx] ?? key;
        if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
        return s;
      },
      fmtDate: (iso, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
        new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString(intlLocale, opts),
      fmtNum: (n, digits = 1) => (n == null || !Number.isFinite(n) ? '–' : new Intl.NumberFormat(intlLocale, { maximumFractionDigits: digits }).format(n)),
    };
  }, [locale, dir]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('I18nProvider missing');
  return v;
}
