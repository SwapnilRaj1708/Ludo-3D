import '@fontsource-variable/inter';
import '@fontsource-variable/cinzel';
import '@fontsource-variable/noto-sans-devanagari';
import '@fontsource-variable/noto-sans-sc';
import '@/styles/globals.css';

import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AppProviders } from '@/components/providers/AppProviders';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('menu');
  return {
    title: { default: 'Ludo 3D', template: '%s · Ludo 3D' },
    description: t('tagline'),
    applicationName: 'Ludo 3D',
    icons: { icon: '/icon.svg' },
  };
}

export const viewport: Viewport = {
  themeColor: '#12100e',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  const t = await getTranslations('common');
  return (
    <html lang={locale}>
      <body>
        <a className="skip-link" href="#main">
          {t('skipToContent')}
        </a>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AppProviders>{children}</AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
