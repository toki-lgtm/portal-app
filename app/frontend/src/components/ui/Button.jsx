// 共通ボタン。variant でトークン色を出し分ける（色は直書きしない）
const VARIANTS = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
  accent: 'bg-accent-500 text-white hover:bg-accent-600 shadow-sm',
  secondary:
    'bg-white dark:bg-ink-700 border border-slate-300 dark:border-ink-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-ink-600',
  danger:
    'bg-danger-50 dark:bg-danger-500/15 text-danger-600 dark:text-danger-400 hover:bg-danger-100',
  ghost:
    'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-ink-800',
}

const SIZES = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-6 py-3 text-base',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
