import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageShell } from '@/components/PageShell';
import { SettingsPanel } from '@/components/settings/SettingsPanel';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings');
  return { title: t('title') };
}

export default async function SettingsPage() {
  const t = await getTranslations('settings');
  return (
    <PageShell title={t('title')}>
      <SettingsPanel />
    </PageShell>
  );
}
