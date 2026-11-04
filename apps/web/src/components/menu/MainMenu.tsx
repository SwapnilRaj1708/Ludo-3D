'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { analytics } from '@/services/analytics';
import type { GameModeName } from '@/services/analytics/events';
import { isOnlineConfigured } from '@/services/config';
import { LanguageSelector } from './LanguageSelector';
import { Logo } from './Logo';
import styles from './menu.module.css';

interface MenuEntry {
  mode: GameModeName;
  href: string;
  label: string;
  hint: string;
  testId: string;
  primary?: boolean;
  requiresServer?: boolean;
}

export function MainMenu() {
  const t = useTranslations('menu');
  const tOnline = useTranslations('online');
  const online = isOnlineConfigured();

  const entries: MenuEntry[] = [
    {
      mode: 'online',
      href: '/play/online',
      label: t('playOnline'),
      hint: t('playOnlineHint'),
      testId: 'menu-online',
      primary: true,
      requiresServer: true,
    },
    {
      mode: 'friends',
      href: '/play/friends',
      label: t('playWithFriends'),
      hint: t('playWithFriendsHint'),
      testId: 'menu-friends',
      requiresServer: true,
    },
    {
      mode: 'join',
      href: '/join',
      label: t('joinRoom'),
      hint: t('joinRoomHint'),
      testId: 'menu-join',
      requiresServer: true,
    },
    {
      mode: 'bots',
      href: '/play/local?mode=bots',
      label: t('playWithBots'),
      hint: t('playWithBotsHint'),
      testId: 'menu-bots',
      primary: !online,
    },
    {
      mode: 'local',
      href: '/play/local?mode=local',
      label: t('passAndPlay'),
      hint: t('passAndPlayHint'),
      testId: 'menu-local',
    },
  ];

  return (
    <div className={styles.menuPage}>
      <div className={styles.backdropArt} aria-hidden />
      <header className={styles.topBar}>
        <LanguageSelector />
      </header>
      <main id="main" className={styles.menuMain}>
        <div className={styles.hero}>
          <Logo />
          <p className={styles.tagline}>{t('tagline')}</p>
        </div>
        <nav className={styles.menuList} aria-label={t('playOnline')}>
          {entries.map((entry) => {
            const disabled = entry.requiresServer && !online;
            const className = `${styles.menuItem} ${entry.primary ? styles.menuItemPrimary : ''}`;
            const body = (
              <>
                <span className={styles.menuItemLabel}>{entry.label}</span>
                <span className={styles.menuItemHint}>
                  {disabled ? tOnline('serverNotConfigured') : entry.hint}
                </span>
              </>
            );
            return disabled ? (
              <span
                key={entry.href}
                className={className}
                aria-disabled="true"
                data-testid={entry.testId}
              >
                {body}
              </span>
            ) : (
              <Link
                key={entry.href}
                href={entry.href}
                className={className}
                data-testid={entry.testId}
              >
                {body}
              </Link>
            );
          })}
        </nav>
        <nav className={styles.secondaryNav} aria-label={t('settings')}>
          <Link href="/how-to-play" data-testid="menu-how-to-play">
            {t('howToPlay')}
          </Link>
          <Link href="/settings" data-testid="menu-settings">
            {t('settings')}
          </Link>
          <Link href="/profile" data-testid="menu-profile">
            {t('profile')}
          </Link>
        </nav>
        <p className={styles.devNotice}>{t('devProxyNotice')}</p>
      </main>
    </div>
  );
}
