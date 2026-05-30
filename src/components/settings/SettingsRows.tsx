import type { ComponentType, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SettingsSectionHeader({
  icon: Icon,
  label,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 px-0.5">
      <Icon className="h-4 w-4 text-neon-lime" aria-hidden />
      <h2 className="type-section-label">{label}</h2>
    </div>
  );
}

export function SettingsGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <article className={cn('overflow-hidden rounded-xl border border-border bg-card shadow-sm', className)}>
      {children}
    </article>
  );
}

export function SettingsRowDivider() {
  return <div className="mx-4 border-t border-border/60" />;
}

export function ConnectBadge({ connected }: { connected: boolean }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
        connected
          ? 'border border-emerald-500/50 bg-emerald-500/15 text-emerald-400'
          : 'border border-border bg-muted/60 text-muted-foreground',
      )}
    >
      {connected ? 'Connected' : 'Connect'}
    </span>
  );
}

type SettingsRowProps = {
  icon?: ComponentType<{ className?: string }>;
  iconNode?: ReactNode;
  title: string;
  subtitle?: string;
  onClick?: () => void;
  trailing?: ReactNode;
  chevron?: boolean;
  disabled?: boolean;
  titleClassName?: string;
  className?: string;
};

export function SettingsRow({
  icon: Icon,
  iconNode,
  title,
  subtitle,
  onClick,
  trailing,
  chevron,
  disabled,
  titleClassName,
  className,
}: SettingsRowProps) {
  const interactive = Boolean(onClick) && !disabled;
  const showChevron = chevron ?? interactive;

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-muted/30 active:bg-muted/40 disabled:opacity-50',
          className,
        )}
      >
        <SettingsRowContent
          Icon={Icon}
          iconNode={iconNode}
          title={title}
          subtitle={subtitle}
          trailing={trailing}
          showChevron={showChevron}
          titleClassName={titleClassName}
        />
      </button>
    );
  }

  return (
    <div className={cn('flex w-full items-center gap-3 px-4 py-3.5 text-left', className)}>
      <SettingsRowContent
        Icon={Icon}
        iconNode={iconNode}
        title={title}
        subtitle={subtitle}
        trailing={trailing}
        showChevron={showChevron}
        titleClassName={titleClassName}
      />
    </div>
  );
}

function SettingsRowContent({
  Icon,
  iconNode,
  title,
  subtitle,
  trailing,
  showChevron,
  titleClassName,
}: {
  Icon?: ComponentType<{ className?: string }>;
  iconNode?: ReactNode;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  showChevron: boolean;
  titleClassName?: string;
}) {
  return (
    <>
      {Icon || iconNode ? (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/40 text-muted-foreground">
          {iconNode ?? (Icon ? <Icon className="h-4 w-4" aria-hidden /> : null)}
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-medium text-foreground', titleClassName)}>{title}</p>
        {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {trailing}
        {showChevron ? <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden /> : null}
      </div>
    </>
  );
}
