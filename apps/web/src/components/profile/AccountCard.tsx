'use client';

import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui';

/** Replaced in Milestone 4 by Firebase-backed sign-in, stats and history. */
export function AccountCard() {
  const t = useTranslations('profile');
  return (
    <Card title={t('title')}>
      <p>{t('guestHint')}</p>
    </Card>
  );
}
