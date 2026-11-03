import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageShell } from '@/components/PageShell';
import { Card } from '@/components/ui';

const SECTIONS = ['goal', 'turns', 'enter', 'bonus', 'capture', 'blockade', 'home', 'win'] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('howToPlay');
  return { title: t('title') };
}

export default async function HowToPlayPage() {
  const t = await getTranslations('howToPlay');
  return (
    <PageShell title={t('title')}>
      <Card as="div">
        {SECTIONS.map((key) => (
          <section key={key} className="prose-section">
            <h2>{t(`${key}Title`)}</h2>
            <p>{t(key)}</p>
          </section>
        ))}
      </Card>
    </PageShell>
  );
}
