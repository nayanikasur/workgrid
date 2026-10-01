import { Loader2, X } from 'lucide-react';
import {
  useEffect,
  useId,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn, initials } from '@/lib/utils';

/* --------------------------------- Button --------------------------------- */

const BUTTON_VARIANTS = {
  primary: 'bg-brand text-white hover:bg-brand-hover shadow-sm',
  secondary: 'bg-surface text-fg border border-line-strong hover:bg-hover',
  ghost: 'text-muted hover:bg-hover hover:text-fg',
  danger: 'bg-danger text-white hover:opacity-90',
} as const;

const BUTTON_SIZES = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  icon: 'h-8 w-8',
} as const;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
  loading?: boolean;
}

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

/* ---------------------------------- Fields --------------------------------- */

const CONTROL =
  'w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-subtle transition-colors ' +
  'focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:cursor-not-allowed disabled:opacity-60';

interface FieldProps {
  label?: string;
  error?: string;
  hint?: string;
}

function FieldShell({ id, label, error, hint, children }: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-xs font-medium text-muted">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-subtle">{hint}</p>
      )}
    </div>
  );
}

export function Input({ label, error, hint, className, id, ...props }: ComponentProps<'input'> & FieldProps) {
  const autoId = useId();
  return (
    <FieldShell id={id ?? autoId} label={label} error={error} hint={hint}>
      <input id={id ?? autoId} aria-invalid={Boolean(error)} className={cn(CONTROL, 'h-9', error && 'border-danger', className)} {...props} />
    </FieldShell>
  );
}

export function Textarea({ label, error, hint, className, id, ...props }: ComponentProps<'textarea'> & FieldProps) {
  const autoId = useId();
  return (
    <FieldShell id={id ?? autoId} label={label} error={error} hint={hint}>
      <textarea id={id ?? autoId} className={cn(CONTROL, 'resize-y py-2 leading-relaxed', error && 'border-danger', className)} {...props} />
    </FieldShell>
  );
}

export function Select({ label, error, hint, className, id, children, ...props }: ComponentProps<'select'> & FieldProps) {
  const autoId = useId();
  return (
    <FieldShell id={id ?? autoId} label={label} error={error} hint={hint}>
      <select id={id ?? autoId} className={cn(CONTROL, 'h-9 pr-8', className)} {...props}>
        {children}
      </select>
    </FieldShell>
  );
}

/* ---------------------------------- Modal ---------------------------------- */

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}

export function Modal({ open, onClose, title, description, children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[12vh]">
      <div className="animate-fade fixed inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label={title} className="animate-pop relative w-full max-w-md rounded-xl border border-line bg-raised p-6 shadow-pop">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close" className="-mt-1 -mr-2">
            <X className="size-4" />
          </Button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/* ----------------------------------- Bits ---------------------------------- */

interface AvatarProps {
  name: string;
  color: string;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

const AVATAR_SIZES = { xs: 'size-5 text-[9px]', sm: 'size-6 text-[10px]', md: 'size-8 text-xs' };

export function Avatar({ name, color, size = 'sm', className }: AvatarProps) {
  return (
    <span
      title={name}
      style={{ backgroundColor: color }}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none', AVATAR_SIZES[size], className)}
    >
      {initials(name)}
    </span>
  );
}

const BADGE_TONES = {
  neutral: 'bg-hover text-muted',
  brand: 'bg-brand-soft text-brand-fg',
  danger: 'bg-danger-soft text-danger',
} as const;

export function Badge({ tone = 'neutral', className, children }: { tone?: keyof typeof BADGE_TONES; className?: string; children: ReactNode }) {
  return <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium', BADGE_TONES[tone], className)}>{children}</span>;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-xl border border-line bg-surface', className)}>{children}</div>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-subtle', className)} aria-label="Loading" />;
}

export function PageLoader() {
  return (
    <div className="flex h-full min-h-40 items-center justify-center">
      <Spinner />
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong px-6 py-14 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-brand-soft text-brand-fg">{icon}</div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', className)}>
      <svg viewBox="0 0 32 32" className="size-6" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-brand" />
        <g fill="#fff">
          <rect x="7" y="7" width="8" height="8" rx="2" />
          <rect x="17" y="7" width="8" height="8" rx="2" opacity=".55" />
          <rect x="7" y="17" width="8" height="8" rx="2" opacity=".55" />
          <rect x="17" y="17" width="8" height="8" rx="2" />
        </g>
      </svg>
      WorkGrid
    </span>
  );
}
