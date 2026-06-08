import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  ArrowLeft,
  Star,
  Pin,
  ChevronUp,
  ChevronDown,
  Bell,
  Monitor,
  Sun,
  Moon,
  Save,
} from 'lucide-react'
import Button from './ui/Button'
import Card from './ui/Card'
import { saveTheme, loadTheme } from '../lib/theme'

// 曜日ラベル（0=日〜6=土、JS の getDay() と同じ）
const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

// 送信時刻の選択肢 6〜20 時
const HOUR_OPTIONS = Array.from({ length: 15 }, (_, i) => i + 6)

/**
 * 設定画面。3セクション（表示・アプリ・通知）を Card で区切り縦並び表示。
 * ブラウザ設定（テーマ/文字サイズ/起動時画面）は即時反映＋localStorage。
 * サーバー設定（アプリカスタム/通知）はまとめて PUT で保存。
 */
export default function SettingsPage({ onBack, apps: rawApps, onSettingsChange }) {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000'

  // --- ブラウザ設定 ---
  const [theme, setTheme] = useState(() => loadTheme())
  const [fontSize, setFontSize] = useState(
    () => localStorage.getItem('fontSize') || 'normal'
  )
  const [startScreen, setStartScreen] = useState(
    () => localStorage.getItem('startScreen') || 'dashboard'
  )

  // --- サーバー設定（ローカル編集用） ---
  const [appOrder, setAppOrder] = useState([]) // [{...app, pinned, favorite}]
  const [showKpi, setShowKpi] = useState(true)
  const [inAppEnabled, setInAppEnabled] = useState(true)
  const [emailEnabled, setEmailEnabled] = useState(false)
  const [emailWeekdays, setEmailWeekdays] = useState([1, 2, 3, 4, 5])
  const [emailHour, setEmailHour] = useState(8)

  // --- UI 状態 ---
  const [serverLoading, setServerLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null) // { type: 'success'|'error', msg: string }

  // トーストを数秒で自動消去
  const showToast = useCallback((type, msg) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3000)
  }, [])

  // --- サーバー設定の取得 ---
  useEffect(() => {
    const token = localStorage.getItem('authToken')
    if (!token) {
      setServerLoading(false)
      // サーバー設定が取れなくてもアプリ一覧はrawAppsで初期化
      initAppOrder(rawApps, { apps: { pinned: [], favorites: [], order: [], show_kpi: true } })
      return
    }

    axios
      .get(`${apiUrl}/api/user/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        const s = res.data
        initAppOrder(rawApps, s)
        setShowKpi(s.apps?.show_kpi !== false)
        setInAppEnabled(s.notifications?.in_app_enabled !== false)
        setEmailEnabled(s.notifications?.email_enabled === true)
        if (s.notifications?.email_weekdays) setEmailWeekdays(s.notifications.email_weekdays)
        if (s.notifications?.email_hour != null) setEmailHour(s.notifications.email_hour)
      })
      .catch((err) => {
        console.error('設定の取得に失敗:', err)
        // 失敗時はデフォルト値でフォールバック
        initAppOrder(rawApps, { apps: { pinned: [], favorites: [], order: [], show_kpi: true } })
      })
      .finally(() => setServerLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * rawApps をサーバー設定（pinned/favorites/order）に基づいて初期化する。
   * ピン留め優先 → 保存 order 順 → 残りは元順。
   */
  function initAppOrder(rawList, serverSettings) {
    const { pinned = [], favorites = [], order = [] } = serverSettings?.apps || {}
    const pinnedSet = new Set(pinned)
    const favSet = new Set(favorites)

    // サーバーの order 配列で並べ替え、order にないものは末尾へ
    const ordered = [...rawList].sort((a, b) => {
      const ia = order.indexOf(String(a.id))
      const ib = order.indexOf(String(b.id))
      if (ia === -1 && ib === -1) return 0
      if (ia === -1) return 1
      if (ib === -1) return -1
      return ia - ib
    })

    // ピン留め優先で再ソート
    ordered.sort((a, b) => {
      const pa = pinnedSet.has(String(a.id)) ? 0 : 1
      const pb = pinnedSet.has(String(b.id)) ? 0 : 1
      return pa - pb
    })

    setAppOrder(
      ordered.map((app) => ({
        ...app,
        pinned: pinnedSet.has(String(app.id)),
        favorite: favSet.has(String(app.id)),
      }))
    )
  }

  // --- ブラウザ設定の即時反映 ---
  const handleThemeChange = (val) => {
    setTheme(val)
    saveTheme(val)
  }

  const handleFontSizeChange = (val) => {
    setFontSize(val)
    localStorage.setItem('fontSize', val)
    if (val === 'large') {
      document.documentElement.classList.add('text-lg-base')
    } else {
      document.documentElement.classList.remove('text-lg-base')
    }
  }

  const handleStartScreenChange = (val) => {
    setStartScreen(val)
    localStorage.setItem('startScreen', val)
  }

  // --- アプリ並び替え ---
  const moveApp = (idx, dir) => {
    setAppOrder((prev) => {
      const arr = [...prev]
      const target = idx + dir
      if (target < 0 || target >= arr.length) return arr
      ;[arr[idx], arr[target]] = [arr[target], arr[idx]]
      return arr
    })
  }

  const togglePinned = (idx) => {
    setAppOrder((prev) =>
      prev.map((a, i) => (i === idx ? { ...a, pinned: !a.pinned } : a))
    )
  }

  const toggleFavorite = (idx) => {
    setAppOrder((prev) =>
      prev.map((a, i) => (i === idx ? { ...a, favorite: !a.favorite } : a))
    )
  }

  // --- 曜日トグル ---
  const toggleWeekday = (day) => {
    setEmailWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
    )
  }

  // --- サーバー設定の保存 ---
  const handleSave = async () => {
    setSaving(true)
    const token = localStorage.getItem('authToken')
    const body = {
      apps: {
        pinned: appOrder.filter((a) => a.pinned).map((a) => String(a.id)),
        favorites: appOrder.filter((a) => a.favorite).map((a) => String(a.id)),
        order: appOrder.map((a) => String(a.id)),
        show_kpi: showKpi,
      },
      notifications: {
        in_app_enabled: inAppEnabled,
        email_enabled: emailEnabled,
        email_weekdays: emailWeekdays,
        email_hour: emailHour,
      },
    }

    try {
      const res = await axios.put(`${apiUrl}/api/user/settings`, body, {
        headers: { Authorization: `Bearer ${token}` },
      })
      showToast('success', '設定を保存しました')
      // 親（AppContent）に最新設定を通知してダッシュボードを更新
      if (onSettingsChange) onSettingsChange(res.data, appOrder)
    } catch (err) {
      console.error('設定の保存に失敗:', err)
      showToast('error', '保存に失敗しました。もう一度お試しください。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-ink-950 transition-colors">
      {/* ヘッダー */}
      <header className="bg-white/80 dark:bg-ink-900/80 backdrop-blur border-b border-slate-200 dark:border-ink-800 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />
            戻る
          </Button>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">個人設定</h1>
        </div>
      </header>

      {/* トースト */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-semibold transition-all
            ${toast.type === 'success'
              ? 'bg-success-100 dark:bg-success-500/20 text-success-700 dark:text-success-300 border border-success-200 dark:border-success-500/30'
              : 'bg-danger-100 dark:bg-danger-500/20 text-danger-700 dark:text-danger-300 border border-danger-200 dark:border-danger-500/30'
            }`}
        >
          {toast.msg}
        </div>
      )}

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">

        {/* ─── セクション1: 表示・テーマ ─── */}
        <Card className="p-6">
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-5 flex items-center gap-2">
            <Monitor className="w-5 h-5 text-brand-500" />
            表示・テーマ
          </h2>

          {/* テーマ選択 */}
          <div className="mb-5">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">テーマ</p>
            <div className="flex flex-wrap gap-3">
              {[
                { value: 'system', label: 'システム連動', icon: Monitor },
                { value: 'light', label: 'ライト', icon: Sun },
                { value: 'dark', label: 'ダーク', icon: Moon },
              ].map(({ value, label, icon: Icon }) => (
                <label
                  key={value}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-pointer transition-colors
                    ${theme === value
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300'
                      : 'border-slate-200 dark:border-ink-600 hover:border-brand-300 dark:hover:border-brand-500/50 text-slate-600 dark:text-slate-300'
                    }`}
                >
                  <input
                    type="radio"
                    name="theme"
                    value={value}
                    checked={theme === value}
                    onChange={() => handleThemeChange(value)}
                    className="sr-only"
                  />
                  <Icon className="w-4 h-4" />
                  <span className="text-sm font-medium">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 文字サイズ */}
          <div className="mb-5">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">文字サイズ</p>
            <div className="flex gap-3">
              {[
                { value: 'normal', label: '標準' },
                { value: 'large', label: '大きめ' },
              ].map(({ value, label }) => (
                <label
                  key={value}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-pointer transition-colors
                    ${fontSize === value
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300'
                      : 'border-slate-200 dark:border-ink-600 hover:border-brand-300 dark:hover:border-brand-500/50 text-slate-600 dark:text-slate-300'
                    }`}
                >
                  <input
                    type="radio"
                    name="fontSize"
                    value={value}
                    checked={fontSize === value}
                    onChange={() => handleFontSizeChange(value)}
                    className="sr-only"
                  />
                  <span className="text-sm font-medium">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 起動時画面 */}
          <div>
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 block mb-2">
              起動時に開く画面
            </label>
            <select
              value={startScreen}
              onChange={(e) => handleStartScreenChange(e.target.value)}
              className="w-full sm:w-60 px-3 py-2 rounded-xl border border-slate-200 dark:border-ink-600 bg-white dark:bg-ink-700 text-slate-800 dark:text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <option value="dashboard">ダッシュボード</option>
              <option value="apps">アプリ選択</option>
            </select>
          </div>
        </Card>

        {/* ─── セクション2: アプリのカスタマイズ ─── */}
        <Card className="p-6">
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
            <Pin className="w-5 h-5 text-accent-500" />
            アプリのカスタマイズ
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
            ピン留め・お気に入り・並び順はダッシュボードに反映されます
          </p>

          {/* KPI 表示スイッチ */}
          <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-ink-700 mb-3">
            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                安全パトロール状況を表示する
              </p>
              <p className="text-xs text-slate-400 mt-0.5">ダッシュボードの KPI カードと最近の点検</p>
            </div>
            <ToggleSwitch checked={showKpi} onChange={setShowKpi} />
          </div>

          {/* アプリ一覧 */}
          {serverLoading ? (
            <p className="text-sm text-slate-400 py-4 text-center">読み込み中...</p>
          ) : appOrder.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">アプリがありません</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-ink-700">
              {appOrder.map((app, idx) => (
                <li key={app.id} className="flex items-center gap-3 py-3">
                  {/* アプリ名 */}
                  <span className="text-xl w-8 text-center shrink-0">{app.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                      {app.name}
                    </p>
                    {(app.pinned || app.favorite) && (
                      <div className="flex gap-1 mt-0.5">
                        {app.pinned && (
                          <span className="text-xs text-accent-600 dark:text-accent-400">ピン留め</span>
                        )}
                        {app.favorite && (
                          <span className="text-xs text-warning-600 dark:text-warning-400">★お気に入り</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 操作ボタン群 */}
                  <div className="flex items-center gap-1 shrink-0">
                    {/* お気に入り */}
                    <button
                      onClick={() => toggleFavorite(idx)}
                      aria-label={app.favorite ? 'お気に入り解除' : 'お気に入り登録'}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition
                        ${app.favorite
                          ? 'text-warning-500 hover:bg-warning-50 dark:hover:bg-warning-500/10'
                          : 'text-slate-300 dark:text-ink-600 hover:text-warning-400 hover:bg-slate-50 dark:hover:bg-ink-700'
                        }`}
                    >
                      <Star className="w-4 h-4" fill={app.favorite ? 'currentColor' : 'none'} />
                    </button>

                    {/* ピン留め */}
                    <button
                      onClick={() => togglePinned(idx)}
                      aria-label={app.pinned ? 'ピン解除' : 'ピン留め'}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition
                        ${app.pinned
                          ? 'text-accent-500 hover:bg-accent-50 dark:hover:bg-accent-500/10'
                          : 'text-slate-300 dark:text-ink-600 hover:text-accent-400 hover:bg-slate-50 dark:hover:bg-ink-700'
                        }`}
                    >
                      <Pin className="w-4 h-4" />
                    </button>

                    {/* 上へ */}
                    <button
                      onClick={() => moveApp(idx, -1)}
                      disabled={idx === 0}
                      aria-label="上へ移動"
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-ink-700 disabled:opacity-30 transition"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>

                    {/* 下へ */}
                    <button
                      onClick={() => moveApp(idx, 1)}
                      disabled={idx === appOrder.length - 1}
                      aria-label="下へ移動"
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-ink-700 disabled:opacity-30 transition"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ─── セクション3: 通知 ─── */}
        <Card className="p-6">
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-5 flex items-center gap-2">
            <Bell className="w-5 h-5 text-brand-500" />
            通知
          </h2>

          {/* アプリ内通知 */}
          <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-ink-700">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              アプリ内通知を受け取る
            </p>
            <ToggleSwitch checked={inAppEnabled} onChange={setInAppEnabled} />
          </div>

          {/* メール通知 */}
          <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-ink-700">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              メール通知を受け取る
            </p>
            <ToggleSwitch checked={emailEnabled} onChange={setEmailEnabled} />
          </div>

          {/* 曜日選択・送信時刻（メール通知OFFで淡色無効） */}
          <div className={`mt-4 space-y-4 transition-opacity ${emailEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">受け取る曜日</p>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_LABELS.map((label, day) => (
                  <button
                    key={day}
                    onClick={() => toggleWeekday(day)}
                    disabled={!emailEnabled}
                    className={`w-10 h-10 rounded-xl text-sm font-semibold transition
                      ${emailWeekdays.includes(day)
                        ? 'bg-brand-600 text-white hover:bg-brand-700'
                        : 'bg-slate-100 dark:bg-ink-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-ink-600'
                      }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 block mb-2">
                送信時刻
              </label>
              <select
                value={emailHour}
                onChange={(e) => setEmailHour(Number(e.target.value))}
                disabled={!emailEnabled}
                className="w-36 px-3 py-2 rounded-xl border border-slate-200 dark:border-ink-600 bg-white dark:bg-ink-700 text-slate-800 dark:text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                {HOUR_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {h}:00
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        {/* 保存ボタン */}
        <div className="flex justify-end pb-10">
          <Button variant="primary" size="lg" onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4" />
            {saving ? '保存中...' : '設定を保存'}
          </Button>
        </div>
      </main>
    </div>
  )
}

/**
 * 汎用トグルスイッチ（チェックボックスベース）
 * 既存 Button/Card に揃えたデザインシステムで実装
 */
function ToggleSwitch({ checked, onChange }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-12 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 dark:focus:ring-offset-ink-800
        ${checked ? 'bg-brand-600' : 'bg-slate-200 dark:bg-ink-600'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform
          ${checked ? 'translate-x-6' : 'translate-x-0'}`}
      />
    </button>
  )
}
