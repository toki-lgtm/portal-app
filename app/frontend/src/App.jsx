import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google'
import {
  LogOut,
  ArrowRight,
  Clock,
  ShieldCheck,
  ClipboardCheck,
  CheckCircle2,
  Wrench,
  Hourglass,
  Activity,
  Settings,
  Bell,
  Star,
  Pin,
  Megaphone,
  AlertTriangle,
  Gavel,
  Trophy,
  Bug,
} from 'lucide-react'
import Button from './components/ui/Button'
import Badge from './components/ui/Badge'
import Card from './components/ui/Card'
import ThemeToggle from './components/ui/ThemeToggle'
import SettingsPage from './components/SettingsPage'
import EmployeesPage from './components/EmployeesPage'
import AnnouncementsPage from './components/AnnouncementsPage'
import BidsPage from './components/BidsPage'
import FeedbackPage from './components/FeedbackPage'
import { applyTheme, loadTheme } from './lib/theme'

// アプリカードのアイコン地色（トークンを順番に巡回して彩りを出す）
const ICON_TONES = [
  'bg-brand-50 dark:bg-brand-500/15 text-brand-600 dark:text-brand-400',
  'bg-success-50 dark:bg-success-500/15 text-success-600 dark:text-success-400',
  'bg-accent-50 dark:bg-accent-500/15 text-accent-600 dark:text-accent-400',
  'bg-warning-50 dark:bg-warning-500/15 text-warning-600 dark:text-warning-400',
]

/**
 * デフォルトのサーバー設定値。GET 失敗時のフォールバックとして使用。
 */
const DEFAULT_SERVER_SETTINGS = {
  apps: { pinned: [], favorites: [], order: [], show_kpi: true },
  notifications: { in_app_enabled: true, email_enabled: false, email_weekdays: [1,2,3,4,5], email_hour: 8 },
}

/**
 * rawApps をサーバー設定（pinned/favorites/order）に基づいて並び替える。
 * ピン留め優先 → 保存 order 順 → 残りは元順。
 */
function sortAppsWithSettings(rawList, serverSettings) {
  const { pinned = [], favorites = [], order = [] } = serverSettings?.apps || {}
  const pinnedSet = new Set(pinned.map(String))
  const favSet = new Set(favorites.map(String))

  // サーバーの order 配列で並べ替え（order にないものは末尾）
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

  return ordered.map((app) => ({
    ...app,
    pinned: pinnedSet.has(String(app.id)),
    favorite: favSet.has(String(app.id)),
  }))
}

function LoginPage({ onLoginSuccess }) {
  const [isLoading, setIsLoading] = useState(false)

  const login = useGoogleLogin({
    onSuccess: async (credentialResponse) => {
      setIsLoading(true)
      try {
        const response = await axios.post(
          `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/auth/google`,
          { token: credentialResponse.access_token }
        )
        const { token, ...user } = response.data
        // サーバー発行のJWTを保存（以降のAPIはこれをBearerで送る）
        localStorage.setItem('authToken', token)
        localStorage.setItem('user', JSON.stringify(user))
        onLoginSuccess(user)
      } catch (error) {
        console.error('Login failed:', error)
        const msg = error.response?.data?.error || 'ログインに失敗しました'
        alert(msg)
      } finally {
        setIsLoading(false)
      }
    },
    onError: () => {
      alert('ログインに失敗しました')
    },
  })

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-ink-950 flex items-center justify-center px-4 transition-colors">
      <div className="fixed top-5 right-5">
        <ThemeToggle />
      </div>
      <div className="max-w-md w-full">
        <div className="bg-white dark:bg-ink-800 rounded-2xl shadow-xl border border-slate-200 dark:border-ink-700 p-8 text-center">
          <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-brand-600 flex items-center justify-center">
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
          <div className="mb-6">
            <h1 className="text-3xl font-black text-slate-900 dark:text-white mb-1">社内ポータル</h1>
            <p className="text-slate-500 dark:text-slate-400">中原建設</p>
          </div>

          <p className="text-slate-600 dark:text-slate-300 mb-8">
            Google アカウントでログインしてください
          </p>

          <button
            onClick={() => login()}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-white dark:bg-ink-700 border border-slate-300 dark:border-ink-600 text-slate-700 dark:text-slate-100 rounded-xl hover:bg-slate-50 dark:hover:bg-ink-600 transition disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {isLoading ? 'ログイン中...' : 'Google でログイン'}
          </button>

          <p className="text-xs text-slate-400 dark:text-slate-500 mt-6">
            Google Workspace アカウントでログインしてください
          </p>
        </div>
      </div>
    </div>
  )
}

