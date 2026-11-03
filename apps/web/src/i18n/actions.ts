'use server';

import { cookies } from 'next/headers';
import { LOCALE_COOKIE, isLocale } from './config';

/** Persists the chosen UI language for one year. */
export async function setLocaleCookie(locale: string): Promise<void> {
  if (!isLocale(locale)) throw new Error('Unsupported locale');
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
}
