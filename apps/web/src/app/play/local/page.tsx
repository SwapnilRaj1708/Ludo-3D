import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { LocalPlay } from '@/components/local/LocalPlay';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('menu');
  return { title: t('playWithBots') };
}

export default function LocalPlayPage() {
  return (
    <Suspense fallback={null}>
      <LocalPlay />
    </Suspense>
  );
}
