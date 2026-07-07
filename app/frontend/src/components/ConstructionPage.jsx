import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import {
  ArrowLeft, Plus, X, Save, Search, Loader2, Building2, ListChecks,
  AlertTriangle, Clock, RotateCcw, ChevronRight, FolderOpen, Pencil,
  Paperclip, Trash2, Upload, ExternalLink, Gavel, Sparkles,
  BarChart3, FileSpreadsheet, ChevronDown, GitBranch, CheckCircle2, RefreshCw,
  Camera, Circle, Link2, MinusCircle, FlaskConical, ClipboardCheck,
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

// 書類整理（保管庫）の分類 = 実フォルダ体系 00〜14（九州防衛局 建築工事の現場フォルダ準拠・実ドライブを確認して整備）
const CONS_FOLDERS = [
  { no: 0, name: '入札時資料' }, { no: 1, name: '設計図書' }, { no: 2, name: '契約関係' },
  { no: 3, name: '工程表' }, { no: 4, name: '施主提出書類' }, { no: 5, name: '施工計画書' },
  { no: 6, name: '工事打合簿' }, { no: 7, name: '施工図・詳細図・完成図' }, { no: 8, name: '材料承認・数量' },
  { no: 9, name: '施工体制' }, { no: 10, name: '工事写真・工事記録・検査関係' }, { no: 11, name: '協力会社見積・作業指示書' },
  { no: 12, name: '打合議事録' }, { no: 13, name: 'KY・新規・安全書類' }, { no: 14, name: '産廃関係' },
  { no: 15, name: '入門・立入申請' },
]
const folderLabel = (no) => `${String(no).padStart(2, '0')}.${(CONS_FOLDERS.find((f) => f.no === Number(no)) || {}).name || '施主提出書類'}`

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

// 受検・試験リスト（migration 047）: 特記仕様書から抽出する検査・試験・測定
const INSP_TEST_CATEGORIES = ['発注者検査', '化学物質濃度試験', '法定検査', 'その他試験']
const INSP_TEST_STATUS = [
  { key: 'planned', label: '予定', tone: 'neutral' },
  { key: 'requested', label: '依頼済', tone: 'info' },
  { key: 'done', label: '実施済', tone: 'info' },
  { key: 'passed', label: '合格', tone: 'success' },
  { key: 'failed', label: '不合格', tone: 'danger' },
  { key: 'na', label: '対象外', tone: 'neutral' },
]
const INSP_TEST_STATUS_MAP = Object.fromEntries(INSP_TEST_STATUS.map((s) => [s.key, s]))
const INSP_WITNESS_OPTIONS = ['発注者立会', '自主', '特定行政庁', '消防']
// 完了扱い（進捗の分子）: 実施済・合格
const INSP_TEST_DONE = ['done', 'passed']
// 一覧に表示するステータス（対象外=na は表示しない）
const INSP_TEST_VISIBLE_STATUS = INSP_TEST_STATUS.filter((s) => s.key !== 'na')

function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(d)
  return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()}`
}
function fmtDateTime(d) {
  if (!d) return '—'
  const dt = new Date(d)
  const p = (n) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()} ${p(dt.getHours())}:${p(dt.getMinutes())}`
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

// ── セクション開閉の共通フック（工事詳細の各セクション用）──
//   開閉状態は localStorage に保存。キーはセクション種別ごと（工事横断で共通）なので、
//   一度畳めばどの工事を開いても同じセクションは畳まれた状態で表示される。
function useSectionCollapse(key, defaultOpen = true) {
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(`constr_section_${key}`)
      return v === null ? defaultOpen : v === '1'
    } catch {
      return defaultOpen
    }
  })
  const toggle = () => setOpen((prev) => {
    const next = !prev
    try {
      localStorage.setItem(`constr_section_${key}`, next ? '1' : '0')
    } catch {
      /* localStorage が使えなくても開閉自体は動かす */
    }
    return next
  })
  return [open, toggle]
}

// ── 開閉用シェブロン（クリックで開閉。見出しの先頭に置く）──
function SectionChevron({ open, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={open}
      className="shrink-0 -ml-1 mr-0.5 p-0.5 rounded hover:bg-slate-100 dark:hover:bg-ink-700 text-slate-400">
      <ChevronDown className={`w-4 h-4 transition-transform ${open ? '' : '-rotate-90'}`} />
    </button>
  )
}

// ── ステータスごとの折りたたみグループ（工事一覧用）──
//   ダッシュボードの CollapsibleSection と同じ挙動。見出し横のシェブロンで開閉し、
//   開閉状態は localStorage に保存して端末ごと・利用者ごとに維持する。
//   defaultOpen=false の完成・引渡済／保管は初期状態で畳んでおく。
function StatusGroup({ status, count, defaultOpen = true, children }) {
  const def = PROJ_STATUS_MAP[status] || { label: status, tone: 'neutral' }
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(`constr_list_collapse_${status}`)
      return v === null ? defaultOpen : v === '1'
    } catch {
      return defaultOpen
    }
  })
  const toggle = () => {
    setOpen((prev) => {
      const next = !prev
      try {
        localStorage.setItem(`constr_list_collapse_${status}`, next ? '1' : '0')
      } catch {
        /* localStorage が使えなくても開閉自体は動かす */
      }
      return next
    })
  }
  return (
    <section>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center gap-2 mb-2 text-left"
      >
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
        <ProjStatusBadge status={status} />
        <span className="text-xs text-slate-400 shrink-0">{count} 件</span>
      </button>
      {open && <div className="grid gap-3">{children}</div>}
    </section>
  )
}

