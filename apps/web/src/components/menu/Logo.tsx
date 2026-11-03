import styles from './menu.module.css';

export function Logo({ size = 'large' }: { size?: 'large' | 'small' }) {
  return (
    <div
      className={size === 'large' ? styles.logo : styles.logoSmall}
      aria-label="Ludo 3D"
      role="img"
    >
      <svg className={styles.emblem} viewBox="0 0 48 48" aria-hidden>
        <defs>
          <linearGradient id="emblemGold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f7dc9f" />
            <stop offset="1" stopColor="#a87a2c" />
          </linearGradient>
        </defs>
        <rect
          x="3"
          y="3"
          width="42"
          height="42"
          rx="9"
          fill="none"
          stroke="url(#emblemGold)"
          strokeWidth="2.5"
        />
        <rect x="8" y="8" width="13" height="13" rx="3" fill="#e7b93e" />
        <rect x="27" y="8" width="13" height="13" rx="3" fill="#35a874" />
        <rect x="27" y="27" width="13" height="13" rx="3" fill="#d4493f" />
        <rect x="8" y="27" width="13" height="13" rx="3" fill="#4479d6" />
        <path d="M24 17 L31 24 L24 31 L17 24 Z" fill="url(#emblemGold)" />
      </svg>
      <span className={styles.wordmark}>
        Ludo <span className={styles.wordmark3d}>3D</span>
      </span>
    </div>
  );
}
