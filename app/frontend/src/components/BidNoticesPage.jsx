import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  ArrowLeft, RefreshCw, Loader2, ExternalLink, Search, Megaphone,
  MapPin, CalendarClock, CheckCircle2, XCircle, FilePlus2, RotateCcw, Building2,
} from 'lucide-react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import Toast from './ui/Toast'
import { API_URL as apiUrl, authConfig } from '../lib/api'
import { useToast } from '../lib/useToast'
import { inputCls } from '../lib/ui'

// ソース定義（表示名・トーン）
const SOURCE_DEFS = {
  kyushu_defense: { label: '九州防衛局', tone: 'info' },
  tsushima_city: { label: '対馬市', tone: 'success' },
  nagasaki_pref: { label: '長崎県', tone: 'warning' },
}
const SOURCE_ORDER = ['kyushu_defense', 'tsushima_city', 'nagasaki_pref']
const PREFECTURES = ['福岡', '佐賀', '長崎', '大分']

const STATUS_DEFS = {
  new: { label: '新着', tone: 'danger' },
  reviewed: { label: '確認済', tone: 'neutral' },
  promoted: { label: '案件登録済', tone: 'success' },
  dismissed: { label: '見送り', tone: 'neutral' },
}

function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt)) return '—'
  return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()}`
}
function fmtDateTime(d) {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt)) return '—'
  return `${dt.getMonth() + 1}/${dt.getDate()} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
}
function fmtYen(n) {
  if (n == null || n === '') return null
  const num = Number(n)
  if (!isFinite(num)) return null
  if (Math.abs(num) >= 1e8) return `¥${(num / 1e8).toFixed(2)}億`
  if (Math.abs(num) >= 1e4) return `¥${Math.round(num / 1e4).toLocaleString()}万`
  return `¥${num.toLocaleString()}`
}
// 締切までの残り日数（bid_date か opening_date）
function daysLeft(n) {
  const deadline = n.bid_date || n.opening_date
  if (!deadline) return null
  const dt = new Date(deadline)
  if (isNaN(dt)) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  dt.setHours(0, 0, 0, 0)
  return Math.round((dt - today) / 86400000)
}