// KPIカード（数字＋ラベル＋補足）
function StatCard({ icon: Icon, iconClass, label, value, unit, sub }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
        <Icon className={`w-5 h-5 ${iconClass}`} />
      </div>
      <p className="text-3xl font-extrabold text-slate-900 dark:text-white tabular-nums">
        {value}
        {unit && <span className="text-base font-medium text-slate-400 ml-1">{unit}</span>}
      </p>
      {sub && <div className="mt-1 text-xs">{sub}</div>}
    </Card>
  )
}

function StatsSection({ stats }) {
  const rate = stats.completion_rate
  return (
    <section className="mb-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={ClipboardCheck}
          iconClass="text-brand-500"
          label="今月の点検"
          value={stats.inspections_this_month}
          unit="件"
          sub={
            <span className="text-slate-400">累計 {stats.inspections_total} 件</span>
          }
        />
        <StatCard
          icon={CheckCircle2}
          iconClass="text-success-500"
          label="是正完了率"
          value={rate == null ? '—' : rate}
          unit={rate == null ? '' : '%'}
          sub={
            rate == null ? (
              <span className="text-slate-400">指摘なし</span>
            ) : (
              <div className="mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-ink-700 overflow-hidden">
                <div className="h-full bg-success-500 rounded-full" style={{ width: `${rate}%` }} />
              </div>
            )
          }
        />
        <StatCard
          icon={Wrench}
          iconClass="text-warning-500"
          label="是正対応中"
          value={stats.issues_open}
          unit="件"
          sub={<span className="text-slate-400">未承認の指摘</span>}
        />
        <StatCard
          icon={Hourglass}
          iconClass="text-accent-500"
          label="承認待ち"
          value={stats.awaiting_approval}
          unit="件"
          sub={<span className="text-slate-400">是正写真の承認</span>}
        />
      </div>
    </section>
  )
}

