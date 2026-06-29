import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  ArrowLeft, Plus, X, Save, Search, Loader2, Building2, ListChecks,
  AlertTriangle, Clock, RotateCcw, ChevronRight, FolderOpen, Pencil,
  Paperclip, Trash2, Upload, ExternalLink, Gavel, Sparkles,
  BarChart3, FileSpreadsheet, ChevronDown, GitBranch, CheckCircle2, RefreshCw,
  Camera,
} from 'lucide-react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import Toast from './ui/Toast'
import ModalShell from './ui/ModalShell'
import Field from './ui/Field'
import { API_URL as apiUrl, authConfig } from '../lib/api'
import { inputCls } from '../lib/ui'
import { fmtBytes, todayStr } from '../lib/format'

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

// 設計変更ステータス
const DC_STATUS = [
  { key: 'negotiating', label: '協議中', tone: 'neutral' },
  { key: 'instructed', label: '指示受領', tone: 'info' },
  { key: 'estimating', label: '見積中', tone: 'warning' },
  { key: 'contracted', label: '変更契約済', tone: 'success' },
  { key: 'cancelled', label: '中止', tone: 'danger' },
]
const DC_STATUS_MAP = Object.fromEntries(DC_STATUS.map((s) => [s.key, s]))

const DC_REASON_CATEGORIES = ['数量増減', '設計変更指示', '追加工事', '工法変更', '条件変更', 'その他']

const DC_DOC_TYPES = ['変更指示書', '変更見積書', '変更契約書', '変更設計図', '変更数量書', 'その他']