export default function BidNoticesPage({ onBack }) {
  const { toast, showToast } = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [collecting, setCollecting] = useState(false)
  const [lastRuns, setLastRuns] = useState([])
  const [busyId, setBusyId] = useState(null)

  // フィルタ状態
  const [source, setSource] = useState('')
  const [prefecture, setPrefecture] = useState('')
  const [tsushimaOnly, setTsushimaOnly] = useState(false)
  const [scope, setScope] = useState('active') // active | all | closed
  const [statusFilter, setStatusFilter] = useState('') // '' | new | reviewed | dismissed | promoted
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = { scope }
      if (source) params.source = source
      if (prefecture) params.prefecture = prefecture
      if (tsushimaOnly) params.tsushima = 'true'
      if (statusFilter) params.status = statusFilter
      if (q.trim()) params.q = q.trim()
      const { data } = await axios.get(`${apiUrl}/api/bid-notices`, { ...authConfig(), params })
      setRows(data || [])
    } catch (e) {
      showToast('error', e.response?.data?.error || '公告一覧の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [source, prefecture, tsushimaOnly, scope, statusFilter, q, showToast])

  const loadLastRuns = useCallback(async () => {
    try {
      const { data } = await axios.get(`${apiUrl}/api/bid-notices/last-run`, authConfig())
      setLastRuns(data || [])
    } catch { /* noop */ }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadLastRuns() }, [loadLastRuns])

  // ステータス変更（確認済 / 見送り / 新着に戻す）
  async function changeStatus(n, status) {
    setBusyId(n.id)
    try {
      await axios.patch(`${apiUrl}/api/bid-notices/${n.id}`, { status }, authConfig())
      showToast('success', (STATUS_DEFS[status]?.label || '') + ' にしました')
      load()
    } catch (e) {
      showToast('error', e.response?.data?.error || '更新に失敗しました')
    } finally {
      setBusyId(null)
    }
  }

  // 入札案件へ昇格
  async function promote(n) {
    if (!window.confirm(`「${n.project_name}」を入札案件として登録しますか？`)) return
    setBusyId(n.id)
    try {
      await axios.post(`${apiUrl}/api/bid-notices/${n.id}/promote`, {}, authConfig())
      showToast('success', '入札案件に登録しました（入札案件管理へ）')
      load()
    } catch (e) {
      showToast('error', e.response?.data?.error || '登録に失敗しました')
    } finally {
      setBusyId(null)
    }
  }

  // 今すぐ収集（管理者）
  async function collectNow() {
    setCollecting(true)
    try {
      const { data } = await axios.post(`${apiUrl}/api/bid-notices/collect`, {}, authConfig())
      const parts = Object.entries(data.perSource || {}).map(
        ([k, v]) => `${SOURCE_DEFS[k]?.label || k}: ${v.ok ? `新着${v.new}件` : '取得失敗'}`
      )
      showToast('success', `収集完了（新着 計${data.totalNew}件）／ ${parts.join(' ・ ')}`)
      load()
      loadLastRuns()
    } catch (e) {
      showToast('error', e.response?.data?.error || '収集に失敗しました（管理者のみ実行可）')
    } finally {
      setCollecting(false)
    }
  }

  const lastOk = lastRuns.find((r) => r.finished_at)
  const newCount = rows.filter((n) => n.status === 'new').length

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-ink-900">
      {toast && <Toast toast={toast} />}

      {/* ヘッダ */}
      <div className="bg-white dark:bg-ink-800 border-b border-slate-200 dark:border-ink-700 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-ink-700" aria-label="戻る">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Megaphone className="w-6 h-6 text-brand-600 shrink-0" />
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 truncate">入札公告</h1>
              <p className="text-xs text-slate-400 truncate">
                九州防衛局（北部九州）・対馬市・長崎県対馬振興局の工事入札公告を日次収集
              </p>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> 更新
          </Button>
          <Button variant="primary" size="sm" onClick={collectNow} disabled={collecting}>
            {collecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} 今すぐ収集
          </Button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-5 space-y-4">
        {/* 最終収集 */}
        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
          <CalendarClock className="w-4 h-4" />
          最終収集: {lastOk ? fmtDateTime(lastOk.started_at) : '—'}
          {lastRuns.length > 0 && (
            <span className="text-slate-400">
              （{lastRuns.slice(0, 3).map((r) => `${SOURCE_DEFS[r.source]?.label || r.source}${r.ok ? '' : '⚠'}`).join(' / ')}）
            </span>
          )}
        </div>

        {/* フィルタ */}
        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* ソース */}
            <div className="flex gap-1">
              <FilterChip active={source === ''} onClick={() => setSource('')}>全ソース</FilterChip>
              {SOURCE_ORDER.map((s) => (
                <FilterChip key={s} active={source === s} onClick={() => setSource(source === s ? '' : s)}>
                  {SOURCE_DEFS[s].label}
                </FilterChip>
              ))}
            </div>
            <div className="w-px h-6 bg-slate-200 dark:bg-ink-700 mx-1" />
            {/* 対馬島内 */}
            <FilterChip active={tsushimaOnly} onClick={() => setTsushimaOnly((v) => !v)}>
              <MapPin className="w-3.5 h-3.5" /> 対馬島内のみ
            </FilterChip>
            {/* 県（九州防衛局向け） */}
            <select value={prefecture} onChange={(e) => setPrefecture(e.target.value)} className={`${inputCls} !w-auto !py-1.5 text-sm`}>
              <option value="">全県</option>
              {PREFECTURES.map((p) => <option key={p} value={p}>{p}県</option>)}
            </select>
            {/* 募集状況 */}
            <select value={scope} onChange={(e) => setScope(e.target.value)} className={`${inputCls} !w-auto !py-1.5 text-sm`}>
              <option value="active">募集中のみ</option>
              <option value="all">すべて</option>
              <option value="closed">締切済</option>
            </select>
            {/* ステータス */}
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${inputCls} !w-auto !py-1.5 text-sm`}>
              <option value="">全状態</option>
              <option value="new">新着</option>
              <option value="reviewed">確認済</option>
              <option value="dismissed">見送り</option>
              <option value="promoted">案件登録済</option>
            </select>
            {/* 検索 */}
            <div className="relative flex-1 min-w-[160px]">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="工事名・場所・発注機関で検索"
                className={`${inputCls} !pl-8 !py-1.5 text-sm`}
              />
            </div>
          </div>
        </Card>

        {/* 件数 */}
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span>{rows.length} 件</span>
          {newCount > 0 && <Badge tone="danger">新着 {newCount}</Badge>}
        </div>

        {/* 一覧 */}
        {loading ? (
          <div className="py-20 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : rows.length === 0 ? (
          <div className="py-20 text-center text-slate-400">該当する公告はありません</div>
        ) : (
          <div className="space-y-2">
            {rows.map((n) => (
              <NoticeRow
                key={n.id}
                n={n}
                busy={busyId === n.id}
                onStatus={changeStatus}
                onPromote={promote}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function FilterChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
        active
          ? 'bg-brand-600 text-white'
          : 'bg-slate-100 dark:bg-ink-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-ink-600'
      }`}
    >
      {children}
    </button>
  )
}

