import { X } from 'lucide-react'

export default function ModalShell({ title, onClose, children, wide, extraWide, maxWidthOverride }) {
  const maxW = maxWidthOverride || (extraWide ? 'max-w-4xl' : wide ? 'max-w-3xl' : 'max-w-lg')
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div
        className={`bg-white dark:bg-ink-800 rounded-2xl shadow-xl border border-slate-200 dark:border-ink-700 w-full ${maxW} my-8`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-ink-700 sticky top-0 bg-white dark:bg-ink-800 rounded-t-2xl z-10">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-ink-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}
