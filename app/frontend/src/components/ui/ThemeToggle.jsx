import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'

// ライト/ダーク切替。選択は localStorage に保存（既定はダーク）
export default function ThemeToggle({ className = '' }) {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains('dark')
  )

  useEffect(() => {
    const root = document.documentElement
    if (isDark) {
      root.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      root.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
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
