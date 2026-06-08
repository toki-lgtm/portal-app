// 状態バッジ。色だけでなくテキストラベル併用が前提（アクセシビリティ）
const TONES = {
  success: 'bg-success-100 dark:bg-success-500/15 text-success-700 dark:text-success-400',
  warning: 'bg-warning-100 dark:bg-warning-500/15 text-warning-700 dark:text-warning-400',
  danger: 'bg-danger-100 dark:bg-danger-500/15 text-danger-700 dark:text-danger-400',
  info: 'bg-brand-100 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300',
  neutral: 'bg-slate-200 dark:bg-ink-700 text-slate-600 dark:text-slate-300',
}

export default function Badge({ tone = 'neutral', className = '', children }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}
