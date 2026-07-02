import { useState, useEffect, useMemo, useCallback } from 'react'
import axios from 'axios'
import {
  ArrowLeft, CalendarDays, Loader2, Trash2,
} from 'lucide-react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import Toast from './ui/Toast'
import ModalShell from './ui/ModalShell'
import { API_URL as apiUrl, authConfig } from '../lib/api'
import { useToast } from '../lib/useToast'

// 種別 → 表示メタ（塗り色・ラベル）。公休日=ピンク / 計画有給=オレンジ。
export const KIND_META = {
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
export function ymd(y, m /*1-12*/, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * 1か月分のカレンダーグリッド（再利用部品）。
 * props: year, month(1-12), holidays({'YYYY-MM-DD':{kind}}), onDayClick?(key),
 *        compact(小型表示・ダッシュボード用), highlightToday(当日枠)
 */
export function MonthGrid({ year, month, holidays = {}, onDayClick, compact = false, highlightToday = true }) {
  const today = new Date()
  const cells = useMemo(() => {
    const first = new Date(year, month - 1, 1)
    const lead = (first.getDay() + 6) % 7 // 月曜始まりでの先頭空白（0=月 .. 6=日）
    const daysInMonth = new Date(year, month, 0).getDate()
    const arr = []
    for (let i = 0; i < lead; i++) arr.push(null)
    for (let d = 1; d <= daysInMonth; d++) arr.push(d)
    while (arr.length % 7 !== 0) arr.push(null)
    return arr
  }, [year, month])

  const stats = useMemo(() => {
    let k = 0, y = 0
    const dim = new Date(year, month, 0).getDate()
    for (let d = 1; d <= dim; d++) {
      const h = holidays[ymd(year, month, d)]
      if (h?.kind === 'koushu') k++
      else if (h?.kind === 'yukyu') y++
    }
    return { koushu: k, yukyu: y }
  }, [holidays, year, month])

  const isToday = (d) =>
    d && year === today.getFullYear() && month === today.getMonth() + 1 && d === today.getDate()

  const cellSize = compact
    ? 'text-[11px]'
    : 'text-sm sm:text-base'

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className={`font-bold text-slate-900 dark:text-white ${compact ? 'text-sm' : 'text-base'}`}>
          {year}年 {MONTH_LABELS[month - 1]}
        </h3>
        <div className="flex items-center gap-1.5">
          <Badge tone="danger">公休 {stats.koushu}</Badge>
          {stats.yukyu > 0 && <Badge tone="warning">有給 {stats.yukyu}</Badge>}
        </div>
      </div>
      <div className={`grid grid-cols-7 ${compact ? 'gap-0.5' : 'gap-1'}`}>
        {WEEK.map((w, i) => (
          <div
            key={w}
            className={`text-center font-bold py-0.5 text-[10px] ${
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
          const tone = meta
            ? meta.cell
            : dow === 6
            ? 'text-rose-500'
            : dow === 5
            ? 'text-blue-500'
            : 'text-slate-700 dark:text-slate-200'
          const ring = highlightToday && isToday(d) ? 'ring-2 ring-brand-500' : ''
          const clickable = onDayClick ? 'cursor-pointer hover:opacity-80' : ''
          return (
            <div
              key={key}
              className={`relative aspect-square rounded-md flex items-center justify-center font-semibold transition select-none ${cellSize} ${tone} ${ring} ${clickable}`}
              onClick={onDayClick ? () => onDayClick(key) : undefined}
            >
              {d}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function CalendarPage({ onBack }) {
  const [holidays, setHolidays] = useState({}) // { 'YYYY-MM-DD': {kind, note} }
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const { toast, showToast } = useToast()

  // 管理者が編集する対象日（クリックで開くアクションモーダル）
  const [editDay, setEditDay] = useState(null) // 'YYYY-MM-DD' | null

  // 現在の月から12か月分（[{year, month}]）
  const months = useMemo(() => {
    const now = new Date()
    const list = []
    for (let i = 0; i < 12; i++) {
      const dt = new Date(now.getFullYear(), now.getMonth() + i, 1)
      list.push({ year: dt.getFullYear(), month: dt.getMonth() + 1 })
    }
    return list
  }, [])

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
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />
            戻る
          </Button>
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-brand-500" />
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">会社カレンダー</h1>
          </div>
          <div className="ml-auto hidden sm:flex items-center gap-4 text-sm text-slate-600 dark:text-slate-300">
            <span className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded-sm ${KIND_META.koushu.dot}`} />公休日
            </span>
            <span className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded-sm ${KIND_META.yukyu.dot}`} />計画有給
            </span>
          </div>
        </div>
      </header>

      {toast && <Toast toast={toast} />}

      <main className="max-w-6xl mx-auto px-6 py-8">
        {loading ? (
          <div className="text-center py-20">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-brand-500" />
            <p className="text-slate-500 dark:text-slate-400 mt-3">読み込み中...</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              現在の月から1年分を表示しています。{isAdmin && '日付をタップすると公休日／計画有給を編集できます。'}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {months.map(({ year, month }) => (
                <Card key={`${year}-${month}`} className="p-4">
                  <MonthGrid
                    year={year}
                    month={month}
                    holidays={holidays}
                    onDayClick={isAdmin ? setEditDay : undefined}
                  />
                </Card>
              ))}
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-6 text-center">
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