export default function ConstructionPage({ onBack }) {
  const [view, setView] = useState('list') // 'list' | 'detail' | 'checklist' | 'storage' | 'photos'
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

  // 工事詳細を取得するだけ（画面遷移・履歴操作はしない）
  const loadDetail = useCallback(async (id) => {
    setDetailLoading(true)
    try {
      const { data } = await axios.get(`${apiUrl}/api/construction/projects/${id}`, authConfig())
      setDetail(data)
    } catch (e) {
      notify(e.response?.data?.error || '工事の取得に失敗しました', 'error')
    } finally {
      setDetailLoading(false)
    }
  }, [notify])

  // ── ブラウザ/スマホの戻るボタン対応 ──
  // ページ内の階層（一覧→詳細→点検表/工事写真）を History API に積み、
  // 戻るで1段ずつ戻れるようにする。App 側はトップレベル view を別途管理しており、
  // ここでは state.view==='construction' のサブ階層(csub)だけを扱う。
  const detailRef = useRef(null)
  useEffect(() => { detailRef.current = detail }, [detail])
  const pushSub = (sub, id) => {
    window.history.pushState({ view: 'construction', csub: sub, cid: id ?? (detailRef.current?.id ?? null) }, '')
  }
  useEffect(() => {
    const onPop = (e) => {
      const st = e.state || {}
      if (st.view !== 'construction') return // 工事管理から出る遷移は App 側が処理
      const sub = st.csub || 'list'
      setView(sub)
      if (sub === 'list') { setDetail(null); loadList() }
      else if (st.cid && (!detailRef.current || detailRef.current.id !== st.cid)) loadDetail(st.cid)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [loadDetail, loadList])

  // 詳細/点検表/工事写真へ進む（履歴を積む）
  const openDetail = useCallback(async (id) => {
    setView('detail'); pushSub('detail', id)
    await loadDetail(id)
  }, [loadDetail])
  const goChecklist = useCallback(() => { setView('checklist'); pushSub('checklist') }, [])
  const goStorage = useCallback(() => { setView('storage'); pushSub('storage') }, [])
  const goPhotos = useCallback(() => { setView('photos'); pushSub('photos') }, [])
  const goTests = useCallback(() => { setView('tests'); pushSub('tests') }, [])
  // 戻る（履歴を1つ戻す＝popstate 経由で view が下がる）
  const goBack = useCallback(() => window.history.back(), [])

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
      'この工事と検査書類チェックリスト・書類整理は一覧から見えなくなります。\n\nよろしいですか？'
    )
    if (!ok) return
    try {
      await axios.delete(`${apiUrl}/api/construction/projects/${proj.id}`, authConfig())
      notify('工事を削除しました')
      window.history.back() // 詳細→一覧へ（履歴も1つ戻す。popstateで一覧を再読込）
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
            <KpiCard icon={<AlertTriangle className="w-4 h-4" />} label="検査日超過" value={stats.overdue} tone="danger" />
            <KpiCard icon={<Clock className="w-4 h-4" />} label="検査日間近(14日)" value={stats.due_soon} tone="warning" />
            <KpiCard icon={<ListChecks className="w-4 h-4" />} label="未確認の検査項目" value={stats.pending_items} tone="warning" />
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
          <div className="space-y-5">
            {/* 既知ステータスに無い工事も取りこぼさないよう、末尾に一覧化する順序を作る */}
            {[...PROJ_STATUS.map((s) => s.key),
              ...[...new Set(filtered.map((p) => p.status))].filter((k) => !PROJ_STATUS_MAP[k]),
            ].map((statusKey) => {
              const rows = filtered.filter((p) => p.status === statusKey)
              if (rows.length === 0) return null
              // 完成・引渡済／保管は初期状態で畳む（現在進行中の工事を上に見せる）
              const defaultOpen = !['completed', 'archived'].includes(statusKey)
              return (
                <StatusGroup key={statusKey} status={statusKey} count={rows.length} defaultOpen={defaultOpen}>
                  {rows.map((p) => (
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
                </StatusGroup>
              )
            })}
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
        <button onClick={goBack}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4">
          <ArrowLeft className="w-4 h-4" /> 工事詳細へ
        </button>

        {detailLoading || !detail ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
        ) : (
          <ChecklistBody
            detail={detail}
            onReload={reloadDetail}
            onOpenStorage={goStorage}
            notify={notify}
          />
        )}
        <Toast toast={toast} />
      </div>
    )
  }

  // ── 書類整理（保管庫）ビュー（別画面）──
  if (view === 'storage') {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6">
        <button onClick={goBack}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4">
          <ArrowLeft className="w-4 h-4" /> 工事詳細へ
        </button>
        {detailLoading || !detail ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
        ) : (
          <StorageBody
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
        <button onClick={goBack}
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

  // ── 受検・試験リストビュー ──
  if (view === 'tests') {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6">
        <button onClick={goBack}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4">
          <ArrowLeft className="w-4 h-4" /> 工事詳細へ
        </button>
        {detailLoading || !detail ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
        ) : (
          <InspectionTestsBody detail={detail} onReload={reloadDetail} notify={notify} />
        )}
        <Toast toast={toast} />
      </div>
    )
  }

  // ── 詳細ビュー ──
  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <button onClick={goBack}
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
          onOpenChecklist={goChecklist}
          onOpenStorage={goStorage}
          onOpenPhotos={goPhotos}
          onOpenTests={goTests}
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
function DetailBody({ detail, onReload, isAdmin, onDelete, notify, onOpenChecklist, onOpenStorage, onOpenPhotos, onOpenTests }) {
  const docs = detail.documents || []
  const items = detail.inspection_items || []
  const inspDone = items.filter((it) => it.status === 'done' || it.status === 'na').length
  const tests = (detail.inspection_tests || []).filter((t) => t.status !== 'na')
  const testsDone = tests.filter((t) => INSP_TEST_DONE.includes(t.status)).length
  const storedFiles = docs.reduce((n, d) => n + (d.files?.length || 0), 0)
  const [reflectBusy, setReflectBusy] = useState(false)
  const [reflect, setReflect] = useState(null) // { fields, used_files } 抽出結果。null=モーダル閉
  const [basicOpen, toggleBasic] = useSectionCollapse('basic_info', true)

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
        <div className="flex items-center gap-1.5">
          <SectionChevron open={basicOpen} onClick={toggleBasic} />
          <button type="button" onClick={toggleBasic}
            className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 flex-1 text-left">
            <FileSpreadsheet className="w-4 h-4 text-brand-500" /> 基本情報
          </button>
        </div>
        {basicOpen && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-y-2 gap-x-4 text-sm mt-3">
            <Meta label="工事番号" value={detail.project_code} />
            <Meta label="契約日" value={fmtDate(detail.contract_date)} />
            <Meta label="工期" value={`${fmtDate(detail.start_date)} 〜 ${fmtDate(detail.end_date)}`} />
            <Meta label="完成検査(予定)" value={fmtDate(detail.completion_inspection_date)} />
            <Meta label="現場代理人" value={detail.site_agent_name} />
            <Meta label="監理技術者" value={detail.chief_engineer_name} />
          </div>
        )}
      </Card>

      <BoqSection detail={detail} notify={notify} onReload={onReload} />

      <DesignChangeSection detail={detail} notify={notify} onReload={onReload} />

      <SekoPlanSection detail={detail} notify={notify} />

      <StructureSection detail={detail} notify={notify} isAdmin={isAdmin} />

      {/* 書類整理（保管庫）は別画面へ遷移 */}
      <button onClick={onOpenStorage}
        className="w-full text-left bg-white dark:bg-ink-800 rounded-xl border border-slate-200 dark:border-ink-700 px-4 py-3 hover:border-brand-300 dark:hover:border-brand-500/50 transition flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-brand-50 dark:bg-brand-500/15 flex items-center justify-center shrink-0">
          <FolderOpen className="w-5 h-5 text-brand-500" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-bold text-slate-800 dark:text-slate-100">書類整理（保管庫）</span>
          <p className="text-xs text-slate-400 mt-0.5">工事のあらゆる書類を 00〜14 のフォルダで整理（添付 {storedFiles} 件）</p>
        </div>
        <ChevronRight className="w-5 h-5 text-slate-300 shrink-0" />
      </button>

      {/* 検査書類チェックリストは別画面へ遷移 */}
      <button onClick={onOpenChecklist}
        className="mt-2 w-full text-left bg-white dark:bg-ink-800 rounded-xl border border-slate-200 dark:border-ink-700 px-4 py-3 hover:border-brand-300 dark:hover:border-brand-500/50 transition flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-brand-50 dark:bg-brand-500/15 flex items-center justify-center shrink-0">
          <ListChecks className="w-5 h-5 text-brand-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-slate-800 dark:text-slate-100">検査書類チェックリスト</span>
            <span className="text-xs text-slate-500 shrink-0">{inspDone}/{items.length} 確認</span>
          </div>
          <div className="mt-1.5"><ProgressBar done={inspDone} total={items.length} /></div>
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

      {/* 受検・試験リストは別画面へ遷移 */}
      <button onClick={onOpenTests}
        className="mt-2 w-full text-left bg-white dark:bg-ink-800 rounded-xl border border-slate-200 dark:border-ink-700 px-4 py-3 hover:border-brand-300 dark:hover:border-brand-500/50 transition flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-brand-50 dark:bg-brand-500/15 flex items-center justify-center shrink-0">
          <FlaskConical className="w-5 h-5 text-brand-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-slate-800 dark:text-slate-100">受検・試験リスト</span>
            <span className="text-xs text-slate-500 shrink-0">{testsDone}/{tests.length} 実施</span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">特記仕様書から発注者検査・化学物質濃度試験などを抽出・管理</p>
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

// ── 構造部材（柱・梁・基礎・杭・壁・鉄骨 等）──
//   構造図の部材リストを機械可読化して保持・確認する（migration 053 / API structural-members）。
//   取込は「図面をローカルで画像化→Geminiで抽出→JSON」を本セクションで読み込み、
//   AI抽出行は未確認(amber)で入り、内容を確認して確定する。将来 “符号×階” を
//   工事写真の配筋・型枠検査ツリーへ展開して撮影漏れ管理に用いる。
const STRUCT_TYPE_META = {
  '柱': 'sky', '大梁': 'indigo', '小梁': 'violet', '地中梁': 'blue', '基礎': 'amber',
  '杭': 'orange', '壁': 'teal', 'スラブ': 'cyan', '鉄骨柱': 'rose', '鉄骨梁': 'pink',
  'ブレース': 'lime', 'デッキプレート': 'stone', 'その他': 'slate',
}
// 取込JSONを平坦化。配列そのまま or {p114:{records:[...]}} / {p114:[...]} の両形に対応。
function flattenStructJson(parsed) {
  if (Array.isArray(parsed)) return parsed
  const out = []
  if (parsed && typeof parsed === 'object') {
    for (const [k, v] of Object.entries(parsed)) {
      const recs = Array.isArray(v) ? v : (Array.isArray(v?.records) ? v.records : null)
      if (!recs) continue
      const page = Number(String(k).replace(/[^0-9]/g, '')) || null
      for (const r of recs) out.push(page ? { ...r, __page: page } : r)
    }
  }
  return out
}

function StructureSection({ detail, notify, isAdmin }) {
  const [open, toggle] = useSectionCollapse('structural_members', false)
  const [members, setMembers] = useState(null) // null=未ロード
  const [order, setOrder] = useState([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState(null)   // 編集対象（null=閉）／{__new:true}=新規
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [lightbox, setLightbox] = useState(null)  // 断面図の拡大表示
  const fileRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await axios.get(
        `${apiUrl}/api/construction/projects/${detail.id}/structural-members`, authConfig())
      setMembers(data.members || [])
      setOrder(data.type_order || [])
    } catch (e) {
      notify(e.response?.data?.error || '構造部材の取得に失敗しました', 'error')
    } finally { setLoading(false) }
  }, [detail.id, notify])

  useEffect(() => { if (open && members === null) load() }, [open, members, load])

  const total = members?.length || 0
  const unconfirmed = (members || []).filter((m) => !m.confirmed).length

  const onImportFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImporting(true)
    try {
      const text = await file.text()
      const list = flattenStructJson(JSON.parse(text))
      if (!list.length) { notify('取込対象の部材が見つかりませんでした', 'error'); return }
      const { data } = await axios.post(
        `${apiUrl}/api/construction/projects/${detail.id}/structural-members/import`,
        { members: list, replace_ai: true }, authConfig())
      notify(`構造部材を ${data.inserted} 件取り込みました（内容を確認して確定してください）`)
      await load()
    } catch (err) {
      notify(err.response?.data?.error || err.message || '取込に失敗しました', 'error')
    } finally { setImporting(false) }
  }

  const confirmAll = async () => {
    setBusy(true)
    try {
      const { data } = await axios.post(
        `${apiUrl}/api/construction/projects/${detail.id}/structural-members/confirm-all`, {}, authConfig())
      notify(`${data.confirmed} 件を確定しました`)
      await load()
    } catch (e) {
      notify(e.response?.data?.error || '確定に失敗しました', 'error')
    } finally { setBusy(false) }
  }

  const toggleConfirm = async (m) => {
    try {
      await axios.patch(`${apiUrl}/api/construction/structural-members/${m.id}`,
        { confirmed: !m.confirmed }, authConfig())
      setMembers((prev) => prev.map((x) => x.id === m.id ? { ...x, confirmed: !m.confirmed } : x))
    } catch (e) {
      notify(e.response?.data?.error || '更新に失敗しました', 'error')
    }
  }

  const onDelete = async (m) => {
    setBusy(true)
    try {
      await axios.delete(`${apiUrl}/api/construction/structural-members/${m.id}`, authConfig())
      setMembers((prev) => prev.filter((x) => x.id !== m.id))
    } catch (e) {
      notify(e.response?.data?.error || '削除に失敗しました', 'error')
    } finally { setBusy(false) }
  }

  const toggleGroup = (t) => setCollapsed((p) => { const n = new Set(p); n.has(t) ? n.delete(t) : n.add(t); return n })

  // 種別ごとにグループ化（type_order 準拠、未知種別は末尾）
  const groups = []
  if (members) {
    const seen = new Set()
    const push = (t) => {
      const rows = members.filter((m) => m.member_type === t)
      if (rows.length) { groups.push([t, rows]); seen.add(t) }
    }
    for (const t of order) push(t)
    for (const m of members) if (!seen.has(m.member_type)) push(m.member_type)
  }

  return (
    <Card className="px-4 py-3 mb-4">
      <div className="flex items-center gap-1.5">
        <SectionChevron open={open} onClick={toggle} />
        <button type="button" onClick={toggle}
          className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 flex-1 text-left">
          <Building2 className="w-4 h-4 text-brand-500" /> 構造部材
          {total > 0 && <span className="text-xs font-normal text-slate-400">（{total} 部材）</span>}
          {unconfirmed > 0 && <Badge tone="warning">未確認 {unconfirmed}</Badge>}
        </button>
      </div>

      {open && (
        <div className="mt-3">
          <p className="text-xs text-slate-400 mb-3 leading-relaxed">
            構造図の柱・梁・基礎・杭・壁・鉄骨リストを機械可読化して保持します。図面から抽出したJSONを取り込み、
            内容を確認して「確定」します。確定した諸元は、今後の工事写真（配筋・型枠検査の符号別 撮り漏れチェック）や
            電子小黒板への差込に活用します。
          </p>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onImportFile} />
            <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={importing}>
              {importing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Upload className="w-4 h-4 mr-1" />}
              抽出JSONを取込
            </Button>
            <Button variant="secondary" onClick={() => setEdit({ __new: true, member_type: '柱' })}>
              <Plus className="w-4 h-4 mr-1" /> 手動追加
            </Button>
            {unconfirmed > 0 && (
              <Button variant="secondary" onClick={confirmAll} disabled={busy}>
                <CheckCircle2 className="w-4 h-4 mr-1" /> すべて確定（{unconfirmed}）
              </Button>
            )}
            <button onClick={load} disabled={loading} title="再読み込み"
              className="ml-auto p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-ink-700">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loading && members === null && (
            <div className="py-6 text-center text-slate-400 text-sm">
              <Loader2 className="w-5 h-5 animate-spin inline mr-2" />読み込み中…
            </div>
          )}

          {members && total === 0 && (
            <div className="py-6 text-center text-sm text-slate-400">
              まだ構造部材がありません。「抽出JSONを取込」または「手動追加」で登録してください。
            </div>
          )}

          {groups.map(([type, rows]) => {
            const gOpen = !collapsed.has(type)
            const gUnconf = rows.filter((r) => !r.confirmed).length
            return (
              <div key={type} className="mb-2 border border-slate-200 dark:border-ink-700 rounded-lg overflow-hidden">
                <button type="button" onClick={() => toggleGroup(type)}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-ink-800/60 text-left">
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${gOpen ? '' : '-rotate-90'}`} />
                  <Badge tone={STRUCT_TYPE_META[type] ? 'info' : 'neutral'}>{type}</Badge>
                  <span className="text-xs text-slate-500">{rows.length} 種</span>
                  {gUnconf > 0 && <span className="text-[11px] text-amber-600 dark:text-amber-400">未確認 {gUnconf}</span>}
                </button>
                {gOpen && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-400 border-b border-slate-100 dark:border-ink-700">
                          <th className="text-left font-medium px-2 py-1.5">符号</th>
                          <th className="text-left font-medium px-2 py-1.5">断面図</th>
                          <th className="text-left font-medium px-2 py-1.5">階/位置</th>
                          <th className="text-left font-medium px-2 py-1.5">断面</th>
                          <th className="text-left font-medium px-2 py-1.5">主筋</th>
                          <th className="text-left font-medium px-2 py-1.5">帯筋/あばら筋</th>
                          <th className="text-left font-medium px-2 py-1.5">備考</th>
                          <th className="px-2 py-1.5"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((m) => (
                          <tr key={m.id}
                            className={`border-b border-slate-50 dark:border-ink-800 ${m.confirmed ? '' : 'bg-amber-50/60 dark:bg-amber-500/5'}`}>
                            <td className="px-2 py-1.5 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                              {m.symbol}
                              {m.source === 'ai' && !m.confirmed && (
                                <span title="AI抽出・未確認" className="ml-1 inline-block align-middle">
                                  <Sparkles className="w-3 h-3 text-amber-500 inline" />
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-1.5">
                              {m.section_url ? (
                                <img src={m.section_url} alt={`${m.symbol} 断面図`} loading="lazy"
                                  onClick={() => setLightbox(m)}
                                  className="h-11 w-auto max-w-[5rem] object-contain bg-white rounded border border-slate-200 dark:border-ink-600 cursor-zoom-in" />
                              ) : (
                                <span className="text-slate-300 dark:text-slate-600 text-[11px]">—</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-slate-500 whitespace-nowrap">{m.floor || '—'}</td>
                            <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300 whitespace-nowrap">{m.section || '—'}</td>
                            <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">{m.main_rebar || '—'}</td>
                            <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">{m.shear_rebar || '—'}</td>
                            <td className="px-2 py-1.5 text-slate-400 max-w-[16rem] truncate" title={m.note || ''}>{m.note || '—'}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap text-right">
                              <button onClick={() => toggleConfirm(m)} title={m.confirmed ? '確定済み（クリックで戻す）' : '確定する'}
                                className={`p-1 rounded ${m.confirmed ? 'text-emerald-500' : 'text-slate-300 hover:text-emerald-500'}`}>
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                              <button onClick={() => setEdit(m)} title="編集"
                                className="p-1 rounded text-slate-400 hover:text-brand-500">
                                <Pencil className="w-4 h-4" />
                              </button>
                              {isAdmin && (
                                <button onClick={() => onDelete(m)} disabled={busy} title="削除（管理者）"
                                  className="p-1 rounded text-slate-300 hover:text-danger-500">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {edit && (
        <StructMemberModal
          projectId={detail.id}
          member={edit.__new ? null : edit}
          typeOrder={order}
          onClose={() => setEdit(null)}
          onSaved={(msg) => { setEdit(null); notify(msg); load() }}
          onError={(m) => notify(m, 'error')}
        />
      )}

      {lightbox && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white">
            <X className="w-5 h-5" />
          </button>
          <div className="max-w-[92vw] max-h-[88vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.section_url} alt={`${lightbox.symbol} 断面図`}
              className="max-w-full max-h-[80vh] object-contain bg-white rounded-lg shadow-2xl" />
            <div className="text-center text-white text-sm mt-3">
              <span className="font-semibold">{lightbox.member_type}　{lightbox.symbol}</span>
              {lightbox.floor ? `　${lightbox.floor}` : ''}
              {lightbox.section ? `　／　${lightbox.section}` : ''}
              {lightbox.main_rebar ? `　主筋 ${lightbox.main_rebar}` : ''}
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

// 構造部材の編集／手動追加モーダル
const STRUCT_TYPES_FALLBACK = ['柱', '大梁', '小梁', '地中梁', '基礎', '杭', '壁', 'スラブ', '鉄骨柱', '鉄骨梁', 'ブレース', 'デッキプレート', 'その他']
function StructMemberModal({ projectId, member, typeOrder, onClose, onSaved, onError }) {
  const isNew = !member
  const [f, setF] = useState({
    member_type: member?.member_type || '柱',
    symbol: member?.symbol || '',
    floor: member?.floor || '',
    section: member?.section || '',
    main_rebar: member?.main_rebar || '',
    shear_rebar: member?.shear_rebar || '',
    concrete_strength: member?.concrete_strength || '',
    note: member?.note || '',
    confirmed: member ? !!member.confirmed : true,
  })
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const types = (typeOrder && typeOrder.length ? typeOrder : STRUCT_TYPES_FALLBACK)

  const submit = async () => {
    if (!f.symbol.trim()) { onError('符号は必須です'); return }
    setSaving(true)
    try {
      if (isNew) {
        await axios.post(`${apiUrl}/api/construction/projects/${projectId}/structural-members`, f, authConfig())
      } else {
        await axios.patch(`${apiUrl}/api/construction/structural-members/${member.id}`, f, authConfig())
      }
      onSaved(isNew ? '構造部材を追加しました' : '構造部材を更新しました')
    } catch (e) {
      onError(e.response?.data?.error || '保存に失敗しました')
    } finally { setSaving(false) }
  }

  return (
    <ModalShell title={isNew ? '構造部材を追加' : `構造部材を編集：${member.symbol}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="部材種別 *">
            <select className={inputCls} value={f.member_type} onChange={set('member_type')}>
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="符号 *">
            <input className={inputCls} value={f.symbol} onChange={set('symbol')} placeholder="例: C1 / G1 / FG1" />
          </Field>
          <Field label="階・位置">
            <input className={inputCls} value={f.floor} onChange={set('floor')} placeholder="例: 2階 / R階 / 全断面" />
          </Field>
          <Field label="断面">
            <input className={inputCls} value={f.section} onChange={set('section')} placeholder="例: 900x1000 / H-400x200 / t=180" />
          </Field>
        </div>
        <Field label="主筋（梁は上端・下端／壁は縦筋）">
          <input className={inputCls} value={f.main_rebar} onChange={set('main_rebar')} placeholder="例: 16-D25 / 上端 5-D25 下端 4-D25" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="帯筋・あばら筋・横筋">
            <input className={inputCls} value={f.shear_rebar} onChange={set('shear_rebar')} placeholder="例: D13@100（K=高強度）" />
          </Field>
          <Field label="コンクリート強度">
            <input className={inputCls} value={f.concrete_strength} onChange={set('concrete_strength')} placeholder="例: Fc24" />
          </Field>
        </div>
        <Field label="備考">
          <textarea className={inputCls} rows={2} value={f.note} onChange={set('note')} placeholder="位置・本数・支持力・ベースプレート寸法など" />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer select-none">
          <input type="checkbox" checked={f.confirmed} onChange={(e) => setF((s) => ({ ...s, confirmed: e.target.checked }))} />
          内容を確認済み（確定）とする
        </label>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose}
          className="px-4 py-2 text-sm rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-ink-700">
          キャンセル
        </button>
        <Button onClick={submit} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" />{isNew ? '追加' : '保存'}</>}
        </Button>
      </div>
    </ModalShell>
  )
}

// ── 検査書類チェックリスト（別画面・区分別アコーディオン）──
//   発注者「完成・完了検査チェックリスト」の項目を確認・達成管理。
//   書類整理(保管庫)の書類を手動で紐づけ＋1日1回のAI棚卸しで自動✓。
function ChecklistBody({ detail, onReload, onOpenStorage, notify }) {
  const items = detail.inspection_items || []
  const docs = detail.documents || []
  const done = items.filter((it) => it.status === 'done' || it.status === 'na').length
  const [sweeping, setSweeping] = useState(false)
  // 区分(section)を出現順で取得
  const sections = []
  for (const it of items) if (!sections.includes(it.section)) sections.push(it.section)
  const [collapsed, setCollapsed] = useState(() => new Set())
  const toggleSec = (s) => setCollapsed((p) => { const n = new Set(p); n.has(s) ? n.delete(s) : n.add(s); return n })

  // 書類整理の書類（紐づけ候補）
  const docOptions = docs.map((d) => ({ id: d.id, label: `${folderLabel(d.folder_no)} ＞ ${d.doc_name}` }))
  const docName = (id) => (docOptions.find((o) => o.id === id) || {}).label || '（不明な書類）'

  const patchItem = async (item, patch) => {
    try {
      await axios.patch(`${apiUrl}/api/construction/inspection-items/${item.id}`, patch, authConfig())
      onReload()
    } catch (e) {
      notify(e.response?.data?.error || '更新に失敗しました', 'error')
    }
  }

  // AI棚卸し: 保管庫の書類から未確認項目に該当するものをAIが判定して自動✓
  const onSweep = async () => {
    setSweeping(true)
    try {
      const { data } = await axios.post(`${apiUrl}/api/construction/projects/${detail.id}/inspection-sweep`, {}, authConfig())
      notify(data.skipped === 'no_api_key'
        ? 'AIが未設定のため棚卸しできません'
        : (data.examined || 0) === 0
          ? '新たに精査する書類はありませんでした（すべて照合済み）'
          : `AI棚卸し完了：${data.examined} 件を精査し ${data.matched || 0} 件を確認済みにしました`)
      onReload()
    } catch (e) {
      notify(e.response?.data?.error || 'AI棚卸しに失敗しました', 'error')
    } finally { setSweeping(false) }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-brand-500" /> 検査書類チェックリスト
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 truncate">{detail.project_name}（{detail.work_category === '改修' ? '改修工事編' : '新設工事編'}）</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={onSweep} disabled={sweeping}
            title="保管庫に格納済みの書類から、未確認の項目に該当するものをAIが判定して自動で確認済みにします"
            className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1 disabled:opacity-50">
            {sweeping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            AI棚卸し
          </button>
          <button onClick={onOpenStorage} className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1">
            <FolderOpen className="w-3.5 h-3.5" /> 書類整理へ
          </button>
        </div>
      </div>

      <Card className="px-4 py-3 mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">検査書類の確認状況</span>
          <span className="text-xs text-slate-500">{done}/{items.length} 確認</span>
        </div>
        <ProgressBar done={done} total={items.length} />
      </Card>

      {items.length === 0 ? (
        <Card className="text-center py-8 text-slate-500 dark:text-slate-400 text-sm">チェック項目がありません。</Card>
      ) : (
        <div className="space-y-3">
          {sections.map((sec) => {
            const rows = items.filter((it) => it.section === sec)
            const secDone = rows.filter((it) => it.status === 'done' || it.status === 'na').length
            const isOpen = !collapsed.has(sec)
            return (
              <div key={sec} className="bg-white dark:bg-ink-800 rounded-xl border border-slate-200 dark:border-ink-700 overflow-hidden">
                <button onClick={() => toggleSec(sec)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-ink-700/50 transition">
                  <ChevronRight className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex-1 text-left truncate">{sec}</h3>
                  <span className="text-xs text-slate-400 shrink-0">{secDone}/{rows.length}</span>
                </button>
                {isOpen && (
                  <div className="border-t border-slate-100 dark:border-ink-700 divide-y divide-slate-100 dark:divide-ink-700">
                    {rows.map((it) => (
                      <InspectionRow key={it.id} item={it} docOptions={docOptions} docName={docName} onPatch={patchItem} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// 検査チェック項目の1行（確認状態の切替＋保管庫書類の手動紐づけ）
function InspectionRow({ item, docOptions, docName, onPatch }) {
  const st = item.status
  const cycle = () => onPatch(item, { status: st === 'pending' ? 'done' : st === 'done' ? 'na' : 'pending' })
  const onLink = (e) => {
    const v = e.target.value
    if (!v) onPatch(item, { linked_document_id: null, status: 'pending' })
    else onPatch(item, { linked_document_id: Number(v), status: 'done' })
  }
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <button onClick={cycle} title="未 → 済 → 対象外 を切替" className="shrink-0">
        {st === 'done' ? <CheckCircle2 className="w-5 h-5 text-success-500" />
          : st === 'na' ? <MinusCircle className="w-5 h-5 text-slate-400" />
            : <Circle className="w-5 h-5 text-slate-300" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`text-sm truncate ${st === 'na' ? 'text-slate-400 line-through' : 'text-slate-800 dark:text-slate-200'}`}>{item.item_name}</span>
          {item.note && <span className="text-[11px] text-slate-400 truncate">{item.note}</span>}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          {item.linked_document_id && (
            <span className="text-[11px] text-brand-600 dark:text-brand-400 flex items-center gap-0.5 truncate">
              <Link2 className="w-3 h-3 shrink-0" />{docName(item.linked_document_id)}
            </span>
          )}
          {item.ai_confidence != null && (
            <span className="text-[11px] text-slate-400 flex items-center gap-0.5" title={item.ai_note || ''}>
              <Sparkles className="w-3 h-3" />AI{Math.round((item.ai_confidence || 0) * 100)}%
            </span>
          )}
          {item.checked_by && <span className="text-[11px] text-slate-400">確認済</span>}
        </div>
      </div>
      <select value={item.linked_document_id || ''} onChange={onLink}
        title="保管庫の該当書類を紐づける"
        className="text-xs px-2 py-1 rounded-lg border border-slate-200 dark:border-ink-600 bg-white dark:bg-ink-700 text-slate-700 dark:text-slate-200 max-w-[40%]">
        <option value="">紐づけ…</option>
        {docOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  )
}

// ── 受検・試験リスト（別画面・区分別アコーディオン）──
//   特記仕様書から「発注者検査・化学物質濃度試験・法定検査・その他試験」を
//   AI抽出→人が確認→登録し、予定日・実施日・合否を管理。成績書(保管庫)と紐づけ。
function InspectionTestsBody({ detail, onReload, notify }) {
  // 対象外(na)は表示しない。実施対象の項目だけを扱う。
  const tests = (detail.inspection_tests || []).filter((t) => t.status !== 'na')
  const docs = detail.documents || []
  const done = tests.filter((t) => INSP_TEST_DONE.includes(t.status)).length
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(null)   // { items, used_files } or null
  const [saving, setSaving] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [collapsed, setCollapsed] = useState(() => new Set())
  const toggle = (c) => setCollapsed((p) => { const n = new Set(p); n.has(c) ? n.delete(c) : n.add(c); return n })

  // 保管庫の書類（成績書・報告書の紐づけ候補）
  const docOptions = docs.map((d) => ({ id: d.id, label: `${folderLabel(d.folder_no)} ＞ ${d.doc_name}` }))
  const docName = (id) => (docOptions.find((o) => o.id === id) || {}).label || '（不明な書類）'

  // 表示する区分（マスタ順＋万一マスタ外があれば末尾に）
  const cats = [...INSP_TEST_CATEGORIES, ...[...new Set(tests.map((t) => t.category))].filter((c) => !INSP_TEST_CATEGORIES.includes(c))]

  // 保管庫(書類整理)の保存済みファイルを選んで → AIが受検・試験を抽出（保存せずプレビュー）
  const onExtractStored = async (fileIds) => {
    if (!fileIds?.length) return
    setPickerOpen(false)
    setBusy(true)
    try {
      const { data } = await axios.post(`${apiUrl}/api/construction/projects/${detail.id}/inspection-tests/extract-stored`, { file_ids: fileIds }, authConfig())
      // 対象外（実施しない）は表示・登録しない。実施対象のみをプレビューに出す。
      const items = (data.items || []).filter((it) => it.applicable !== false)
      if (!items.length) { notify('実施対象の検査・試験は見つかりませんでした', 'error'); return }
      setPreview({ items, used_files: data.used_files || [] })
    } catch (err) {
      notify(err.response?.data?.error || 'AI抽出に失敗しました', 'error')
    } finally {
      setBusy(false)
    }
  }

  // プレビューで選んだ項目を一括登録
  const onConfirm = async (chosen) => {
    setSaving(true)
    try {
      const payload = chosen.map((c) => ({
        category: c.category, name: c.name, target: c.target, timing: c.timing,
        basis: c.basis, witness: c.witness, applicable: c.applicable,
        confidence: c.confidence, reason: c.reason,
      }))
      const { data } = await axios.post(`${apiUrl}/api/construction/projects/${detail.id}/inspection-tests/bulk`, { items: payload }, authConfig())
      setPreview(null)
      notify(`${data.inserted || 0} 件を登録しました`)
      onReload()
    } catch (err) {
      notify(err.response?.data?.error || '登録に失敗しました', 'error')
    } finally { setSaving(false) }
  }

  const patchTest = async (test, patch) => {
    try {
      await axios.patch(`${apiUrl}/api/construction/inspection-tests/${test.id}`, patch, authConfig())
      onReload()
    } catch (e) {
      notify(e.response?.data?.error || '更新に失敗しました', 'error')
    }
  }
  const deleteTest = async (test) => {
    if (!window.confirm(`「${test.name}」を削除します。よろしいですか？`)) return
    try {
      await axios.delete(`${apiUrl}/api/construction/inspection-tests/${test.id}`, authConfig())
      notify('削除しました')
      onReload()
    } catch (e) {
      notify(e.response?.data?.error || '削除に失敗しました', 'error')
    }
  }
  const syncPhotos = async () => {
    setSyncing(true)
    try {
      const { data } = await axios.post(`${apiUrl}/api/construction/projects/${detail.id}/inspection-tests/sync-photos`, {}, authConfig())
      notify(data.inserted ? `工事写真ツリーに ${data.inserted} 件を追加しました` : '工事写真ツリーは最新です（追加はありません）')
    } catch (e) {
      notify(e.response?.data?.error || '工事写真への追加に失敗しました', 'error')
    } finally { setSyncing(false) }
  }
  const clearAll = async () => {
    if (!window.confirm(`この工事の受検・試験リスト（${tests.length}件）をすべて削除します。\n特記仕様書から抽出し直したいときに使います。\n\nよろしいですか？`)) return
    try {
      const { data } = await axios.delete(`${apiUrl}/api/construction/projects/${detail.id}/inspection-tests`, authConfig())
      notify(`${data.deleted || 0} 件を削除しました`)
      onReload()
    } catch (e) {
      notify(e.response?.data?.error || '全消去に失敗しました', 'error')
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-brand-500" /> 受検・試験リスト
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 truncate">{detail.project_name}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={() => setPickerOpen(true)} disabled={busy}
            title="保管庫(書類整理)に保存済みの特記仕様書を選ぶと、発注者検査・化学物質濃度試験・法定検査・その他試験をAIが抽出します（確認のうえ登録）"
            className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1 disabled:opacity-50">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            特記仕様書からAI抽出
          </button>
          <button onClick={() => setAddOpen(true)} className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> 手動で追加
          </button>
          {tests.length > 0 && (
            <button onClick={syncPhotos} disabled={syncing}
              title="このリストの実施対象を工事写真ツリーに撮影対象として追加します（新規登録分は自動で追加されます）"
              className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1 disabled:opacity-50">
              {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
              工事写真ツリーへ追加
            </button>
          )}
          {tests.length > 0 && (
            <button onClick={clearAll} title="この工事の受検・試験を全削除（特記仕様書から抽出し直すとき用）"
              className="text-xs font-semibold text-danger-600 dark:text-danger-400 hover:underline flex items-center gap-1">
              <Trash2 className="w-3.5 h-3.5" /> 全消去
            </button>
          )}
        </div>
      </div>

      <Card className="px-4 py-3 mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">実施状況（実施済・合格を完了とカウント）</span>
          <span className="text-xs text-slate-500">{done}/{tests.length} 完了</span>
        </div>
        <ProgressBar done={done} total={tests.length} />
      </Card>

      {tests.length === 0 ? (
        <Card className="text-center py-8 text-slate-500 dark:text-slate-400 text-sm">
          まだ項目がありません。<span className="font-semibold">特記仕様書からAI抽出</span>するか、手動で追加してください。
        </Card>
      ) : (
        <div className="space-y-3">
          {cats.map((cat) => {
            const rows = tests.filter((t) => t.category === cat)
            if (rows.length === 0) return null
            const catDone = rows.filter((t) => INSP_TEST_DONE.includes(t.status)).length
            const isOpen = !collapsed.has(cat)
            return (
              <div key={cat} className="bg-white dark:bg-ink-800 rounded-xl border border-slate-200 dark:border-ink-700 overflow-hidden">
                <button onClick={() => toggle(cat)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-ink-700/50 transition">
                  <ChevronRight className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex-1 text-left truncate">{cat}</h3>
                  <span className="text-xs text-slate-400 shrink-0">{catDone}/{rows.length}</span>
                </button>
                {isOpen && (
                  <div className="border-t border-slate-100 dark:border-ink-700 divide-y divide-slate-100 dark:divide-ink-700">
                    {rows.map((t) => (
                      <TestRow key={t.id} test={t} docOptions={docOptions} docName={docName} onPatch={patchTest} onDelete={deleteTest} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {busy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-ink-800 rounded-2xl shadow-xl border border-slate-200 dark:border-ink-700 px-8 py-7 max-w-sm w-full text-center">
            <Loader2 className="w-8 h-8 animate-spin text-brand-500 mx-auto mb-3" />
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">AIが特記仕様書を読み取っています…</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
              発注者検査・化学物質濃度試験・法定検査などを抽出しています。<br />
              ページ数によっては1分ほどかかります。このままお待ちください。
            </div>
          </div>
        </div>
      )}
      {pickerOpen && (
        <SpecPickerModal
          documents={docs}
          onClose={() => setPickerOpen(false)}
          onPick={onExtractStored}
        />
      )}
      {preview && (
        <TestExtractModal
          items={preview.items}
          usedFiles={preview.used_files}
          saving={saving}
          onClose={() => setPreview(null)}
          onConfirm={onConfirm}
        />
      )}
      {addOpen && (
        <AddTestModal
          projectId={detail.id}
          onClose={() => setAddOpen(false)}
          onAdded={() => { setAddOpen(false); onReload(); notify('項目を追加しました') }}
          onError={(m) => notify(m, 'error')}
        />
      )}
    </div>
  )
}

// 受検・試験の1行（状態・予定日・実施日・成績書紐づけ・結果メモ・削除）
function TestRow({ test, docOptions, docName, onPatch, onDelete }) {
  const onStatus = (e) => onPatch(test, { status: e.target.value })
  const onLink = (e) => {
    const v = e.target.value
    onPatch(test, { linked_document_id: v ? Number(v) : null })
  }
  const selectCls = 'text-xs px-2 py-1 rounded-lg border border-slate-200 dark:border-ink-600 bg-white dark:bg-ink-700 text-slate-700 dark:text-slate-200'
  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{test.name}</span>
            {test.source === 'ai' && test.ai_confidence != null && (
              <span className="text-[11px] text-slate-400 flex items-center gap-0.5" title={test.ai_reason || ''}>
                <Sparkles className="w-3 h-3" />AI{Math.round((test.ai_confidence || 0) * 100)}%
              </span>
            )}
          </div>
          {(test.target || test.timing || test.witness || test.basis) && (
            <div className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
              {test.target && <span>対象: {test.target}</span>}
              {test.timing && <span>時期: {test.timing}</span>}
              {test.witness && <span>立会: {test.witness}</span>}
              {test.basis && <span>根拠: {test.basis}</span>}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <select value={test.status} onChange={onStatus} title="状態" className={selectCls}>
              {INSP_TEST_VISIBLE_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <label className="text-[11px] text-slate-400 flex items-center gap-1">予定
              <input type="date" value={test.scheduled_date || ''} onChange={(e) => onPatch(test, { scheduled_date: e.target.value || null })} className={selectCls} />
            </label>
            <label className="text-[11px] text-slate-400 flex items-center gap-1">実施
              <input type="date" value={test.done_date || ''} onChange={(e) => onPatch(test, { done_date: e.target.value || null })} className={selectCls} />
            </label>
            <select value={test.linked_document_id || ''} onChange={onLink} title="成績書・報告書（保管庫）を紐づける" className={`${selectCls} max-w-[45%]`}>
              <option value="">成績書を紐づけ…</option>
              {docOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          {test.linked_document_id && (
            <div className="text-[11px] text-brand-600 dark:text-brand-400 flex items-center gap-0.5 mt-1 truncate">
              <Link2 className="w-3 h-3 shrink-0" />{docName(test.linked_document_id)}
            </div>
          )}
          <input
            placeholder="結果・所見メモ"
            defaultValue={test.result_note || ''}
            onBlur={(e) => { if ((e.target.value || '') !== (test.result_note || '')) onPatch(test, { result_note: e.target.value }) }}
            className="mt-1.5 w-full text-xs px-2 py-1 rounded-lg border border-slate-200 dark:border-ink-600 bg-white dark:bg-ink-700 text-slate-700 dark:text-slate-200"
          />
        </div>
        <button onClick={() => onDelete(test)} title="削除" className="shrink-0 text-slate-300 hover:text-danger-500">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// 保管庫(書類整理)の保存済みファイルから、AI抽出の対象（特記仕様書）を選ぶ
function SpecPickerModal({ documents, onClose, onPick }) {
  // 保管庫の全ファイルをフラット化（PDF/画像のみ。特記仕様書らしいものを上に）
  const all = []
  for (const d of documents || []) {
    for (const f of (d.files || [])) {
      const mt = f.mime_type || ''
      const isDoc = mt === 'application/pdf' || mt.startsWith('image/') || /\.(pdf|png|jpe?g|gif|webp)$/i.test(f.file_name || '')
      if (!isDoc) continue
      const likely = d.folder_no === 1 || /特記|仕様/.test(`${d.doc_name || ''}${f.file_name || ''}`)
      all.push({ id: f.id, fileName: f.file_name, folderNo: d.folder_no, docName: d.doc_name, likely })
    }
  }
  all.sort((a, b) => (b.likely - a.likely))
  const [sel, setSel] = useState(() => new Set(all.filter((x) => x.likely).map((x) => x.id)))
  const toggle = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  return (
    <ModalShell title="特記仕様書を選択（保管庫から）" onClose={onClose} wide>
      {all.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 py-4">
          保管庫（書類整理）に読み取れるファイル（PDF/画像）がありません。<br />
          先に <span className="font-semibold">書類整理（保管庫）</span> へ特記仕様書を保存してから、ここで選んでください。
        </p>
      ) : (
        <>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            保管庫の保存済みファイルから、読み取る特記仕様書を選んでください。「設計図書」フォルダや「特記／仕様」を含むファイルは初期選択済みです（複数選択可）。
          </p>
          <div className="space-y-1 max-h-[55vh] overflow-auto -mx-2 px-2">
            {all.map((f) => (
              <label key={f.id} className={`flex items-center gap-2 py-2 border-b border-slate-100 dark:border-ink-700 cursor-pointer ${sel.has(f.id) ? '' : 'opacity-60'}`}>
                <input type="checkbox" checked={sel.has(f.id)} onChange={() => toggle(f.id)} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-slate-800 dark:text-slate-100 truncate">{f.fileName}</div>
                  <div className="text-[11px] text-slate-400 truncate">{folderLabel(f.folderNo)} ＞ {f.docName}</div>
                </div>
                {f.likely && <Badge tone="info">特記候補</Badge>}
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={onClose}>キャンセル</Button>
            <Button onClick={() => onPick([...sel])} disabled={!sel.size}>
              <Sparkles className="w-4 h-4" />{sel.size} 件で抽出
            </Button>
          </div>
        </>
      )}
    </ModalShell>
  )
}

// AI抽出結果のプレビュー（登録する項目を選び、区分を直してから一括登録）
function TestExtractModal({ items, usedFiles, saving, onClose, onConfirm }) {
  const [rows, setRows] = useState(() => items.map((it, i) => ({ ...it, _include: true, _key: i })))
  const toggle = (k) => setRows((rs) => rs.map((r) => (r._key === k ? { ...r, _include: !r._include } : r)))
  const setCat = (k, v) => setRows((rs) => rs.map((r) => (r._key === k ? { ...r, category: v } : r)))
  const chosen = rows.filter((r) => r._include)
  const selectCls = 'text-xs px-2 py-1 rounded-lg border border-slate-200 dark:border-ink-600 bg-white dark:bg-ink-700 text-slate-700 dark:text-slate-200'
  return (
    <ModalShell title="特記仕様書から抽出した受検・試験" onClose={onClose} wide>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        {rows.length} 件を読み取りました。登録する項目にチェックし、区分を必要に応じて直してから登録してください。
        {usedFiles?.length ? <span className="block mt-0.5 text-slate-400">対象ファイル: {usedFiles.join(' / ')}</span> : null}
      </p>
      <div className="space-y-1 max-h-[58vh] overflow-auto -mx-2 px-2">
        {rows.map((r) => (
          <div key={r._key} className={`flex items-start gap-2 py-2 border-b border-slate-100 dark:border-ink-700 ${r._include ? '' : 'opacity-50'}`}>
            <input type="checkbox" checked={r._include} onChange={() => toggle(r._key)} className="mt-1 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{r.name}</span>
                {r.applicable === false && <Badge tone="neutral">対象外</Badge>}
                {r.confidence != null && <span className="text-[11px] text-slate-400">AI{Math.round((r.confidence || 0) * 100)}%</span>}
              </div>
              {(r.target || r.timing || r.witness || r.basis) && (
                <div className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                  {r.target && <span>対象: {r.target}</span>}
                  {r.timing && <span>時期: {r.timing}</span>}
                  {r.witness && <span>立会: {r.witness}</span>}
                  {r.basis && <span>根拠: {r.basis}</span>}
                </div>
              )}
            </div>
            <select value={r.category} onChange={(e) => setCat(r._key, e.target.value)} className={`${selectCls} shrink-0`}>
              {INSP_TEST_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="ghost" onClick={onClose}>キャンセル</Button>
        <Button onClick={() => onConfirm(chosen)} disabled={saving || !chosen.length}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          {chosen.length} 件を登録
        </Button>
      </div>
    </ModalShell>
  )
}

// 受検・試験を手動で1件追加
function AddTestModal({ projectId, onClose, onAdded, onError }) {
  const [f, setF] = useState({ category: '発注者検査', name: '', target: '', timing: '', witness: '', basis: '' })
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))
  const submit = async () => {
    if (!f.name.trim()) { onError('名称を入力してください'); return }
    setSaving(true)
    try {
      await axios.post(`${apiUrl}/api/construction/projects/${projectId}/inspection-tests`, f, authConfig())
      onAdded()
    } catch (err) {
      onError(err.response?.data?.error || '追加に失敗しました')
    } finally { setSaving(false) }
  }
  const selectCls = 'w-full text-sm px-3 py-2 rounded-lg border border-slate-300 dark:border-ink-600 bg-white dark:bg-ink-700 text-slate-700 dark:text-slate-200'
  return (
    <ModalShell title="受検・試験を追加" onClose={onClose}>
      <div className="space-y-3">
        <Field label="区分">
          <select value={f.category} onChange={set('category')} className={selectCls}>
            {INSP_TEST_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="名称（必須）"><input className={inputCls} value={f.name} onChange={set('name')} placeholder="例: 中間技術検査 / 化学物質の濃度測定" /></Field>
        <Field label="対象"><input className={inputCls} value={f.target} onChange={set('target')} placeholder="対象工程・室・材料・物質" /></Field>
        <Field label="実施時期"><input className={inputCls} value={f.timing} onChange={set('timing')} placeholder="例: 工事完成時 / 配筋完了後" /></Field>
        <Field label="立会区分">
          <select value={f.witness} onChange={set('witness')} className={selectCls}>
            <option value="">—</option>
            {INSP_WITNESS_OPTIONS.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </Field>
        <Field label="根拠"><input className={inputCls} value={f.basis} onChange={set('basis')} placeholder="特記の項番・標準仕様書の条番号など" /></Field>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="ghost" onClick={onClose}>キャンセル</Button>
        <Button onClick={submit} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}追加</Button>
      </div>
    </ModalShell>
  )
}

// ── 書類整理（保管庫・別画面）00〜14 フォルダ別アコーディオン ──
function StorageBody({ detail, onReload, onEditDoc, onAddDoc, notify }) {
  // 保管庫は「実ファイルのある書類」だけを表示する。
  // （旧・提出書類リストの名残で中身が空のまま名前だけ残った書類は出さない）
  const docs = (detail.documents || []).filter((d) => (d.files?.length || 0) > 0)
  const storedFiles = docs.reduce((n, d) => n + (d.files?.length || 0), 0)
  const [aiUploading, setAiUploading] = useState(false)
  // 既定: 書類のあるフォルダは展開、空フォルダは折りたたみ
  const [collapsed, setCollapsed] = useState(() => new Set(CONS_FOLDERS.filter((f) => !docs.some((d) => d.folder_no === f.no)).map((f) => f.no)))
  const toggle = (no) => setCollapsed((p) => { const n = new Set(p); n.has(no) ? n.delete(no) : n.add(no); return n })

  // 書類をアップロード→Geminiが内容を読み取り、該当フォルダへ自動で振り分けて格納
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
      const where = `${folderLabel(data.document.folder_no)} ＞ ${data.document.doc_name}`
      notify(c
        ? `「${where}」へ自動で振り分けました（確信度 ${Math.round((c.confidence || 0) * 100)}%）`
        : `「${where}」へ格納しました（AI判定なし。フォルダをご確認ください）`)
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
            <FolderOpen className="w-5 h-5 text-brand-500" /> 書類整理（保管庫）
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 truncate">{detail.project_name}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <label className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline cursor-pointer flex items-center gap-1" title="アップロードした書類の内容をAIが読み取り、00〜14 のフォルダへ自動で振り分けます">
            {aiUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            AIで振り分けアップロード
            <input type="file" className="hidden" onChange={onAiUpload} disabled={aiUploading} />
          </label>
          <button onClick={onAddDoc} className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> 書類を追加
          </button>
        </div>
      </div>

      <Card className="px-4 py-3 mb-4 text-xs text-slate-500 dark:text-slate-400">
        工事のあらゆる書類をフォルダ別に整理します。ここに入れた書類のうち検査で必要なものは、
        <span className="font-semibold">検査書類チェックリスト</span>側で紐づけ・AI棚卸しにより自動で確認済みになります。（添付 {storedFiles} 件）
      </Card>

      <div className="space-y-3">
        {CONS_FOLDERS.map((f) => {
          const rows = docs.filter((d) => d.folder_no === f.no)
          const isOpen = !collapsed.has(f.no)
          return (
            <div key={f.no} className="bg-white dark:bg-ink-800 rounded-xl border border-slate-200 dark:border-ink-700 overflow-hidden">
              <button onClick={() => toggle(f.no)}
                className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-ink-700/50 transition">
                <ChevronRight className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                <span className="text-[11px] font-bold text-white bg-brand-500 rounded-md px-1.5 h-5 flex items-center justify-center shrink-0 tabular-nums">{String(f.no).padStart(2, '0')}</span>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex-1 text-left truncate">{f.name}</h3>
                <span className="text-xs text-slate-400 shrink-0">{rows.length} 件</span>
              </button>
              {isOpen && (
                rows.length === 0 ? (
                  <div className="border-t border-slate-100 dark:border-ink-700 px-4 py-3 text-xs text-slate-400">書類なし</div>
                ) : (
                  <div className="border-t border-slate-100 dark:border-ink-700 divide-y divide-slate-100 dark:divide-ink-700">
                    {rows.map((d) => (
                      <DocRow key={d.id} doc={d} onEdit={() => onEditDoc(d)} />
                    ))}
                  </div>
                )
              )}
            </div>
          )
        })}
      </div>
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
// 施工計画書の工種（テンプレ名 工種別_<key>_… / 自主検査CL_<key>_… の <key> に一致）
const SEKO_KOSHU = [
  '01_直接仮設工事', '02_土工事', '03_地業工事', '04_鉄筋工事', '05_コンクリート工事',
  '06_型枠工事', '07_既製コンクリート工事', '08_防水工事', '09_石工事', '10_タイル工事',
  '11_屋根及びとい工事', '12_金属工事', '13_左官工事', '14_建具工事', '15_塗装工事',
  '16_内外装工事', '17_ユニット及びその他工事',
]
const SEKO_PLAN_TYPES = [
  { key: 'soukatsu', label: '総合施工計画書' },
  { key: 'koshu', label: '工種別施工計画書' },
  { key: 'checklist', label: '自主検査チェックリスト' },
]
const SEKO_STATUS_TONE = { queued: 'warning', processing: 'warning', done: 'success', error: 'danger' }
const SEKO_STATUS_LABEL = { queued: '待機中', processing: '生成中', done: '完了', error: 'エラー' }

// ── 施工計画書 生成（ハイブリッド: ジョブ投入→常駐エージェント生成→回収DL）──
//   工事マスタ（契約情報・体制）から Word を自動生成。総合／工種別／自主検査CL に対応。
function SekoPlanSection({ detail, notify }) {
  const [open, toggleOpen] = useSectionCollapse('seko_plan', true)
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [planType, setPlanType] = useState('soukatsu')
  const [koshu, setKoshu] = useState(SEKO_KOSHU[3]) // 既定=鉄筋
  const [busy, setBusy] = useState(false)
  const [dlId, setDlId] = useState(null)
  const pollRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await axios.get(`${apiUrl}/api/construction/projects/${detail.id}/seko-plans`, authConfig())
      setPlans(data.plans || [])
    } catch { /* noop */ } finally { setLoading(false) }
  }, [detail.id])

  useEffect(() => { load() }, [load])
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  // 生成中ジョブがある間、状態をポーリングして一覧を更新
  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    let ticks = 0
    pollRef.current = setInterval(async () => {
      ticks += 1
      const pending = plans.filter((p) => p.status === 'queued' || p.status === 'processing')
      try {
        const results = await Promise.all(
          pending.map((p) => axios.get(`${apiUrl}/api/construction/seko-plans/${p.id}/status`, authConfig()).then((r) => r.data).catch(() => null)),
        )
        if (results.some((r) => r && (r.ready || r.status === 'error')) || ticks > 75) {
          await load()
        }
      } catch { /* noop */ }
    }, 4000)
  }, [plans, load])

  useEffect(() => {
    const hasPending = plans.some((p) => p.status === 'queued' || p.status === 'processing')
    if (hasPending) startPolling()
    else if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    return () => { if (pollRef.current && !hasPending) { clearInterval(pollRef.current); pollRef.current = null } }
  }, [plans, startPolling])

  const onGenerate = async () => {
    setBusy(true)
    try {
      const body = { plan_type: planType }
      if (planType !== 'soukatsu') body.koshu = koshu
      await axios.post(`${apiUrl}/api/construction/projects/${detail.id}/seko-plans`, body, authConfig())
      notify('生成ジョブを投入しました。エージェントが生成すると完了します')
      await load()
    } catch (err) {
      notify(err.response?.data?.error || '生成ジョブの投入に失敗しました', 'error')
    } finally { setBusy(false) }
  }

  const onDownload = async (plan) => {
    setDlId(plan.id)
    try {
      const token = localStorage.getItem('authToken')
      const resp = await axios.get(`${apiUrl}/api/construction/seko-plans/${plan.id}/download`,
        { headers: { Authorization: `Bearer ${token}` }, responseType: 'blob' })
      const url = URL.createObjectURL(resp.data)
      const a = document.createElement('a')
      a.href = url
      a.download = plan.output_name || '施工計画書.docx'
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      notify(err.response?.data?.error || 'ダウンロードに失敗しました', 'error')
    } finally { setDlId(null) }
  }

  const onDelete = async (plan) => {
    if (!window.confirm(`「${plan.title || plan.output_name}」を削除しますか？\n\n生成した施工計画書と、共有ドライブ上のファイルも削除されます。`)) return
    try {
      await axios.delete(`${apiUrl}/api/construction/seko-plans/${plan.id}`, authConfig())
      notify('削除しました')
      await load()
    } catch (err) {
      notify(err.response?.data?.error || '削除に失敗しました', 'error')
    }
  }

  return (
    <Card className="px-4 py-3 mb-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 min-w-0">
          <SectionChevron open={open} onClick={toggleOpen} />
          <button type="button" onClick={toggleOpen} className="flex items-center gap-1.5 truncate text-left">
            <Sparkles className="w-4 h-4 text-brand-500 shrink-0" /> 施工計画書 生成
          </button>
        </span>
        {plans.length > 0 && <span className="text-xs text-slate-500 shrink-0">{plans.length} 件</span>}
      </div>

      {open && (
        <div className="mt-1">
          <p className="text-xs text-slate-400 mb-3">
            工事の契約情報・体制から Word を自動生成します（総合／工種別／自主検査チェックリスト）。
            発注機関長など台帳に無い項目は雛形の値のまま残るため、生成後に加筆してください。
          </p>

          {/* 生成コントロール */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <select value={planType} onChange={(e) => setPlanType(e.target.value)} className={inputCls + ' text-sm w-auto'}>
              {SEKO_PLAN_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            {planType !== 'soukatsu' && (
              <select value={koshu} onChange={(e) => setKoshu(e.target.value)} className={inputCls + ' text-sm w-auto'}>
                {SEKO_KOSHU.map((k) => <option key={k} value={k}>{k.replace(/^\d+_/, '')}</option>)}
              </select>
            )}
            <Button onClick={onGenerate} disabled={busy} className="text-sm">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              生成
            </Button>
          </div>

          {/* 生成履歴 */}
          {loading ? (
            <div className="py-6 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
          ) : plans.length === 0 ? (
            <p className="text-xs text-slate-400 py-2">まだ生成した施工計画書はありません。</p>
          ) : (
            <ul className="space-y-1.5">
              {plans.map((p) => (
                <li key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-ink-700 bg-white dark:bg-ink-800">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-800 dark:text-slate-100 truncate">{p.title || p.output_name}</div>
                    <div className="text-[11px] text-slate-400">{fmtDateTime(p.created_at)}{p.generated_by ? ` ・ ${p.generated_by}` : ''}</div>
                  </div>
                  <Badge tone={SEKO_STATUS_TONE[p.status] || 'neutral'}>
                    {(p.status === 'queued' || p.status === 'processing') && <Loader2 className="w-3 h-3 animate-spin mr-1 inline" />}
                    {SEKO_STATUS_LABEL[p.status] || p.status}
                  </Badge>
                  {p.status === 'done' && (
                    <Button variant="ghost" onClick={() => onDownload(p)} disabled={dlId === p.id} className="text-xs px-2 py-1">
                      {dlId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                      DL
                    </Button>
                  )}
                  <button onClick={() => onDelete(p)} title="削除"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-500/15 shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}

function BoqSection({ detail, notify, onReload }) {
  const [boq, setBoq] = useState(null)        // { rows, summary, total, imported_at }
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showItems, setShowItems] = useState(false)
  const [naModal, setNaModal] = useState(null) // NA候補（取込直後の承認用）
  const [open, toggleOpen] = useSectionCollapse('boq', true)

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
        <span className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 min-w-0">
          <SectionChevron open={open} onClick={toggleOpen} />
          <button type="button" onClick={toggleOpen} className="flex items-center gap-1.5 truncate text-left">
            <BarChart3 className="w-4 h-4 text-brand-500 shrink-0" /> 数量内訳・構成比率
          </button>
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

      {open && (<>
      {/* ── 当初版表示 ── */}
      {selectedVersion === 'original' && loading && (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
      )}
      {selectedVersion === 'original' && !loading && !boq?.imported_at && (
        <p className="text-xs text-slate-400 py-2">
          数量書(内訳書)を取込むと、工種別の構成比率を算出します。
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
      </>)}

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

function DocRow({ doc, onEdit }) {
  const files = doc.files || []
  const [expand, setExpand] = useState(false)
  const hasAi = files.some((f) => f.source && f.source !== 'manual')
  // 書類を開く: 1ファイルなら直接そのファイルを開く。複数なら一覧を開いて選ばせる。
  const openDoc = () => {
    if (files.length === 1) window.open(files[0].url, '_blank', 'noopener')
    else if (files.length > 1) setExpand((v) => !v)
  }
  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center gap-3">
        <button onClick={openDoc} className="min-w-0 flex-1 text-left group"
          title={files.length === 1 ? '書類を開く' : '書類のファイル一覧を表示'}>
          <div className="flex items-center gap-2">
            <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-sm text-slate-800 dark:text-slate-200 truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 group-hover:underline">{doc.doc_name}</span>
            {doc.trade && doc.trade !== '共通' && <Badge tone="neutral">{doc.trade}</Badge>}
            {files.length > 1 && <span className="text-[11px] text-slate-400 shrink-0">{files.length} ファイル</span>}
            {hasAi && (
              <span className="text-[11px] text-brand-600 dark:text-brand-400 flex items-center gap-0.5 shrink-0" title="AIが自動で振り分けた書類を含みます。種別をご確認ください">
                <Sparkles className="w-3 h-3" />AI振分
              </span>
            )}
            {files.length === 1 && <ExternalLink className="w-3 h-3 text-slate-300 shrink-0" />}
          </div>
        </button>
        <button onClick={onEdit} title="書類名・フォルダ・添付ファイルを編集"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-ink-700 shrink-0">
          <Pencil className="w-4 h-4" />
        </button>
      </div>
      {expand && files.length > 1 && (
        <ul className="mt-2 ml-6 space-y-1">
          {files.map((file) => (
            <li key={file.id}>
              <a href={file.url} target="_blank" rel="noreferrer"
                className="text-xs text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1">
                <Paperclip className="w-3 h-3 shrink-0" />
                <span className="truncate">{file.file_name}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── 新規工事モーダル ──
// 工事追加時に読み込ませる必要書類スロット（目達原(6)庁舎新設で工事マスタを埋めた書類構成に準拠）
// prefill=true の書類は「工事情報を自動入力」の読み取り対象。boq=true は数量書(Excel)取込へ回す。
const REQUIRED_DOC_SLOTS = [
  { key: 'contract', label: '契約書類', kind: 'doc', prefill: true,
    accept: '.pdf,image/*',
    desc: '建設工事請負契約書（＋変更契約書）／現場代理人等通知書・経歴書・資格者証／監督官通知 など',
    reads: '工事名・工期・請負金額・契約番号・体制' },
  { key: 'design', label: '設計図書（図面）', kind: 'doc', prefill: true,
    accept: '.pdf,image/*',
    desc: '設計図（100%版の図面PDF）',
    reads: '建物配置・構造規模・面積' },
  { key: 'spec', label: '特記仕様書', kind: 'doc', prefill: true,
    accept: '.pdf,image/*',
    desc: '建築工事特記仕様書（本紙）',
    reads: '適用図書の版・材料仕様・品質/試験・施工条件' },
  { key: 'boq', label: '数量書（Excel）', kind: 'boq',
    accept: '.xlsx,.xls',
    desc: '入札時積算数量書（別紙明細を含む xlsx）',
    reads: '工事内容・工種内訳・数量（→ BOQ取込）' },
  { key: 'other', label: 'その他', kind: 'doc',
    accept: '.pdf,image/*',
    desc: '現場説明書／建設リサイクル法13条 別紙／請負代金内訳書 など（保管のみ）',
    reads: '保管庫へ自動振り分け' },
]

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
  const [ingestMsg, setIngestMsg] = useState('')
  // 必要書類スロットに入れたファイル（key→File配列）
  const [slots, setSlots] = useState({ contract: [], design: [], spec: [], boq: [], other: [] })
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const authHdr = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } })

  const addFiles = (key) => (e) => {
    const arr = Array.from(e.target.files || [])
    if (arr.length) setSlots((s) => ({ ...s, [key]: [...s[key], ...arr] }))
    e.target.value = ''
  }
  const removeFile = (key, idx) => setSlots((s) => ({ ...s, [key]: s[key].filter((_, i) => i !== idx) }))
  const totalFiles = Object.values(slots).reduce((n, a) => n + a.length, 0)

  // 契約書類・設計図書・特記仕様書を読み取り→工事情報の空欄を自動入力（既存の extract-info を再利用）
  const onAiPrefill = async () => {
    const files = [...slots.contract, ...slots.design, ...slots.spec]
    if (!files.length) { onError('契約書類・設計図書・特記仕様書のいずれかを追加してください'); return }
    setAiBusy(true); setAiMsg('')
    try {
      const fd = new FormData()
      for (const file of files) fd.append('files', file)
      const { data } = await axios.post(`${apiUrl}/api/construction/extract-info`, fd, authHdr())
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
    }
  }

  // 登録後に必要書類を保管・取込（best-effort：1件失敗しても工事登録は成立）。
  const ingestDocuments = async (projectId) => {
    let filed = 0, boqDone = 0, failed = 0
    let done = 0
    const docFiles = [...slots.contract, ...slots.design, ...slots.spec, ...slots.other]
    for (const file of docFiles) {
      setIngestMsg(`書類を保管中… (${++done}/${totalFiles})`)
      try {
        const fd = new FormData(); fd.append('file', file)
        await axios.post(`${apiUrl}/api/construction/projects/${projectId}/documents/auto-file`, fd, authHdr())
        filed++
      } catch { failed++ }
    }
    for (const file of slots.boq) {
      setIngestMsg(`数量書を取込中… (${++done}/${totalFiles})`)
      try {
        const fd = new FormData(); fd.append('file', file)
        await axios.post(`${apiUrl}/api/construction/projects/${projectId}/import-boq`, fd, authHdr())
        boqDone++
      } catch { failed++ }
    }
    return { filed, boqDone, failed }
  }

  const submit = async () => {
    if (!f.project_name.trim()) { onError('工事名は必須です'); return }
    setSaving(true); setIngestMsg('')
    try {
      const payload = { ...f, generate_checklist: genChecklist }
      const { data } = await axios.post(`${apiUrl}/api/construction/projects`, payload, authConfig())
      // 工事作成に成功したら、必要書類スロットの中身を保管・取込
      let ing = { filed: 0, boqDone: 0, failed: 0 }
      if (totalFiles > 0) { try { ing = await ingestDocuments(data.id) } catch (e) { console.error('ingest:', e) } }
      const parts = [`検査チェック項目 ${data.generated_documents || 0} 件を生成`]
      if (ing.filed) parts.push(`書類 ${ing.filed} 件を保管`)
      if (ing.boqDone) parts.push('数量書を取込')
      if (ing.failed) parts.push(`※ ${ing.failed} 件は取込に失敗（工事詳細から再アップロードしてください）`)
      onCreated(`工事を登録しました（${parts.join('／')}）`)
    } catch (e) {
      onError(e.response?.data?.error || '登録に失敗しました')
    } finally {
      setSaving(false); setIngestMsg('')
    }
  }

  return (
    <ModalShell title="工事を追加" onClose={onClose} wide>
      {/* 必要書類スロット：目達原(6)の実績に準拠した書類を入れて、工事情報の自動入力＋保管庫への格納を行う */}
      <div className="mb-4 rounded-xl border border-brand-200 dark:border-brand-500/30 bg-brand-50 dark:bg-brand-500/10 px-4 py-3">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="text-xs text-slate-600 dark:text-slate-300">
            <span className="font-semibold text-brand-700 dark:text-brand-300 flex items-center gap-1 mb-0.5">
              <Sparkles className="w-3.5 h-3.5" />必要書類を読み込ませて登録
            </span>
            下の各欄に契約書類・設計図書などを入れ、「工事情報を自動入力」で欄を埋めてから登録します。登録時に書類は保管庫へ自動で振り分けられ、数量書はBOQへ取込まれます。
          </div>
          <button type="button" onClick={onAiPrefill} disabled={aiBusy}
            className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60">
            {aiBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            工事情報を自動入力
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {REQUIRED_DOC_SLOTS.map((slot) => (
            <div key={slot.key} className="rounded-lg border border-slate-200 dark:border-ink-600 bg-white/70 dark:bg-ink-800/40 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1">
                    {slot.kind === 'boq' ? <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" /> : <Paperclip className="w-3.5 h-3.5 text-slate-400" />}
                    {slot.label}
                    {slot.prefill && <span className="text-[10px] font-normal text-brand-600 dark:text-brand-300 bg-brand-100 dark:bg-brand-500/20 rounded px-1">自動入力に使用</span>}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{slot.desc}</div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">読み取り: {slot.reads}</div>
                </div>
                <label className="shrink-0 text-[11px] font-semibold text-brand-600 dark:text-brand-400 hover:underline cursor-pointer flex items-center gap-0.5">
                  <Upload className="w-3 h-3" />追加
                  <input type="file" multiple accept={slot.accept} className="hidden" onChange={addFiles(slot.key)} />
                </label>
              </div>
              {slots[slot.key].length > 0 && (
                <ul className="mt-1.5 space-y-1">
                  {slots[slot.key].map((file, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 text-[11px] bg-slate-50 dark:bg-ink-700/60 rounded px-2 py-1">
                      <span className="truncate text-slate-700 dark:text-slate-200">{file.name}</span>
                      <button type="button" onClick={() => removeFile(slot.key, i)} className="shrink-0 text-slate-400 hover:text-danger-500">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
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
        検査書類チェックリストを自動生成する（新設／改修の区分に応じた項目を生成）
      </label>
      <div className="flex items-center justify-end gap-3 mt-5">
        {saving && ingestMsg && <span className="text-[11px] text-slate-500 dark:text-slate-400">{ingestMsg}</span>}
        <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-ink-700 disabled:opacity-60">キャンセル</button>
        <Button onClick={submit} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" />{totalFiles > 0 ? '登録して書類を保管' : '登録'}</>}</Button>
      </div>
    </ModalShell>
  )
}

// ── 書類の編集（書類名・フォルダ・添付ファイル・メモ）──
function EditDocModal({ doc, onClose, onSaved, onError }) {
  const [f, setF] = useState({
    doc_name: doc.doc_name || '', folder_no: doc.folder_no ?? 4,
    due_date: doc.due_date || '', file_ref: doc.file_ref || '', note: doc.note || '',
  })
  const [saving, setSaving] = useState(false)
  const [files, setFiles] = useState(doc.files || [])
  const [uploading, setUploading] = useState(false)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  const submit = async () => {
    if (!String(f.doc_name).trim()) { onError('書類名は必須です'); return }
    setSaving(true)
    try {
      await axios.patch(`${apiUrl}/api/construction/documents/${doc.id}`,
        { ...f, folder_no: Number(f.folder_no) }, authConfig())
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
        <div className="col-span-2"><Field label="書類名 *"><input className={inputCls} value={f.doc_name} onChange={set('doc_name')} /></Field></div>
        <Field label="フォルダ"><select className={inputCls} value={f.folder_no} onChange={set('folder_no')}>{CONS_FOLDERS.map((c) => <option key={c.no} value={c.no}>{String(c.no).padStart(2, '0')}. {c.name}</option>)}</select></Field>
        <Field label="締切"><input className={inputCls} type="date" value={f.due_date} onChange={set('due_date')} /></Field>
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

// ── 書類の手動追加（フォルダを指定してファイルを格納。AIを使わない手動振り分け）──
//   保管庫は「実ファイルのある書類」のみ表示するため、追加時にファイルを必ず添付する。
function AddDocModal({ projectId, onClose, onAdded, onError }) {
  const [f, setF] = useState({ folder_no: 4, doc_name: '', trade: '共通' })
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  // 書類名が空ならファイル名（拡張子を除く）を採用
  const effectiveName = (f.doc_name.trim() || (file ? file.name.replace(/\.[^.]+$/, '') : '')).trim()

  const submit = async () => {
    if (!file) { onError('ファイルを選択してください'); return }
    if (!effectiveName) { onError('書類名は必須です'); return }
    setSaving(true)
    try {
      // 1) フォルダに書類（入れ物）を作成
      const { data: doc } = await axios.post(`${apiUrl}/api/construction/projects/${projectId}/documents`, {
        folder_no: Number(f.folder_no), doc_name: effectiveName, trade: f.trade,
      }, authConfig())
      // 2) ファイルを添付（共有ドライブ保存）
      const fd = new FormData()
      fd.append('file', file)
      const token = localStorage.getItem('authToken')
      await axios.post(`${apiUrl}/api/construction/documents/${doc.id}/files`, fd,
        { headers: { Authorization: `Bearer ${token}` } })
      onAdded()
    } catch (e) {
      onError(e.response?.data?.error || '追加に失敗しました')
    } finally { setSaving(false) }
  }

  return (
    <ModalShell title="書類を追加" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="フォルダ"><select className={inputCls} value={f.folder_no} onChange={set('folder_no')}>{CONS_FOLDERS.map((c) => <option key={c.no} value={c.no}>{String(c.no).padStart(2, '0')}. {c.name}</option>)}</select></Field>
        <Field label="工種"><input className={inputCls} value={f.trade} onChange={set('trade')} /></Field>
        <div className="col-span-2"><Field label="書類名（空欄ならファイル名を使用）"><input className={inputCls} value={f.doc_name} onChange={set('doc_name')} placeholder={file ? file.name.replace(/\.[^.]+$/, '') : '例: 着工届'} /></Field></div>
        <div className="col-span-2">
          <Field label="ファイル *">
            <label className="flex items-center gap-2 text-sm px-3 py-2 rounded-xl border border-dashed border-slate-300 dark:border-ink-600 cursor-pointer hover:border-brand-400 text-slate-600 dark:text-slate-300">
              <Upload className="w-4 h-4 shrink-0" />
              <span className="truncate">{file ? file.name : 'ファイルを選択'}</span>
              <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
          </Field>
        </div>
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
  const [open, toggleOpen] = useSectionCollapse('design_change', true)
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
        <span className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 min-w-0">
          <SectionChevron open={open} onClick={toggleOpen} />
          <button type="button" onClick={toggleOpen} className="flex items-center gap-1.5 truncate text-left">
            <GitBranch className="w-4 h-4 text-brand-500 shrink-0" /> 設計変更（変更契約）
          </button>
          {changeCount > 0 && (
            <span className="ml-1 text-[11px] font-bold bg-brand-100 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300 rounded-full px-1.5 py-0.5 shrink-0">
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

      {open && (<>
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
      </>)}

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

// 画像の左下に「電子小黒板」を焼き込んで新しい File を返す。参照様式に準拠：
//   上部 = ラベル列｜値列の小さめの表（gridRows）
//   下部 = 大きな自由記述欄（freeLines）
// 背景は半透明（透過）。失敗時（古い端末等）は元ファイルをそのまま返す。
async function burnBlackboard(file, { gridRows = [], freeLines = [] }) {
  try {
    // EXIF の向きを反映してデコード（スマホ写真の回転ズレ対策）
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const W = bitmap.width, H = bitmap.height
    const canvas = document.createElement('canvas')
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0, W, H)
    if (bitmap.close) bitmap.close()

    const grid = gridRows.filter((r) => r && r[0])
    const frees = freeLines.filter(Boolean)

    // 文字サイズ（やや小さめ）。表＝小／自由記述＝中
    const gridFont = Math.max(Math.round(W / 54), 12)
    const freeFont = Math.max(Math.round(W / 36), 18)
    const padX = Math.round(gridFont * 0.6)
    const gridRowH = Math.round(gridFont * 1.7)
    const freeRowH = Math.round(freeFont * 1.4)
    const freePadY = Math.round(freeFont * 0.4)

    // 黒板の幅は固定（内容で伸縮させない）。画像幅の 1/3。
    const boxW = Math.round(W / 3)

    // 表のラベル列幅（ラベル文字に合わせる）／値列は残り
    ctx.font = `bold ${gridFont}px sans-serif`
    let labelW = 0
    for (const [label] of grid) labelW = Math.max(labelW, ctx.measureText(label).width)
    labelW = Math.round(labelW + padX * 2)
    const valueW = boxW - labelW

    const gridH = grid.length * gridRowH
    const freeH = frees.length ? frees.length * freeRowH + freePadY * 2 : 0
    const boxH = gridH + freeH
    const margin = Math.round(W / 60)
    const x = margin
    const y = H - boxH - margin

    // 下地（半透明・透過）
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
    ctx.fillRect(x, y, boxW, boxH)

    // 罫線（白）
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.lineWidth = Math.max(1, Math.round(gridFont / 12))
    ctx.strokeRect(x, y, boxW, boxH)
    ctx.beginPath()
    // 表の行間＋（表と自由記述の境界）
    for (let i = 1; i <= grid.length; i++) {
      const yy = y + i * gridRowH
      ctx.moveTo(x, yy); ctx.lineTo(x + boxW, yy)
    }
    // 表のラベル/値 縦線（表の範囲のみ）
    if (grid.length) { ctx.moveTo(x + labelW, y); ctx.lineTo(x + labelW, y + gridH) }
    ctx.stroke()

    // 表の文字（小さめ・縦中央・左寄せ。長い値は列内に自動圧縮）
    ctx.fillStyle = '#ffffff'
    ctx.textBaseline = 'middle'
    ctx.font = `bold ${gridFont}px sans-serif`
    grid.forEach(([label, value], i) => {
      const cy = y + i * gridRowH + Math.round(gridRowH / 2)
      ctx.fillText(label, x + padX, cy, labelW - padX * 2)
      ctx.fillText(String(value || ''), x + labelW + padX, cy, valueW - padX * 2)
    })
    // 自由記述（大きめ）
    ctx.font = `bold ${freeFont}px sans-serif`
    frees.forEach((t, i) => {
      const cy = y + gridH + freePadY + i * freeRowH + Math.round(freeRowH / 2)
      ctx.fillText(t, x + padX, cy, boxW - padX * 2)
    })

    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.9))
    if (!blob) return file
    const base = (file.name || 'photo').replace(/\.[^.]+$/, '')
    return new File([blob], `${base}_kb.jpg`, { type: 'image/jpeg' })
  } catch {
    return file
  }
}

// ── 工事写真 メインビュー ──
function PhotoBody({ detail, notify }) {
  const [nodes, setNodes] = useState([])
  const [generated, setGenerated] = useState(false)
  const [presentTrades, setPresentTrades] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  // 撮影ツリー生成の対象「版(edition)」。未指定だと全版(新築・改修・電気・機械・解体)が
  // 取り込まれ、改修工事なのに新築用カタログまで出てしまうため、ここで版を絞る。
  // 工事名に「改修/改築」が含まれれば既定を改修に、それ以外は新築(建築)に寄せる。
  const ALL_EDITIONS = ['建築', '改修', '電気', '機械', '解体']
  const [editions, setEditions] = useState(
    () => /改修|改築/.test(detail?.project_name || '') ? ['改修'] : ['建築']
  )
  const toggleEdition = (e) =>
    setEditions((prev) => prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e])
  const editionChips = (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-slate-500 dark:text-slate-400">対象の版:</span>
      {ALL_EDITIONS.map((e) => {
        const on = editions.includes(e)
        return (
          <button
            key={e}
            type="button"
            onClick={() => toggleEdition(e)}
            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
              on
                ? 'bg-brand-500 text-white border-brand-500'
                : 'bg-transparent text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-600 hover:border-brand-400'
            }`}>
            {e}
          </button>
        )
      })}
    </div>
  )
  const [photos, setPhotos] = useState([]) // project 全写真
  const [photosLoading, setPhotosLoading] = useState(false)
  const [expandedNodes, setExpandedNodes] = useState(new Set())
  const [collapsedTrades, setCollapsedTrades] = useState(new Set())
  const [addNodeOpen, setAddNodeOpen] = useState(false)
  const [lightbox, setLightbox] = useState(null) // Photo object
  const [editNoteNode, setEditNoteNode] = useState(null)
  const [uploadingNodes, setUploadingNodes] = useState(new Set()) // node IDs

  // silent=true のときは全画面ローディングを出さず裏で更新（撮影/削除後の暗転防止）
  const loadNodes = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
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
      if (!silent) setLoading(false)
    }
  }, [detail.id, notify])

  const loadPhotos = useCallback(async (silent = false) => {
    if (!silent) setPhotosLoading(true)
    try {
      const { data } = await axios.get(
        `${apiUrl}/api/construction/projects/${detail.id}/photos`,
        authConfig()
      )
      setPhotos(data || [])
    } catch { /* noop */ } finally {
      if (!silent) setPhotosLoading(false)
    }
  }, [detail.id])

  useEffect(() => { loadNodes() }, [loadNodes])
  useEffect(() => { loadPhotos() }, [loadPhotos])

  const doGenerate = async () => {
    if (editions.length === 0) {
      notify('対象の版を1つ以上選んでください', 'error')
      return
    }
    setGenerating(true)
    try {
      await axios.post(
        `${apiUrl}/api/construction/projects/${detail.id}/photo-nodes/generate`,
        { editions }, authConfig()
      )
      await loadNodes(true)
      notify('撮影ツリーを生成しました')
    } catch (e) {
      notify(e.response?.data?.error || 'ツリー生成に失敗しました', 'error')
    } finally {
      setGenerating(false)
    }
  }

  const regenTree = async () => {
    if (editions.length === 0) {
      notify('対象の版を1つ以上選んでください', 'error')
      return
    }
    const ok = window.confirm(
      `撮影ツリーを再生成します。\n対象の版: ${editions.join('・')}\n` +
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

  const uploadPhotos = async (nodeId, files, opts = {}) => {
    setUploadingNodes((s) => { const n = new Set(s); n.add(nodeId); return n })
    try {
      const token = localStorage.getItem('authToken')
      let toSend = Array.from(files)
      // 撮影時は左下に電子小黒板（工事名/工事種別/工種/項目/タイミング）を焼き込む
      if (opts.blackboard) {
        const node = nodes.find((n) => n.id === nodeId)
        if (node) {
          // 上部の表＝工事名・工種、下部の自由記述＝それ以外すべて（工事種別・撮影項目・撮影対象・タイミング）を各行に
          const gridRows = [
            ['工事名', detail.project_name || ''],
            ['工種', node.trade || ''],
          ]
          const freeLines = []
          if (node.edition) freeLines.push(node.edition)
          if (node.photo_item) freeLines.push(node.photo_item)
          if (node.target && node.target !== node.photo_item) freeLines.push(node.target)
          if (node.timing) freeLines.push(node.timing)
          toSend = await Promise.all(toSend.map((f) => burnBlackboard(f, { gridRows, freeLines })))
        }
      }
      for (const file of toSend) {
        const fd = new FormData()
        fd.append('photo', file)
        fd.append('node_id', nodeId)
        await axios.post(
          `${apiUrl}/api/construction/projects/${detail.id}/photos`,
          fd,
          { headers: { Authorization: `Bearer ${token}` } }
        )
      }
      await Promise.all([loadPhotos(true), loadNodes(true)])
      notify(`${toSend.length} 枚をアップロードしました`)
    } catch (e) {
      notify(e.response?.data?.error || 'アップロードに失敗しました', 'error')
    } finally {
      setUploadingNodes((s) => { const n = new Set(s); n.delete(nodeId); return n })
    }
  }

  const deletePhoto = async (photoId) => {
    if (!window.confirm('この写真を削除します。よろしいですか？')) return
    try {
      await axios.delete(`${apiUrl}/api/construction/photos/${photoId}`, authConfig())
      setPhotos((prev) => prev.filter((p) => p.id !== photoId))
      await loadNodes(true) // photo_count を更新
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
            選んだ版 × 数量書の工種で、撮影対象一覧が自動作成されます。
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            改修工事は「改修」だけを選ぶと、新築用の項目が混ざりません。
          </p>
        </div>
        {editionChips}
        <Button onClick={doGenerate} disabled={generating}>
          {generating
            ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />生成中...</>
            : <><Camera className="w-4 h-4 mr-1" />撮影ツリーを生成</>}
        </Button>
        {addNodeOpen && (
          <AddPhotoNodeModal
            projectId={detail.id}
            onClose={() => setAddNodeOpen(false)}
            onAdded={() => { setAddNodeOpen(false); loadNodes(true); notify('撮影対象を追加しました') }}
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
            title="選んだ版で再生成。既存ノードは温存し、不足分のみ追加します"
            className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:underline flex items-center gap-1">
            <RefreshCw className="w-3.5 h-3.5" /> 再生成（既存温存）
          </button>
        </div>
      </div>

      {/* 再生成の対象版セレクタ（選んだ版で不足分を追加） */}
      <div className="mb-4">{editionChips}</div>

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
                                onUpload={(files, opts) => uploadPhotos(node.id, files, opts)}
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
          onAdded={() => { setAddNodeOpen(false); loadNodes(true); notify('撮影対象を追加しました') }}
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
              {/* 撮影項目(工法/部位)を併記。同じ「施工状況」でも工法違いを見分けられるようにする */}
              {node.photo_item && node.photo_item !== node.target && (
                <span className="text-slate-500 dark:text-slate-400">{node.photo_item}：</span>
              )}
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

          {/* 写真アップロード：スマホはカメラ直起動、PC等はファイル選択 */}
          <div className="mb-3 flex items-center gap-3 flex-wrap">
            {/* 撮影（capture=environment でスマホの背面カメラを直接起動。PCではファイル選択に自動フォールバック） */}
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-brand-500 text-white hover:bg-brand-600 cursor-pointer transition shadow-sm">
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
              撮影
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) onUpload(Array.from(e.target.files), { blackboard: true })
                  e.target.value = ''
                }}
                disabled={uploading}
              />
            </label>
            {/* ファイル/ギャラリーから追加（複数可） */}
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
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 flex items-center justify-center text-white transition hover:bg-danger-600 active:bg-danger-600"
                    title="写真を削除">
                    <X className="w-3.5 h-3.5" />
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-2">
      {/* 閉じるボタンは画面右上に固定（画像サイズに依存させない） */}
      <button
        onClick={onClose}
        className="absolute top-3 right-3 z-10 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/40 transition">
        <X className="w-5 h-5" />
      </button>
      <div className="flex flex-col items-center">
        {/* 画像はビューポート基準でフィット。最初から全体が見える状態で開く */}
        <img
          src={photo.url}
          alt={photo.file_name}
          className="max-w-[96vw] max-h-[82dvh] w-auto h-auto object-contain rounded-xl shadow-2xl"
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
