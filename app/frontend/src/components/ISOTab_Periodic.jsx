import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { Loader2, CheckCircle2, AlertTriangle, CalendarClock, ArrowRight, RefreshCw } from 'lucide-react'
import Card from './ui/Card'
import Badge from './ui/Badge'
import Button from './ui/Button'
import { API_URL as apiUrl, authConfig } from '../lib/api'

// 頻度バケットの表示定義（表示順もこの順）
const BUCKETS = [
  { key: 'daily', label: '毎日', freqs: ['daily'], hint: '始業・終業ごとに記入' },
  { key: 'monthly', label: '今月', freqs: ['monthly', 'monthly_target'], hint: '当月中に記入' },
  { key: 'cycle', label: '四半期・周期', freqs: ['quarterly', 'cycle'], hint: '期ごとに記入・確認' },
]

// 1項目の状態 → バッジ（tone / ラベル）を決める
function statusBadge(it) {
  if (it.freq === 'monthly_target') {
    const done = it.count >= (it.target || 0)
    return { tone: done ? 'success' : 'warning', label: `${it.count} / ${it.target}件${done ? ' 達成' : ''}` }
  }
  if (it.invert) {
    // 校正など「対象0が良い」項目
    return it.count === 0
      ? { tone: 'success', label: '期限接近なし' }
      : { tone: 'danger', label: `${it.count}${it.unit || ''} 期限接近` }
  }
  if (it.done) {
    const detail = it.total != null ? `${it.count} / ${it.total}${it.unit || ''}` : `${it.count}${it.unit || ''}`
    return { tone: 'success', label: `記入済（${detail}）` }
  }
  // 未記入
  if (it.total != null && it.count > 0) return { tone: 'warning', label: `一部（${it.count} / ${it.total}${it.unit || ''}）` }
  return { tone: 'warning', label: '未記入' }
}

export default function PeriodicTab({ onJump, showToast }) {
  const [state, setState] = useState(null) // {today, ym, items}
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await axios.get(`${apiUrl}/api/iso/periodic-status`, authConfig())
      setState(r.data)
    } catch {
      showToast?.('error', '記入状況の取得に失敗しました')
      setState({ items: [] })
    } finally {
      setLoading(false)
    }
  }, [showToast])
  useEffect(() => { load() }, [load])

  if (loading && !state) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div>
  }

  const items = state?.items || []
  // サマリ（達成すべきもののうち何件済んでいるか。invert項目は「対象0=OK」を済とみなす）
  const actionable = items.filter((it) => it.freq !== 'monthly_target')
  const doneCount = actionable.filter((it) => it.done).length
  const totalCount = actionable.length
  const ymLabel = state?.ym ? `${state.ym.slice(0, 4)}年${Number(state.ym.slice(5, 7))}月` : ''

  return (
    <div className="space-y-5">
      {/* ヘッダー：今日 / 当月 / 済サマリ */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-slate-900 dark:text-white">
            <CalendarClock className="w-5 h-5 text-brand-500" />
            <span className="text-lg font-bold">定期記入</span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            本日 {state?.today} ・ {ymLabel}の記入状況。「記入する」から各記録画面へ移動できます。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone={doneCount === totalCount ? 'success' : 'warning'}>
            記入済 {doneCount} / {totalCount}
          </Badge>
          <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />更新
          </Button>
        </div>
      </div>

      {/* 頻度バケットごとにカード */}
      {BUCKETS.map((bucket) => {
        const rows = items.filter((it) => bucket.freqs.includes(it.freq))
        if (rows.length === 0) return null
        return (
          <div key={bucket.key}>
            <div className="flex items-baseline gap-2 mb-2">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">{bucket.label}</h3>
              <span className="text-xs text-slate-400">{bucket.hint}</span>
            </div>
            <Card className="overflow-hidden divide-y divide-slate-100 dark:divide-ink-800">
              {rows.map((it) => {
                const b = statusBadge(it)
                const ok = b.tone === 'success'
                return (
                  <div key={it.key} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-ink-900/40">
                    {ok
                      ? <CheckCircle2 className="w-5 h-5 text-success-500 shrink-0" />
                      : <AlertTriangle className="w-5 h-5 text-warning-500 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{it.label}</div>
                    </div>
                    <Badge tone={b.tone}>{b.label}</Badge>
                    <button
                      onClick={() => onJump?.(it.tab)}
                      className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 dark:text-brand-300 hover:text-brand-700 whitespace-nowrap"
                    >
                      {ok ? '開く' : '記入する'}<ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )
              })}
            </Card>
          </div>
        )
      })}

      <p className="text-xs text-slate-400 dark:text-slate-500">
        ※ 各記録テーブルの当日・当月・当四半期のデータ有無から自動判定しています（新しい記録を追加すると即反映）。
      </p>
    </div>
  )
}
