import { useState, useEffect, useMemo, useCallback } from 'react'
import axios from 'axios'
import {
  ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Loader2, Trash2,
} from 'lucide-react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import Toast from './ui/Toast'
import ModalShell from './ui/ModalShell'
import { API_URL as apiUrl, authConfig } from '../lib/api'
import { useToast } from '../lib/useToast'

// 種別 → 表示メタ（塗り色・ラベル）。公休日=ピンク / 計画有給=オレンジ。
const KIND_META = {
  koushu: {
    label: '公休日',
    cell: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200',
    dot: 'bg-rose-400',
  },
  yukyu: {
    label: '計画有給',
    cell: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200',
    dot: 'bg-amber-400',
  },
}

const WEEK = ['月', '火', '水', '木', '金', '土', '日'] // 月曜始まり（会社カレンダーの表記に合わせる）
const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

// ローカルタイムで 'YYYY-MM-DD' を作る（toISOString だと UTC ずれで前日になる）
function ymd(y, m /*1-12*/, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export default function CalendarPage({ onBack }) {
  const [holidays, setHolidays] = useState({}) // { 'YYYY-MM-DD': {kind, note} }
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const { toast, showToast } = useToast()

  // 表示中の年月。既定は今日の月。
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1) // 1-12

  // 管理者が編集する対象日（クリックで開くアクションモーダル）
  const [editDay, setEditDay] = useState(null) // 'YYYY-MM-DD' | null

  const loadHolidays = useCallback(async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/calendar/holidays`, authConfig())
      const map = {}
      for (const r of res.data || []) map[r.day] = { kind: r.kind, note: r.note }
      setHolidays(map)
    } catch (e) {
      console.error('Failed to load holidays:', e)
      showToast('error', '休日データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    loadHolidays()
    axios
      .get(`${apiUrl}/api/my-permissions`, authConfig())
      .then((res) => setIsAdmin(res.data?.role === 'admin'))
      .catch(() => setIsAdmin(false))
  }, [loadHolidays])

  // 表示月のセル配列を作る（先頭の空白 + 各日）
  const cells = useMemo(() => {
    const first = new Date(year, month - 1, 1)
    const lead = (first.getDay() + 6) % 7 // 月曜始まりでの先頭空白数（0=月 .. 6=日）
    const daysInMonth = new Date(year, month, 0).getDate()
    const arr = []
    for (let i = 0; i < lead; i++) arr.push(null)
    for (let d = 1; d <= daysInMonth; d++) arr.push(d)
    while (arr.length % 7 !== 0) arr.push(null)
    return arr
  }, [year, month])

  // 表示月の集計
  const monthStats = useMemo(() => {
    let k = 0, y = 0
    const daysInMonth = new Date(year, month, 0).getDate()
    for (let d = 1; d <= daysInMonth; d++) {
      const h = holidays[ymd(year, month, d)]
      if (h?.kind === 'koushu') k++
      else if (h?.kind === 'yukyu') y++
    }
    return { koushu: k, yukyu: y }
  }, [holidays, year, month])

  const gotoMonth = (delta) => {
    let m = month + delta
    let y = year
    if (m < 1) { m = 12; y-- }
    if (m > 12) { m = 1; y++ }
    setYear(y)
    setMonth(m)
  }

  const isToday = (d) =>
    d && year === today.getFullYear() && month === today.getMonth() + 1 && d === today.getDate()

  // 管理者操作：日付に種別を設定 / 解除
  const setKind = async (day, kind) => {
    try {
      await axios.post(`${apiUrl}/api/calendar/holidays`, { day, kind }, authConfig())
      setHolidays((prev) => ({ ...prev, [day]: { kind, note: null } }))
      showToast('success', `${day} を「${KIND_META[kind].label}」に設定しました`)
    } catch (e) {
      showToast('error', e.response?.data?.error || '更新に失敗しました')
    } finally {
      setEditDay(null)
    }
  }
  const clearDay = async (day) => {
    try {
      await axios.delete(`${apiUrl}/api/calendar/holidays/${day}`, authConfig())
      setHolidays((prev) => {
        const next = { ...prev }
        delete next[day]
        return next
      })
      showToast('success', `${day} の休みを解除しました`)
    } catch (e) {
      showToast('error', e.response?.data?.error || '削除に失敗しました')
    } finally {
      setEditDay(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-ink-950 transition-colors">
      {/* ヘッダー */}
      <header className="bg-white/80 dark:bg-ink-900/80 backdrop-blur border-b border-slate-200 dark:border-ink-800 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />
            戻る
          </Button>
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-brand-500" />
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">会社カレンダー</h1>
          </div>
        </div>
      </header>

      {toast && <Toast toast={toast} />}

      <main className="max-w-4xl mx-auto px-6 py-8">
        {loading ? (
          <div className="text-center py-20">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-brand-500" />
            <p className="text-slate-500 dark:text-slate-400 mt-3">読み込み中...</p>
          </div>
        ) : (
          <>
            {/* 月ナビゲーション */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => gotoMonth(-1)}
                aria-label="前の月"
                className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-ink-800 transition"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="text-center">
                <div className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
                  {year}年 {MONTH_LABELS[month - 1]}
                </div>
                <div className="flex items-center justify-center gap-2 mt-1">
                  <Badge tone="danger">公休 {monthStats.koushu}日</Badge>
                  {monthStats.yukyu > 0 && <Badge tone="warning">計画有給 {monthStats.yukyu}日</Badge>}
                </div>
              </div>
              <button
                onClick={() => gotoMonth(1)}
                aria-label="次の月"
                className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-ink-800 transition"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* 凡例 */}
            <div className="flex items-center justify-center gap-4 mb-4 text-sm text-slate-600 dark:text-slate-300">
              <span className="flex items-center gap-1.5">
                <span className={`w-3 h-3 rounded-sm ${KIND_META.koushu.dot}`} />公休日
              </span>
              <span className="flex items-center gap-1.5">
                <span className={`w-3 h-3 rounded-sm ${KIND_META.yukyu.dot}`} />計画有給
              </span>
              {isAdmin && <span className="text-xs text-slate-400">（日付をタップで編集）</span>}
            </div>

            {/* カレンダー本体 */}
            <Card className="p-4 sm:p-6">
              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {WEEK.map((w, i) => (
                  <div
                    key={w}
                    className={`text-center text-xs font-bold py-1 ${
                      i === 5 ? 'text-blue-500' : i === 6 ? 'text-rose-500' : 'text-slate-400'
                    }`}
                  >
                    {w}
                  </div>
                ))}
                {cells.map((d, idx) => {
                  if (d === null) return <div key={`e${idx}`} />
                  const key = ymd(year, month, d)
                  const h = holidays[key]
                  const dow = idx % 7 // 0=月 .. 6=日
                  const meta = h ? KIND_META[h.kind] : null
                  const base =
                    'relative aspect-square rounded-lg flex items-center justify-center text-sm sm:text-base font-semibold transition select-none'
                  const tone = meta
                    ? meta.cell
                    : dow === 6
                    ? 'text-rose-500'
                    : dow === 5
                    ? 'text-blue-500'
                    : 'text-slate-700 dark:text-slate-200'
                  const ring = isToday(d) ? 'ring-2 ring-brand-500' : ''
                  const clickable = isAdmin ? 'cursor-pointer hover:opacity-80' : ''
                  return (
                    <div
                      key={key}
                      className={`${base} ${tone} ${ring} ${clickable}`}
                      onClick={isAdmin ? () => setEditDay(key) : undefined}
                    >
                      {d}
                    </div>
                  )
                })}
              </div>
            </Card>

            <p className="text-xs text-slate-400 dark:text-slate-500 mt-4 text-center">
              出典: 主税さん作成「計画有給休暇一覧」（2026.7〜2027.6 確定）。祝日・振替は公休日に含みます。
            </p>
          </>
        )}
      </main>

      {/* 管理者用：日付の種別を設定 / 解除 */}
      {editDay && (
        <ModalShell title={`${editDay} の設定`} onClose={() => setEditDay(null)}>
          <div className="space-y-2">
            <Button
              variant={holidays[editDay]?.kind === 'koushu' ? 'primary' : 'secondary'}
              className="w-full justify-center"
              onClick={() => setKind(editDay, 'koushu')}
            >
              公休日にする
            </Button>
            <Button
              variant={holidays[editDay]?.kind === 'yukyu' ? 'primary' : 'secondary'}
              className="w-full justify-center"
              onClick={() => setKind(editDay, 'yukyu')}
            >
              計画有給にする
            </Button>
            {holidays[editDay] && (
              <Button variant="danger" className="w-full justify-center" onClick={() => clearDay(editDay)}>
                <Trash2 className="w-4 h-4" />
                休みを解除（平日に戻す）
              </Button>
            )}
          </div>
        </ModalShell>
      )}
    </div>
  )
}
