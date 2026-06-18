export default function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</span>
      {hint && <span className="text-xs text-slate-400 ml-2">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  )
}
