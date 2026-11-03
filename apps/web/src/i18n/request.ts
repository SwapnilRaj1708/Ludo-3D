import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, negotiateLocale } from './config';

/**
 * Locale resolution order: explicit cookie (set by the language selector),
 * then the browser's Accept-Language, then English. English messages are
 * always loaded as the fallback for any key missing in another language.
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(fromCookie)
    ? fromCookie
    : negotiateLocale((await headers()).get('accept-language'));

  const fallback = (await import('../../messages/en.json')).default;
  const messages =
    locale === DEFAULT_LOCALE
      ? fallback
      : deepMerge(fallback, (await import(`../../messages/${locale}.json`)).default);

  return { locale, messages };
});

type Messages = { [key: string]: string | Messages };

function deepMerge(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = out[key];
    out[key] =
      typeof value === 'object' && typeof current === 'object' ? deepMerge(current, value) : value;
  }
  return out;
}
