import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  ArrowLeft, Plus, X, Save, Search, Loader2, Building2, ListChecks,
  AlertTriangle, Clock, RotateCcw, ChevronRight, FolderOpen, Pencil,
  Paperclip, Trash2, Upload, ExternalLink, Gavel, Sparkles,
  BarChart3, FileSpreadsheet, ChevronDown,
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
function fmtYen(n) {
  if (n == null) return '—'
  return `¥${Math.round(n).toLocaleString('ja-JP')}`
}
function fmtPct(r) {
  if (r == null) return '—'
  return `${(r * 100).toFixed(1)}%`
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
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
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

  const isAdmin = stats?.role === 'admin'

  const deleteProject = useCallback(async (proj) => {
    if (!proj?.id) return
    const ok = window.confirm(
      `工事「${proj.project_name}」を削除します。\n` +
      'この工事と提出書類チェックリストは一覧から見えなくなります。\n\nよろしいですか？'
    )
    if (!ok) return
    try {
      await axios.delete(`${apiUrl}/api/construction/projects/${proj.id}`, authConfig())
      notify('工事を削除しました')
      setView('list'); setDetail(null); loadList()
    } catch (e) {
      notify(e.response?.data?.error || '削除に失敗しました', 'error')
    }
  }, [notify, loadList])

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
          isAdmin={isAdmin}
          onDelete={() => deleteProject(detail)}
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
function DetailBody({ detail, onReload, onEditDoc, onAddDoc, isAdmin, onDelete, notify }) {
  const docs = detail.documents || []
  const done = docs.filter((d) => ['submitted', 'approved', 'na'].includes(d.status)).length
  const [aiUploading, setAiUploading] = useState(false)

  const changeStatus = async (doc, status) => {
    try {
      await axios.patch(`${apiUrl}/api/construction/documents/${doc.id}`, { status }, authConfig())
      onReload()
    } catch (e) {
      notify(e.response?.data?.error || 'ステータス更新に失敗しました', 'error')
    }
  }

  // 書類をアップロード→Geminiが内容を読み取り、該当する提出書類へ自動で振り分けて添付
  const onAiUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAiUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const token = localStorage.getItem('authToken')
      const { data } = await axios.post(
        `${apiUrl}/api/construction/projects/${detail.id}/documents/auto-file`, fd,
        { headers: { Authorization: `Bearer ${token}` } })
      const c = data.classification
      const where = `${data.document.category_no}. ${data.document.category} ＞ ${data.document.doc_name}`
      notify(c
        ? `「${where}」に自動振り分けしました（確信度 ${Math.round((c.confidence || 0) * 100)}%）`
        : `「${where}」に添付しました（AI判定なし。種別をご確認ください）`)
      onReload()
    } catch (err) {
      notify(err.response?.data?.error || 'アップロードに失敗しました', 'error')
    } finally {
      setAiUploading(false)
      e.target.value = ''
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
          {detail.bid && (
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              <Gavel className="w-3 h-3" /> 入札連携: {detail.bid.project_name}
            </p>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-3">
          {detail.drive_folder_url && (
            <a href={detail.drive_folder_url} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline">
              <FolderOpen className="w-4 h-4" /> 共有フォルダ
            </a>
          )}
          {isAdmin && (
            <button onClick={onDelete} title="この工事を削除（管理者のみ）"
              className="flex items-center gap-1 text-xs font-semibold text-danger-600 dark:text-danger-400 hover:underline">
              <Trash2 className="w-4 h-4" /> 工事を削除
            </button>
          )}
        </div>
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

      <BoqSection detail={detail} notify={notify} onReload={onReload} />

      <div className="flex items-center justify-between mb-2 gap-3">
        <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">提出書類チェックリスト</h2>
        <div className="flex items-center gap-3 shrink-0">
          <label className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline cursor-pointer flex items-center gap-1" title="アップロードした書類の内容をAIが読み取り、該当する提出書類へ自動で振り分けます">
            {aiUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            AIで振り分けアップロード
            <input type="file" className="hidden" onChange={onAiUpload} disabled={aiUploading} />
          </label>
          <button onClick={onAddDoc} className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> 書類を追加
          </button>
        </div>
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

// ── 数量内訳・構成比率セクション ──
function BoqSection({ detail, notify, onReload }) {
  const [boq, setBoq] = useState(null)        // { rows, summary, total, imported_at }
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showItems, setShowItems] = useState(false)
  const [naModal, setNaModal] = useState(null) // NA候補（取込直後の承認用）

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await axios.get(`${apiUrl}/api/construction/projects/${detail.id}/boq`, authConfig())
      setBoq(data)
    } catch { /* noop */ } finally { setLoading(false) }
  }, [detail.id])

  useEffect(() => { load() }, [load])

  const onUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const token = localStorage.getItem('authToken')
      const { data } = await axios.post(
        `${apiUrl}/api/construction/projects/${detail.id}/import-boq`, fd,
        { headers: { Authorization: `Bearer ${token}` } })
      notify(`数量書を取込みました（明細 ${data.line_count} 件・総額 ${fmtYen(data.total)}）`)
      await load()
      if ((data.na_candidates || []).length > 0) setNaModal(data.na_candidates)
      else notify('数量書の工種に該当しない書類はありませんでした')
    } catch (err) {
      notify(err.response?.data?.error || '数量書の取込に失敗しました', 'error')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const summary = boq?.summary || []
  const maxRatio = summary.reduce((m, t) => Math.max(m, t.ratio || 0), 0) || 1

  // ── 階層ツリー（種目→科目→細目→別紙）の表示制御 ──
  const rows = boq?.rows || []
  const [expanded, setExpanded] = useState(() => new Set()) // 既定は全折りたたみ（上位のみ表示）
  const toggle = (path) => setExpanded((s) => {
    const n = new Set(s); n.has(path) ? n.delete(path) : n.add(path); return n
  })
  // 親（子を持つ path）の集合
  const parentSet = new Set()
  for (const r of rows) {
    if (!r.path) continue
    const parts = String(r.path).split('.')
    if (parts.length > 1) parentSet.add(parts.slice(0, -1).join('.'))
  }
  const isParent = (p) => p != null && parentSet.has(p)
  // 折りたたみを反映した可視ノード列
  const visible = []
  let hidePrefix = null
  for (const r of rows) {
    if (hidePrefix && r.path && String(r.path).startsWith(hidePrefix)) continue
    hidePrefix = null
    visible.push(r)
    if (isParent(r.path) && !expanded.has(r.path)) hidePrefix = r.path + '.'
  }
  // 小見出し帯（<撤去> や (地区名)）の差し込み位置を計算
  const treeItems = []
  let prevParent = null, prevGroup = null
  for (const r of visible) {
    const parent = r.path ? String(r.path).split('.').slice(0, -1).join('.') : ''
    if (r.group_label && !(parent === prevParent && r.group_label === prevGroup)) {
      treeItems.push({ band: true, key: `band-${r.id}`, level: r.level, label: r.group_label })
    }
    treeItems.push({ row: r, key: `row-${r.id}`, parent: isParent(r.path) })
    prevParent = parent; prevGroup = r.group_label || null
  }
  const nTane = rows.filter((r) => r.kind === '種目').length
  const nKamoku = rows.filter((r) => r.kind === '科目').length
  const nSaimoku = rows.filter((r) => r.kind === '細目').length
  const nBeppi = rows.filter((r) => r.kind === '別紙').length
  const expandAll = () => setExpanded(new Set(parentSet))
  const collapseAll = () => setExpanded(new Set())

  const kindStyle = {
    種目: 'font-bold text-slate-800 dark:text-slate-100 bg-slate-100/70 dark:bg-ink-700/60',
    共通費: 'font-bold text-slate-700 dark:text-slate-200 bg-amber-50/70 dark:bg-amber-900/20',
    科目: 'font-semibold text-slate-700 dark:text-slate-200',
    細目: 'text-slate-700 dark:text-slate-200',
    別紙: 'text-slate-400 dark:text-slate-400',
  }

  return (
    <Card className="px-4 py-3 mb-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4 text-brand-500" /> 数量内訳・構成比率
        </span>
        <label className="shrink-0 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline cursor-pointer flex items-center gap-1"
          title="数量書(内訳書 .xlsx)を取込み、工事内容・数量・金額を保存して工種別の構成比率を算出します">
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
          {boq?.imported_at ? '数量書を再取込' : '数量書(xlsx)を取込'}
          <input type="file" accept=".xlsx,.xlsm" className="hidden" onChange={onUpload} disabled={uploading} />
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
      ) : !boq?.imported_at ? (
        <p className="text-xs text-slate-400 py-2">
          数量書(内訳書)を取込むと、工種別の構成比率を算出し、数量書に無い工種の施工計画書などをチェックリストから対象外にできます。
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mb-3">
            <span>直接工事費 <span className="font-bold text-slate-800 dark:text-slate-100 tabular-nums">{fmtYen(boq.total)}</span></span>
            <span>種目 {nTane} / 科目 {nKamoku} / 細目 {nSaimoku}{nBeppi ? ` / 別紙 ${nBeppi}` : ''}</span>
            <span>取込 {fmtDate(boq.imported_at)}</span>
          </div>

          {/* 工種別 構成比率（科目名そのまま・その他で括らない） */}
          <div className="space-y-1.5">
            {summary.map((t) => (
              <div key={t.trade} className="flex items-center gap-2">
                <span className="w-28 shrink-0 text-xs text-slate-600 dark:text-slate-300 truncate" title={t.canonical && t.canonical !== t.trade ? `${t.trade}（${t.canonical}）` : t.trade}>{t.trade}</span>
                <div className="flex-1 h-4 rounded bg-slate-100 dark:bg-ink-700 overflow-hidden">
                  <div className="h-full bg-brand-500/80 rounded" style={{ width: `${((t.ratio || 0) / maxRatio) * 100}%` }} />
                </div>
                <span className="w-14 shrink-0 text-right text-xs font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                  {fmtPct(t.ratio)}
                </span>
                <span className="w-24 shrink-0 text-right text-[11px] text-slate-400 tabular-nums">{fmtYen(t.amount)}</span>
              </div>
            ))}
          </div>

          {/* 内訳ツリー（種目→科目→細目→別紙：Excel の表記・順序のまま）*/}
          <div className="mt-3 flex items-center justify-between">
            <button onClick={() => setShowItems((s) => !s)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1">
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showItems ? 'rotate-180' : ''}`} />
              内訳を{showItems ? '隠す' : '表示'}
            </button>
            {showItems && (
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <button onClick={expandAll} className="hover:text-slate-600 dark:hover:text-slate-200">すべて展開</button>
                <span>/</span>
                <button onClick={collapseAll} className="hover:text-slate-600 dark:hover:text-slate-200">折りたたむ</button>
              </div>
            )}
          </div>
          {showItems && (
            <div className="mt-2 max-h-96 overflow-y-auto rounded-xl border border-slate-200 dark:border-ink-700 divide-y divide-slate-100 dark:divide-ink-700/70">
              {treeItems.map((it) => it.band ? (
                <div key={it.key} className="px-2 py-1 text-[11px] font-medium text-slate-400 dark:text-slate-500 bg-slate-50/60 dark:bg-ink-700/40"
                  style={{ paddingLeft: `${0.5 + it.level * 1.1}rem` }}>
                  {it.label}
                </div>
              ) : (
                <div key={it.key}
                  className={`flex items-start gap-1.5 px-2 py-1.5 text-xs ${kindStyle[it.row.kind] || ''} ${it.parent ? 'cursor-pointer' : ''}`}
                  style={{ paddingLeft: `${0.5 + it.row.level * 1.1}rem` }}
                  onClick={it.parent ? () => toggle(it.row.path) : undefined}>
                  <span className="w-3.5 shrink-0 pt-0.5">
                    {it.parent ? <ChevronRight className={`w-3.5 h-3.5 transition-transform ${expanded.has(it.row.path) ? 'rotate-90' : ''}`} /> : null}
                  </span>
                  <span className="flex-1 min-w-0">
                    {it.row.item_name}
                    {it.row.spec ? <span className="text-slate-400"> ／ {it.row.spec}</span> : ''}
                    {it.row.beppi_no && it.row.kind === '細目' ? <span className="ml-1 text-[10px] text-brand-500/80">別紙{it.row.beppi_no}</span> : ''}
                  </span>
                  <span className="w-20 shrink-0 text-right tabular-nums text-slate-500 dark:text-slate-400">
                    {it.row.quantity != null ? `${Number(it.row.quantity).toLocaleString('ja-JP')}${it.row.unit || ''}` : ''}
                  </span>
                  <span className="w-24 shrink-0 text-right tabular-nums">
                    {it.row.amount != null ? fmtYen(it.row.amount) : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {naModal && (
        <NaConfirmModal
          projectId={detail.id}
          candidates={naModal}
          onClose={() => setNaModal(null)}
          onApplied={(n) => { setNaModal(null); notify(`${n} 件を対象外にしました`); onReload() }}
          onError={(m) => notify(m, 'error')}
        />
      )}
    </Card>
  )
}

// ── 不要書類の対象外(na)化 承認モーダル ──
function NaConfirmModal({ projectId, candidates, onClose, onApplied, onError }) {
  const [checked, setChecked] = useState(() => new Set(candidates.map((c) => c.id)))
  const [saving, setSaving] = useState(false)
  const toggle = (id) => setChecked((s) => {
    const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n
  })

  // 工種ごとにグループ表示
  const groups = {}
  for (const c of candidates) (groups[c.trade] = groups[c.trade] || []).push(c)

  const apply = async () => {
    setSaving(true)
    try {
      const ids = [...checked]
      const { data } = await axios.post(
        `${apiUrl}/api/construction/projects/${projectId}/apply-checklist-filter`,
        { document_ids: ids }, authConfig())
      onApplied(data.updated ?? ids.length)
    } catch (e) {
      onError(e.response?.data?.error || '適用に失敗しました')
    } finally { setSaving(false) }
  }

  return (
    <ModalShell title="数量書に無い工種の書類を対象外にしますか？" onClose={onClose} wide>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        取込んだ数量書に該当工種が見当たらない書類です。チェックした書類を「対象外(na)」にします
        （削除ではありません。後からステータスを戻せば復活します）。
      </p>
      <div className="max-h-96 overflow-y-auto space-y-3">
        {Object.keys(groups).sort().map((trade) => (
          <div key={trade}>
            <div className="flex items-center gap-2 mb-1">
              <Badge tone="neutral">{trade}</Badge>
              <span className="text-[11px] text-slate-400">{groups[trade].length} 件</span>
            </div>
            <div className="border border-slate-200 dark:border-ink-700 rounded-xl divide-y divide-slate-100 dark:divide-ink-700">
              {groups[trade].map((c) => (
                <label key={c.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer">
                  <input type="checkbox" checked={checked.has(c.id)} onChange={() => toggle(c.id)} />
                  <span className="text-xs text-slate-400 w-8 shrink-0">{c.category_no}.</span>
                  <span className="text-sm text-slate-700 dark:text-slate-200 truncate">{c.doc_name}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-5">
        <span className="text-xs text-slate-500">{checked.size} / {candidates.length} 件を選択中</span>
        <div className="flex gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-ink-700">キャンセル</button>
          <Button onClick={apply} disabled={saving || checked.size === 0}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <>対象外にする（{checked.size}件）</>}
          </Button>
        </div>
      </div>
    </ModalShell>
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
          {doc.files?.some((f) => f.source && f.source !== 'manual') && (
            <span className="text-[11px] text-brand-600 dark:text-brand-400 flex items-center gap-0.5" title="AIが自動で振り分けた書類を含みます。種別をご確認ください">
              <Sparkles className="w-3 h-3" />AI振分
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
  const [aiBusy, setAiBusy] = useState(false)
  const [aiMsg, setAiMsg] = useState('')
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  // 契約・設計図書などをアップロード→Geminiが工事情報を読み取り、空欄を自動入力
  const onAiPrefill = async (e) => {
    const files = e.target.files
    if (!files || !files.length) return
    setAiBusy(true); setAiMsg('')
    try {
      const fd = new FormData()
      for (const file of files) fd.append('files', file)
      const token = localStorage.getItem('authToken')
      const { data } = await axios.post(`${apiUrl}/api/construction/extract-info`, fd,
        { headers: { Authorization: `Bearer ${token}` } })
      const x = data.fields || {}
      // 空欄のみ補完（既入力は尊重）。発注者・工種・区分は読み取れた値があれば反映。
      setF((s) => ({
        ...s,
        project_name: s.project_name || x.project_name || '',
        project_code: s.project_code || x.project_code || '',
        client_org: x.client_org || s.client_org,
        construction_type: x.construction_type || s.construction_type,
        work_category: x.work_category || s.work_category,
        location: s.location || x.location || '',
        contract_amount: s.contract_amount || (x.contract_amount != null ? String(x.contract_amount) : ''),
        contract_date: s.contract_date || x.contract_date || '',
        start_date: s.start_date || x.start_date || '',
        end_date: s.end_date || x.end_date || '',
        completion_inspection_date: s.completion_inspection_date || x.completion_inspection_date || '',
      }))
      setAiMsg(`書類から読み取りました：${(data.used_files || []).join('、')}（内容をご確認ください）`)
    } catch (err) {
      onError(err.response?.data?.error || 'AI読み取りに失敗しました')
    } finally {
      setAiBusy(false)
      e.target.value = ''
    }
  }

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
      {/* 書類からAI自動入力（契約・設計図書をアップロードすると工事情報を読み取る） */}
      <div className="mb-4 rounded-xl border border-brand-200 dark:border-brand-500/30 bg-brand-50 dark:bg-brand-500/10 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-slate-600 dark:text-slate-300">
            <span className="font-semibold text-brand-700 dark:text-brand-300 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />書類から自動入力
            </span>
            契約書・設計図書・特記仕様書などをアップロードすると、工事名・契約日・工期などをAIが読み取ります。
          </div>
          <label className="shrink-0 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline cursor-pointer flex items-center gap-1">
            {aiBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            書類を選択
            <input type="file" multiple className="hidden" onChange={onAiPrefill} disabled={aiBusy} />
          </label>
        </div>
        {aiMsg && <p className="mt-2 text-[11px] text-success-700 dark:text-success-300">{aiMsg}</p>}
      </div>
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
