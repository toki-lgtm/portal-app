import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'
import { saveTheme } from '../../lib/theme'

/**
 * ヘッダー用テーマ切替ボタン。
 * dark ⇄ light を明示的に切り替える。3値のラジオ選択は設定画面で提供。
 */
export default function ThemeToggle({ className = '' }) {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains('dark')
  )

  useEffect(() => {
    // dark/light を明示保存。system モードから脱して固定する
    saveTheme(isDark ? 'dark' : 'light')
  }, [isDark])

  return (
    <button
      onClick={() => setIsDark((v) => !v)}
      aria-label="テーマ切替"
      className={`w-10 h-10 rounded-xl flex items-center justify-center text-slate-600 dark:text-amber-300 hover:bg-slate-100 dark:hover:bg-ink-800 transition ${className}`}
    >
      {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  )
}
