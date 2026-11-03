import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageShell } from '@/components/PageShell';
import { ProfilePanel } from '@/components/profile/ProfilePanel';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('profile');
  return { title: t('title') };
}

export default async function ProfilePage() {
  const t = await getTranslations('profile');
  return (
    <PageShell title={t('title')}>
      <ProfilePanel />
    </PageShell>
  );
}