function RecentActivity({ recent }) {
  const fmt = (d) => {
    if (!d) return ''
    const dt = new Date(d)
    return `${dt.getMonth() + 1}/${dt.getDate()}`
  }
  return (
    <Card className="p-6 h-full">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-5 h-5 text-brand-500" />
        <h2 className="font-bold text-slate-900 dark:text-white">最近の点検</h2>
      </div>
      {recent.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">まだ点検記録がありません</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-ink-700">
          {recent.map((r) => {
            const tone = r.open_issues > 0 ? 'danger' : r.issues > 0 ? 'success' : 'neutral'
            const label =
              r.open_issues > 0
                ? `是正中 ${r.open_issues}件`
                : r.issues > 0
                ? '是正済'
                : '指摘なし'
            return (
              <li key={r.id} className="flex items-center gap-3 py-3">
                <span className="text-xs text-slate-400 w-10 shrink-0 tabular-nums">{fmt(r.inspection_date)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{r.project_name}</p>
                </div>
                <Badge tone={tone}>{label}</Badge>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

/**
 * 通知ベルドロップダウン。
 * stats の awaiting_approval / issues_open と未読お知らせ数を統合表示。
 */
function NotificationBell({ stats, apps, announcementUnreadCount, onOpenAnnouncements }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // ドロップダウン外クリックで閉じる
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const patrolCount = (stats?.awaiting_approval || 0) + (stats?.issues_open || 0)
  const badgeCount = patrolCount + (announcementUnreadCount || 0)

  // 安全パトロールアプリの URL を apps から探す（名前で判定）
  const patrolApp = apps?.find(
    (a) => a.name && a.name.includes('安全') && a.url
  )

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="通知"
        className="relative w-10 h-10 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-ink-800 transition"
      >
        <Bell className="w-5 h-5" />
        {badgeCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-accent-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-72 bg-white dark:bg-ink-800 border border-slate-200 dark:border-ink-700 rounded-2xl shadow-xl z-20 p-4">
          <p className="text-sm font-bold text-slate-900 dark:text-white mb-3">通知</p>
          {badgeCount === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">新しい通知はありません</p>
          ) : (
            <ul className="space-y-2">
              {(announcementUnreadCount || 0) > 0 && (
                <li className="flex items-center justify-between text-sm">
                  <button
                    className="flex items-center gap-2 flex-1 text-left"
                    onClick={() => { setOpen(false); onOpenAnnouncements?.() }}
                  >
                    <Megaphone className="w-4 h-4 text-brand-500 shrink-0" />
                    <span className="text-slate-700 dark:text-slate-300 hover:underline">未読のお知らせ</span>
                  </button>
                  <span className="font-bold text-brand-600 dark:text-brand-400">
                    {announcementUnreadCount} 件
                  </span>
                </li>
              )}
              {(stats?.awaiting_approval || 0) > 0 && (
                <li className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Hourglass className="w-4 h-4 text-accent-500 shrink-0" />
                    <span className="text-slate-700 dark:text-slate-300">承認待ち</span>
                  </div>
                  <span className="font-bold text-accent-600 dark:text-accent-400">
                    {stats.awaiting_approval} 件
                  </span>
                </li>
              )}
              {(stats?.issues_open || 0) > 0 && (
                <li className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-warning-500 shrink-0" />
                    <span className="text-slate-700 dark:text-slate-300">是正対応中</span>
                  </div>
                  <span className="font-bold text-warning-600 dark:text-warning-400">
                    {stats.issues_open} 件
                  </span>
                </li>
              )}
            </ul>
          )}
          {patrolApp && (
            <a
              href={patrolApp.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline"
            >
              安全パトロールを開く
              <ArrowRight className="w-3 h-3" />
            </a>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * ダッシュボードのお知らせカード（上位3件）。
 * APIが失敗しても表示が崩れないようtry/catchでフォールバック。
 */
function AnnouncementsCard({ onOpenAnnouncements }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000'
    const token = localStorage.getItem('authToken')
    const fetchAnnouncements = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/announcements`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        // ピン優先→新しい順で上位3件
        const sorted = [...data].sort((a, b) => {
          if (a.is_pinned && !b.is_pinned) return -1
          if (!a.is_pinned && b.is_pinned) return 1
          return new Date(b.publish_at || b.created_at) - new Date(a.publish_at || a.created_at)
        })
        setItems(sorted.slice(0, 3))
      } catch {
        // APIが落ちても既存ダッシュボードは壊さない
      } finally {
        setLoading(false)
      }
    }
    fetchAnnouncements()
  }, [])

  const unreadCount = items.filter((a) => !a.is_read).length

  return (
    <Card className="p-6 h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-brand-500" />
          <h2 className="font-bold text-slate-900 dark:text-white">お知らせ</h2>
          {unreadCount > 0 && (
            <span className="w-5 h-5 rounded-full bg-accent-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </div>
        <button
          onClick={onOpenAnnouncements}
          className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
        >
          一覧を見る <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 py-4 text-center">読み込み中...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">お知らせはありません</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-ink-700">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-3 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-ink-700/30 -mx-2 px-2 rounded-lg transition"
              onClick={onOpenAnnouncements}
            >
              <div className="flex-1 min-w-0">
                <div className={`text-sm truncate ${!item.is_read ? 'font-bold text-slate-900 dark:text-white' : 'font-medium text-slate-700 dark:text-slate-300'}`}>
                  {item.is_pinned && <Pin className="w-3 h-3 inline mr-1 text-brand-400" />}
                  {item.priority === 'important' && <AlertTriangle className="w-3 h-3 inline mr-1 text-warning-500" />}
                  {item.title}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {item.author_name && <span className="mr-2">{item.author_name}</span>}
                  {item.publish_at || item.created_at
                    ? new Date(item.publish_at || item.created_at).toLocaleDateString('ja-JP')
                    : ''}
                </div>
              </div>
              {!item.is_read && (
                <span className="w-2 h-2 rounded-full bg-accent-400 mt-1.5 shrink-0" />
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/**
 * 入札案件のKPIセクション（入札担当のみ）。
 * bidStats が取得できた場合だけ表示。クリックで入札案件管理ビューへ。
 */
function BidsKpiSection({ bidStats, onOpen }) {
  const s = bidStats?.summary
  if (!s) return null
  const rate = s.win_rate_count?.rate
  const nextBid = s.next_bid
  const dueCount = s.due_soon?.length || 0

  return (
    <section className="mb-8">
      <button
        type="button"
        onClick={onOpen}
        className="flex items-center gap-2 mb-4 group"
      >
        <Gavel className="w-5 h-5 text-brand-500" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">入札案件の状況</h2>
        <ArrowRight className="w-4 h-4 text-brand-400 group-hover:translate-x-0.5 transition" />
      </button>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Activity}
          iconClass="text-brand-500"
          label="進行中"
          value={s.in_progress}
          unit="件"
          sub={<span className="text-slate-400">うち積算中 {s.estimating} 件</span>}
        />
        <StatCard
          icon={Clock}
          iconClass="text-accent-500"
          label="今月の入札"
          value={s.bids_this_month}
          unit="件"
          sub={
            nextBid ? (
              <span className="text-slate-400 truncate block">次: {new Date(nextBid.bid_date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })} {nextBid.project_name}</span>
            ) : (
              <span className="text-slate-400">予定なし</span>
            )
          }
        />
        <StatCard
          icon={AlertTriangle}
          iconClass={dueCount > 0 ? 'text-warning-500' : 'text-success-500'}
          label="期限間近"
          value={dueCount}
          unit="件"
          sub={<span className="text-slate-400">入札日が7日以内</span>}
        />
        <StatCard
          icon={Trophy}
          iconClass="text-success-500"
          label="落札率（今年度）"
          value={rate == null ? '—' : Math.round(rate * 100)}
          unit={rate == null ? '' : '%'}
          sub={<span className="text-slate-400">{s.win_rate_count.won}勝 / {s.win_rate_count.lost}敗</span>}
        />
      </div>
    </section>
  )
}

/**
 * ダッシュボードページ。
 * サーバー設定（serverSettings）に基づきアプリを並べ、KPIの表示/非表示を制御。
 */
function DashboardPage({ user, onLogout, apps, loading, stats, bidStats, serverSettings, onOpenSettings, onOpenInternal, announcementUnreadCount }) {
  const showKpi = serverSettings?.apps?.show_kpi !== false
  const inAppEnabled = serverSettings?.notifications?.in_app_enabled !== false

  // アプリを設定順で並び替え（バグ報告は右下の常駐ボタンに一本化するためカードからは除外）
  const sortedApps = (loading ? apps : sortAppsWithSettings(apps, serverSettings))
    .filter((a) => a.view !== 'feedback')

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-ink-950 transition-colors">
      {/* ヘッダー */}
      <header className="bg-white/80 dark:bg-ink-900/80 backdrop-blur border-b border-slate-200 dark:border-ink-800 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center font-black text-white shrink-0">
              中
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">社内ポータル</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                中原建設 ・{' '}
                {new Date().toLocaleDateString('ja-JP', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:block text-sm text-slate-600 dark:text-slate-300 max-w-[200px] truncate">
              {user?.email}
            </span>

            {/* 通知ベル（in_app_enabled のときのみ表示） */}
            {inAppEnabled && (
              <NotificationBell
                stats={stats}
                apps={apps}
                announcementUnreadCount={announcementUnreadCount}
                onOpenAnnouncements={() => onOpenInternal?.('announcements')}
              />
            )}

            <ThemeToggle />

            {/* 設定ボタン */}
            <button
              onClick={onOpenSettings}
              aria-label="個人設定"
              className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-ink-800 transition"
            >
              <Settings className="w-5 h-5" />
            </button>

            <Button variant="danger" size="sm" onClick={onLogout}>
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">ログアウト</span>
            </Button>
          </div>
        </div>
      </header>

      {/* メイン */}
      <main className="max-w-6xl mx-auto px-6 py-10">
        {loading ? (
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600"></div>
            <p className="text-slate-500 dark:text-slate-400 mt-4">読み込み中...</p>
          </div>
        ) : (
          <>
            {/* 安全パトロール状況サマリ（show_kpi && statsが取得できた場合のみ表示） */}
            {showKpi && stats && (
              <div className="mb-2">
                <div className="flex items-center gap-2 mb-4">
                  <ShieldCheck className="w-5 h-5 text-brand-500" />
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">安全パトロール状況</h2>
                </div>
                <StatsSection stats={stats} />
              </div>
            )}

            {/* 入札案件の状況（入札担当のみ・bidStats取得時のみ表示） */}
            <BidsKpiSection bidStats={bidStats} onOpen={() => onOpenInternal?.('bids')} />

            <div className="mb-6">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">利用可能なアプリ</h2>
              <p className="text-slate-500 dark:text-slate-400 mt-1">必要なツールにアクセスできます</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedApps.map((app, idx) => {
                const isComingSoon = app.status === 'coming_soon'
                const tone = ICON_TONES[idx % ICON_TONES.length]

                if (isComingSoon) {
                  return (
                    <div
                      key={app.id}
                      className="bg-slate-50 dark:bg-ink-800/50 rounded-2xl border border-dashed border-slate-300 dark:border-ink-700 p-6 opacity-80"
                    >
                      <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-ink-700 text-slate-400 flex items-center justify-center mb-4 text-2xl">
                        {app.icon}
                      </div>
                      <h3 className="font-bold text-slate-500 dark:text-slate-400 mb-1">{app.name}</h3>
                      <p className="text-sm text-slate-400 dark:text-slate-500 mb-4">
                        {app.description || 'アプリケーション'}
                      </p>
                      <Badge tone="neutral">
                        <Clock className="w-3.5 h-3.5" />
                        近日公開
                      </Badge>
                    </div>
                  )
                }

                // 内部アプリ（社員一覧など）はポータル内ビューへ遷移するボタンとして描画
                const cardCls =
                  'group bg-white dark:bg-ink-800 rounded-2xl border border-slate-200 dark:border-ink-700 p-6 hover:shadow-lg hover:border-brand-200 dark:hover:border-brand-500/50 hover:-translate-y-1 transition-all duration-200 cursor-pointer block relative text-left w-full'
                const cardInner = (
                  <>
                    {/* ピン留め・お気に入りアイコン */}
                    <div className="absolute top-3 right-3 flex gap-1">
                      {app.favorite && (
                        <Star className="w-3.5 h-3.5 text-warning-400" fill="currentColor" />
                      )}
                      {app.pinned && (
                        <Pin className="w-3.5 h-3.5 text-accent-400" />
                      )}
                    </div>
                    <div
                      className={`w-12 h-12 rounded-xl ${tone} flex items-center justify-center mb-4 text-2xl group-hover:scale-110 transition`}
                    >
                      {app.icon}
                    </div>
                    <h3 className="font-bold text-slate-900 dark:text-white mb-1">{app.name}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                      {app.description || 'アプリケーションにアクセス'}
                    </p>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 dark:text-brand-400 group-hover:gap-2 transition-all">
                      開く <ArrowRight className="w-4 h-4" />
                    </span>
                  </>
                )

                if (app.internal) {
                  return (
                    <button key={app.id} type="button" onClick={() => onOpenInternal?.(app.view)} className={cardCls}>
                      {cardInner}
                    </button>
                  )
                }

                return (
                  <a
                    key={app.id}
                    href={app.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group bg-white dark:bg-ink-800 rounded-2xl border border-slate-200 dark:border-ink-700 p-6 hover:shadow-lg hover:border-brand-200 dark:hover:border-brand-500/50 hover:-translate-y-1 transition-all duration-200 cursor-pointer block relative"
                  >
                    {/* ピン留め・お気に入りアイコン */}
                    <div className="absolute top-3 right-3 flex gap-1">
                      {app.favorite && (
                        <Star className="w-3.5 h-3.5 text-warning-400" fill="currentColor" />
                      )}
                      {app.pinned && (
                        <Pin className="w-3.5 h-3.5 text-accent-400" />
                      )}
                    </div>

                    <div
                      className={`w-12 h-12 rounded-xl ${tone} flex items-center justify-center mb-4 text-2xl group-hover:scale-110 transition`}
                    >
                      {app.icon}
                    </div>
                    <h3 className="font-bold text-slate-900 dark:text-white mb-1">{app.name}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                      {app.description || 'アプリケーションにアクセス'}
                    </p>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 dark:text-brand-400 group-hover:gap-2 transition-all">
                      開く <ArrowRight className="w-4 h-4" />
                    </span>
                  </a>
                )
              })}
            </div>

            {sortedApps.length === 0 && (
              <div className="text-center py-16 text-slate-400 dark:text-slate-500">
                利用可能なアプリがありません
              </div>
            )}

            {/* お知らせカード（常設）＋最近の点検 */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-8">
              {/* お知らせ（常設・1列） */}
              <div className={showKpi && stats ? '' : 'lg:col-span-3'}>
                <AnnouncementsCard onOpenAnnouncements={() => onOpenInternal?.('announcements')} />
              </div>

              {/* 最近の点検（show_kpi && statsが取得できた場合のみ） */}
              {showKpi && stats && (
                <>
                  <div>
                    <RecentActivity recent={stats.recent || []} />
                  </div>
                  <div className="bg-gradient-to-br from-brand-700 to-brand-900 dark:from-brand-800 dark:to-ink-900 rounded-2xl p-6 text-white flex flex-col border border-transparent dark:border-ink-700">
                    <ShieldCheck className="w-8 h-8 mb-3 text-accent-400" />
                    <h3 className="font-bold text-lg mb-1">安全第一</h3>
                    <p className="text-brand-100 dark:text-slate-300 text-sm flex-1">
                      {stats.issues_open > 0
                        ? `現在 ${stats.issues_open} 件の是正対応が進行中です。期限管理を徹底しましょう。`
                        : '未対応の是正はありません。引き続き安全管理を継続しましょう。'}
                    </p>
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </main>

      {/* フッター */}
      <footer className="border-t border-slate-200 dark:border-ink-800 mt-10">
        <div className="max-w-6xl mx-auto px-6 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
          &copy; 2026 中原建設 ・ 社内ポータルで業務を効率化
        </div>
      </footer>
    </div>
  )
}

/**
 * 画面右下に常駐するバグ報告・改善要望ボタン（FAB）。
 * どの画面からでもワンタップで報告ページを開けるようにする。
 */
function FeedbackFab({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="バグ報告・改善要望"
      title="バグ報告・改善要望"
      className="fixed bottom-6 right-6 z-30 flex items-center gap-2 rounded-full bg-brand-600 hover:bg-brand-700 text-white pl-4 pr-5 py-3 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
    >
      <Bug className="w-5 h-5 shrink-0" />
      <span className="hidden sm:inline text-sm font-semibold">バグ報告・改善</span>
    </button>
  )
}

function AppContent() {
  const [user, setUser] = useState(null)
  const [apps, setApps] = useState([])
  const [stats, setStats] = useState(null)
  // 入札KPI（入札担当のみ取得成功。権限なし/未デプロイ時は null のまま＝非表示）
  const [bidStats, setBidStats] = useState(null)
  const [loading, setLoading] = useState(true)
  // サーバーから取得したユーザー設定。取得失敗時はデフォルト値を使う
  const [serverSettings, setServerSettings] = useState(DEFAULT_SERVER_SETTINGS)
  // 未読お知らせ数（通知ベル用）。APIが落ちても 0 にフォールバック
  const [announcementUnreadCount, setAnnouncementUnreadCount] = useState(0)
  // 'dashboard' | 'settings' | 'employees' | 'announcements' | 'bids' | 'feedback'
  const [view, setView] = useState('dashboard')

  // 起動時にテーマをシステム連動で適用（ThemeToggleが上書きするまで）
  useEffect(() => {
    applyTheme(loadTheme())
  }, [])

  // 文字サイズの初期適用
  useEffect(() => {
    const fs = localStorage.getItem('fontSize')
    if (fs === 'large') document.documentElement.classList.add('text-lg-base')
  }, [])

  useEffect(() => {
    const savedUser = localStorage.getItem('user')
    if (savedUser) {
      setUser(JSON.parse(savedUser))
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000'
    const token = localStorage.getItem('authToken')
    const authConfig = { headers: { Authorization: `Bearer ${token}` } }

    const fetchApps = async () => {
      try {
        const response = await axios.get(`${apiUrl}/api/apps`, authConfig)
        setApps(response.data)
      } catch (error) {
        console.error('Failed to fetch apps:', error)
        // トークン切れ・無効ならログアウトして再ログインを促す
        if (error.response?.status === 401 || error.response?.status === 403) {
          handleLogout()
        }
      } finally {
        setLoading(false)
      }
    }

    // 統計は補助情報。失敗してもアプリ一覧の表示は妨げない
    const fetchStats = async () => {
      try {
        const response = await axios.get(`${apiUrl}/api/dashboard/stats`, authConfig)
        setStats(response.data)
      } catch (error) {
        console.error('Failed to fetch dashboard stats:', error)
      }
    }

    // ユーザー設定を取得。失敗時はデフォルト値でフォールバック
    const fetchUserSettings = async () => {
      try {
        const response = await axios.get(`${apiUrl}/api/user/settings`, authConfig)
        setServerSettings(response.data)
      } catch (error) {
        console.error('Failed to fetch user settings:', error)
        // 401/403 はここでは logout せず（apps 側で処理済みのため）
        setServerSettings(DEFAULT_SERVER_SETTINGS)
      }
    }

    // 未読お知らせ数を取得。失敗しても既存表示に影響させない
    const fetchAnnouncementUnreadCount = async () => {
      try {
        const response = await axios.get(`${apiUrl}/api/announcements/unread-count`, authConfig)
        setAnnouncementUnreadCount(response.data?.count || 0)
      } catch {
        setAnnouncementUnreadCount(0)
      }
    }

    // 入札KPI。アクセス権がない場合は403で失敗するので静かに非表示（null のまま）
    const fetchBidStats = async () => {
      try {
        const response = await axios.get(`${apiUrl}/api/bids/stats`, authConfig)
        setBidStats(response.data)
      } catch {
        setBidStats(null)
      }
    }

    fetchApps()
    fetchStats()
    fetchUserSettings()
    fetchAnnouncementUnreadCount()
    fetchBidStats()
  }, [user])

  const handleLogout = () => {
    localStorage.removeItem('authToken')
    localStorage.removeItem('user')
    setUser(null)
    setApps([])
    setStats(null)
    setBidStats(null)
    setServerSettings(DEFAULT_SERVER_SETTINGS)
    setAnnouncementUnreadCount(0)
    setView('dashboard')
  }

  /**
   * SettingsPage から保存成功時に呼ばれるコールバック。
   * サーバー返却の最新設定をステートに反映し、ダッシュボードの表示を更新する。
   */
  const handleSettingsChange = (newServerSettings) => {
    setServerSettings(newServerSettings)
  }

  if (!user) {
    return <LoginPage onLoginSuccess={setUser} />
  }

  // 現在のビューに対応するページを決定（FABを全ビュー共通で重ねるため変数に保持）
  let page
  if (view === 'settings') {
    page = (
      <SettingsPage
        onBack={() => setView('dashboard')}
        apps={apps}
        onSettingsChange={handleSettingsChange}
      />
    )
  } else if (view === 'employees') {
    page = <EmployeesPage onBack={() => setView('dashboard')} />
  } else if (view === 'announcements') {
    page = <AnnouncementsPage onBack={() => setView('dashboard')} />
  } else if (view === 'bids') {
    page = <BidsPage onBack={() => setView('dashboard')} />
  } else if (view === 'feedback') {
    page = <FeedbackPage onBack={() => setView('dashboard')} />
  } else {
    page = (
      <DashboardPage
        user={user}
        onLogout={handleLogout}
        apps={apps}
        loading={loading}
        stats={stats}
        bidStats={bidStats}
        serverSettings={serverSettings}
        onOpenSettings={() => setView('settings')}
        onOpenInternal={(v) => setView(v || 'employees')}
        announcementUnreadCount={announcementUnreadCount}
      />
    )
  }

  return (
    <>
      {page}
      {/* バグ報告・改善要望は右下に常駐（報告ページを開いている時は重複表示しない） */}
      {view !== 'feedback' && (
        <FeedbackFab onClick={() => setView('feedback')} />
      )}
    </>
  )
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      <AppContent />
    </GoogleOAuthProvider>
  )
}
