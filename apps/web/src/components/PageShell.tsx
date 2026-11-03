import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

/** Header + content column used by every non-game screen. */
export async function PageShell({ title, children }: { title: string; children: ReactNode }) {
  const t = await getTranslations('common');
  return (
    <main id="main" className="page">
      <div className="page__inner">
        <div className="page__header">
          <Link href="/" aria-label={t('back')} className="back-link">
            ←
          </Link>
          <h1 className="page__title">{title}</h1>
        </div>
        {children}
      </div>
    </main>
  );
}
