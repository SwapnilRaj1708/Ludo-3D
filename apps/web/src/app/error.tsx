'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Button } from '@/components/ui';
import { reportError } from '@/services/errors';

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');
  const tCommon = useTranslations('common');
  useEffect(() => {
    reportError(error, 'route', error.digest ? { digest: error.digest } : undefined);
  }, [error]);
  return (
    <main id="main" className="page">
      <div className="page__inner" style={{ textAlign: 'center', marginTop: '18vh' }}>
        <h1 className="page__title">{t('generic')}</h1>
        <Button variant="primary" onClick={reset}>
          {tCommon('retry')}
        </Button>
        <Link href="/">{t('goHome')}</Link>
      </div>
    </main>
  );
}