function NoticeRow({ n, busy, onStatus, onPromote }) {
  const src = SOURCE_DEFS[n.source] || { label: n.source, tone: 'neutral' }
  const st = STATUS_DEFS[n.status] || { label: n.status, tone: 'neutral' }
  const dl = daysLeft(n)
  const yen = fmtYen(n.budget_price)
  const promoted = n.status === 'promoted'

  return (
    <Card className={`p-3 ${n.status === 'new' ? 'border-l-4 border-l-danger-500' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* バッジ行 */}
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <Badge tone={src.tone}>{src.label}</Badge>
            {n.is_tsushima && <Badge tone="success"><MapPin className="w-3 h-3" /> 対馬</Badge>}
            {n.prefecture && !n.is_tsushima && <Badge tone="neutral">{n.prefecture}県</Badge>}
            {n.bid_method && <span className="text-xs text-slate-400">{n.bid_method}</span>}
            <Badge tone={st.tone}>{st.label}</Badge>
            {n.is_active && dl != null && dl >= 0 && (
              <Badge tone={dl <= 3 ? 'danger' : dl <= 7 ? 'warning' : 'info'}>締切まで{dl}日</Badge>
            )}
          </div>
          {/* 工事名 */}
          <a
            href={n.notice_url}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-slate-800 dark:text-slate-100 hover:text-brand-600 inline-flex items-start gap-1"
          >
            <span className="break-words">{n.project_name}</span>
            <ExternalLink className="w-3.5 h-3.5 mt-1 shrink-0 text-slate-400" />
          </a>
          {/* メタ */}
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />{n.source_agency}</span>
            {n.location && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{n.location}</span>}
            <span>公告 {fmtDate(n.notice_date)}</span>
            <span className="font-medium text-slate-600 dark:text-slate-300">
              締切 {fmtDate(n.bid_date || n.opening_date)}
            </span>
            {yen && <span className="text-brand-600 dark:text-brand-400 font-medium">予定 {yen}</span>}
          </div>
          {n.summary && <p className="mt-1 text-xs text-slate-400 line-clamp-2">{n.summary}</p>}
        </div>

        {/* アクション */}
        <div className="flex flex-col gap-1.5 shrink-0">
          {!promoted ? (
            <>
              <Button variant="primary" size="sm" onClick={() => onPromote(n)} disabled={busy}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FilePlus2 className="w-4 h-4" />} 案件登録
              </Button>
              <div className="flex gap-1">
                {n.status !== 'reviewed' ? (
                  <button
                    onClick={() => onStatus(n, 'reviewed')}
                    disabled={busy}
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-ink-700"
                    title="確認済にする"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => onStatus(n, 'new')}
                    disabled={busy}
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-ink-700"
                    title="新着に戻す"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
                {n.status !== 'dismissed' ? (
                  <button
                    onClick={() => onStatus(n, 'dismissed')}
                    disabled={busy}
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-ink-700"
                    title="見送りにする"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => onStatus(n, 'new')}
                    disabled={busy}
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-ink-700"
                    title="新着に戻す"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </div>
            </>
          ) : (
            <Badge tone="success"><CheckCircle2 className="w-3.5 h-3.5" /> 登録済</Badge>
          )}
        </div>
      </div>
    </Card>
  )
}
