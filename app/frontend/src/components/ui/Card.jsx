// 共通カード。サーフェス色・境界・角丸をトークンで統一
export default function Card({ className = '', children, ...props }) {
  return (
    <div
      className={`bg-white dark:bg-ink-800 rounded-2xl border border-slate-200 dark:border-ink-700 ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
