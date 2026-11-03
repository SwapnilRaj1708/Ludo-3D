'use client';

import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import styles from './ui.module.css';

function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'normal' | 'small';
  block?: boolean;
  icon?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'normal',
  block,
  icon,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        styles.button,
        variant === 'primary' && styles.primary,
        variant === 'ghost' && styles.ghost,
        variant === 'danger' && styles.danger,
        size === 'small' && styles.small,
        block && styles.block,
        icon && styles.iconButton,
        className,
      )}
      {...rest}
    />
  );
}

export function Card({
  title,
  children,
  className,
  as: Tag = 'section',
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div';
}) {
  const titleId = useId();
  return (
    <Tag className={cx(styles.card, className)} aria-labelledby={title ? titleId : undefined}>
      {title ? (
        <h2 id={titleId} className={styles.cardTitle}>
          {title}
        </h2>
      ) : null}
      {children}
    </Tag>
  );
}

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: ReactNode;
  testId?: string;
}

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={styles.segmented}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={styles.segment}
          data-testid={option.testId}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <span className={styles.hint}>{hint}</span> : null}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(styles.input, props.className)} />;
}

export function Toggle({
  label,
  checked,
  onChange,
  testId,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  testId?: string;
}) {
  const id = useId();
  return (
    <div className={styles.toggleRow}>
      <span id={id}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        className={styles.toggle}
        data-testid={testId}
        onClick={() => onChange(!checked)}
      />
    </div>
  );
}

export function Slider({
  label,
  value,
  onChange,
  disabled,
  testId,
}: {
  label: ReactNode;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  testId?: string;
}) {
  const id = useId();
  return (
    <div className={styles.sliderRow}>
      <label htmlFor={id}>{label}</label>
      <span className={styles.sliderValue}>{Math.round(value * 100)}%</span>
      <input
        id={id}
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        disabled={disabled}
        data-testid={testId}
        className={styles.slider}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
      />
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className={styles.loadingBlock} role="status" aria-live="polite">
      <div className={styles.spinner} aria-hidden />
      {label ? <span>{label}</span> : null}
    </div>
  );
}

export function Badge({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span className={styles.badge} title={title}>
      {children}
    </span>
  );
}

export function Alert({
  children,
  tone = 'danger',
}: {
  children: ReactNode;
  tone?: 'danger' | 'info';
}) {
  return (
    <div className={styles.alert} data-tone={tone} role={tone === 'danger' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

/**
 * Accessible modal dialog: traps initial focus, closes on Escape and
 * restores focus to the previously focused element when it unmounts.
 */
export function Modal({
  title,
  children,
  actions,
  onClose,
  testId,
}: {
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  onClose?: () => void;
  testId?: string;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelector<HTMLElement>(
      'button, [href], input, select, [tabindex]:not([tabindex="-1"])',
    );
    (focusable ?? dialog)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onClose) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div className={styles.backdrop} onClick={onClose ? () => onClose() : undefined}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={styles.modal}
        data-testid={testId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className={styles.modalTitle}>
          {title}
        </h2>
        {children}
        {actions ? <div className={styles.modalActions}>{actions}</div> : null}
      </div>
    </div>
  );
}

export { styles as uiStyles };