function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(d)
  return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()}`
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
  const [view, setView] = useState('list') // 'list' | 'detail' | 'checklist' | 'photos'
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

  // ── チェックリストビュー（別画面）──
  if (view === 'checklist') {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6">
        <button onClick={() => setView('detail')}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4">
          <ArrowLeft className="w-4 h-4" /> 工事詳細へ
        </button>

        {detailLoading || !detail ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
        ) : (
          <ChecklistBody
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

  // ── 工事写真ビュー ──
  if (view === 'photos') {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6">
        <button onClick={() => setView('detail')}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4">
          <ArrowLeft className="w-4 h-4" /> 工事詳細へ
        </button>
        {detailLoading || !detail ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
        ) : (
          <PhotoBody detail={detail} notify={notify} />
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
          isAdmin={isAdmin}
          onDelete={() => deleteProject(detail)}
          notify={notify}
          onOpenChecklist={() => setView('checklist')}
          onOpenPhotos={() => setView('photos')}
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
function DetailBody({ detail, onReload, isAdmin, onDelete, notify, onOpenChecklist, onOpenPhotos }) {
  const docs = detail.documents || []
  const done = docs.filter((d) => ['submitted', 'approved', 'na'].includes(d.status)).length
  const [reflectBusy, setReflectBusy] = useState(false)
  const [reflect, setReflect] = useState(null) // { fields, used_files } 抽出結果。null=モーダル閉

  // 契約書・設計図書をアップロード→AIが工事情報を読み取り→確認のうえ既存の工事内容へ反映
  const onContractReflect = async (e) => {
    const files = e.target.files
    if (!files || !files.length) return
    setReflectBusy(true)
    try {
      const fd = new FormData()
      for (const file of files) fd.append('files', file)
      const { data } = await axios.post(`${apiUrl}/api/construction/extract-info`, fd, authConfig())
      setReflect({ fields: data.fields || {}, used_files: data.used_files || [] })
    } catch (err) {
      notify(err.response?.data?.error || 'AI読み取りに失敗しました', 'error')
    } finally {
      setReflectBusy(false)
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
          <label title="契約書・設計図書をアップロードすると、AIが工事番号・契約金額・工期などを読み取り、確認のうえ工事内容へ反映します"
            className="flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline cursor-pointer">
            {reflectBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            契約書から反映
            <input type="file" multiple className="hidden" onChange={onContractReflect} disabled={reflectBusy} />
          </label>
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
      </Card>

      <BoqSection detail={detail} notify={notify} onReload={onReload} />

      <DesignChangeSection detail={detail} notify={notify} onReload={onReload} />

      {/* 提出書類チェックリストは別画面へ遷移 */}
      <button onClick={onOpenChecklist}
        className="w-full text-left bg-white dark:bg-ink-800 rounded-xl border border-slate-200 dark:border-ink-700 px-4 py-3 hover:border-brand-300 dark:hover:border-brand-500/50 transition flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-brand-50 dark:bg-brand-500/15 flex items-center justify-center shrink-0">
          <ListChecks className="w-5 h-5 text-brand-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-slate-800 dark:text-slate-100">提出書類チェックリスト</span>
            <span className="text-xs text-slate-500 shrink-0">{done}/{docs.length} 完了</span>
          </div>
          <div className="mt-1.5"><ProgressBar done={done} total={docs.length} /></div>
        </div>
        <ChevronRight className="w-5 h-5 text-slate-300 shrink-0" />
      </button>

      {/* 工事写真は別画面へ遷移 */}
      <button onClick={onOpenPhotos}
        className="mt-2 w-full text-left bg-white dark:bg-ink-800 rounded-xl border border-slate-200 dark:border-ink-700 px-4 py-3 hover:border-brand-300 dark:hover:border-brand-500/50 transition flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-brand-50 dark:bg-brand-500/15 flex items-center justify-center shrink-0">
          <Camera className="w-5 h-5 text-brand-500" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-bold text-slate-800 dark:text-slate-100">工事写真</span>
          <p className="text-xs text-slate-400 mt-0.5">撮影対象ツリー・必須写真の撮り漏れチェック</p>
        </div>
        <ChevronRight className="w-5 h-5 text-slate-300 shrink-0" />
      </button>

      {reflect && (
        <ContractReflectModal
          detail={detail}
          fields={reflect.fields}
          usedFiles={reflect.used_files}
          onClose={() => setReflect(null)}
          onSaved={(msg) => { setReflect(null); onReload(); notify(msg) }}
          onError={(m) => notify(m, 'error')}
        />
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

// ── 提出書類チェックリスト（別画面・カテゴリ別アコーディオン）──
function ChecklistBody({ detail, onReload, onEditDoc, onAddDoc, notify }) {
  const docs = detail.documents || []
  const done = docs.filter((d) => ['submitted', 'approved', 'na'].includes(d.status)).length
  const [aiUploading, setAiUploading] = useState(false)
  // 書類が1件以上あるカテゴリのみ表示
  const cats = CATEGORIES.filter((cat) => docs.some((d) => d.category_no === cat.no))
  // collapsed に入っている category_no は折りたたみ。既定は全展開。
  const [collapsed, setCollapsed] = useState(() => new Set())
  const toggleCat = (no) => setCollapsed((s) => { const n = new Set(s); n.has(no) ? n.delete(no) : n.add(no); return n })
  const expandAll = () => setCollapsed(new Set())
  const collapseAll = () => setCollapsed(new Set(cats.map((c) => c.no)))

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
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-brand-500" /> 提出書類チェックリスト
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 truncate">{detail.project_name}</p>
        </div>
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

      <Card className="px-4 py-3 mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">提出書類の進捗</span>
          <span className="text-xs text-slate-500">{done}/{docs.length} 完了</span>
        </div>
        <ProgressBar done={done} total={docs.length} />
      </Card>

      {docs.length === 0 ? (
        <Card className="text-center py-8 text-slate-500 dark:text-slate-400 text-sm">書類がありません。</Card>
      ) : (
        <>
          <div className="flex items-center justify-end gap-2 text-[11px] text-slate-400 mb-2">
            <button onClick={expandAll} className="hover:text-slate-600 dark:hover:text-slate-200">すべて展開</button>
            <span>/</span>
            <button onClick={collapseAll} className="hover:text-slate-600 dark:hover:text-slate-200">すべて折りたたむ</button>
          </div>
          <div className="space-y-3">
            {cats.map((cat) => {
              const rows = docs.filter((d) => d.category_no === cat.no)
              const catDone = rows.filter((d) => ['submitted', 'approved', 'na'].includes(d.status)).length
              const isOpen = !collapsed.has(cat.no)
              return (
                <div key={cat.no} className="bg-white dark:bg-ink-800 rounded-xl border border-slate-200 dark:border-ink-700 overflow-hidden">
                  <button onClick={() => toggleCat(cat.no)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-ink-700/50 transition">
                    <ChevronRight className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                    <span className="text-xs font-bold text-white bg-brand-500 rounded-md w-5 h-5 flex items-center justify-center shrink-0">{cat.no}</span>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex-1 text-left truncate">{cat.name}</h3>
                    <span className="text-xs text-slate-400 shrink-0">{catDone}/{rows.length}</span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-slate-100 dark:border-ink-700 divide-y divide-slate-100 dark:divide-ink-700">
                      {rows.map((d) => (
                        <DocRow key={d.id} doc={d} onChangeStatus={changeStatus} onEdit={() => onEditDoc(d)} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ── 契約書から工事内容へAI反映（既存工事の更新）──
// extract-info で抽出した値を現在値と対比し、選んだ項目だけ PUT で上書き（誤反映防止に確認を挟む）
const REFLECT_DATE_KEYS = new Set(['contract_date', 'start_date', 'end_date', 'completion_inspection_date'])
const REFLECT_FIELDS = [
  { key: 'project_name', label: '工事名' },
  { key: 'project_code', label: '工事番号' },
  { key: 'client_org', label: '発注者' },
  { key: 'construction_type', label: '工種大別' },
  { key: 'work_category', label: '工事区分' },
  { key: 'location', label: '工事場所' },
  { key: 'contract_amount', label: '契約金額', fmt: fmtYen },
  { key: 'contract_date', label: '契約日', fmt: fmtDate },
  { key: 'start_date', label: '着工日', fmt: fmtDate },
  { key: 'end_date', label: '工期末', fmt: fmtDate },
  { key: 'completion_inspection_date', label: '完成検査(予定)日', fmt: fmtDate },
]

function ContractReflectModal({ detail, fields, usedFiles, onClose, onSaved, onError }) {
  // 比較用に正規化（日付は先頭10文字、金額は数値文字列、他はtrim）
  const norm = (key, v) => {
    if (v == null) return ''
    if (REFLECT_DATE_KEYS.has(key)) return String(v).slice(0, 10)
    if (key === 'contract_amount') return v === '' ? '' : String(Number(v))
    return String(v).trim()
  }
  // 読み取れた かつ 現在値と異なる 項目のみ反映候補にする
  const diffs = REFLECT_FIELDS
    .map((fld) => ({ ...fld, newRaw: fields[fld.key], newVal: norm(fld.key, fields[fld.key]), curVal: norm(fld.key, detail[fld.key]) }))
    .filter((d) => d.newVal !== '' && d.newVal !== d.curVal)

  const [sel, setSel] = useState(() => new Set(diffs.map((d) => d.key)))
  const [saving, setSaving] = useState(false)
  const toggle = (key) => setSel((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })

  const fmtVal = (fld, raw) => {
    if (raw == null || raw === '') return '—'
    return fld.fmt ? fld.fmt(raw) : String(raw)
  }

  const submit = async () => {
    const payload = {}
    for (const d of diffs) if (sel.has(d.key)) payload[d.key] = d.newRaw
    if (!Object.keys(payload).length) { onError('反映する項目が選択されていません'); return }
    setSaving(true)
    try {
      await axios.put(`${apiUrl}/api/construction/projects/${detail.id}`, payload, authConfig())
      onSaved(`工事内容を更新しました（${Object.keys(payload).length}項目）`)
    } catch (e) {
      onError(e.response?.data?.error || '更新に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title="契約書から工事内容へ反映" onClose={onClose} wide>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        読み取った書類：{usedFiles.length ? usedFiles.join('、') : '—'}
      </p>
      {diffs.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
          書類から読み取れた内容は、現在の工事情報と差異がありませんでした。
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            変更がある項目のみ表示しています。反映する項目にチェックを入れて「反映」を押してください。
          </p>
          <div className="space-y-1">
            {diffs.map((d) => (
              <label key={d.key} className="flex items-start gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-ink-700/50 cursor-pointer">
                <input type="checkbox" className="mt-1 shrink-0" checked={sel.has(d.key)} onChange={() => toggle(d.key)} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">{d.label}</div>
                  <div className="flex items-center gap-2 text-sm mt-0.5 flex-wrap">
                    <span className="text-slate-400 line-through">{fmtVal(d, detail[d.key])}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                    <span className="font-semibold text-slate-800 dark:text-slate-100">{fmtVal(d, d.newRaw)}</span>
                  </div>
                </div>
              </label>
            ))}
          </div>
        </>
      )}
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="px-4 py-2 text-sm rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-ink-700">キャンセル</button>
        {diffs.length > 0 && (
          <Button onClick={submit} disabled={saving || sel.size === 0}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" />反映（{sel.size}項目）</>}
          </Button>
        )}
      </div>
    </ModalShell>
  )
}

// ── BoqSection 内部で使うツリー描画ユーティリティ ──
function buildTreeItems(rows, expanded) {
  const parentSet = new Set()
  for (const r of rows) {
    if (!r.path) continue
    const parts = String(r.path).split('.')
    if (parts.length > 1) parentSet.add(parts.slice(0, -1).join('.'))
  }
  const isParent = (p) => p != null && parentSet.has(p)
  const visible = []
  let hidePrefix = null
  for (const r of rows) {
    if (hidePrefix && r.path && String(r.path).startsWith(hidePrefix)) continue
    hidePrefix = null
    visible.push(r)
    if (isParent(r.path) && !expanded.has(r.path)) hidePrefix = r.path + '.'
  }
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
  return { treeItems, parentSet, isParent }
}

const kindStyle = {
  種目: 'font-bold text-slate-800 dark:text-slate-100 bg-slate-100/70 dark:bg-ink-700/60',
  共通費: 'font-bold text-slate-700 dark:text-slate-200 bg-amber-50/70 dark:bg-amber-900/20',
  科目: 'font-semibold text-slate-700 dark:text-slate-200',
  細目: 'text-slate-700 dark:text-slate-200',
  別紙: 'text-slate-400 dark:text-slate-400',
}

// ── BoqTreeView: 当初版と変更後共通のツリー描画コンポーネント ──
function BoqTreeView({ rows }) {
  const [expanded, setExpanded] = useState(() => new Set())
  const toggle = (path) => setExpanded((s) => {
    const n = new Set(s); n.has(path) ? n.delete(path) : n.add(path); return n
  })
  const { treeItems, parentSet } = buildTreeItems(rows, expanded)
  const expandAll = () => setExpanded(new Set(parentSet))
  const collapseAll = () => setExpanded(new Set())
  return (
    <>
      <div className="flex items-center justify-end gap-2 text-[11px] text-slate-400 mb-1">
        <button onClick={expandAll} className="hover:text-slate-600 dark:hover:text-slate-200">すべて展開</button>
        <span>/</span>
        <button onClick={collapseAll} className="hover:text-slate-600 dark:hover:text-slate-200">折りたたむ</button>
      </div>
      <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-200 dark:border-ink-700 divide-y divide-slate-100 dark:divide-ink-700/70">
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
    </>
  )
}

// ── 数量内訳・構成比率セクション ──
function BoqSection({ detail, notify, onReload }) {
  const [boq, setBoq] = useState(null)        // { rows, summary, total, imported_at }
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showItems, setShowItems] = useState(false)
  const [naModal, setNaModal] = useState(null) // NA候補（取込直後の承認用）

  // 版切替: 'original' | change.id (number文字列)
  const [selectedVersion, setSelectedVersion] = useState('original')
  // 変更後版データ: { change_id, change_no, boq_mode, base_total, change_total, diff, trades, rows }
  const [resolvedBoq, setResolvedBoq] = useState(null)
  const [resolvedLoading, setResolvedLoading] = useState(false)

  // boq_imported_at が入っている設計変更だけを版選択肢に出す
  const dcVersions = (detail.design_changes || []).filter((dc) => dc.boq_imported_at != null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await axios.get(`${apiUrl}/api/construction/projects/${detail.id}/boq`, authConfig())
      setBoq(data)
    } catch { /* noop */ } finally { setLoading(false) }
  }, [detail.id])

  useEffect(() => { load() }, [load])

  // 版切替時に変更後データを取得
  useEffect(() => {
    if (selectedVersion === 'original') { setResolvedBoq(null); return }
    const changeId = selectedVersion
    setResolvedLoading(true)
    axios.get(`${apiUrl}/api/construction/projects/${detail.id}/boq-resolved?change_id=${changeId}`, authConfig())
      .then(({ data }) => setResolvedBoq(data))
      .catch(() => notify('変更後数量書の取得に失敗しました', 'error'))
      .finally(() => setResolvedLoading(false))
  }, [selectedVersion, detail.id, notify])

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

  // ── 当初版ツリー用 ──
  const rows = boq?.rows || []
  const nTane = rows.filter((r) => r.kind === '種目').length
  const nKamoku = rows.filter((r) => r.kind === '科目').length
  const nSaimoku = rows.filter((r) => r.kind === '細目').length
  const nBeppi = rows.filter((r) => r.kind === '別紙').length

  // 変更後版: 工種別表示用
  const resolvedTrades = resolvedBoq?.trades || []
  const resolvedMaxRatio = resolvedTrades.reduce((m, t) => Math.max(m, t.ratio || 0), 0) || 1
  const isDelta = resolvedBoq?.boq_mode === 'delta'

  return (
    <Card className="px-4 py-3 mb-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4 text-brand-500" /> 数量内訳・構成比率
        </span>
        <div className="flex items-center gap-2">
          {/* 版切替セレクタ */}
          {(boq?.imported_at || dcVersions.length > 0) && (
            <select
              className="text-xs px-2 py-1 rounded-lg border border-slate-200 dark:border-ink-600 bg-white dark:bg-ink-700 text-slate-700 dark:text-slate-200"
              value={selectedVersion}
              onChange={(e) => { setSelectedVersion(e.target.value); setShowItems(false) }}>
              <option value="original">当初版</option>
              {dcVersions.map((dc) => (
                <option key={dc.id} value={String(dc.id)}>
                  第{dc.change_no}回変更後
                </option>
              ))}
            </select>
          )}
          {/* 当初版のみ取込ボタン表示 */}
          {selectedVersion === 'original' && (
            <label className="shrink-0 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline cursor-pointer flex items-center gap-1"
              title="数量書(内訳書 .xlsx)を取込み、工事内容・数量・金額を保存して工種別の構成比率を算出します">
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
              {boq?.imported_at ? '数量書を再取込' : '数量書(xlsx)を取込'}
              <input type="file" accept=".xlsx,.xlsm" className="hidden" onChange={onUpload} disabled={uploading} />
            </label>
          )}
        </div>
      </div>

      {/* ── 当初版表示 ── */}
      {selectedVersion === 'original' && loading && (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
      )}
      {selectedVersion === 'original' && !loading && !boq?.imported_at && (
        <p className="text-xs text-slate-400 py-2">
          数量書(内訳書)を取込むと、工種別の構成比率を算出し、数量書に無い工種の施工計画書などをチェックリストから対象外にできます。
        </p>
      )}
      {selectedVersion === 'original' && !loading && boq?.imported_at && (
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
          <div className="mt-3">
            <button onClick={() => setShowItems((s) => !s)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1">
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showItems ? 'rotate-180' : ''}`} />
              内訳を{showItems ? '隠す' : '表示'}
            </button>
          </div>
          {showItems && (
            <div className="mt-2">
              <BoqTreeView rows={rows} />
            </div>
          )}
        </>
      )}

      {/* ── 変更後版表示（ローディング）── */}
      {selectedVersion !== 'original' && resolvedLoading && (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
      )}

      {/* ── 変更後版表示（データあり）── */}
      {selectedVersion !== 'original' && !resolvedLoading && resolvedBoq && (
        <>
          {/* 合計サマリ */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mb-3">
            <span>直接工事費（変更後）
              <span className="ml-1 font-bold text-slate-800 dark:text-slate-100 tabular-nums">{fmtYen(resolvedBoq.change_total)}</span>
            </span>
            <span className="flex items-center gap-1">
              当初比 <AmountDiff before={resolvedBoq.base_total} after={resolvedBoq.change_total} />
            </span>
            {isDelta && (
              <span className="text-amber-600 dark:text-amber-400 font-semibold">変更分のみ(delta)モード</span>
            )}
            <span className="text-[11px]">取込 {fmtDate(resolvedBoq.boq_imported_at || null)}</span>
          </div>

          {/* 工種別構成比率（変更後・増減マーク付き） */}
          <div className="space-y-1.5 mb-3">
            {resolvedTrades.map((t) => {
              const isInc = t.diff > 0
              const barColor = t.changed
                ? (isInc ? 'bg-warning-500/80' : 'bg-success-500/80')
                : 'bg-brand-500/80'
              return (
                <div key={t.trade} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 text-xs text-slate-600 dark:text-slate-300 truncate flex items-center gap-1" title={t.trade}>
                    {t.changed && (
                      <span className={`text-[10px] font-bold ${isInc ? 'text-warning-600 dark:text-warning-400' : 'text-success-600 dark:text-success-400'}`}>
                        {isInc ? '▲' : '▼'}
                      </span>
                    )}
                    {t.trade}
                  </span>
                  <div className="flex-1 h-4 rounded bg-slate-100 dark:bg-ink-700 overflow-hidden">
                    <div className={`h-full ${barColor} rounded`} style={{ width: `${((t.ratio || 0) / resolvedMaxRatio) * 100}%` }} />
                  </div>
                  <span className="w-14 shrink-0 text-right text-xs font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                    {fmtPct(t.ratio)}
                  </span>
                  <span className="w-24 shrink-0 text-right text-[11px] text-slate-400 tabular-nums">{fmtYen(t.after_amount)}</span>
                  {t.changed && (
                    <span className="w-20 shrink-0 text-right">
                      <AmountDiff before={t.base_amount} after={t.after_amount} />
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {/* 内訳ツリー */}
          {resolvedBoq.rows && resolvedBoq.rows.length > 0 && (
            <>
              <div className="mt-3">
                <button onClick={() => setShowItems((s) => !s)}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1">
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showItems ? 'rotate-180' : ''}`} />
                  内訳を{showItems ? '隠す' : '表示'}
                </button>
              </div>
              {showItems && (
                <>
                  {/* full版: 通常ツリー */}
                  {!isDelta && (
                    <div className="mt-2">
                      <BoqTreeView rows={resolvedBoq.rows} />
                    </div>
                  )}
                  {/* delta版: 当初ツリー + 増減明細 */}
                  {isDelta && (
                    <div className="mt-2 space-y-4">
                      {rows.length > 0 && (
                        <div>
                          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">当初（据え置き）</p>
                          <BoqTreeView rows={rows} />
                        </div>
                      )}
                      <div>
                        <p className="text-[11px] font-semibold text-warning-600 dark:text-warning-400 mb-1">
                          第{resolvedBoq.change_no}回 変更分（増減）
                        </p>
                        <div className="max-h-64 overflow-y-auto rounded-xl border border-warning-200 dark:border-warning-500/30 divide-y divide-slate-100 dark:divide-ink-700/70">
                          {resolvedBoq.rows.map((r, i) => (
                            <div key={i} className={`flex items-start gap-1.5 px-3 py-1.5 text-xs ${kindStyle[r.kind] || ''}`}>
                              <span className="flex-1 min-w-0">
                                {r.item_name}
                                {r.spec ? <span className="text-slate-400"> ／ {r.spec}</span> : ''}
                              </span>
                              <span className="w-20 shrink-0 text-right tabular-nums text-slate-500 dark:text-slate-400">
                                {r.quantity != null ? `${Number(r.quantity).toLocaleString('ja-JP')}${r.unit || ''}` : ''}
                              </span>
                              <span className="w-24 shrink-0 text-right tabular-nums">
                                {r.amount != null ? fmtYen(r.amount) : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
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

// ════════════════════════════════════════════════════════════════
// ── 設計変更（変更契約）セクション ──────────────────────────────
// ════════════════════════════════════════════════════════════════

function DcStatusBadge({ status }) {
  const def = DC_STATUS_MAP[status] || { label: status, tone: 'neutral' }
  return <Badge tone={def.tone}>{def.label}</Badge>
}

// 金額差分の表示ヘルパー（増減を色付きで）
function AmountDiff({ before, after }) {
  if (before == null || after == null) return <span className="text-slate-400">—</span>
  const diff = after - before
  const sign = diff >= 0 ? '+' : ''
  const cls = diff > 0 ? 'text-danger-600 dark:text-danger-400'
    : diff < 0 ? 'text-success-600 dark:text-success-400'
      : 'text-slate-400'
  return (
    <span className={`tabular-nums text-xs ${cls}`}>
      {sign}{fmtYen(diff)}
    </span>
  )
}

// 日付差分の表示ヘルパー（増減日数）
function DateDiff({ before, after }) {
  if (!before || !after) return <span className="text-slate-400">—</span>
  const diffMs = new Date(after) - new Date(before)
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24))
  if (days === 0) return <span className="text-slate-400">増減なし</span>
  const sign = days > 0 ? '+' : ''
  const cls = days > 0 ? 'text-warning-600 dark:text-warning-400' : 'text-success-600 dark:text-success-400'
  return <span className={`tabular-nums text-xs ${cls}`}>{sign}{days}日</span>
}

// ── 設計変更 メインセクション ──
function DesignChangeSection({ detail, notify, onReload }) {
  const [changes, setChanges] = useState(detail.design_changes || [])
  const [loading, setLoading] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [filesTarget, setFilesTarget] = useState(null)  // { change, mode: 'files' | 'boq' }
  const [applyingId, setApplyingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  // 書類読込→AI抽出
  const [extractBusy, setExtractBusy] = useState(false)
  const [draftData, setDraftData] = useState(null)     // { draft, confidence, summary }
  const [extractedFiles, setExtractedFiles] = useState([]) // File[]

  // 詳細取得後にdesign_changesが変わったら同期
  useEffect(() => {
    setChanges(detail.design_changes || [])
  }, [detail.design_changes])

  // 一覧を単独取得（保存・削除後）
  const loadChanges = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await axios.get(`${apiUrl}/api/construction/projects/${detail.id}/design-changes`, authConfig())
      setChanges(data || [])
    } catch (e) {
      notify(e.response?.data?.error || '設計変更の読み込みに失敗しました', 'error')
    } finally { setLoading(false) }
  }, [detail.id, notify])

  const handleApply = async (change) => {
    const ok = window.confirm(
      `第${change.change_no}回変更（${change.title}）を工事基本情報へ反映します。\n` +
      '契約金額・工期末・完成検査日が更新されます。よろしいですか？'
    )
    if (!ok) return
    setApplyingId(change.id)
    try {
      await axios.post(`${apiUrl}/api/construction/design-changes/${change.id}/apply`, {}, authConfig())
      notify(`第${change.change_no}回変更を反映しました`)
      await onReload()
      await loadChanges()
    } catch (e) {
      notify(e.response?.data?.error || '反映に失敗しました', 'error')
    } finally { setApplyingId(null) }
  }

  const handleDelete = async (change) => {
    const ok = window.confirm(`第${change.change_no}回変更「${change.title}」を削除します。よろしいですか？`)
    if (!ok) return
    setDeletingId(change.id)
    try {
      await axios.delete(`${apiUrl}/api/construction/design-changes/${change.id}`, authConfig())
      notify('設計変更を削除しました')
      await loadChanges()
    } catch (e) {
      notify(e.response?.data?.error || '削除に失敗しました', 'error')
    } finally { setDeletingId(null) }
  }

  // 書類読込ハンドラ（ファイル選択 → extract API → モーダルをプリフィルして開く）
  const onExtractFiles = async (e) => {
    const files = e.target.files
    if (!files || !files.length) return
    setExtractBusy(true)
    const selected = Array.from(files)
    try {
      const fd = new FormData()
      for (const file of files) fd.append('files', file)
      const token = localStorage.getItem('authToken')
      const { data } = await axios.post(
        `${apiUrl}/api/construction/projects/${detail.id}/design-changes/extract`, fd,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setDraftData(data)
    } catch (err) {
      // AIで読めない資料(Excel等)のみ／抽出失敗でも、資料は添付して手入力で続行できるようにする
      setDraftData(null)
      notify('AIで読み取れる書類(PDF/画像)が無いため自動入力はスキップしました。手入力で登録できます（選んだ資料は添付されます）')
    } finally {
      setExtractedFiles(selected)
      setShowNew(true)
      setExtractBusy(false)
      e.target.value = ''
    }
  }

  const hasOriginal = detail.original_contract_amount != null || detail.original_end_date != null
  const changeCount = detail.change_count ?? changes.length

  return (
    <Card className="px-4 py-3 mb-4">
      {/* ヘッダ */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
          <GitBranch className="w-4 h-4 text-brand-500" /> 設計変更（変更契約）
          {changeCount > 0 && (
            <span className="ml-1 text-[11px] font-bold bg-brand-100 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300 rounded-full px-1.5 py-0.5">
              {changeCount}回
            </span>
          )}
        </span>
        {/* ボタン群：主導線（書類読込）＋サブ（空フォーム追加） */}
        <div className="flex items-center gap-2">
          <label className={`text-xs font-semibold cursor-pointer flex items-center gap-1 px-3 py-1.5 rounded-xl border transition-colors
            ${extractBusy
              ? 'opacity-60 cursor-not-allowed border-brand-200 dark:border-brand-500/30 bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400'
              : 'border-brand-200 dark:border-brand-500/30 bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-500/20'}`}>
            {extractBusy
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Sparkles className="w-3.5 h-3.5" />}
            書類を読み込んで設計変更を追加
            <input
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff,.heic,.xlsx,.xls,.xlsm,.csv,.doc,.docx"
              className="hidden"
              onChange={onExtractFiles}
              disabled={extractBusy}
            />
          </label>
          <button
            onClick={() => { setDraftData(null); setExtractedFiles([]); setShowNew(true) }}
            className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:underline flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> 手入力で追加
          </button>
        </div>
      </div>

      {/* 対比サマリカード */}
      {!hasOriginal ? (
        <p className="text-xs text-slate-400 py-1 mb-3">設計変更なし（変更を追加すると当初値が自動保存されます）</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          {/* 契約金額対比 */}
          <div className="rounded-xl border border-slate-200 dark:border-ink-700 bg-slate-50 dark:bg-ink-700/40 px-3 py-2.5">
            <div className="text-[11px] text-slate-400 mb-1">契約金額</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              当初 <span className="font-semibold text-slate-700 dark:text-slate-200">{fmtYen(detail.original_contract_amount)}</span>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
              現在 <span className="font-semibold text-slate-800 dark:text-slate-100">{fmtYen(detail.contract_amount)}</span>
            </div>
            {detail.original_contract_amount != null && detail.contract_amount != null && (
              <div className="mt-1 flex items-center gap-1 text-xs">
                <AmountDiff before={detail.original_contract_amount} after={detail.contract_amount} />
                {detail.original_contract_amount !== 0 && (
                  <span className="text-slate-400">
                    （{detail.contract_amount >= detail.original_contract_amount ? '+' : ''}
                    {(((detail.contract_amount - detail.original_contract_amount) / detail.original_contract_amount) * 100).toFixed(1)}%）
                  </span>
                )}
              </div>
            )}
          </div>
          {/* 工期末対比 */}
          <div className="rounded-xl border border-slate-200 dark:border-ink-700 bg-slate-50 dark:bg-ink-700/40 px-3 py-2.5">
            <div className="text-[11px] text-slate-400 mb-1">工期末</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              当初 <span className="font-semibold text-slate-700 dark:text-slate-200">{fmtDate(detail.original_end_date)}</span>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              現在 <span className="font-semibold text-slate-800 dark:text-slate-100">{fmtDate(detail.end_date)}</span>
            </div>
            {detail.original_end_date && detail.end_date && (
              <div className="mt-1">
                <DateDiff before={detail.original_end_date} after={detail.end_date} />
              </div>
            )}
          </div>
          {/* 完成検査日対比 */}
          <div className="rounded-xl border border-slate-200 dark:border-ink-700 bg-slate-50 dark:bg-ink-700/40 px-3 py-2.5">
            <div className="text-[11px] text-slate-400 mb-1">完成検査日</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              当初 <span className="font-semibold text-slate-700 dark:text-slate-200">{fmtDate(detail.original_completion_inspection_date)}</span>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              現在 <span className="font-semibold text-slate-800 dark:text-slate-100">{fmtDate(detail.completion_inspection_date)}</span>
            </div>
            {detail.original_completion_inspection_date && detail.completion_inspection_date && (
              <div className="mt-1">
                <DateDiff before={detail.original_completion_inspection_date} after={detail.completion_inspection_date} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* 変更履歴テーブル */}
      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
      ) : changes.length === 0 ? (
        <p className="text-xs text-slate-400 py-2">設計変更の記録はまだありません。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-ink-700">
                <th className="text-left py-1.5 pr-3 text-slate-500 font-semibold whitespace-nowrap">回</th>
                <th className="text-left py-1.5 pr-3 text-slate-500 font-semibold whitespace-nowrap">ステータス</th>
                <th className="text-left py-1.5 pr-3 text-slate-500 font-semibold whitespace-nowrap">変更指示日</th>
                <th className="text-left py-1.5 pr-3 text-slate-500 font-semibold whitespace-nowrap">変更契約日</th>
                <th className="text-left py-1.5 pr-3 text-slate-500 font-semibold whitespace-nowrap">金額（前→後）</th>
                <th className="text-left py-1.5 pr-3 text-slate-500 font-semibold whitespace-nowrap">工期末（前→後）</th>
                <th className="text-left py-1.5 pr-3 text-slate-500 font-semibold whitespace-nowrap">理由区分</th>
                <th className="text-left py-1.5 text-slate-500 font-semibold whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-ink-700/60">
              {changes.map((ch) => (
                <tr key={ch.id} className="hover:bg-slate-50 dark:hover:bg-ink-700/30">
                  <td className="py-2 pr-3 font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                    第{ch.change_no}回
                    {ch.applied && (
                      <span title="基本情報に反映済" className="ml-1 inline-flex items-center">
                        <CheckCircle2 className="w-3.5 h-3.5 text-success-500" />
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap"><DcStatusBadge status={ch.status} /></td>
                  <td className="py-2 pr-3 whitespace-nowrap text-slate-600 dark:text-slate-300 tabular-nums">{fmtDate(ch.instruction_date)}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-slate-600 dark:text-slate-300 tabular-nums">{fmtDate(ch.agreement_date)}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <div className="text-slate-500 dark:text-slate-400 tabular-nums">
                      {fmtYen(ch.amount_before)} → {fmtYen(ch.amount_after)}
                    </div>
                    <AmountDiff before={ch.amount_before} after={ch.amount_after} />
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <div className="text-slate-500 dark:text-slate-400">
                      {fmtDate(ch.end_date_before)} → {fmtDate(ch.end_date_after)}
                    </div>
                    <DateDiff before={ch.end_date_before} after={ch.end_date_after} />
                  </td>
                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{ch.reason_category || '—'}</td>
                  <td className="py-2 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditTarget(ch)}
                        className="px-2 py-1 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-ink-700 flex items-center gap-0.5">
                        <Pencil className="w-3.5 h-3.5" /> 編集
                      </button>
                      {!ch.applied && (
                        <button
                          onClick={() => handleApply(ch)}
                          disabled={applyingId === ch.id}
                          className="px-2 py-1 rounded-lg text-xs font-semibold text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10 flex items-center gap-0.5 disabled:opacity-50">
                          {applyingId === ch.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          反映
                        </button>
                      )}
                      <button
                        onClick={() => setFilesTarget(ch)}
                        className="px-2 py-1 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-ink-700 flex items-center gap-0.5">
                        <Paperclip className="w-3.5 h-3.5" /> 書類
                      </button>
                      <button
                        onClick={() => handleDelete(ch)}
                        disabled={deletingId === ch.id}
                        className="px-2 py-1 rounded-lg text-xs font-semibold text-danger-600 dark:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-500/10 flex items-center gap-0.5 disabled:opacity-50">
                        {deletingId === ch.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* モーダル群 */}
      {showNew && (
        <NewDesignChangeModal
          detail={detail}
          draft={draftData?.draft || null}
          confidence={draftData?.confidence ?? null}
          summary={draftData?.summary || null}
          extractedFiles={extractedFiles}
          onClose={() => { setShowNew(false); setDraftData(null); setExtractedFiles([]) }}
          onSaved={async () => {
            setShowNew(false); setDraftData(null); setExtractedFiles([])
            notify('設計変更を登録しました')
            await Promise.all([loadChanges(), onReload()])
          }}
          onError={(m) => notify(m, 'error')}
        />
      )}
      {editTarget && (
        <EditDesignChangeModal
          change={editTarget}
          detail={detail}
          onClose={() => setEditTarget(null)}
          onSaved={async () => { setEditTarget(null); notify('設計変更を更新しました'); await loadChanges() }}
          onError={(m) => notify(m, 'error')}
        />
      )}
      {filesTarget && (
        <DesignChangeFilesModal
          change={filesTarget}
          detail={detail}
          onClose={() => setFilesTarget(null)}
          onReload={loadChanges}
          onReloadDetail={onReload}
          notify={notify}
        />
      )}
    </Card>
  )
}

// ── 設計変更フォームの共通フィールド群 ──
function DcFormFields({ f, set, currentDetail }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Field label="理由区分 *">
        <select className={inputCls} value={f.reason_category} onChange={set('reason_category')}>
          <option value="">選択してください</option>
          {DC_REASON_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="ステータス">
        <select className={inputCls} value={f.status} onChange={set('status')}>
          {DC_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </Field>
      <div className="md:col-span-2">
        <Field label="変更タイトル *">
          <input className={inputCls} value={f.title} onChange={set('title')} placeholder="第○回設計変更 等" />
        </Field>
      </div>
      <Field label="変更後契約金額（円）">
        <div className="relative">
          <input className={inputCls} type="number" value={f.amount_after} onChange={set('amount_after')} />
          {currentDetail?.contract_amount != null && (
            <p className="text-[11px] text-slate-400 mt-0.5">
              現在 {fmtYen(currentDetail.contract_amount)}
            </p>
          )}
        </div>
      </Field>
      <Field label="変更後工期末">
        <input className={inputCls} type="date" value={f.end_date_after} onChange={set('end_date_after')} />
        {currentDetail?.end_date && (
          <p className="text-[11px] text-slate-400 mt-0.5">現在 {fmtDate(currentDetail.end_date)}</p>
        )}
      </Field>
      <Field label="変更後完成検査日">
        <input className={inputCls} type="date" value={f.completion_inspection_date_after} onChange={set('completion_inspection_date_after')} />
        {currentDetail?.completion_inspection_date && (
          <p className="text-[11px] text-slate-400 mt-0.5">現在 {fmtDate(currentDetail.completion_inspection_date)}</p>
        )}
      </Field>
      <Field label="変更指示日">
        <input className={inputCls} type="date" value={f.instruction_date} onChange={set('instruction_date')} />
      </Field>
      <Field label="変更契約日">
        <input className={inputCls} type="date" value={f.agreement_date} onChange={set('agreement_date')} />
      </Field>
      <div className="md:col-span-2">
        <Field label="変更内容・理由">
          <textarea className={inputCls} rows={3} value={f.reason} onChange={set('reason')} placeholder="変更の詳細・根拠を記載" />
        </Field>
      </div>
      <div className="md:col-span-2">
        <Field label="備考">
          <textarea className={inputCls} rows={2} value={f.note} onChange={set('note')} />
        </Field>
      </div>
    </div>
  )
}

// ── AI読取バッジ ──
function AiBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-100 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300 ml-1 align-middle">
      <Sparkles className="w-2.5 h-2.5" />AI読取
    </span>
  )
}

// ── 設計変更フォームの共通フィールド群（AI読取バッジ対応版）──
function DcFormFieldsWithBadge({ f, set, currentDetail, aiFields }) {
  const ai = aiFields || {}
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Field label={<>理由区分 *{ai.reason_category && <AiBadge />}</>}>
        <select className={inputCls} value={f.reason_category} onChange={set('reason_category')}>
          <option value="">選択してください</option>
          {DC_REASON_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <Field label={<>ステータス{ai.status && <AiBadge />}</>}>
        <select className={inputCls} value={f.status} onChange={set('status')}>
          {DC_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </Field>
      <div className="md:col-span-2">
        <Field label={<>変更タイトル *{ai.title && <AiBadge />}</>}>
          <input className={inputCls} value={f.title} onChange={set('title')} placeholder="第○回設計変更 等" />
        </Field>
      </div>
      <Field label={<>変更後契約金額（円）{ai.amount_after && <AiBadge />}</>}>
        <div className="relative">
          <input className={inputCls} type="number" value={f.amount_after} onChange={set('amount_after')} />
          {currentDetail?.contract_amount != null && (
            <p className="text-[11px] text-slate-400 mt-0.5">
              現在 {fmtYen(currentDetail.contract_amount)}
            </p>
          )}
        </div>
      </Field>
      <Field label={<>変更後工期末{ai.end_date_after && <AiBadge />}</>}>
        <input className={inputCls} type="date" value={f.end_date_after} onChange={set('end_date_after')} />
        {currentDetail?.end_date && (
          <p className="text-[11px] text-slate-400 mt-0.5">現在 {fmtDate(currentDetail.end_date)}</p>
        )}
      </Field>
      <Field label={<>変更後完成検査日{ai.completion_inspection_date_after && <AiBadge />}</>}>
        <input className={inputCls} type="date" value={f.completion_inspection_date_after} onChange={set('completion_inspection_date_after')} />
        {currentDetail?.completion_inspection_date && (
          <p className="text-[11px] text-slate-400 mt-0.5">現在 {fmtDate(currentDetail.completion_inspection_date)}</p>
        )}
      </Field>
      <Field label={<>変更指示日{ai.instruction_date && <AiBadge />}</>}>
        <input className={inputCls} type="date" value={f.instruction_date} onChange={set('instruction_date')} />
      </Field>
      <Field label={<>変更契約日{ai.agreement_date && <AiBadge />}</>}>
        <input className={inputCls} type="date" value={f.agreement_date} onChange={set('agreement_date')} />
      </Field>
      <div className="md:col-span-2">
        <Field label={<>変更内容・理由{ai.reason && <AiBadge />}</>}>
          <textarea className={inputCls} rows={3} value={f.reason} onChange={set('reason')} placeholder="変更の詳細・根拠を記載" />
        </Field>
      </div>
      <div className="md:col-span-2">
        <Field label="備考">
          <textarea className={inputCls} rows={2} value={f.note} onChange={set('note')} />
        </Field>
      </div>
    </div>
  )
}

// ── 設計変更 新規登録モーダル ──
function NewDesignChangeModal({ detail, draft, confidence, summary, extractedFiles, onClose, onSaved, onError }) {
  // draft があればプリフィル、なければ空
  const hasDraft = !!draft
  const [f, setF] = useState(() => ({
    reason_category: draft?.reason_category || '',
    title: draft?.title || '',
    status: draft?.status || 'negotiating',
    amount_after: draft?.amount_after != null ? String(draft.amount_after) : '',
    end_date_after: draft?.end_date_after || '',
    completion_inspection_date_after: draft?.completion_inspection_date_after || '',
    instruction_date: draft?.instruction_date || '',
    agreement_date: draft?.agreement_date || '',
    reason: draft?.reason || '',
    note: '',
  }))

  // ファイルごとのdoc_type（添付用）
  const [fileMeta, setFileMeta] = useState(() =>
    (extractedFiles || []).map((file) => ({ file, doc_type: DC_DOC_TYPES[0] }))
  )

  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  // draftのどのフィールドがAI埋めか（空でないもの）
  const aiFields = hasDraft ? Object.fromEntries(
    Object.entries(draft).filter(([, v]) => v != null && v !== '')
  ) : {}

  const submit = async () => {
    if (!f.title.trim()) { onError('変更タイトルは必須です'); return }
    if (!f.reason_category) { onError('理由区分は必須です'); return }
    setSaving(true)
    try {
      const payload = {
        title: f.title,
        reason_category: f.reason_category,
        reason: f.reason,
        status: f.status,
        amount_after: f.amount_after !== '' ? Number(f.amount_after) : null,
        end_date_after: f.end_date_after || null,
        completion_inspection_date_after: f.completion_inspection_date_after || null,
        instruction_date: f.instruction_date || null,
        agreement_date: f.agreement_date || null,
        note: f.note,
      }
      const { data: created } = await axios.post(
        `${apiUrl}/api/construction/projects/${detail.id}/design-changes`, payload, authConfig()
      )
      const changeId = created.id

      // 抽出元ファイルがあれば順次添付
      if (fileMeta.length > 0 && changeId) {
        const token = localStorage.getItem('authToken')
        for (const meta of fileMeta) {
          const fd = new FormData()
          fd.append('file', meta.file)
          fd.append('doc_type', meta.doc_type)
          await axios.post(
            `${apiUrl}/api/construction/design-changes/${changeId}/files`, fd,
            { headers: { Authorization: `Bearer ${token}` } }
          )
        }
      }

      onSaved()
    } catch (e) {
      onError(e.response?.data?.error || '登録に失敗しました')
    } finally { setSaving(false) }
  }

  return (
    <ModalShell title="設計変更を追加" onClose={onClose} wide>
      {/* AI抽出結果サマリ */}
      {hasDraft && (
        <div className="mb-4 rounded-xl border border-brand-200 dark:border-brand-500/30 bg-brand-50 dark:bg-brand-500/10 px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-brand-500 shrink-0" />
            <span className="text-xs font-semibold text-brand-700 dark:text-brand-300">書類から自動入力しました</span>
            {confidence != null && (
              <span className="text-[11px] text-slate-400 ml-auto">信頼度 {Math.round(confidence * 100)}%</span>
            )}
          </div>
          {summary && (
            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">{summary}</p>
          )}
          <p className="text-[11px] text-slate-400 mt-1">
            <AiBadge /> マークの付いた項目はAIが読み取りました。内容を確認・修正してから登録してください。
          </p>
        </div>
      )}

      <DcFormFieldsWithBadge f={f} set={set} currentDetail={detail} aiFields={aiFields} />

      {/* 抽出元ファイルの doc_type 選択 */}
      {fileMeta.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-ink-700">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2 flex items-center gap-1">
            <Paperclip className="w-3.5 h-3.5" /> 読み込んだ書類を添付（書類種別を確認してください）
          </p>
          <ul className="space-y-2">
            {fileMeta.map((meta, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="text-xs text-slate-600 dark:text-slate-300 truncate flex-1 min-w-0">{meta.file.name}</span>
                <select
                  className={`${inputCls} w-40 shrink-0`}
                  value={meta.doc_type}
                  onChange={(e) => setFileMeta((prev) => prev.map((m, idx) =>
                    idx === i ? { ...m, doc_type: e.target.value } : m
                  ))}>
                  {DC_DOC_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="px-4 py-2 text-sm rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-ink-700">キャンセル</button>
        <Button onClick={submit} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" />登録</>}</Button>
      </div>
    </ModalShell>
  )
}

// ── 設計変更 編集モーダル（後から資料を追加してAI反映できる）──
function EditDesignChangeModal({ change, detail, onClose, onSaved, onError }) {
  const [f, setF] = useState({
    reason_category: change.reason_category || '',
    title: change.title || '',
    status: change.status || 'negotiating',
    amount_after: change.amount_after != null ? String(change.amount_after) : '',
    end_date_after: change.end_date_after || '',
    completion_inspection_date_after: change.completion_inspection_date_after || '',
    instruction_date: change.instruction_date || '',
    agreement_date: change.agreement_date || '',
    reason: change.reason || '',
    note: change.note || '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  // 後から資料を追加してAI反映
  const [extractBusy, setExtractBusy] = useState(false)
  const [aiFields, setAiFields] = useState({})     // 直近のAI反映で更新した項目
  const [aiInfo, setAiInfo] = useState(null)        // { confidence, summary }
  const [fileMeta, setFileMeta] = useState([])      // 追加添付する書類 [{ file, doc_type }]

  // 複数資料を読み込み → extract → 非空のAI値をフォームへ反映 ＋ 添付候補に追加
  const onAddDocs = async (e) => {
    const files = e.target.files
    if (!files || !files.length) return
    setExtractBusy(true)
    const selected = Array.from(files)
    try {
      const fd = new FormData()
      for (const file of files) fd.append('files', file)
      const token = localStorage.getItem('authToken')
      const { data } = await axios.post(
        `${apiUrl}/api/construction/projects/${detail.id}/design-changes/extract`, fd,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const draft = data?.draft || {}
      const updated = {}
      setF((s) => {
        const next = { ...s }
        for (const [k, v] of Object.entries(draft)) {
          if (v == null || v === '' || !(k in next)) continue
          next[k] = (k === 'amount_after') ? String(v) : v
          updated[k] = v
        }
        return next
      })
      setAiFields((prev) => ({ ...prev, ...updated }))
      setAiInfo({ confidence: data?.confidence ?? null, summary: data?.summary || null })
    } catch (err) {
      // AIで読めない資料(Excel等)のみ／抽出失敗でも、資料は添付候補に積む（反映はスキップ）
      setAiInfo({ confidence: null, summary: 'AIで読み取れる書類(PDF/画像)が無かったため自動反映はスキップしました。選んだ資料は保存時に添付されます。' })
    } finally {
      setFileMeta((prev) => [
        ...prev,
        ...selected.map((file) => ({ file, doc_type: DC_DOC_TYPES[0] })),
      ])
      setExtractBusy(false)
      e.target.value = ''
    }
  }

  const submit = async () => {
    if (!f.title.trim()) { onError('変更タイトルは必須です'); return }
    if (!f.reason_category) { onError('理由区分は必須です'); return }
    setSaving(true)
    try {
      const payload = {
        title: f.title,
        reason_category: f.reason_category,
        reason: f.reason,
        status: f.status,
        amount_after: f.amount_after !== '' ? Number(f.amount_after) : null,
        end_date_after: f.end_date_after || null,
        completion_inspection_date_after: f.completion_inspection_date_after || null,
        instruction_date: f.instruction_date || null,
        agreement_date: f.agreement_date || null,
        note: f.note,
      }
      await axios.patch(`${apiUrl}/api/construction/design-changes/${change.id}`, payload, authConfig())

      // 後から追加した資料を関連書類として添付
      if (fileMeta.length > 0) {
        const token = localStorage.getItem('authToken')
        for (const meta of fileMeta) {
          const ffd = new FormData()
          ffd.append('file', meta.file)
          ffd.append('doc_type', meta.doc_type)
          await axios.post(
            `${apiUrl}/api/construction/design-changes/${change.id}/files`, ffd,
            { headers: { Authorization: `Bearer ${token}` } }
          )
        }
      }

      onSaved()
    } catch (e) {
      onError(e.response?.data?.error || '更新に失敗しました')
    } finally { setSaving(false) }
  }

  return (
    <ModalShell title={`第${change.change_no}回変更を編集`} onClose={onClose} wide>
      {change.applied && (
        <div className="mb-3 flex items-center gap-2 text-xs text-success-700 dark:text-success-300 bg-success-50 dark:bg-success-500/10 border border-success-200 dark:border-success-500/30 rounded-xl px-3 py-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          この変更は工事基本情報へ反映済みです。金額・工期を変更した場合は再度「反映」を行ってください。
        </div>
      )}

      {/* 後から資料を追加してAI反映 */}
      <div className="mb-4 rounded-xl border border-brand-200 dark:border-brand-500/30 bg-brand-50 dark:bg-brand-500/10 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 text-brand-500 shrink-0" />
            <span className="text-xs font-semibold text-brand-700 dark:text-brand-300">追加資料を読み込んで反映</span>
            {aiInfo?.confidence != null && (
              <span className="text-[11px] text-slate-400">信頼度 {Math.round(aiInfo.confidence * 100)}%</span>
            )}
          </div>
          <label className={`text-xs font-semibold cursor-pointer flex items-center gap-1 px-3 py-1.5 rounded-xl border transition-colors shrink-0
            ${extractBusy
              ? 'opacity-60 cursor-not-allowed border-brand-200 dark:border-brand-500/30 text-brand-600 dark:text-brand-400'
              : 'border-brand-300 dark:border-brand-500/40 bg-white dark:bg-ink-800 text-brand-600 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-500/20'}`}>
            {extractBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            資料を追加
            <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff,.heic,.xlsx,.xls,.xlsm,.csv,.doc,.docx" className="hidden" onChange={onAddDocs} disabled={extractBusy} />
          </label>
        </div>
        {aiInfo?.summary && (
          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed mt-1">{aiInfo.summary}</p>
        )}
        <p className="text-[11px] text-slate-400 mt-1">複数選択できます。<AiBadge /> の項目が今回反映されました。内容を確認・修正して保存してください。</p>
      </div>

      <DcFormFieldsWithBadge f={f} set={set} currentDetail={detail} aiFields={aiFields} />

      {/* 追加した書類の添付（保存時に添付）*/}
      {fileMeta.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-ink-700">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2 flex items-center gap-1">
            <Paperclip className="w-3.5 h-3.5" /> 追加した書類を添付（書類種別を確認してください）
          </p>
          <ul className="space-y-2">
            {fileMeta.map((meta, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="text-xs text-slate-600 dark:text-slate-300 truncate flex-1 min-w-0">{meta.file.name}</span>
                <select
                  className={`${inputCls} w-40 shrink-0`}
                  value={meta.doc_type}
                  onChange={(e) => setFileMeta((prev) => prev.map((m, idx) => idx === i ? { ...m, doc_type: e.target.value } : m))}>
                  {DC_DOC_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
                <button
                  onClick={() => setFileMeta((prev) => prev.filter((_, idx) => idx !== i))}
                  className="text-slate-400 hover:text-danger-500 shrink-0" title="この添付を取り消す">
                  <X className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="px-4 py-2 text-sm rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-ink-700">キャンセル</button>
        <Button onClick={submit} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" />保存</>}</Button>
      </div>
    </ModalShell>
  )
}

// ── 設計変更 関連書類モーダル（ファイル管理 + 変更後数量書取込 + BOQ比較）──
function DesignChangeFilesModal({ change, detail, onClose, onReload, onReloadDetail, notify }) {
  const [files, setFiles] = useState([])
  const [loadingFiles, setLoadingFiles] = useState(true)
  const [boqUploading, setBoqUploading] = useState(false)
  const [boqCompare, setBoqCompare] = useState(null)
  const [boqLoading, setBoqLoading] = useState(false)
  const [showBoq, setShowBoq] = useState(false)
  // 変更後数量書取込モード
  const [boqMode, setBoqMode] = useState('full') // 'full' | 'delta'

  // 複数ファイル追加ステージ: [{ file, doc_type }]
  const [stagedFiles, setStagedFiles] = useState([])
  const [batchUploading, setBatchUploading] = useState(false)

  const loadFiles = useCallback(async () => {
    setLoadingFiles(true)
    try {
      const { data } = await axios.get(
        `${apiUrl}/api/construction/design-changes/${change.id}/files`, authConfig())
      setFiles(data || [])
    } catch { /* noop */ } finally { setLoadingFiles(false) }
  }, [change.id])

  useEffect(() => { loadFiles() }, [loadFiles])

  // Excel 数量書か判定
  const isExcelFile = (name) => /\.(xlsx|xlsm|xls)$/i.test(name || '')

  // 複数ファイル選択 → ステージに追加（種別が「変更数量書」のとき boq_mode を併用）
  const onSelectFiles = (e) => {
    const selected = Array.from(e.target.files || [])
    if (!selected.length) return
    setStagedFiles((prev) => [
      ...prev,
      ...selected.map((file) => ({ file, doc_type: DC_DOC_TYPES[0], boq_mode: 'full' })),
    ])
    e.target.value = ''
  }

  // まとめてアップロード（「変更数量書」のExcelは添付＋数量書取込で数量内訳に反映）
  const onBatchUpload = async () => {
    if (!stagedFiles.length) return
    setBatchUploading(true)
    try {
      const token = localStorage.getItem('authToken')
      let boqImported = 0
      for (const meta of stagedFiles) {
        // 1) 関連書類として添付
        const fd = new FormData()
        fd.append('file', meta.file)
        fd.append('doc_type', meta.doc_type)
        await axios.post(
          `${apiUrl}/api/construction/design-changes/${change.id}/files`, fd,
          { headers: { Authorization: `Bearer ${token}` } })
        // 2) 種別=変更数量書 かつ Excel なら数量書取込（数量内訳・構成比率へ反映）
        if (meta.doc_type === '変更数量書' && isExcelFile(meta.file.name)) {
          const bfd = new FormData()
          bfd.append('file', meta.file)
          bfd.append('change_id', change.id)
          bfd.append('boq_mode', meta.boq_mode || 'full')
          await axios.post(
            `${apiUrl}/api/construction/projects/${detail.id}/import-boq`, bfd,
            { headers: { Authorization: `Bearer ${token}` } })
          boqImported += 1
        }
      }
      notify(`${stagedFiles.length} 件のファイルをアップロードしました`)
      if (boqImported > 0) {
        notify(`変更数量書を取込み、数量内訳・構成比率の「第${change.change_no}回変更後」に反映しました`)
      }
      setStagedFiles([])
      await loadFiles()
      // 数量書を取込んだ場合は詳細も再取得して版セレクタ／数量内訳に反映
      if (boqImported > 0) {
        await onReload()
        if (onReloadDetail) await onReloadDetail()
      }
    } catch (err) {
      notify(err.response?.data?.error || 'アップロードに失敗しました', 'error')
    } finally { setBatchUploading(false) }
  }

  const onDeleteFile = async (fileId) => {
    try {
      await axios.delete(`${apiUrl}/api/construction/design-change-files/${fileId}`, authConfig())
      setFiles((s) => s.filter((x) => x.id !== fileId))
      notify('ファイルを削除しました')
    } catch (err) {
      notify(err.response?.data?.error || '削除に失敗しました', 'error')
    }
  }

  // 変更後数量書(xlsx)取込 — boq_mode を付けて送信
  const onBoqUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBoqUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('change_id', change.id)
      fd.append('boq_mode', boqMode)
      const token = localStorage.getItem('authToken')
      const { data } = await axios.post(
        `${apiUrl}/api/construction/projects/${detail.id}/import-boq`, fd,
        { headers: { Authorization: `Bearer ${token}` } })
      const modeLabel = (data.mode || boqMode) === 'delta' ? '変更分のみ' : '全体版'
      notify(`変更後数量書を取込みました（${modeLabel}・明細 ${data.line_count} 件・総額 ${fmtYen(data.total)}）`)
      notify(`数量内訳・構成比率の「第${change.change_no}回変更後」で確認できます`)
      // 詳細再取得（design_changes.boq_imported_at を更新して版セレクタに反映）
      await onReload()
      if (onReloadDetail) await onReloadDetail()
    } catch (err) {
      notify(err.response?.data?.error || '数量書の取込に失敗しました', 'error')
    } finally { setBoqUploading(false); e.target.value = '' }
  }

  // BOQ比較取得（旧 boq-compare エンドポイント）
  const loadBoqCompare = async () => {
    setBoqLoading(true)
    setShowBoq(true)
    try {
      const { data } = await axios.get(
        `${apiUrl}/api/construction/projects/${detail.id}/boq-compare?change_id=${change.id}`, authConfig())
      setBoqCompare(data)
    } catch (err) {
      notify(err.response?.data?.error || '比較データの取得に失敗しました', 'error')
      setShowBoq(false)
    } finally { setBoqLoading(false) }
  }

  return (
    <ModalShell title={`第${change.change_no}回変更 — 関連書類`} onClose={onClose} wide>

      {/* ── 書類追加エリア ── */}
      <div className="mb-4 rounded-xl border border-slate-200 dark:border-ink-700 bg-slate-50 dark:bg-ink-700/30 px-4 py-3">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-0.5 flex items-center gap-1">
          <Plus className="w-3.5 h-3.5 text-brand-500" /> 書類を追加
        </p>
        <p className="text-[11px] text-slate-400 mb-3">
          変更指示書・契約書・図面などをまとめて追加できます。ファイルを選んで種別を確認してから「まとめてアップロード」してください。
          種別を「変更数量書」にしたExcelは、添付と同時に数量内訳・構成比率へ反映されます。
        </p>

        {/* ファイル選択ボタン */}
        <label className={`inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer px-3 py-1.5 rounded-xl border transition-colors
          border-brand-200 dark:border-brand-500/30 bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-500/20`}>
          <Upload className="w-3.5 h-3.5" />
          ファイルを選択（複数可）
          <input type="file" multiple className="hidden" onChange={onSelectFiles} disabled={batchUploading} />
        </label>

        {/* ステージ一覧 */}
        {stagedFiles.length > 0 && (
          <div className="mt-3 space-y-2">
            <ul className="space-y-2">
              {stagedFiles.map((meta, i) => {
                const isBoq = meta.doc_type === '変更数量書'
                const boqExcel = isBoq && isExcelFile(meta.file.name)
                return (
                <li key={i} className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-slate-600 dark:text-slate-300 truncate flex-1 min-w-0">{meta.file.name}</span>
                  <select
                    className={`${inputCls} w-40 shrink-0`}
                    value={meta.doc_type}
                    onChange={(e) => setStagedFiles((prev) => prev.map((m, idx) => idx === i ? { ...m, doc_type: e.target.value } : m))}>
                    {DC_DOC_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                  {boqExcel && (
                    <select
                      className="text-xs px-2 py-1 rounded-lg border border-brand-200 dark:border-brand-500/30 bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300 shrink-0"
                      title="数量内訳・構成比率への反映方法"
                      value={meta.boq_mode || 'full'}
                      onChange={(e) => setStagedFiles((prev) => prev.map((m, idx) => idx === i ? { ...m, boq_mode: e.target.value } : m))}>
                      <option value="full">全体版で反映</option>
                      <option value="delta">変更分のみで反映</option>
                    </select>
                  )}
                  <button
                    onClick={() => setStagedFiles((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-slate-400 hover:text-danger-500 shrink-0" title="この添付を取り消す">
                    <X className="w-4 h-4" />
                  </button>
                  {isBoq && !boqExcel && (
                    <span className="text-[11px] text-amber-600 dark:text-amber-400 basis-full">
                      ※ 数量内訳への反映はExcel(.xlsx/.xlsm/.xls)のみ対応です。このファイルは添付のみになります。
                    </span>
                  )}
                </li>
                )
              })}
            </ul>
            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-slate-400">{stagedFiles.length} 件を追加待ち</span>
              <Button onClick={onBatchUpload} disabled={batchUploading}>
                {batchUploading
                  ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />アップロード中...</>
                  : <><Upload className="w-4 h-4 mr-1" />まとめてアップロード</>}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── 既存ファイル一覧 ── */}
      {loadingFiles ? (
        <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
      ) : files.length === 0 ? (
        <p className="text-xs text-slate-400 py-2">関連書類はまだありません。</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-ink-700 border border-slate-200 dark:border-ink-700 rounded-xl mb-4">
          {files.map((file) => (
            <li key={file.id} className="flex items-center gap-2 px-3 py-2">
              <Badge tone="neutral">{file.doc_type || '—'}</Badge>
              <a href={file.url} target="_blank" rel="noreferrer"
                className="text-sm text-brand-600 dark:text-brand-400 hover:underline truncate flex-1 flex items-center gap-1">
                {file.file_name}<ExternalLink className="w-3 h-3 shrink-0" />
              </a>
              {file.size_bytes != null && (
                <span className="text-[11px] text-slate-400 shrink-0">{fmtBytes(file.size_bytes)}</span>
              )}
              <button onClick={() => onDeleteFile(file.id)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-danger-500 hover:bg-slate-100 dark:hover:bg-ink-700 shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* ── 変更後数量書取込 ── */}
      <div className="pt-4 border-t border-slate-100 dark:border-ink-700">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1">
              <FileSpreadsheet className="w-4 h-4 text-brand-500" /> 変更後数量書（xlsx）取込
            </span>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
              取込後は「数量内訳・構成比率」の版切替で確認できます。
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* 取込モードセレクト */}
            <select
              className="text-xs px-2 py-1 rounded-lg border border-slate-200 dark:border-ink-600 bg-white dark:bg-ink-700 text-slate-700 dark:text-slate-200"
              value={boqMode}
              onChange={(e) => setBoqMode(e.target.value)}>
              <option value="full">全体版</option>
              <option value="delta">変更分のみ</option>
            </select>
            <label className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline cursor-pointer flex items-center gap-1">
              {boqUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              取込
              <input type="file" accept=".xlsx,.xlsm" className="hidden" onChange={onBoqUpload} disabled={boqUploading} />
            </label>
            <button onClick={loadBoqCompare} disabled={boqLoading}
              className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1 disabled:opacity-50">
              {boqLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BarChart3 className="w-3.5 h-3.5" />}
              当初との比較
            </button>
          </div>
        </div>
        {/* モード説明 */}
        <p className="text-[11px] text-slate-400 mb-2">
          {boqMode === 'delta'
            ? '変更分のみ＝増減があった項目だけの数量書。当初の数量書に加算して変更後を算出します。'
            : '全体版＝変更後の全明細が入った数量書。当初と全て置き換えます。'}
        </p>

        {showBoq && (
          boqLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : boqCompare ? (
            <div>
              {/* 合計行 */}
              <div className="flex items-center gap-4 mb-2 px-2 py-2 bg-slate-50 dark:bg-ink-700/40 rounded-xl text-xs">
                <span className="text-slate-500">当初合計 <span className="font-bold text-slate-800 dark:text-slate-100 tabular-nums">{fmtYen(boqCompare.base_total)}</span></span>
                <span className="text-slate-500">変更後合計 <span className="font-bold text-slate-800 dark:text-slate-100 tabular-nums">{fmtYen(boqCompare.change_total)}</span></span>
                <AmountDiff before={boqCompare.base_total} after={boqCompare.change_total} />
              </div>
              {/* 工種別比較テーブル */}
              <div className="overflow-x-auto max-h-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-ink-700">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-ink-700">
                    <tr className="border-b border-slate-200 dark:border-ink-700">
                      <th className="text-left px-3 py-1.5 text-slate-500 font-semibold">工種</th>
                      <th className="text-right px-3 py-1.5 text-slate-500 font-semibold tabular-nums">当初</th>
                      <th className="text-right px-3 py-1.5 text-slate-500 font-semibold tabular-nums">変更後</th>
                      <th className="text-right px-3 py-1.5 text-slate-500 font-semibold tabular-nums">増減</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-ink-700/60">
                    {(boqCompare.rows || []).map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-ink-700/20">
                        <td className="px-3 py-1.5 text-slate-700 dark:text-slate-200">{row.trade}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{fmtYen(row.base_amount)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{fmtYen(row.change_amount)}</td>
                        <td className="px-3 py-1.5 text-right">
                          <AmountDiff before={row.base_amount} after={row.change_amount} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null
        )}
      </div>

      <div className="flex justify-end mt-5">
        <button onClick={onClose} className="px-4 py-2 text-sm rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-ink-700">閉じる</button>
      </div>
    </ModalShell>
  )
}

// ════════════════════════════════════════════════════════════════
// ── 工事写真管理 ─────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════

// ── 工事写真 メインビュー ──
function PhotoBody({ detail, notify }) {
  const [nodes, setNodes] = useState([])
  const [generated, setGenerated] = useState(false)
  const [presentTrades, setPresentTrades] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [photos, setPhotos] = useState([]) // project 全写真
  const [photosLoading, setPhotosLoading] = useState(false)
  const [expandedNodes, setExpandedNodes] = useState(new Set())
  const [collapsedTrades, setCollapsedTrades] = useState(new Set())
  const [addNodeOpen, setAddNodeOpen] = useState(false)
  const [lightbox, setLightbox] = useState(null) // Photo object
  const [editNoteNode, setEditNoteNode] = useState(null)
  const [uploadingNodes, setUploadingNodes] = useState(new Set()) // node IDs

  const loadNodes = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await axios.get(
        `${apiUrl}/api/construction/projects/${detail.id}/photo-nodes`,
        authConfig()
      )
      setNodes(data.nodes || [])
      setGenerated(data.generated ?? false)
      setPresentTrades(data.present_trades || [])
    } catch (e) {
      notify(e.response?.data?.error || '撮影ノードの取得に失敗しました', 'error')
    } finally {
      setLoading(false)
    }
  }, [detail.id, notify])

  const loadPhotos = useCallback(async () => {
    setPhotosLoading(true)
    try {
      const { data } = await axios.get(
        `${apiUrl}/api/construction/projects/${detail.id}/photos`,
        authConfig()
      )
      setPhotos(data || [])
    } catch { /* noop */ } finally {
      setPhotosLoading(false)
    }
  }, [detail.id])

  useEffect(() => { loadNodes() }, [loadNodes])
  useEffect(() => { loadPhotos() }, [loadPhotos])

  const doGenerate = async () => {
    setGenerating(true)
    try {
      await axios.post(
        `${apiUrl}/api/construction/projects/${detail.id}/photo-nodes/generate`,
        {}, authConfig()
      )
      await loadNodes()
      notify('撮影ツリーを生成しました')
    } catch (e) {
      notify(e.response?.data?.error || 'ツリー生成に失敗しました', 'error')
    } finally {
      setGenerating(false)
    }
  }

  const regenTree = async () => {
    const ok = window.confirm(
      '撮影ツリーを再生成します。\n' +
      '既存のノードは温存され、不足分のみ追加されます（冪等）。\nよろしいですか？'
    )
    if (!ok) return
    await doGenerate()
  }

  const patchNode = async (nodeId, body) => {
    try {
      const { data } = await axios.patch(
        `${apiUrl}/api/construction/photo-nodes/${nodeId}`, body, authConfig()
      )
      setNodes((prev) => prev.map((n) => n.id === nodeId ? data : n))
    } catch (e) {
      notify(e.response?.data?.error || '更新に失敗しました', 'error')
    }
  }

  const deleteNode = async (nodeId) => {
    const ok = window.confirm('この撮影ノードを削除します。よろしいですか？')
    if (!ok) return
    try {
      await axios.delete(`${apiUrl}/api/construction/photo-nodes/${nodeId}`, authConfig())
      setNodes((prev) => prev.filter((n) => n.id !== nodeId))
      notify('撮影ノードを削除しました')
    } catch (e) {
      notify(e.response?.data?.error || '削除に失敗しました', 'error')
    }
  }

  const uploadPhotos = async (nodeId, files) => {
    setUploadingNodes((s) => { const n = new Set(s); n.add(nodeId); return n })
    try {
      const token = localStorage.getItem('authToken')
      for (const file of files) {
        const fd = new FormData()
        fd.append('photo', file)
        fd.append('node_id', nodeId)
        await axios.post(
          `${apiUrl}/api/construction/projects/${detail.id}/photos`,
          fd,
          { headers: { Authorization: `Bearer ${token}` } }
        )
      }
      await Promise.all([loadPhotos(), loadNodes()])
      notify(`${files.length} 枚をアップロードしました`)
    } catch (e) {
      notify(e.response?.data?.error || 'アップロードに失敗しました', 'error')
    } finally {
      setUploadingNodes((s) => { const n = new Set(s); n.delete(nodeId); return n })
    }
  }

  const deletePhoto = async (photoId) => {
    try {
      await axios.delete(`${apiUrl}/api/construction/photos/${photoId}`, authConfig())
      setPhotos((prev) => prev.filter((p) => p.id !== photoId))
      await loadNodes() // photo_count を更新
      notify('写真を削除しました')
    } catch (e) {
      notify(e.response?.data?.error || '削除に失敗しました', 'error')
    }
  }

  const toggleNode = (nodeId) => setExpandedNodes((s) => {
    const n = new Set(s); n.has(nodeId) ? n.delete(nodeId) : n.add(nodeId); return n
  })
  const toggleTrade = (trade) => setCollapsedTrades((s) => {
    const n = new Set(s); n.has(trade) ? n.delete(trade) : n.add(trade); return n
  })

  // trade → category → nodes のグルーピング
  const tradeMap = {}
  for (const node of nodes) {
    const t = node.trade || '未分類'
    const c = node.category || '未分類'
    if (!tradeMap[t]) tradeMap[t] = {}
    if (!tradeMap[t][c]) tradeMap[t][c] = []
    tradeMap[t][c].push(node)
  }

  // 撮影漏れ（required && is_active && photo_count===0）を工種別に集計
  const missingByTrade = {}
  for (const node of nodes) {
    if (node.required && node.is_active && (node.photo_count ?? 0) === 0) {
      const t = node.trade || '未分類'
      missingByTrade[t] = (missingByTrade[t] || 0) + 1
    }
  }
  const totalMissing = Object.values(missingByTrade).reduce((s, n) => s + n, 0)

  // node_id → Photo[] のマップ
  const photosByNode = {}
  for (const p of photos) {
    const key = String(p.node_id || '__none')
    if (!photosByNode[key]) photosByNode[key] = []
    photosByNode[key].push(p)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    )
  }

  // 初回未生成
  if (!generated && nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-6 text-center">
        <Camera className="w-16 h-16 text-slate-300 dark:text-slate-600" />
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">
            撮影ツリーがまだ生成されていません
          </h2>
          {presentTrades.length > 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">
              数量書の工種: {presentTrades.join('、')}
            </p>
          )}
          <p className="text-sm text-slate-500 dark:text-slate-400">
            ボタンを押すと工種に応じた撮影対象一覧が自動作成されます。
          </p>
        </div>
        <Button onClick={doGenerate} disabled={generating}>
          {generating
            ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />生成中...</>
            : <><Camera className="w-4 h-4 mr-1" />撮影ツリーを生成</>}
        </Button>
        {addNodeOpen && (
          <AddPhotoNodeModal
            projectId={detail.id}
            onClose={() => setAddNodeOpen(false)}
            onAdded={() => { setAddNodeOpen(false); loadNodes(); notify('撮影対象を追加しました') }}
            onError={(m) => notify(m, 'error')}
          />
        )}
      </div>
    )
  }

  return (
    <div>
      {/* ヘッダ */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Camera className="w-5 h-5 text-brand-500" /> 工事写真
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 truncate">{detail.project_name}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0 flex-wrap justify-end">
          {totalMissing > 0 && (
            <span className="text-xs font-bold text-danger-600 dark:text-danger-400 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />必須未撮影 {totalMissing}件
            </span>
          )}
          <button
            onClick={() => setAddNodeOpen(true)}
            className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> 撮影対象を手動追加
          </button>
          <button
            onClick={regenTree}
            title="冪等な再生成：既存ノードは温存し不足分のみ追加"
            className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:underline flex items-center gap-1">
            <RefreshCw className="w-3.5 h-3.5" /> 再生成（既存温存）
          </button>
        </div>
      </div>

      {/* 工種グループ */}
      {Object.keys(tradeMap).length === 0 ? (
        <Card className="text-center py-10 text-slate-500 dark:text-slate-400 text-sm">
          撮影対象がありません。「撮影対象を手動追加」から登録するか「再生成」を試してください。
        </Card>
      ) : (
        <div className="space-y-3">
          {Object.keys(tradeMap).map((trade) => {
            const catMap = tradeMap[trade]
            const missing = missingByTrade[trade] || 0
            const isOpen = !collapsedTrades.has(trade)
            return (
              <div key={trade} className="bg-white dark:bg-ink-800 rounded-2xl border border-slate-200 dark:border-ink-700 overflow-hidden">
                {/* 工種ヘッダ */}
                <button
                  onClick={() => toggleTrade(trade)}
                  className="w-full flex items-center gap-2 px-4 py-3 hover:bg-slate-50 dark:hover:bg-ink-700/50 transition">
                  <ChevronRight className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100 flex-1 text-left">{trade}</span>
                  {missing > 0 && (
                    <span className="text-xs font-bold text-danger-600 dark:text-danger-400 flex items-center gap-1 shrink-0">
                      <AlertTriangle className="w-3 h-3" />未撮影 {missing}件
                    </span>
                  )}
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 dark:border-ink-700">
                    {Object.keys(catMap).map((cat) => {
                      const catNodes = catMap[cat]
                      return (
                        <div key={cat}>
                          {/* 種目（カテゴリ）サブヘッダ */}
                          <div className="px-4 py-1.5 bg-slate-50 dark:bg-ink-700/40 text-xs font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-ink-700/70">
                            {cat}
                          </div>
                          {/* ノード行 */}
                          <div className="divide-y divide-slate-100 dark:divide-ink-700/60">
                            {catNodes.map((node) => (
                              <PhotoNodeRow
                                key={node.id}
                                node={node}
                                nodePhotos={photosByNode[String(node.id)] || []}
                                expanded={expandedNodes.has(node.id)}
                                uploading={uploadingNodes.has(node.id)}
                                photosLoading={photosLoading}
                                onToggle={() => toggleNode(node.id)}
                                onUpload={(files) => uploadPhotos(node.id, files)}
                                onDeletePhoto={deletePhoto}
                                onOpenLightbox={(p) => setLightbox(p)}
                                onPatchNode={(body) => patchNode(node.id, body)}
                                onDeleteNode={() => deleteNode(node.id)}
                                onEditNote={() => setEditNoteNode(node)}
                              />
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {addNodeOpen && (
        <AddPhotoNodeModal
          projectId={detail.id}
          onClose={() => setAddNodeOpen(false)}
          onAdded={() => { setAddNodeOpen(false); loadNodes(); notify('撮影対象を追加しました') }}
          onError={(m) => notify(m, 'error')}
        />
      )}

      {lightbox && (
        <PhotoLightbox photo={lightbox} onClose={() => setLightbox(null)} />
      )}

      {editNoteNode && (
        <EditPhotoNoteModal
          node={editNoteNode}
          onClose={() => setEditNoteNode(null)}
          onSaved={(updated) => {
            setEditNoteNode(null)
            setNodes((prev) => prev.map((n) => n.id === updated.id ? updated : n))
            notify('メモを保存しました')
          }}
          onError={(m) => notify(m, 'error')}
        />
      )}
    </div>
  )
}

// ── 撮影ノード 1行（折りたたみ式）──
function PhotoNodeRow({
  node, nodePhotos, expanded, uploading, photosLoading,
  onToggle, onUpload, onDeletePhoto, onOpenLightbox,
  onPatchNode, onDeleteNode, onEditNote,
}) {
  const isMissing = node.required && node.is_active && (node.photo_count ?? 0) === 0

  return (
    <div className={isMissing ? 'border-l-2 border-danger-400 dark:border-danger-500' : ''}>
      {/* サマリ行（クリックで展開）*/}
      <div
        className={`flex items-center gap-2 px-4 py-2.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-ink-700/30 transition ${!node.is_active ? 'opacity-50' : ''}`}
        onClick={onToggle}>
        <ChevronRight className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-slate-800 dark:text-slate-200 truncate">
              {node.target || node.photo_item || '—'}
            </span>
            {node.required && node.is_active && <Badge tone="warning">必須</Badge>}
            {!node.is_active && <Badge tone="neutral">対象外</Badge>}
            {node.source === 'manual' && <Badge tone="neutral">手動</Badge>}
          </div>
          {node.timing && (
            <p className="text-xs text-slate-400 mt-0.5">{node.timing}</p>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {isMissing && <AlertTriangle className="w-4 h-4 text-danger-500" title="必須・未撮影" />}
          <span className={`text-xs font-semibold tabular-nums ${(node.photo_count ?? 0) > 0 ? 'text-success-600 dark:text-success-400' : 'text-slate-400'}`}>
            {node.photo_count ?? 0}枚
          </span>
        </div>
      </div>

      {/* 展開エリア */}
      {expanded && (
        <div className="px-5 pb-4 pt-2 bg-slate-50/50 dark:bg-ink-700/20 border-t border-slate-100 dark:border-ink-700/60">
          {/* コントロール行 */}
          <div className="flex items-center gap-4 flex-wrap mb-3">
            <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={!!node.is_active}
                onChange={(e) => { e.stopPropagation(); onPatchNode({ is_active: e.target.checked }) }}
              />
              撮影対象に含める
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={!!node.required}
                onChange={(e) => { e.stopPropagation(); onPatchNode({ required: e.target.checked }) }}
              />
              必須写真
            </label>
            <button
              onClick={(e) => { e.stopPropagation(); onEditNote() }}
              className="text-xs text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1">
              <Pencil className="w-3 h-3" />
              {node.note ? 'メモを編集' : 'メモを追加'}
            </button>
            {node.note && (
              <span className="text-xs text-slate-500 dark:text-slate-400 max-w-xs truncate italic" title={node.note}>
                {node.note}
              </span>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onDeleteNode() }}
              className="text-xs text-danger-500 hover:underline flex items-center gap-1 ml-auto">
              <Trash2 className="w-3 h-3" /> 削除
            </button>
          </div>

          {/* 写真アップロード */}
          <div className="mb-3">
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline cursor-pointer">
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              写真を追加（複数可）
              <input
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) onUpload(Array.from(e.target.files))
                  e.target.value = ''
                }}
                disabled={uploading}
              />
            </label>
          </div>

          {/* サムネイル一覧 */}
          {photosLoading ? (
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />読み込み中...
            </div>
          ) : nodePhotos.length === 0 ? (
            <p className="text-xs text-slate-400">写真はまだありません。</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {nodePhotos.map((photo) => (
                <div key={photo.id} className="relative group w-20 h-20 shrink-0">
                  <img
                    src={photo.url}
                    alt={photo.file_name}
                    loading="lazy"
                    className="w-20 h-20 object-cover rounded-xl cursor-pointer border border-slate-200 dark:border-ink-700 hover:opacity-90 transition"
                    onClick={() => onOpenLightbox(photo)}
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeletePhoto(photo.id) }}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition hover:bg-danger-600"
                    title="写真を削除">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── 写真ライトボックス（画像拡大・×ボタンのみで閉じる）──
function PhotoLightbox({ photo, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
      <div className="relative flex flex-col items-center max-w-4xl w-full">
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/40 transition">
          <X className="w-5 h-5" />
        </button>
        <img
          src={photo.url}
          alt={photo.file_name}
          className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl"
        />
        {(photo.caption || photo.location || photo.taken_at) && (
          <div className="mt-3 text-center text-sm text-white/80 space-y-0.5">
            {photo.caption && <p>{photo.caption}</p>}
            {photo.location && <p className="text-white/60">{photo.location}</p>}
            {photo.taken_at && <p className="text-white/50 text-xs">{fmtDate(photo.taken_at)}</p>}
          </div>
        )}
        {photo.file_name && (
          <p className="mt-1 text-xs text-white/40">{photo.file_name}</p>
        )}
      </div>
    </div>
  )
}

// ── メモ編集モーダル ──
function EditPhotoNoteModal({ node, onClose, onSaved, onError }) {
  const [note, setNote] = useState(node.note || '')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    try {
      const { data } = await axios.patch(
        `${apiUrl}/api/construction/photo-nodes/${node.id}`,
        { note }, authConfig()
      )
      onSaved(data)
    } catch (e) {
      onError(e.response?.data?.error || '保存に失敗しました')
    } finally { setSaving(false) }
  }

  return (
    <ModalShell title="メモを編集" onClose={onClose}>
      <Field label="メモ">
        <textarea
          className={inputCls}
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="撮影に関するメモ・注意事項など"
        />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose}
          className="px-4 py-2 text-sm rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-ink-700">
          キャンセル
        </button>
        <Button onClick={submit} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" />保存</>}
        </Button>
      </div>
    </ModalShell>
  )
}

// ── 撮影対象 手動追加モーダル ──
function AddPhotoNodeModal({ projectId, onClose, onAdded, onError }) {
  const [f, setF] = useState({
    category: '',
    target: '',
    photo_item: '',
    trade: '',
    timing: '',
    required: true,
    note: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const setB = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.checked }))

  const submit = async () => {
    if (!f.category.trim()) { onError('種目（工種種目）は必須です'); return }
    if (!f.target.trim()) { onError('撮影対象は必須です'); return }
    setSaving(true)
    try {
      await axios.post(
        `${apiUrl}/api/construction/projects/${projectId}/photo-nodes`,
        {
          category: f.category,
          target: f.target,
          photo_item: f.photo_item || undefined,
          trade: f.trade || undefined,
          timing: f.timing || undefined,
          required: f.required,
          note: f.note || undefined,
        },
        authConfig()
      )
      onAdded()
    } catch (e) {
      onError(e.response?.data?.error || '追加に失敗しました')
    } finally { setSaving(false) }
  }

  return (
    <ModalShell title="撮影対象を手動追加" onClose={onClose}>
      <div className="space-y-3">
        <Field label="工種種目（大分類） *">
          <input className={inputCls} value={f.category} onChange={set('category')} placeholder="例: 鉄筋工事" />
        </Field>
        <Field label="撮影対象 *">
          <input className={inputCls} value={f.target} onChange={set('target')} placeholder="例: 鉄筋組立状況" />
        </Field>
        <Field label="写真種別（中分類）">
          <input className={inputCls} value={f.photo_item} onChange={set('photo_item')} placeholder="例: 施工状況" />
        </Field>
        <Field label="工種">
          <input className={inputCls} value={f.trade} onChange={set('trade')} placeholder="例: 建築" />
        </Field>
        <Field label="撮影時期">
          <input className={inputCls} value={f.timing} onChange={set('timing')} placeholder="例: 施工中" />
        </Field>
        <Field label="メモ">
          <textarea className={inputCls} rows={2} value={f.note} onChange={set('note')} placeholder="撮影上の注意など" />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer select-none">
          <input type="checkbox" checked={f.required} onChange={setB('required')} />
          必須写真とする
        </label>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose}
          className="px-4 py-2 text-sm rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-ink-700">
          キャンセル
        </button>
        <Button onClick={submit} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" />追加</>}
        </Button>
      </div>
    </ModalShell>
  )
}
