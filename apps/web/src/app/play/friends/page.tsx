import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageShell } from '@/components/PageShell';
import { OnlineEntry } from '@/components/online/OnlineEntry';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('online');
  return { title: t('friendsTitle') };
}

export default async function FriendsPage() {
  const t = await getTranslations('online');
  return (
    <PageShell title={t('friendsTitle')}>
      <OnlineEntry kind="friends" />
    </PageShell>
  );
}
