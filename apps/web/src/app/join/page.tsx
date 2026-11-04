import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageShell } from '@/components/PageShell';
import { JoinForm } from '@/components/online/JoinForm';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('online');
  return { title: t('joinTitle') };
}

export default async function JoinPage() {
  const t = await getTranslations('online');
  return (
    <PageShell title={t('joinTitle')}>
      <JoinForm />
    </PageShell>
  );
}
