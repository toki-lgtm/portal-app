import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  ArrowLeft, Plus, X, Save, Search, Loader2, Building2, ListChecks,
  AlertTriangle, Clock, RotateCcw, ChevronRight, FolderOpen, Pencil,
  Paperclip, Trash2, Upload, ExternalLink,
} from 'lucide-react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000'

// 工事ステータス
const PROJ_STATUS = [
  { key: 'preparing', label: '着手準備', tone: 'neutral' },
  { key: 'in_progress', label: '施工中', tone: 'info' },
  { key: 'inspecting', label: '検査中', tone: 'warning' },
  { key: 'completed', label: '完成・引渡済', tone: 'success' },
  { key: 'archived', label: '保管', tone: 'neutral' },
]
const PROJ_STATUS_MAP = Object.fromEntries(PROJ_STATUS.map((s) => [s.key, s]))

// 提出書類ステータス（順序＝標準フロー）
const DOC_STATUS = [
  { key: 'not_started', label: '未着手', tone: 'neutral' },
  { key: 'drafting', label: '作成中', tone: 'info' },
  { key: 'internal_review', label: '社内確認', tone: 'warning' },
  { key: 'submitted', label: '提出済', tone: 'info' },
  { key: 'approved', label: '承認', tone: 'success' },
  { key: 'rejected', label: '差戻し', tone: 'danger' },
  { key: 'na', label: '対象外', tone: 'neutral' },
]
const DOC_STATUS_MAP = Object.fromEntries(DOC_STATUS.map((s) => [s.key, s]))

// 大分類（業務フェーズ）
const CATEGORIES = [
  { no: 1, name: '契約・設計図書' },
  { no: 2, name: '着手・届出' },
  { no: 3, name: '施工計画' },
  { no: 4, name: '施工管理' },
  { no: 5, name: '品質・出来形' },
  { no: 6, name: '安全・環境' },
  { no: 7, name: '工事写真' },
  { no: 8, name: '検査' },
  { no: 9, name: '完成・引渡・電子納品' },
]

const CONSTRUCTION_TYPES = ['建築', '土木', '電気', '機械', 'その他']
const WORK_CATEGORIES = ['新設', '改修', 'その他']

function authConfig() {
  const token = localStorage.getItem('authToken')
  return { headers: { Authorization: `Bearer ${token}` } }
}
function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(d)
  return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()}`
}
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtBytes(b) {
  if (b == null) return ''
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)}MB`
  if (b >= 1024) return `${Math.round(b / 1024)}KB`
  return `${b}B`
}
// 締切の状態（期限超過 / 間近14日 / 通常）
function dueState(due) {
  if (!due) return 'none'
  const today = todayStr()
  if (due < today) return 'overdue'
  const d = new Date(today); d.setDate(d.getDate() + 14)
  const soon = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  if (due <= soon) return 'soon'
  return 'ok'
}

const inputCls = 'w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-ink-600 bg-white dark:bg-ink-700 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-60'

