import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export default async function NotFound() {
  const t = await getTranslations('errors');
  return (
    <main id="main" className="page">
      <div className="page__inner" style={{ textAlign: 'center', marginTop: '20vh' }}>
        <h1 className="page__title">{t('notFoundTitle')}</h1>
        <p>{t('notFoundBody')}</p>
        <Link href="/">{t('goHome')}</Link>
      </div>
    </main>
  );
}
