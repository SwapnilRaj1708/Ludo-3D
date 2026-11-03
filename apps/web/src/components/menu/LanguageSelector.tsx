'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { LOCALES, LOCALE_LABELS } from '@/i18n/config';
import { setLocaleCookie } from '@/i18n/actions';
import styles from './menu.module.css';

export function LanguageSelector() {
  const t = useTranslations('menu');
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className={styles.language}>
      <span className="visually-hidden">{t('language')}</span>
      <span aria-hidden className={styles.languageIcon}>
        文A
      </span>
      <select
        value={locale}
        disabled={pending}
        data-testid="language-select"
        aria-label={t('language')}
        onChange={(e) => {
          const next = e.currentTarget.value;
          startTransition(async () => {
            await setLocaleCookie(next);
            router.refresh();
          });
        }}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