function Toast({ toast }) {
  if (!toast) return null
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-semibold
      ${toast.type === 'success'
        ? 'bg-success-100 dark:bg-success-500/20 text-success-700 dark:text-success-300 border border-success-200 dark:border-success-500/30'
        : 'bg-danger-100 dark:bg-danger-500/20 text-danger-700 dark:text-danger-300 border border-danger-200 dark:border-danger-500/30'}`}>
      {toast.msg}
    </div>
  )
}

function ModalShell({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className={`bg-white dark:bg-ink-800 rounded-2xl shadow-xl border border-slate-200 dark:border-ink-700 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} my-8`}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-ink-700 sticky top-0 bg-white dark:bg-ink-800 rounded-t-2xl z-10">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-ink-700">
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

function ProjStatusBadge({ status }) {
  const def = PROJ_STATUS_MAP[status] || { label: status, tone: 'neutral' }
  return <Badge tone={def.tone}>{def.label}</Badge>
}

// ── 進捗バー ──
function ProgressBar({ done, total }) {
  const rate = total ? Math.round((done / total) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-ink-600 overflow-hidden">
        <div className="h-full bg-brand-500 rounded-full" style={{ width: `${rate}%` }} />
      </div>
      <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">{done}/{total}</span>
    </div>
  )
}

export default function ConstructionPage({ onBack }) {
  const [view, setView] = useState('list') // 'list' | 'detail'
  const [projects, setProjects] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [editDoc, setEditDoc] = useState(null)
  const [addDocOpen, setAddDocOpen] = useState(false)
  const [toast, setToast] = useState(null)

  const notify = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2600)
  }, [])

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const [p, s] = await Promise.all([
        axios.get(`${apiUrl}/api/construction/projects`, authConfig()),
        axios.get(`${apiUrl}/api/construction/stats`, authConfig()),
      ])
      setProjects(p.data || [])
      setStats(s.data || null)
    } catch (e) {
      notify(e.response?.data?.error || '読み込みに失敗しました', 'error')
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => { loadList() }, [loadList])

  const openDetail = useCallback(async (id) => {
    setDetailLoading(true); setView('detail')
    try {
      const { data } = await axios.get(`${apiUrl}/api/construction/projects/${id}`, authConfig())
      setDetail(data)
    } catch (e) {
      notify(e.response?.data?.error || '工事の取得に失敗しました', 'error')
      setView('list')
    } finally {
      setDetailLoading(false)
    }
  }, [notify])

  const reloadDetail = useCallback(async () => {
    if (!detail?.id) return
    try {
      const { data } = await axios.get(`${apiUrl}/api/construction/projects/${detail.id}`, authConfig())
      setDetail(data)
    } catch { /* noop */ }
  }, [detail?.id])

  const filtered = projects.filter((p) => {
    if (!q) return true
    const n = q.toLowerCase()
    return (p.project_name || '').toLowerCase().includes(n) || (p.location || '').toLowerCase().includes(n)
  })

  // ── 一覧ビュー ──
  if (view === 'list') {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-ink-700">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-brand-500" /> 工事管理
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">九州防衛局 建築工事 ／ 提出書類・検査書類の進捗</p>
            </div>
          </div>
          <Button onClick={() => setShowNew(true)}><Plus className="w-4 h-4 mr-1" />工事を追加</Button>
        </div>

        {/* KPI */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <KpiCard icon={<Building2 className="w-4 h-4" />} label="進行中の工事" value={stats.active_projects} tone="info" />
            <KpiCard icon={<AlertTriangle className="w-4 h-4" />} label="期限超過" value={stats.overdue} tone="danger" />
            <KpiCard icon={<Clock className="w-4 h-4" />} label="締切間近(14日)" value={stats.due_soon} tone="warning" />
            <KpiCard icon={<RotateCcw className="w-4 h-4" />} label="差戻し" value={stats.rejected} tone="danger" />
          </div>
        )}

        <div className="relative mb-4">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={inputCls + ' pl-9'} placeholder="工事名・場所で検索" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
        ) : filtered.length === 0 ? (
          <Card className="text-center py-12 text-slate-500 dark:text-slate-400">
            工事がありません。「工事を追加」から登録してください。
          </Card>
        ) : (
          <div className="grid gap-3">
            {filtered.map((p) => (
              <button key={p.id} onClick={() => openDetail(p.id)}
                className="text-left bg-white dark:bg-ink-800 rounded-2xl border border-slate-200 dark:border-ink-700 px-5 py-4 hover:border-brand-300 dark:hover:border-brand-500/50 transition">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <ProjStatusBadge status={p.status} />
                      <Badge tone="neutral">{p.construction_type}・{p.work_category}</Badge>
                    </div>
                    <h3 className="font-bold text-slate-900 dark:text-white truncate">{p.project_name}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {p.location || '場所未設定'}{p.site_agent_name ? ` ／ 現場代理人: ${p.site_agent_name}` : ''}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 shrink-0 mt-1" />
                </div>
                <div className="mt-3"><ProgressBar done={p.doc_done} total={p.doc_total} /></div>
              </button>
            ))}
          </div>
        )}

        {showNew && (
          <NewProjectModal
            onClose={() => setShowNew(false)}
            onCreated={(msg) => { setShowNew(false); notify(msg); loadList() }}
            onError={(m) => notify(m, 'error')}
          />
        )}
        <Toast toast={toast} />
      </div>
    )
  }

  // ── 詳細ビュー ──
  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <button onClick={() => { setView('list'); setDetail(null); loadList() }}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4">
        <ArrowLeft className="w-4 h-4" /> 工事一覧へ
      </button>

      {detailLoading || !detail ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : (
        <DetailBody
          detail={detail}
          onReload={reloadDetail}
          onEditDoc={(d) => setEditDoc(d)}
          onAddDoc={() => setAddDocOpen(true)}
          notify={notify}
        />
      )}

      {editDoc && (
        <EditDocModal doc={editDoc} onClose={() => setEditDoc(null)}
          onSaved={() => { setEditDoc(null); reloadDetail(); notify('更新しました') }}
          onError={(m) => notify(m, 'error')} />
      )}
      {addDocOpen && detail && (
        <AddDocModal projectId={detail.id} onClose={() => setAddDocOpen(false)}
          onAdded={() => { setAddDocOpen(false); reloadDetail(); notify('書類を追加しました') }}
          onError={(m) => notify(m, 'error')} />
      )}
      <Toast toast={toast} />
    </div>
  )
}

function KpiCard({ icon, label, value, tone }) {
  const toneCls = {
    info: 'text-brand-600 dark:text-brand-400',
    danger: 'text-danger-600 dark:text-danger-400',
    warning: 'text-warning-600 dark:text-warning-400',
  }[tone] || 'text-slate-600'
  return (
    <Card className="px-4 py-3">
      <div className={`flex items-center gap-1.5 text-xs font-semibold ${toneCls}`}>{icon}{label}</div>
      <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">{value ?? '—'}</div>
    </Card>
  )
}

// ── 詳細本体（工事メタ＋フェーズ別書類チェックリスト）──
function DetailBody({ detail, onReload, onEditDoc, onAddDoc, notify }) {
  const docs = detail.documents || []
  const done = docs.filter((d) => ['submitted', 'approved', 'na'].includes(d.status)).length

  const changeStatus = async (doc, status) => {
    try {
      await axios.patch(`${apiUrl}/api/construction/documents/${doc.id}`, { status }, authConfig())
      onReload()
    } catch (e) {
      notify(e.response?.data?.error || 'ステータス更新に失敗しました', 'error')
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ProjStatusBadge status={detail.status} />
            <Badge tone="neutral">{detail.construction_type}・{detail.work_category}</Badge>
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{detail.project_name}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {detail.client_org}{detail.location ? ` ／ ${detail.location}` : ''}
          </p>
        </div>
        {detail.drive_folder_url && (
          <a href={detail.drive_folder_url} target="_blank" rel="noreferrer"
            className="shrink-0 flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline">
            <FolderOpen className="w-4 h-4" /> 共有フォルダ
          </a>
        )}
      </div>

      <Card className="px-4 py-3 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-y-2 gap-x-4 text-sm">
          <Meta label="工事番号" value={detail.project_code} />
          <Meta label="契約日" value={fmtDate(detail.contract_date)} />
          <Meta label="工期" value={`${fmtDate(detail.start_date)} 〜 ${fmtDate(detail.end_date)}`} />
          <Meta label="完成検査(予定)" value={fmtDate(detail.completion_inspection_date)} />
          <Meta label="現場代理人" value={detail.site_agent_name} />
          <Meta label="監理技術者" value={detail.chief_engineer_name} />
        </div>
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-ink-700">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1">
              <ListChecks className="w-4 h-4" /> 提出書類の進捗
            </span>
            <span className="text-xs text-slate-500">{done}/{docs.length} 完了</span>
          </div>
          <ProgressBar done={done} total={docs.length} />
        </div>
      </Card>

      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">提出書類チェックリスト</h2>
        <button onClick={onAddDoc} className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" /> 書類を追加
        </button>
      </div>

      {docs.length === 0 ? (
        <Card className="text-center py-8 text-slate-500 dark:text-slate-400 text-sm">書類がありません。</Card>
      ) : (
        <div className="space-y-4">
          {CATEGORIES.map((cat) => {
            const rows = docs.filter((d) => d.category_no === cat.no)
            if (rows.length === 0) return null
            const catDone = rows.filter((d) => ['submitted', 'approved', 'na'].includes(d.status)).length
            return (
              <div key={cat.no}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-bold text-white bg-brand-500 rounded-md w-5 h-5 flex items-center justify-center">{cat.no}</span>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">{cat.name}</h3>
                  <span className="text-xs text-slate-400">{catDone}/{rows.length}</span>
                </div>
                <div className="bg-white dark:bg-ink-800 rounded-xl border border-slate-200 dark:border-ink-700 divide-y divide-slate-100 dark:divide-ink-700">
                  {rows.map((d) => (
                    <DocRow key={d.id} doc={d} onChangeStatus={changeStatus} onEdit={() => onEditDoc(d)} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Meta({ label, value }) {
  return (
    <div>
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="text-slate-800 dark:text-slate-200">{value || '—'}</div>
    </div>
  )
}

function DocRow({ doc, onChangeStatus, onEdit }) {
  const ds = dueState(doc.due_date)
  const dueCls = ds === 'overdue' ? 'text-danger-600 dark:text-danger-400 font-semibold'
    : ds === 'soon' ? 'text-warning-600 dark:text-warning-400 font-semibold'
      : 'text-slate-500 dark:text-slate-400'
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-800 dark:text-slate-200 truncate">{doc.doc_name}</span>
          {doc.trade && doc.trade !== '共通' && <Badge tone="neutral">{doc.trade}</Badge>}
          {doc.form_no && <span className="text-[11px] text-slate-400">様式#{doc.form_no}</span>}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className={`text-xs ${dueCls}`}>{doc.due_date ? `締切 ${fmtDate(doc.due_date)}` : '締切—'}</span>
          {doc.assignee_name && <span className="text-xs text-slate-400">担当 {doc.assignee_name}</span>}
          {doc.files?.length > 0 && (
            <span className="text-xs text-success-600 dark:text-success-400 flex items-center gap-0.5">
              <Paperclip className="w-3 h-3" />{doc.files.length}
            </span>
          )}
        </div>
      </div>
      <select
        value={doc.status}
        onChange={(e) => onChangeStatus(doc, e.target.value)}
        className="text-xs px-2 py-1 rounded-lg border border-slate-200 dark:border-ink-600 bg-white dark:bg-ink-700 text-slate-700 dark:text-slate-200">
        {DOC_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
      <button onClick={onEdit} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-ink-700">
        <Pencil className="w-4 h-4" />
      </button>
    </div>
  )
}

// ── 新規工事モーダル ──
function NewProjectModal({ onClose, onCreated, onError }) {
  const [f, setF] = useState({
    project_name: '', project_code: '', client_org: '九州防衛局',
    construction_type: '建築', work_category: '新設', location: '',
    contract_amount: '', contract_date: '', start_date: '', end_date: '',
    completion_inspection_date: '', drive_folder_url: '',
  })
  const [genChecklist, setGenChecklist] = useState(true)
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  const submit = async () => {
    if (!f.project_name.trim()) { onError('工事名は必須です'); return }
    setSaving(true)
    try {
      const payload = { ...f, generate_checklist: genChecklist }
      const { data } = await axios.post(`${apiUrl}/api/construction/projects`, payload, authConfig())
      onCreated(`工事を登録しました（書類 ${data.generated_documents || 0} 件を自動生成）`)
    } catch (e) {
      onError(e.response?.data?.error || '登録に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title="工事を追加" onClose={onClose} wide>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2"><Field label="工事名 *"><input className={inputCls} value={f.project_name} onChange={set('project_name')} placeholder="○○(6)庁舎新設等建築工事" /></Field></div>
        <Field label="工事番号"><input className={inputCls} value={f.project_code} onChange={set('project_code')} /></Field>
        <Field label="発注者"><input className={inputCls} value={f.client_org} onChange={set('client_org')} /></Field>
        <Field label="工種大別"><select className={inputCls} value={f.construction_type} onChange={set('construction_type')}>{CONSTRUCTION_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="工事区分"><select className={inputCls} value={f.work_category} onChange={set('work_category')}>{WORK_CATEGORIES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <div className="md:col-span-2"><Field label="工事場所"><input className={inputCls} value={f.location} onChange={set('location')} placeholder="○○駐屯地 等" /></Field></div>
        <Field label="契約金額(円)"><input className={inputCls} type="number" value={f.contract_amount} onChange={set('contract_amount')} /></Field>
        <Field label="契約日"><input className={inputCls} type="date" value={f.contract_date} onChange={set('contract_date')} /></Field>
        <Field label="着工日"><input className={inputCls} type="date" value={f.start_date} onChange={set('start_date')} /></Field>
        <Field label="工期末"><input className={inputCls} type="date" value={f.end_date} onChange={set('end_date')} /></Field>
        <Field label="完成検査(予定)日"><input className={inputCls} type="date" value={f.completion_inspection_date} onChange={set('completion_inspection_date')} /></Field>
        <div className="md:col-span-2"><Field label="共有ドライブの工事フォルダURL"><input className={inputCls} value={f.drive_folder_url} onChange={set('drive_folder_url')} placeholder="https://drive.google.com/..." /></Field></div>
      </div>
      <label className="flex items-center gap-2 mt-4 text-sm text-slate-700 dark:text-slate-200">
        <input type="checkbox" checked={genChecklist} onChange={(e) => setGenChecklist(e.target.checked)} />
        必要書類チェックリストを自動生成する（契約日・着工日・完成検査日から締切も自動計算）
      </label>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="px-4 py-2 text-sm rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-ink-700">キャンセル</button>
        <Button onClick={submit} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" />登録</>}</Button>
      </div>
    </ModalShell>
  )
}

// ── 書類の編集（締切・担当ファイル参照・メモ）──
function EditDocModal({ doc, onClose, onSaved, onError }) {
  const [f, setF] = useState({
    status: doc.status, due_date: doc.due_date || '', file_ref: doc.file_ref || '',
    submitted_at: doc.submitted_at || '', approved_at: doc.approved_at || '', note: doc.note || '',
  })
  const [saving, setSaving] = useState(false)
  const [files, setFiles] = useState(doc.files || [])
  const [uploading, setUploading] = useState(false)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  const submit = async () => {
    setSaving(true)
    try {
      await axios.patch(`${apiUrl}/api/construction/documents/${doc.id}`, f, authConfig())
      onSaved()
    } catch (e) {
      onError(e.response?.data?.error || '更新に失敗しました')
    } finally { setSaving(false) }
  }

  const onUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const token = localStorage.getItem('authToken')
      const { data } = await axios.post(
        `${apiUrl}/api/construction/documents/${doc.id}/files`, fd,
        { headers: { Authorization: `Bearer ${token}` } })
      setFiles((s) => [...s, data])
    } catch (err) {
      onError(err.response?.data?.error || 'アップロードに失敗しました')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const onDeleteFile = async (id) => {
    try {
      await axios.delete(`${apiUrl}/api/construction/files/${id}`, authConfig())
      setFiles((s) => s.filter((x) => x.id !== id))
    } catch (err) {
      onError(err.response?.data?.error || '削除に失敗しました')
    }
  }

  return (
    <ModalShell title={doc.doc_name} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="ステータス"><select className={inputCls} value={f.status} onChange={set('status')}>{DOC_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
        <Field label="締切"><input className={inputCls} type="date" value={f.due_date} onChange={set('due_date')} /></Field>
        <Field label="提出日"><input className={inputCls} type="date" value={f.submitted_at} onChange={set('submitted_at')} /></Field>
        <Field label="承認日"><input className={inputCls} type="date" value={f.approved_at} onChange={set('approved_at')} /></Field>
        <div className="col-span-2"><Field label="ファイル参照（共有ドライブのURL/パス）"><input className={inputCls} value={f.file_ref} onChange={set('file_ref')} placeholder="https://drive.google.com/... または \\\\server\\..." /></Field></div>
        <div className="col-span-2"><Field label="メモ"><textarea className={inputCls} rows={2} value={f.note} onChange={set('note')} /></Field></div>
      </div>

      {/* 添付ファイル（共有ドライブ保存） */}
      <div className="mt-5 pt-4 border-t border-slate-100 dark:border-ink-700">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1">
            <Paperclip className="w-4 h-4" /> 添付ファイル（共有ドライブ）
          </span>
          <label className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline cursor-pointer flex items-center gap-1">
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            アップロード
            <input type="file" className="hidden" onChange={onUpload} disabled={uploading} />
          </label>
        </div>
        {files.length === 0 ? (
          <p className="text-xs text-slate-400 py-2">ファイルはまだありません。</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-ink-700 border border-slate-200 dark:border-ink-700 rounded-xl">
            {files.map((file) => (
              <li key={file.id} className="flex items-center gap-2 px-3 py-2">
                <Paperclip className="w-4 h-4 text-slate-400 shrink-0" />
                <a href={file.url} target="_blank" rel="noreferrer"
                  className="text-sm text-brand-600 dark:text-brand-400 hover:underline truncate flex-1 flex items-center gap-1">
                  {file.file_name}<ExternalLink className="w-3 h-3 shrink-0" />
                </a>
                {file.size_bytes != null && <span className="text-[11px] text-slate-400 shrink-0">{fmtBytes(file.size_bytes)}</span>}
                <button onClick={() => onDeleteFile(file.id)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-danger-500 hover:bg-slate-100 dark:hover:bg-ink-700 shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="px-4 py-2 text-sm rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-ink-700">閉じる</button>
        <Button onClick={submit} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" />保存</>}</Button>
      </div>
    </ModalShell>
  )
}

// ── 書類の手動追加 ──
function AddDocModal({ projectId, onClose, onAdded, onError }) {
  const [f, setF] = useState({ category_no: 4, doc_name: '', subcategory: '', trade: '共通', due_date: '' })
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  const submit = async () => {
    if (!f.doc_name.trim()) { onError('書類名は必須です'); return }
    setSaving(true)
    try {
      const cat = CATEGORIES.find((c) => c.no === Number(f.category_no))
      await axios.post(`${apiUrl}/api/construction/projects/${projectId}/documents`, {
        category_no: Number(f.category_no), category: cat?.name || '',
        subcategory: f.subcategory, doc_name: f.doc_name, trade: f.trade, due_date: f.due_date || null,
      }, authConfig())
      onAdded()
    } catch (e) {
      onError(e.response?.data?.error || '追加に失敗しました')
    } finally { setSaving(false) }
  }

  return (
    <ModalShell title="書類を追加" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="大分類"><select className={inputCls} value={f.category_no} onChange={set('category_no')}>{CATEGORIES.map((c) => <option key={c.no} value={c.no}>{c.no}. {c.name}</option>)}</select></Field>
        <Field label="工種"><input className={inputCls} value={f.trade} onChange={set('trade')} /></Field>
        <div className="col-span-2"><Field label="書類名 *"><input className={inputCls} value={f.doc_name} onChange={set('doc_name')} /></Field></div>
        <Field label="中分類"><input className={inputCls} value={f.subcategory} onChange={set('subcategory')} /></Field>
        <Field label="締切"><input className={inputCls} type="date" value={f.due_date} onChange={set('due_date')} /></Field>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="px-4 py-2 text-sm rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-ink-700">キャンセル</button>
        <Button onClick={submit} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" />追加</>}</Button>
      </div>
    </ModalShell>
  )
}
