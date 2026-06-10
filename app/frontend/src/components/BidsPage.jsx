import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  ArrowLeft, Plus, Pencil, Trash2, X, Save, Search, Loader2, Gavel,
  FileText, Upload, Download, Clock, BarChart3, ListChecks, AlertTriangle,
  Sparkles,
} from 'lucide-react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000'

// ステータス定義（順序＝標準フロー）。tone は Badge のトーン。
const STATUS_DEFS = [
  { key: 'collecting', label: '情報収集', tone: 'neutral' },
  { key: 'judging', label: '参加判断', tone: 'info' },
  { key: 'estimating', label: '積算中', tone: 'warning' },
  { key: 'bid', label: '入札済', tone: 'info' },
  { key: 'won', label: '落札', tone: 'success' },
  { key: 'lost', label: '失注', tone: 'danger' },
  { key: 'contracted', label: '契約', tone: 'success' },
  { key: 'declined', label: '不参加', tone: 'neutral' },
]
const STATUS_MAP = Object.fromEntries(STATUS_DEFS.map((s) => [s.key, s]))

// 認証付き axios 設定
function authConfig() {
  const token = localStorage.getItem('authToken')
  return { headers: { Authorization: `Bearer ${token}` } }
}

// 日付（YYYY/M/D）
function fmtDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()}`
}
// 入札日など 月/日 のみ
function fmtMD(d) {
  if (!d) return '—'
  const dt = new Date(d)
  return `${dt.getMonth() + 1}/${dt.getDate()}`
}
// 金額のコンパクト表示（億 / 万）
function fmtYen(n) {
  if (n == null || n === '') return '—'
  const num = Number(n)
  if (!isFinite(num)) return '—'
  if (Math.abs(num) >= 1e8) return `¥${(num / 1e8).toFixed(2)}億`
  if (Math.abs(num) >= 1e4) return `¥${Math.round(num / 1e4).toLocaleString()}万`
  return `¥${num.toLocaleString()}`
}
// 割合→％
function pct(rate) {
  return rate == null ? '—' : `${(rate * 100).toFixed(1)}%`
}
// 今日（ローカル YYYY-MM-DD）
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function Toast({ toast }) {
  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-semibold
        ${toast.type === 'success'
          ? 'bg-success-100 dark:bg-success-500/20 text-success-700 dark:text-success-300 border border-success-200 dark:border-success-500/30'
          : 'bg-danger-100 dark:bg-danger-500/20 text-danger-700 dark:text-danger-300 border border-danger-200 dark:border-danger-500/30'
        }`}
    >
      {toast.msg}
    </div>
  )
}

function ModalShell({ title, onClose, children, wide }) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className={`bg-white dark:bg-ink-800 rounded-2xl shadow-xl border border-slate-200 dark:border-ink-700 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} my-8`}
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

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}
const inputCls = 'w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-ink-600 bg-white dark:bg-ink-700 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-60'

function StatusBadge({ status }) {
  const def = STATUS_MAP[status] || { label: status, tone: 'neutral' }
  return <Badge tone={def.tone}>{def.label}</Badge>
}

// ファイル名から資料種別を推定（添付保存時の doc_type）
function guessDocType(name) {
  const n = name || ''
  if (/図面|設計図/.test(n)) return '図面'
  if (/設計書|設計図書/.test(n)) return '設計書'
  if (/仕様|特記/.test(n)) return '仕様書'
  return 'その他'
}
// バイト数を読みやすく
function fmtBytes(b) {
  if (b == null) return ''
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)}MB`
  if (b >= 1024) return `${Math.round(b / 1024)}KB`
  return `${b}B`
}
// 抽出結果（null/空を除く）をフォームに反映するための整形
function extractedToForm(fields) {
  const out = {}
  for (const [k, v] of Object.entries(fields || {})) {
    if (v == null || v === '') continue
    out[k] = String(v)
  }
  return out
}

// ──────────────────────────────────────────────
// 新規/編集フォームモーダル
// ──────────────────────────────────────────────
const EMPTY_FORM = {
  project_name: '', client_name: '', location: '', work_type: '', bid_method: '',
  status: 'collecting',
  notice_date: '', question_due: '', bid_date: '', opening_date: '',
  budget_price: '', our_estimate: '', awarded_price: '', awarded_company: '',
  staff_id: '', note: '',
}

function BidFormModal({ item, staffList, onClose, onSaved, showToast }) {
  const isNew = !item?.id
  const [form, setForm] = useState(() => {
    if (!item) return EMPTY_FORM
    const pick = (v) => (v == null ? '' : v)
    return {
      project_name: pick(item.project_name), client_name: pick(item.client_name),
      location: pick(item.location), work_type: pick(item.work_type), bid_method: pick(item.bid_method),
      status: item.status || 'collecting',
      notice_date: item.notice_date || '', question_due: item.question_due || '',
      bid_date: item.bid_date || '', opening_date: item.opening_date || '',
      budget_price: pick(item.budget_price), our_estimate: pick(item.our_estimate),
      awarded_price: pick(item.awarded_price), awarded_company: pick(item.awarded_company),
      staff_id: pick(item.staff_id), note: pick(item.note),
    }
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  // 新規登録時のみ: アップロード資料と AI 自動入力
  const [files, setFiles] = useState([])           // 添付予定のファイル（File[]）
  const [extracting, setExtracting] = useState(false)
  const [extractInfo, setExtractInfo] = useState(null) // 読み取りに使った書類名など

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList || [])
    if (!incoming.length) return
    setFiles((prev) => {
      // 同名・同サイズの重複は除外
      const key = (f) => `${f.name}__${f.size}`
      const seen = new Set(prev.map(key))
      return [...prev, ...incoming.filter((f) => !seen.has(key(f)))]
    })
  }
  const removeFile = (idx) => setFiles((prev) => prev.filter((_, i) => i !== idx))

  // 資料を AI に読ませてフォームへ反映
  const extract = async () => {
    if (!files.length) { showToast('error', '先に資料をアップロードしてください'); return }
    setExtracting(true)
    setExtractInfo(null)
    try {
      const fd = new FormData()
      files.forEach((f) => fd.append('files', f))
      const res = await axios.post(`${apiUrl}/api/bids/extract`, fd, authConfig())
      const patch = extractedToForm(res.data.fields)
      if (Object.keys(patch).length === 0) {
        showToast('error', '資料から案件情報を読み取れませんでした。手入力してください')
      } else {
        setForm((f) => ({ ...f, ...patch }))
        setExtractInfo({ used: res.data.used_files || [] })
        showToast('success', '資料から自動入力しました。内容を確認してください')
      }
    } catch (err) {
      showToast('error', err.response?.data?.error || '資料の読み取りに失敗しました')
    } finally {
      setExtracting(false)
    }
  }

  const save = async () => {
    if (!form.project_name.trim()) { showToast('error', '工事名は必須です'); return }
    setSaving(true)
    try {
      if (isNew) {
        const res = await axios.post(`${apiUrl}/api/bids`, form, authConfig())
        const newId = res.data?.id
        // アップロード済みの資料を新規案件に添付
        if (newId && files.length) {
          let failed = 0
          for (const f of files) {
            try {
              const fd = new FormData()
              fd.append('file', f)
              fd.append('doc_type', guessDocType(f.name))
              await axios.post(`${apiUrl}/api/bids/${newId}/documents`, fd, authConfig())
            } catch {
              failed += 1
            }
          }
          showToast(failed ? 'error' : 'success',
            failed ? `案件は登録しましたが ${failed} 件の資料添付に失敗しました` : '案件を登録し、資料を添付しました')
        } else {
          showToast('success', '案件を登録しました')
        }
      } else {
        await axios.put(`${apiUrl}/api/bids/${item.id}`, form, authConfig())
        showToast('success', '案件を更新しました')
      }
      onSaved()
      onClose()
    } catch (err) {
      showToast('error', err.response?.data?.error || '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title={isNew ? '入札案件を登録' : '入札案件を編集'} onClose={onClose} wide>
      {isNew && (
        <div className="mb-5 rounded-2xl border border-brand-200 dark:border-brand-500/30 bg-brand-50/60 dark:bg-brand-500/10 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-brand-600 dark:text-brand-400" />
            <p className="text-sm font-bold text-brand-700 dark:text-brand-300">資料から自動入力</p>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            指名通知・公告・設計書などの資料をアップロードすると、AIが工事名・発注者・日程などを読み取って下のフォームに入力します。アップした資料はそのまま案件に添付されます。
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-ink-600 bg-white dark:bg-ink-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-ink-600 cursor-pointer">
              <Upload className="w-4 h-4" />
              資料を選択
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
              />
            </label>
            <Button variant="primary" size="sm" onClick={extract} disabled={extracting || files.length === 0}>
              {extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {extracting ? '読み取り中...' : '資料から自動入力'}
            </Button>
            {files.length > 0 && (
              <span className="text-xs text-slate-400">{files.length}件の資料</span>
            )}
          </div>

          {files.length > 0 && (
            <ul className="mt-3 space-y-1">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <FileText className="w-3.5 h-3.5 text-brand-500 shrink-0" />
                  <span className="flex-1 min-w-0 truncate">{f.name}</span>
                  <span className="text-slate-400 shrink-0">{fmtBytes(f.size)}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="p-1 rounded text-slate-400 hover:text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-500/10 shrink-0"
                    title="この資料を外す"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {extractInfo && (
            <p className="mt-3 text-xs text-success-600 dark:text-success-400">
              読み取りに使用: {extractInfo.used.join(' / ') || '—'}（内容を確認・修正してから登録してください）
            </p>
          )}
        </div>
      )}

      <div className="space-y-4">
        <Field label="工事名 *">
          <input className={inputCls} value={form.project_name} onChange={(e) => set('project_name', e.target.value)} placeholder="例: ○○道路改良工事" />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="発注者">
            <input className={inputCls} value={form.client_name} onChange={(e) => set('client_name', e.target.value)} placeholder="例: 県土木事務所" />
          </Field>
          <Field label="工事場所">
            <input className={inputCls} value={form.location} onChange={(e) => set('location', e.target.value)} />
          </Field>
          <Field label="工種">
            <input className={inputCls} value={form.work_type} onChange={(e) => set('work_type', e.target.value)} placeholder="例: 道路 / 橋梁 / 舗装" />
          </Field>
          <Field label="入札方式">
            <input className={inputCls} value={form.bid_method} onChange={(e) => set('bid_method', e.target.value)} placeholder="例: 一般競争 / 指名" />
          </Field>
          <Field label="ステータス">
            <select className={inputCls} value={form.status} onChange={(e) => set('status', e.target.value)}>
              {STATUS_DEFS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="担当">
            <select className={inputCls} value={form.staff_id} onChange={(e) => set('staff_id', e.target.value)}>
              <option value="">（未割当）</option>
              {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        </div>

        <div className="border-t border-slate-100 dark:border-ink-700 pt-4">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-3">日程</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Field label="公告日">
              <input type="date" className={inputCls} value={form.notice_date} onChange={(e) => set('notice_date', e.target.value)} />
            </Field>
            <Field label="質問期限">
              <input type="date" className={inputCls} value={form.question_due} onChange={(e) => set('question_due', e.target.value)} />
            </Field>
            <Field label="入札日">
              <input type="date" className={inputCls} value={form.bid_date} onChange={(e) => set('bid_date', e.target.value)} />
            </Field>
            <Field label="開札日">
              <input type="date" className={inputCls} value={form.opening_date} onChange={(e) => set('opening_date', e.target.value)} />
            </Field>
          </div>
        </div>

        <div className="border-t border-slate-100 dark:border-ink-700 pt-4">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-3">金額（円）</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Field label="予定価格">
              <input type="number" className={inputCls} value={form.budget_price} onChange={(e) => set('budget_price', e.target.value)} />
            </Field>
            <Field label="自社見積">
              <input type="number" className={inputCls} value={form.our_estimate} onChange={(e) => set('our_estimate', e.target.value)} />
            </Field>
            <Field label="落札額">
              <input type="number" className={inputCls} value={form.awarded_price} onChange={(e) => set('awarded_price', e.target.value)} />
            </Field>
            <Field label="落札業者">
              <input className={inputCls} value={form.awarded_company} onChange={(e) => set('awarded_company', e.target.value)} placeholder="自社/他社名" />
            </Field>
          </div>
        </div>

        <Field label="メモ">
          <textarea className={inputCls + ' min-h-[80px] resize-y'} value={form.note} onChange={(e) => set('note', e.target.value)} />
        </Field>
      </div>

      <div className="flex justify-end gap-2 mt-6">
        <Button variant="ghost" size="sm" onClick={onClose}>キャンセル</Button>
        <Button variant="primary" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? '保存中...' : (isNew ? '登録する' : '更新する')}
        </Button>
      </div>
    </ModalShell>
  )
}

// 詳細の情報行
function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-sm border-b border-slate-50 dark:border-ink-700/50">
      <span className="text-slate-400 shrink-0">{label}</span>
      <span className="text-slate-800 dark:text-slate-200 text-right">{value || '—'}</span>
    </div>
  )
}

// ──────────────────────────────────────────────
// 詳細モーダル（基本情報 / 金額・結果 / 資料 / 履歴 のタブ）
// ──────────────────────────────────────────────
function BidDetailModal({ id, onClose, onEdit, onChanged, showToast }) {
  const [bid, setBid] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('basic')
  const [uploading, setUploading] = useState(false)
  const [docType, setDocType] = useState('設計書')

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/bids/${id}`, authConfig())
      setBid(res.data)
    } catch {
      showToast('error', '案件の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [id, showToast])

  useEffect(() => { load() }, [load])

  const changeStatus = async (status) => {
    try {
      await axios.put(`${apiUrl}/api/bids/${id}`, { status }, authConfig())
      showToast('success', 'ステータスを更新しました')
      load()
      onChanged()
    } catch {
      showToast('error', 'ステータス更新に失敗しました')
    }
  }

  const handleDelete = async () => {
    if (!confirm(`「${bid.project_name}」を削除しますか？`)) return
    try {
      await axios.delete(`${apiUrl}/api/bids/${id}`, authConfig())
      showToast('success', '削除しました')
      onChanged()
      onClose()
    } catch {
      showToast('error', '削除に失敗しました')
    }
  }

  const uploadDoc = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('doc_type', docType)
      await axios.post(`${apiUrl}/api/bids/${id}/documents`, fd, authConfig())
      showToast('success', '資料をアップロードしました')
      load()
    } catch (err) {
      showToast('error', err.response?.data?.error || 'アップロードに失敗しました')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const downloadDoc = async (docId) => {
    try {
      const res = await axios.get(`${apiUrl}/api/bids/${id}/documents/${docId}/url`, authConfig())
      window.open(res.data.url, '_blank', 'noopener,noreferrer')
    } catch {
      showToast('error', 'ダウンロードURLの取得に失敗しました')
    }
  }

  const deleteDoc = async (docId) => {
    if (!confirm('この資料を削除しますか？')) return
    try {
      await axios.delete(`${apiUrl}/api/bids/${id}/documents/${docId}`, authConfig())
      showToast('success', '資料を削除しました')
      load()
    } catch {
      showToast('error', '資料の削除に失敗しました')
    }
  }

  if (loading || !bid) {
    return (
      <ModalShell title="読み込み中..." onClose={onClose} wide>
        <div className="py-10 text-center text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin inline" />
        </div>
      </ModalShell>
    )
  }

  const winRatio = bid.budget_price > 0 && bid.awarded_price > 0
    ? `（対予定価格 ${((bid.awarded_price / bid.budget_price) * 100).toFixed(1)}%）`
    : ''

  const TABS = [
    { key: 'basic', label: '基本情報' },
    { key: 'money', label: '金額・結果' },
    { key: 'docs', label: `資料${bid.documents?.length ? ` (${bid.documents.length})` : ''}` },
    { key: 'history', label: '履歴' },
  ]

  return (
    <ModalShell title={bid.project_name} onClose={onClose} wide>
      {/* ステータス変更 */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <StatusBadge status={bid.status} />
        <select
          className="px-2 py-1 rounded-lg border border-slate-200 dark:border-ink-600 bg-white dark:bg-ink-700 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
          value={bid.status}
          onChange={(e) => changeStatus(e.target.value)}
        >
          {STATUS_DEFS.map((s) => <option key={s.key} value={s.key}>{s.label}に変更</option>)}
        </select>
        <div className="ml-auto flex gap-2">
          <Button variant="danger" size="sm" onClick={handleDelete}><Trash2 className="w-4 h-4" />削除</Button>
          <Button variant="secondary" size="sm" onClick={() => { onClose(); onEdit(bid) }}><Pencil className="w-4 h-4" />編集</Button>
        </div>
      </div>

      {/* タブ */}
      <div className="flex gap-1 border-b border-slate-100 dark:border-ink-700 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition
              ${tab === t.key
                ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'basic' && (
        <div>
          <Row label="発注者" value={bid.client_name} />
          <Row label="工事場所" value={bid.location} />
          <Row label="工種" value={bid.work_type} />
          <Row label="入札方式" value={bid.bid_method} />
          <Row label="担当" value={bid.staff_name} />
          <Row label="公告日" value={fmtDate(bid.notice_date)} />
          <Row label="質問期限" value={fmtDate(bid.question_due)} />
          <Row label="入札日" value={fmtDate(bid.bid_date)} />
          <Row label="開札日" value={fmtDate(bid.opening_date)} />
          {bid.note && (
            <div className="mt-3 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap bg-slate-50 dark:bg-ink-900/40 rounded-xl p-3">
              {bid.note}
            </div>
          )}
        </div>
      )}

      {tab === 'money' && (
        <div>
          <Row label="予定価格" value={bid.budget_price != null ? `¥${Number(bid.budget_price).toLocaleString()}` : '—'} />
          <Row label="自社見積" value={bid.our_estimate != null ? `¥${Number(bid.our_estimate).toLocaleString()}` : '—'} />
          <Row label="落札額" value={bid.awarded_price != null ? `¥${Number(bid.awarded_price).toLocaleString()} ${winRatio}` : '—'} />
          <Row label="落札業者" value={bid.awarded_company} />
        </div>
      )}

      {tab === 'docs' && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <select
              className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-ink-600 bg-white dark:bg-ink-700 text-xs text-slate-700 dark:text-slate-200"
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
            >
              {['設計書', '図面', '仕様書', 'その他'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 cursor-pointer">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? 'アップロード中...' : '資料を追加'}
              <input type="file" className="hidden" onChange={uploadDoc} disabled={uploading} />
            </label>
          </div>
          {(!bid.documents || bid.documents.length === 0) ? (
            <p className="text-sm text-slate-400 py-6 text-center">資料はまだありません</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-ink-700">
              {bid.documents.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-2.5">
                  <FileText className="w-4 h-4 text-brand-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800 dark:text-slate-200 truncate">{d.file_name}</p>
                    <p className="text-xs text-slate-400">{d.doc_type || 'その他'} ・ {fmtDate(d.created_at)}</p>
                  </div>
                  <button onClick={() => downloadDoc(d.id)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-ink-700" title="ダウンロード">
                    <Download className="w-4 h-4" />
                  </button>
                  <button onClick={() => deleteDoc(d.id)} className="p-1.5 rounded-lg text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-500/10" title="削除">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div>
          {(!bid.history || bid.history.length === 0) ? (
            <p className="text-sm text-slate-400 py-6 text-center">履歴はありません</p>
          ) : (
            <ul className="space-y-2">
              {bid.history.map((h) => (
                <li key={h.id} className="flex items-center gap-2 text-sm">
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-slate-400">{fmtDate(h.changed_at)}</span>
                  <span className="text-slate-700 dark:text-slate-300">
                    {h.from_status ? `${STATUS_MAP[h.from_status]?.label || h.from_status} → ` : ''}
                    {STATUS_MAP[h.to_status]?.label || h.to_status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </ModalShell>
  )
}

// ──────────────────────────────────────────────
// 分析タブ
// ──────────────────────────────────────────────
function StatCard({ label, value, sub }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">{label}</p>
      <p className="text-3xl font-extrabold text-slate-900 dark:text-white tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </Card>
  )
}

function AnalyticsTab({ showToast }) {
  const [period, setPeriod] = useState('fy')
  const [groupBy, setGroupBy] = useState('client')
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ period, group_by: groupBy })
    axios.get(`${apiUrl}/api/bids/stats?${params}`, authConfig())
      .then((res) => setStats(res.data))
      .catch(() => showToast('error', '集計の取得に失敗しました'))
      .finally(() => setLoading(false))
  }, [period, groupBy, showToast])

  if (loading || !stats) {
    return <div className="py-16 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin inline" /></div>
  }

  const s = stats.summary
  const maxTotal = Math.max(1, ...stats.by_group.map((g) => g.total))
  const groupLabel = { client: '発注者別', work_type: '工種別', staff: '担当者別' }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <select className={inputCls + ' w-auto'} value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="fy">今年度</option>
          <option value="cy">暦年</option>
        </select>
        <select className={inputCls + ' w-auto'} value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
          <option value="client">発注者別</option>
          <option value="work_type">工種別</option>
          <option value="staff">担当者別</option>
        </select>
        <span className="text-xs text-slate-400">対象: {fmtDate(stats.period.from)} 〜 {fmtDate(stats.period.to)}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="落札率（件数）"
          value={pct(s.win_rate_count.rate)}
          sub={`${s.win_rate_count.won}勝 / ${s.win_rate_count.lost}敗`}
        />
        <StatCard
          label="落札率（金額）"
          value={pct(s.win_rate_amount.rate)}
          sub={`${fmtYen(s.win_rate_amount.won_total)} / ${fmtYen(s.win_rate_amount.denom_total)}`}
        />
        <StatCard
          label="平均応札率"
          value={pct(s.avg_bid_ratio)}
          sub="落札時の対予定価格・平均"
        />
      </div>

      <Card className="p-6">
        <h3 className="font-bold text-slate-900 dark:text-white mb-4">{groupLabel[groupBy]} 落札率</h3>
        {stats.by_group.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">対象期間に確定した案件がありません</p>
        ) : (
          <div className="space-y-3">
            {stats.by_group.map((g) => (
              <div key={g.key}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-700 dark:text-slate-300 truncate">{g.key}</span>
                  <span className="text-slate-500 tabular-nums shrink-0 ml-2">{g.won}/{g.total} ・ {pct(g.win_rate)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-ink-700 overflow-hidden">
                  <div
                    className="h-full bg-brand-500 rounded-full"
                    style={{ width: `${(g.win_rate ?? 0) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

// ──────────────────────────────────────────────
// メインページ
// ──────────────────────────────────────────────
export default function BidsPage({ onBack }) {
  const [tab, setTab] = useState('list') // 'list' | 'analytics'
  const [bids, setBids] = useState([])
  const [loading, setLoading] = useState(true)
  const [staffList, setStaffList] = useState([])

  const [statusFilter, setStatusFilter] = useState('')
  const [staffFilter, setStaffFilter] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('bid_date')

  const [detailId, setDetailId] = useState(null)
  const [editing, setEditing] = useState(null) // {} = 新規 / item = 編集
  const [toast, setToast] = useState(null)

  const showToast = useCallback((type, msg) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const loadBids = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (staffFilter) params.set('staff_id', staffFilter)
      if (search.trim()) params.set('q', search.trim())
      if (sort) params.set('sort', sort)
      const res = await axios.get(`${apiUrl}/api/bids?${params}`, authConfig())
      setBids(res.data)
    } catch (err) {
      showToast('error', '案件の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, staffFilter, search, sort, showToast])

  useEffect(() => {
    // 担当ドロップダウン用に社員一覧を取得（マスターは認証不要のエンドポイント）
    axios.get(`${apiUrl}/api/masters/staff`)
      .then((res) => setStaffList(res.data || []))
      .catch(() => setStaffList([]))
  }, [])

  useEffect(() => {
    setLoading(true)
    loadBids()
  }, [loadBids])

  const today = todayStr()
  const in7 = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
  const NOT_YET = ['collecting', 'judging', 'estimating']

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-ink-950 transition-colors">
      <header className="bg-white/80 dark:bg-ink-900/80 backdrop-blur border-b border-slate-200 dark:border-ink-800 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />戻る
          </Button>
          <div className="flex items-center gap-2">
            <Gavel className="w-5 h-5 text-brand-500" />
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">入札案件管理</h1>
          </div>

          {/* タブ切替 */}
          <div className="ml-2 flex gap-1">
            <button
              onClick={() => setTab('list')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold transition
                ${tab === 'list' ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-ink-800'}`}
            >
              <ListChecks className="w-4 h-4" />案件一覧
            </button>
            <button
              onClick={() => setTab('analytics')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold transition
                ${tab === 'analytics' ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-ink-800'}`}
            >
              <BarChart3 className="w-4 h-4" />分析
            </button>
          </div>

          <div className="ml-auto">
            <Button variant="primary" size="sm" onClick={() => setEditing({})}>
              <Plus className="w-4 h-4" />新規登録
            </Button>
          </div>
        </div>
      </header>

      {toast && <Toast toast={toast} />}

      <main className="max-w-6xl mx-auto px-6 py-8">
        {tab === 'analytics' ? (
          <AnalyticsTab showToast={showToast} />
        ) : (
          <>
            {/* ツールバー */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="工事名・発注者で検索"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-ink-600 bg-white dark:bg-ink-700 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
              <select className={inputCls + ' w-auto'} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">全ステータス</option>
                {STATUS_DEFS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <select className={inputCls + ' w-auto'} value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)}>
                <option value="">全担当</option>
                {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select className={inputCls + ' w-auto'} value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="bid_date">入札日順</option>
                <option value="created_at">登録が新しい順</option>
                <option value="project_name">工事名順</option>
              </select>
            </div>

            {loading ? (
              <div className="text-center py-20">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600"></div>
                <p className="text-slate-500 dark:text-slate-400 mt-4">読み込み中...</p>
              </div>
            ) : bids.length === 0 ? (
              <div className="text-center py-16 text-slate-400 dark:text-slate-500">該当する案件がありません</div>
            ) : (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-400 border-b border-slate-100 dark:border-ink-700">
                        <th className="px-4 py-3 font-semibold">工事名</th>
                        <th className="px-4 py-3 font-semibold">発注者</th>
                        <th className="px-4 py-3 font-semibold whitespace-nowrap">入札日</th>
                        <th className="px-4 py-3 font-semibold">状態</th>
                        <th className="px-4 py-3 font-semibold">担当</th>
                        <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">自社見積</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-ink-700/60">
                      {bids.map((b) => {
                        const dueSoon = b.bid_date && NOT_YET.includes(b.status) && b.bid_date >= today && b.bid_date <= in7
                        const overdue = b.bid_date && NOT_YET.includes(b.status) && b.bid_date < today
                        return (
                          <tr
                            key={b.id}
                            onClick={() => setDetailId(b.id)}
                            className="cursor-pointer hover:bg-slate-50 dark:hover:bg-ink-700/30 transition"
                          >
                            <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200 max-w-[240px] truncate">{b.project_name}</td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{b.client_name || '—'}</td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`tabular-nums ${overdue ? 'text-danger-500 font-semibold' : dueSoon ? 'text-warning-600 dark:text-warning-400 font-semibold' : 'text-slate-600 dark:text-slate-400'}`}>
                                {(dueSoon || overdue) && <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />}
                                {fmtMD(b.bid_date)}
                              </span>
                            </td>
                            <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{b.staff_name || '—'}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{fmtYen(b.our_estimate)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        )}
      </main>

      {detailId && (
        <BidDetailModal
          id={detailId}
          onClose={() => setDetailId(null)}
          onEdit={(item) => setEditing(item)}
          onChanged={loadBids}
          showToast={showToast}
        />
      )}

      {editing !== null && (
        <BidFormModal
          item={editing?.id ? editing : null}
          staffList={staffList}
          onClose={() => setEditing(null)}
          onSaved={loadBids}
          showToast={showToast}
        />
      )}
    </div>
  )
}
