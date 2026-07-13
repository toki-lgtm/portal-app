import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import {
  ArrowLeft, Mail, Plus, Pencil, Trash2, Loader2, Download, Search, AlertTriangle,
  FileSpreadsheet, CheckCircle2, XCircle, Clock, Paperclip, Upload, Sparkles, Circle, Wand2,
  ChevronDown, ChevronRight, ListChecks,
} from 'lucide-react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import Toast from './ui/Toast'
import ModalShell from './ui/ModalShell'
import { API_URL as apiUrl, authConfig, authConfigMultipart } from '../lib/api'
import { useToast } from '../lib/useToast'

// 依頼状況の表示メタ（様式1-6の色分け：桃→緑→黄→青）
const STATUS_META = {
  estimate_drafting:  { label: '見積作成中',        cls: 'bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-200' },
  surveyed:           { label: '調査完了',          cls: 'bg-slate-100 text-slate-600 dark:bg-ink-700 dark:text-slate-300' },
  done_no_estimate:   { label: '工事完成(見積未)',  cls: 'bg-slate-100 text-slate-600 dark:bg-ink-700 dark:text-slate-300' },
  estimate_submitted: { label: '見積書提出',        cls: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-200' },
  contracted:         { label: '工事契約',          cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200' },
  completed:          { label: '工事完成',          cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200' },
  canceled:           { label: '依頼取消',          cls: 'bg-slate-100 text-slate-400 dark:bg-ink-800 dark:text-slate-500' },
  on_hold:            { label: '保留',              cls: 'bg-slate-100 text-slate-400 dark:bg-ink-800 dark:text-slate-500' },
  stopped:            { label: '中止',              cls: 'bg-slate-100 text-slate-400 dark:bg-ink-800 dark:text-slate-500' },
  closed:             { label: '終了',              cls: 'bg-slate-100 text-slate-400 dark:bg-ink-800 dark:text-slate-500' },
}
const STATUS_ORDER = Object.keys(STATUS_META)

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, cls: 'bg-slate-100 text-slate-600' }
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${m.cls}`}>{m.label}</span>
}

const yen = (n) => (n == null || n === '') ? '' : '¥' + Number(n).toLocaleString('ja-JP')

// 汎用フィールド（label + 入力）。type: text/date/number/textarea/select/checkbox
function Field({ label, type = 'text', value, onChange, options, hint, span1 }) {
  const base = 'w-full rounded-lg border border-slate-300 dark:border-ink-600 bg-white dark:bg-ink-800 px-3 py-2 text-sm'
  return (
    <div className={span1 ? '' : 'sm:col-span-1'}>
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{label}</label>
      {type === 'textarea' ? (
        <textarea rows={2} className={base} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      ) : type === 'select' ? (
        <select className={base} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : type === 'checkbox' ? (
        <label className="inline-flex items-center gap-2 py-1.5 text-sm text-slate-700 dark:text-slate-200">
          <input type="checkbox" className="w-4 h-4" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
          {hint}
        </label>
      ) : (
        <input type={type} className={base + (type === 'number' ? ' tabular-nums' : '')}
          value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && type !== 'checkbox' && <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  )
}

function SectionTitle({ children }) {
  return <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mt-4 mb-2 border-b border-slate-100 dark:border-ink-700 pb-1">{children}</h3>
}

// 折りたたみカード（工事管理の詳細と同じく、基本情報→各セクションが並ぶ構成に使う）
function CollapsibleCard({ title, icon: Icon, defaultOpen = true, right, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Card className="p-0 overflow-hidden mb-3">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-slate-50/60 dark:hover:bg-ink-800/30">
        {open ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
        {Icon && <Icon className="w-4 h-4 text-brand-500 shrink-0" />}
        <span className="text-sm font-bold text-slate-700 dark:text-slate-200 flex-1 min-w-0">{title}</span>
        {right}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </Card>
  )
}

export default function PostOfficePage({ onBack }) {
  const [cases, setCases] = useState([])
  const [stats, setStats] = useState(null)
  const [years, setYears] = useState([])
  const [fy, setFy] = useState(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [staff, setStaff] = useState([])
  const [edit, setEdit] = useState(null)
  const [saving, setSaving] = useState(false)
  // 様式1-6 生成
  const [genOpen, setGenOpen] = useState(false)
  const [genDate, setGenDate] = useState('')
  const [genBranch, setGenBranch] = useState('')
  const [generating, setGenerating] = useState(false)
  const [submissions, setSubmissions] = useState([])
  const [view, setView] = useState('list')               // 'list' | 'detail'（工事管理と同じページ遷移）
  // 添付ファイル / 提出書類チェックリスト（案件詳細画面内）
  const [caseFiles, setCaseFiles] = useState([])
  const [checklist, setChecklist] = useState([])
  const [docTypes, setDocTypes] = useState([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadType, setUploadType] = useState('')       // '' = AIで自動判別
  // AIで起票（見積依頼メール/PDF → 新規案件プリフィル）
  const [ingestOpen, setIngestOpen] = useState(false)
  const [ingesting, setIngesting] = useState(false)
  const { toast, showToast } = useToast()

  const load = useCallback(async (year, status, type, search) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (year) params.set('fiscal_year', year)
      if (status) params.set('status', status)
      if (type) params.set('response_type', type)
      if (search) params.set('q', search)
      const [cRes, sRes] = await Promise.all([
        axios.get(`${apiUrl}/api/post-office/cases?${params}`, authConfig()),
        axios.get(`${apiUrl}/api/post-office/stats${year ? `?fiscal_year=${year}` : ''}`, authConfig()),
      ])
      setCases(cRes.data || [])
      setStats(sRes.data || null)
      setIsAdmin((sRes.data?.role) === 'admin')
    } catch (e) {
      showToast('error', e.response?.data?.error || '案件の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  // 初回: 年度リストと担当者を取得してから読み込み
  useEffect(() => {
    (async () => {
      try {
        const [yRes, stRes] = await Promise.all([
          axios.get(`${apiUrl}/api/post-office/years`, authConfig()),
          axios.get(`${apiUrl}/api/post-office/staff`, authConfig()),
        ])
        const ys = yRes.data || []
        setYears(ys)
        setStaff(stRes.data || [])
        const first = ys[0] || null
        setFy(first)
        await load(first, '', '', '')
      } catch (e) {
        showToast('error', e.response?.data?.error || '初期化に失敗しました')
        setLoading(false)
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => load(fy, filterStatus, filterType, q)

  // ── 一覧⇄詳細の遷移（工事管理と同じく端末の戻るボタンに対応）─────────
  const detailRef = useRef(null)
  useEffect(() => { detailRef.current = edit }, [edit])
  const pushSub = (sub, id) => window.history.pushState({ view: 'post-office', psub: sub, cid: id ?? null }, '')
  const openDetail = (c) => { setEdit({ ...c }); setView('detail'); pushSub('detail', c.id ?? null) }
  const goBack = () => window.history.back()
  useEffect(() => {
    const onPop = (e) => {
      const st = e.state || {}
      if (st.view !== 'post-office') return   // 郵便局から出る遷移は App 側が処理
      const sub = st.psub || 'list'
      if (sub === 'list') { setView('list'); setEdit(null); load(fy, filterStatus, filterType, q) }
      else setView('detail')
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [load, fy, filterStatus, filterType, q])

  const openNew = () => {
    setEdit({
      fiscal_year: fy || new Date().getFullYear(), status: 'estimate_drafting',
      response_type: '一般', area: '長崎県対馬エリア', company: '㈱中原建設',
      is_pre_movein: false, is_policy_work: false,
    })
    setView('detail'); pushSub('detail', null)
  }

  const save = async () => {
    setSaving(true)
    try {
      const body = { ...edit }
      // 数値項目を整数化（空は null）
      for (const k of ['seq_no', 'fiscal_year', 'contract_amount', 'assessed_amount', 'classification_code']) {
        if (body[k] === '' || body[k] == null) body[k] = null
        else body[k] = Number(String(body[k]).replace(/[^0-9-]/g, '')) || null
      }
      let savedId = edit.id
      if (edit.id) {
        await axios.put(`${apiUrl}/api/post-office/cases/${edit.id}`, body, authConfig())
      } else {
        const { data } = await axios.post(`${apiUrl}/api/post-office/cases`, body, authConfig())
        savedId = data.id
      }
      showToast('success', '保存しました')
      // 最新（派生値・新規idを含む）を取り直して詳細に留まる（新規はここで添付が使えるように）
      try {
        const { data: fresh } = await axios.get(`${apiUrl}/api/post-office/cases/${savedId}`, authConfig())
        setEdit(fresh)
      } catch { /* 取り直し失敗時も保存自体は成立 */ }
      load(fy, filterStatus, filterType, q)   // 一覧を裏で更新
    } catch (e) {
      showToast('error', e.response?.data?.error || '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (row) => {
    if (!window.confirm(`「${row.facility_name || '（無題）'}」を削除しますか？`)) return
    try {
      await axios.delete(`${apiUrl}/api/post-office/cases/${row.id}`, authConfig())
      showToast('success', '削除しました')
      if (view === 'detail') goBack(); else refresh()
    } catch (e) {
      showToast('error', e.response?.data?.error || '削除に失敗しました')
    }
  }

  const exportXlsx = async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/post-office/export?fiscal_year=${fy}`, { ...authConfig(), responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url; a.download = `郵便局_受注一覧_${fy}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      showToast('error', 'エクスポートに失敗しました')
    }
  }

  // ── 様式1-6 正式自動生成 ────────────────────────────────
  const loadSubmissions = useCallback(async (year) => {
    try {
      const res = await axios.get(`${apiUrl}/api/post-office/submissions?fiscal_year=${year}`, authConfig())
      setSubmissions(res.data?.submissions || [])
    } catch { /* 一覧取得失敗は致命ではない */ }
  }, [])

  const openGenerate = () => {
    setGenDate(new Date().toISOString().slice(0, 10))  // 既定＝本日（毎月10日に提出）
    setGenBranch('')
    setGenOpen(true)
    loadSubmissions(fy)
  }

  const downloadSubmission = async (id, name) => {
    const res = await axios.get(`${apiUrl}/api/post-office/submissions/${id}/download`, { ...authConfig(), responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url; a.download = name || '様式1-6.xlsx'; a.click()
    URL.revokeObjectURL(url)
  }

  const runGenerate = async () => {
    setGenerating(true)
    try {
      const { data } = await axios.post(`${apiUrl}/api/post-office/submissions`,
        { fiscal_year: fy, report_date: genDate, branch: genBranch || undefined }, authConfig())
      showToast('info', `生成を開始しました（${data.case_count}件）。少々お待ちください…`)
      await loadSubmissions(fy)
      // 状態ポーリング（最大約90秒）。done で自動ダウンロード。
      const id = data.id
      let ready = false
      for (let i = 0; i < 36 && !ready; i++) {
        await new Promise((r) => setTimeout(r, 2500))
        try {
          const s = await axios.get(`${apiUrl}/api/post-office/submissions/${id}/status`, authConfig())
          if (s.data?.status === 'error') { showToast('error', `生成に失敗しました：${s.data.message || ''}`); break }
          if (s.data?.ready) {
            ready = true
            await loadSubmissions(fy)
            await downloadSubmission(id, s.data.file)
            showToast('success', '様式1-6を生成しました')
          }
        } catch { /* ポーリング一時失敗は継続 */ }
      }
      if (!ready) { await loadSubmissions(fy); showToast('info', '生成に時間がかかっています。数分後に「生成履歴」からダウンロードしてください。') }
    } catch (e) {
      showToast('error', e.response?.data?.error || '生成の開始に失敗しました')
    } finally {
      setGenerating(false)
    }
  }

  // ── 案件の添付ファイル / 提出書類チェックリスト ─────────────────
  const fileInputRef = useRef(null)
  const pendingTypeRef = useRef('')          // チェックリストのチップから種別指定でアップロード
  const triggerUpload = (docType) => { pendingTypeRef.current = docType || ''; fileInputRef.current?.click() }

  const loadCaseFiles = useCallback(async (caseId) => {
    setFilesLoading(true)
    try {
      const res = await axios.get(`${apiUrl}/api/post-office/cases/${caseId}/files`, authConfig())
      setCaseFiles(res.data?.files || [])
      setChecklist(res.data?.checklist || [])
      setDocTypes(res.data?.doc_types || [])
    } catch (e) {
      setCaseFiles([]); setChecklist([])
    } finally {
      setFilesLoading(false)
    }
  }, [])

  // 詳細を開いた案件（既存）の添付を読み込む
  useEffect(() => {
    if (edit?.id) loadCaseFiles(edit.id)
    else { setCaseFiles([]); setChecklist([]); setUploadType('') }
  }, [edit?.id, loadCaseFiles])

  const uploadCaseFile = async (file, docType) => {
    if (!file || !edit?.id) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (docType) fd.append('doc_type', docType)
      const { data } = await axios.post(`${apiUrl}/api/post-office/cases/${edit.id}/files`, fd, authConfigMultipart())
      const cl = data?.classification
      showToast('success', cl ? `「${data.file.doc_type}」として添付しました（AI判別）` : '添付しました')
      await loadCaseFiles(edit.id)
    } catch (e) {
      showToast('error', e.response?.data?.error || '添付に失敗しました')
    } finally {
      setUploading(false)
    }
  }

  const retypeFile = async (fileId, docType) => {
    try {
      await axios.put(`${apiUrl}/api/post-office/case-files/${fileId}`, { doc_type: docType }, authConfig())
      await loadCaseFiles(edit.id)
    } catch (e) {
      showToast('error', e.response?.data?.error || '種別の変更に失敗しました')
    }
  }

  const deleteCaseFile = async (fileId) => {
    if (!window.confirm('この添付ファイルを削除しますか？')) return
    try {
      await axios.delete(`${apiUrl}/api/post-office/case-files/${fileId}`, authConfig())
      await loadCaseFiles(edit.id)
    } catch (e) {
      showToast('error', e.response?.data?.error || '削除に失敗しました')
    }
  }

  // ── AIで起票（見積依頼メール/PDF → 新規案件をプリフィル）─────────
  const runIngest = async (files) => {
    if (!files || !files.length) return
    setIngesting(true)
    try {
      const fd = new FormData()
      for (const f of files) fd.append('files', f)
      const { data } = await axios.post(`${apiUrl}/api/post-office/extract-info`, fd, authConfigMultipart())
      const f = data?.fields || {}
      setIngestOpen(false)
      // 抽出結果で新規案件フォームをプリフィル（空欄は既定値のまま）
      setEdit({
        fiscal_year: fy || new Date().getFullYear(), status: 'estimate_drafting',
        area: '長崎県対馬エリア', company: '㈱中原建設',
        is_pre_movein: false, is_policy_work: false,
        response_type: f.response_type || '一般',
        category: f.category || '',
        facility_name: f.facility_name || '',
        eizen_recv_no: f.eizen_recv_no || '',
        estimate_no: f.estimate_no || '',
        requester_org: f.requester_org || '',
        requester_name: f.requester_name || '',
        work_content: f.work_content || '',
        request_recv_date: f.request_recv_date || '',
        survey_designated_date: f.survey_designated_date || '',
        remarks: f.remarks || '',
      })
      setView('detail'); pushSub('detail', null)
      showToast('success', 'AIが読み取った内容をフォームに反映しました。確認して保存してください。')
    } catch (e) {
      showToast('error', e.response?.data?.error || 'AI読み取りに失敗しました')
    } finally {
      setIngesting(false)
    }
  }

  const staffOptions = [{ value: '', label: '（未設定）' }, ...staff.map((s) => ({ value: s.id, label: s.name }))]

  // 見積提出営業日数の色（目標8以下）
  const bizCls = (n, target) => n == null ? 'text-slate-300' : (n > target ? 'text-danger-600 dark:text-danger-400 font-bold' : 'text-slate-600 dark:text-slate-300')

  // ── 詳細ビュー（案件1件。工事管理と同じくページ遷移）──
  if (view === 'detail' && edit) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-ink-950 transition-colors">
        <header className="bg-white/80 dark:bg-ink-900/80 backdrop-blur border-b border-slate-200 dark:border-ink-800 sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={goBack}><ArrowLeft className="w-4 h-4" />一覧へ</Button>
            <div className="flex items-center gap-2 min-w-0">
              <Mail className="w-5 h-5 text-brand-500 shrink-0" />
              <h1 className="text-lg font-bold text-slate-900 dark:text-white truncate">
                {edit.id ? (edit.facility_name || '（施設名未設定）') : '案件を追加'}
              </h1>
              {edit.id && <StatusBadge status={edit.status} />}
            </div>
            <div className="ml-auto flex items-center gap-2">
              {isAdmin && edit.id && (
                <Button variant="ghost" size="sm" onClick={() => remove(edit)}><Trash2 className="w-4 h-4" /><span className="hidden sm:inline">削除</span></Button>
              )}
              <Button variant="primary" size="sm" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}保存
              </Button>
            </div>
          </div>
        </header>

        {toast && <Toast toast={toast} />}

        <main className="max-w-5xl mx-auto px-6 py-6">
          {/* ① 基本情報（案件の identity。一番上に置く） */}
          <CollapsibleCard title="基本情報" icon={FileSpreadsheet} defaultOpen>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="依頼状況" type="select" value={edit.status} onChange={(v) => setEdit({ ...edit, status: v })}
                options={STATUS_ORDER.map((s) => ({ value: s, label: STATUS_META[s].label }))} />
              <Field label="対応の種別" type="select" value={edit.response_type} onChange={(v) => setEdit({ ...edit, response_type: v })}
                options={[{ value: '一般', label: '一般' }, { value: '緊急', label: '緊急' }]} />
              <Field label="区分" type="select" value={edit.category || ''} onChange={(v) => setEdit({ ...edit, category: v })}
                options={[{ value: '', label: '（未設定）' }, { value: '旧郵便事業', label: '旧郵便事業' }, { value: '旧郵便局', label: '旧郵便局' }, { value: '社宅', label: '社宅' }]} />
              <Field label="施設名称（局名/社宅）" value={edit.facility_name} onChange={(v) => setEdit({ ...edit, facility_name: v })} />
              <Field label="識別番号（見積発行番号）" value={edit.estimate_no} onChange={(v) => setEdit({ ...edit, estimate_no: v })} hint="例 25-0001" />
              <Field label="営繕サポート受付番号" value={edit.eizen_recv_no} onChange={(v) => setEdit({ ...edit, eizen_recv_no: v })} hint="7桁" />
              <Field label="依頼者 所属・役職" value={edit.requester_org} onChange={(v) => setEdit({ ...edit, requester_org: v })} />
              <Field label="依頼者 氏名" value={edit.requester_name} onChange={(v) => setEdit({ ...edit, requester_name: v })} />
              <Field label="担当" type="select" value={edit.assignee_id || ''} onChange={(v) => setEdit({ ...edit, assignee_id: v })} options={staffOptions} />
              <Field label="契約金額（税込）" type="number" value={edit.contract_amount} onChange={(v) => setEdit({ ...edit, contract_amount: v })} />
              <Field label="完成期限" type="date" value={edit.completion_deadline} onChange={(v) => setEdit({ ...edit, completion_deadline: v })}
                hint={edit.completion_deadline_calc ? `自動: ${edit.completion_deadline_calc}` : '契約日+4ヶ月後20日'} />
              <Field label="案件フォルダURL" value={edit.drive_folder_url} onChange={(v) => setEdit({ ...edit, drive_folder_url: v })} />
              <Field label="" type="checkbox" value={edit.is_pre_movein} onChange={(v) => setEdit({ ...edit, is_pre_movein: v })} hint="社宅入居前修繕" />
              <Field label="" type="checkbox" value={edit.is_policy_work} onChange={(v) => setEdit({ ...edit, is_policy_work: v })} hint="施策工事" />
            </div>
            <div className="mt-3"><Field label="工事内容" type="textarea" span1 value={edit.work_content} onChange={(v) => setEdit({ ...edit, work_content: v })} /></div>
            {edit.id && (
              <p className="text-xs text-slate-400 mt-2">
                連絡までの営業日数：<b className={bizCls(edit.contact_bizdays, 2)}>{edit.contact_bizdays ?? '—'}</b>（目標2以下） ／
                見積提出の営業日数：<b className={bizCls(edit.estimate_bizdays, 8)}>{edit.estimate_bizdays ?? '—'}</b>（目標8以下）
              </p>
            )}
          </CollapsibleCard>

          {/* ② 提出書類チェック / 添付ファイル（詳細の主役。フェーズ別に並ぶ） */}
          {edit.id ? (
            <CollapsibleCard title="提出書類チェック / 添付ファイル" icon={ListChecks} defaultOpen
              right={<span className="text-xs text-slate-400 mr-1">添付 {caseFiles.length} 件</span>}>
              {/* フェーズ別チェックリスト（提出済＝緑✓／未提出＝灰○。チップを押すとその種別で追加） */}
              <div className="space-y-2">
                {checklist.map((grp) => (
                  <div key={grp.phase} className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 w-10 shrink-0">{grp.phase}</span>
                    {grp.items.map((it) => (
                      <button key={it.doc_type} type="button" onClick={() => triggerUpload(it.doc_type)} disabled={uploading}
                        title={it.present ? `${it.doc_type}（${it.count}件）— 追加でアップロード` : `${it.doc_type} を追加`}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs border transition ${it.present
                          ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-500/15 dark:border-green-500/30 dark:text-green-300'
                          : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-brand-300 dark:bg-ink-800 dark:border-ink-700'}`}>
                        {it.present ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                        {it.doc_type}{it.count > 1 ? ` ×${it.count}` : ''}
                      </button>
                    ))}
                  </div>
                ))}
              </div>

              {/* アップロード操作（種別を選ぶか、AIで自動判別） */}
              <div className="flex flex-wrap items-center gap-2 mt-4">
                <select value={uploadType} onChange={(e) => setUploadType(e.target.value)}
                  className="rounded-lg border border-slate-300 dark:border-ink-600 bg-white dark:bg-ink-800 px-2.5 py-1.5 text-xs">
                  <option value="">AIで自動判別</option>
                  {(docTypes.length ? docTypes : ['その他']).map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <input ref={fileInputRef} type="file" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCaseFile(f, pendingTypeRef.current); e.target.value = '' }} />
                <Button variant="secondary" size="sm" disabled={uploading} onClick={() => triggerUpload(uploadType)}>
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}ファイルを追加
                </Button>
                <span className="text-[11px] text-slate-400">本体は共有ドライブに保存されます</span>
              </div>

              {/* 添付一覧 */}
              <div className="mt-3">
                {filesLoading ? (
                  <div className="text-center py-4"><Loader2 className="w-5 h-5 animate-spin mx-auto text-brand-500" /></div>
                ) : caseFiles.length === 0 ? (
                  <p className="text-xs text-slate-400 flex items-center gap-1"><Paperclip className="w-3.5 h-3.5" />まだ添付ファイルはありません。</p>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-ink-700 border border-slate-100 dark:border-ink-700 rounded-lg">
                    {caseFiles.map((f) => (
                      <li key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                        <Paperclip className="w-4 h-4 text-slate-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <a href={f.url} target="_blank" rel="noreferrer" className="truncate block text-slate-700 dark:text-slate-200 hover:text-brand-500">{f.file_name}</a>
                          <div className="text-[11px] text-slate-400">
                            {f.source === 'auto' && <span className="text-brand-500">AI判別 </span>}
                            {(f.created_at || '').slice(0, 10)}
                          </div>
                        </div>
                        <select value={f.doc_type} onChange={(e) => retypeFile(f.id, e.target.value)}
                          className="rounded border border-slate-200 dark:border-ink-600 bg-white dark:bg-ink-800 px-1.5 py-1 text-[11px] max-w-[9rem]">
                          {(docTypes.length ? docTypes : [f.doc_type]).map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                        <a href={f.url} target="_blank" rel="noreferrer" aria-label="ダウンロード" className="p-1 text-slate-400 hover:text-brand-500"><Download className="w-4 h-4" /></a>
                        <button onClick={() => deleteCaseFile(f.id)} aria-label="削除" className="p-1 text-slate-400 hover:text-danger-500"><Trash2 className="w-4 h-4" /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CollapsibleCard>
          ) : (
            <Card className="p-4 mb-3">
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <Paperclip className="w-3.5 h-3.5" />提出書類チェックと添付ファイルは、保存して案件を作成すると表示されます。
              </p>
            </Card>
          )}

          {/* ③ 日程・様式1-6の詳細（各フェーズの日付・工期確認・支社欄。折りたたみ） */}
          <CollapsibleCard title="日程・様式1-6の詳細" icon={Clock} defaultOpen={!edit.id}>
            <SectionTitle>見積</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="見積依頼受付日" type="date" value={edit.request_recv_date} onChange={(v) => setEdit({ ...edit, request_recv_date: v })} />
              <Field label="郵便局等 連絡日" type="date" value={edit.first_contact_date} onChange={(v) => setEdit({ ...edit, first_contact_date: v })} />
              <Field label="最終調査 指定日" type="date" value={edit.survey_designated_date} onChange={(v) => setEdit({ ...edit, survey_designated_date: v })} />
              <Field label="最終調査 完了日" type="date" value={edit.survey_done_date} onChange={(v) => setEdit({ ...edit, survey_done_date: v })} />
              <Field label="見積書 提出日" type="date" value={edit.estimate_submit_date} onChange={(v) => setEdit({ ...edit, estimate_submit_date: v })} />
            </div>

            <SectionTitle>契約・工期確認（BPO）</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="工事契約日" type="date" value={edit.contract_date} onChange={(v) => setEdit({ ...edit, contract_date: v })} />
              <Field label="契約後 連絡日" type="date" value={edit.contract_contact_date} onChange={(v) => setEdit({ ...edit, contract_contact_date: v })} />
              <Field label="契約番号（BPO）" value={edit.contract_number} onChange={(v) => setEdit({ ...edit, contract_number: v })} />
              <Field label="営繕管理番号" value={edit.eizen_mgmt_no} onChange={(v) => setEdit({ ...edit, eizen_mgmt_no: v })} />
              <Field label="局番号" value={edit.office_number} onChange={(v) => setEdit({ ...edit, office_number: v })} />
              <Field label="査定額（税抜）" type="number" value={edit.assessed_amount} onChange={(v) => setEdit({ ...edit, assessed_amount: v })} />
            </div>

            <SectionTitle>施工・完成・請求</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="現地工事 開始日" type="date" value={edit.work_start_date} onChange={(v) => setEdit({ ...edit, work_start_date: v })} />
              <Field label="現地工事 完了日" type="date" value={edit.work_done_date} onChange={(v) => setEdit({ ...edit, work_done_date: v })} />
              <Field label="完成書類 提出日" type="date" value={edit.completion_docs_date} onChange={(v) => setEdit({ ...edit, completion_docs_date: v })} />
              <Field label="請求書 提出日" type="date" value={edit.invoice_date} onChange={(v) => setEdit({ ...edit, invoice_date: v })} />
              <Field label="入金 確認日" type="date" value={edit.payment_date} onChange={(v) => setEdit({ ...edit, payment_date: v })} />
            </div>

            <SectionTitle>その他（管理欄）</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="年度" type="number" value={edit.fiscal_year} onChange={(v) => setEdit({ ...edit, fiscal_year: v })} />
              <Field label="整理番号" type="number" value={edit.seq_no} onChange={(v) => setEdit({ ...edit, seq_no: v })} hint="空で自動採番" />
              <Field label="分類コード（支社）" type="number" value={edit.classification_code} onChange={(v) => setEdit({ ...edit, classification_code: v })} hint="0〜4" />
            </div>
            <div className="mt-3"><Field label="備考" type="textarea" span1 value={edit.remarks} onChange={(v) => setEdit({ ...edit, remarks: v })} /></div>
          </CollapsibleCard>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={goBack}>キャンセル</Button>
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}保存
            </Button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-ink-950 transition-colors">
      <header className="bg-white/80 dark:bg-ink-900/80 backdrop-blur border-b border-slate-200 dark:border-ink-800 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4" />戻る</Button>
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-brand-500" />
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">郵便局 年間指名</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={exportXlsx}><Download className="w-4 h-4" /><span className="hidden sm:inline">一覧をExcel出力</span></Button>
            <Button variant="secondary" size="sm" onClick={openGenerate}><FileSpreadsheet className="w-4 h-4" /><span className="hidden sm:inline">様式1-6を生成</span></Button>
            <Button variant="secondary" size="sm" onClick={() => setIngestOpen(true)}><Wand2 className="w-4 h-4" /><span className="hidden sm:inline">AIで起票</span></Button>
            <Button variant="primary" size="sm" onClick={openNew}><Plus className="w-4 h-4" />案件を追加</Button>
          </div>
        </div>
      </header>

      {toast && <Toast toast={toast} />}

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* KPI */}
        {stats && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Badge tone="info">案件 {stats.total} 件</Badge>
            {stats.estimate_overdue > 0 && (
              <Badge tone="danger"><AlertTriangle className="w-3.5 h-3.5" />見積遅延 {stats.estimate_overdue} 件</Badge>
            )}
            {stats.deadline_overdue > 0 && (
              <Badge tone="warning"><AlertTriangle className="w-3.5 h-3.5" />工期超過 {stats.deadline_overdue} 件</Badge>
            )}
            <span className="text-xs text-slate-400">見積提出は起算日翌日から8営業日以内が目標</span>
          </div>
        )}

        {/* フィルタ */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <select value={fy || ''} onChange={(e) => { const y = Number(e.target.value); setFy(y); load(y, filterStatus, filterType, q) }}
            className="rounded-lg border border-slate-300 dark:border-ink-600 bg-white dark:bg-ink-800 px-3 py-2 text-sm font-bold">
            {years.map((y) => <option key={y} value={y}>{y === 2000 ? '旧書式（2022〜2025.9）' : `${y}年度`}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); load(fy, e.target.value, filterType, q) }}
            className="rounded-lg border border-slate-300 dark:border-ink-600 bg-white dark:bg-ink-800 px-3 py-2 text-sm">
            <option value="">状況：すべて</option>
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
          <select value={filterType} onChange={(e) => { setFilterType(e.target.value); load(fy, filterStatus, e.target.value, q) }}
            className="rounded-lg border border-slate-300 dark:border-ink-600 bg-white dark:bg-ink-800 px-3 py-2 text-sm">
            <option value="">種別：すべて</option>
            <option value="一般">一般</option>
            <option value="緊急">緊急</option>
          </select>
          <div className="relative flex-1 min-w-[12rem]">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') refresh() }}
              placeholder="施設名・工事内容・識別番号で検索"
              className="w-full rounded-lg border border-slate-300 dark:border-ink-600 bg-white dark:bg-ink-800 pl-8 pr-3 py-2 text-sm" />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20"><Loader2 className="w-8 h-8 animate-spin mx-auto text-brand-500" /><p className="text-slate-500 mt-3">読み込み中...</p></div>
        ) : cases.length === 0 ? (
          <Card className="p-10 text-center text-slate-400">
            <Mail className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>この年度の案件はまだありません。</p>
            <p className="text-xs mt-1">「案件を追加」から登録できます。</p>
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-ink-800/60 text-slate-500 dark:text-slate-400 text-left whitespace-nowrap">
                    <th className="px-3 py-3 font-semibold text-right">No.</th>
                    <th className="px-3 py-3 font-semibold">状況</th>
                    <th className="px-3 py-3 font-semibold">施設 / 工事内容</th>
                    <th className="px-3 py-3 font-semibold">種別</th>
                    <th className="px-3 py-3 font-semibold text-right">見積(営業日)</th>
                    <th className="px-3 py-3 font-semibold text-right">契約金額</th>
                    <th className="px-3 py-3 font-semibold">担当</th>
                    <th className="px-3 py-3 font-semibold text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-ink-700">
                  {cases.map((c) => (
                    <tr key={c.id} className="align-top hover:bg-slate-50/60 dark:hover:bg-ink-800/30 cursor-pointer" onClick={() => openDetail(c)}>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-500">{c.seq_no ?? ''}</td>
                      <td className="px-3 py-3"><StatusBadge status={c.status} /></td>
                      <td className="px-3 py-3 min-w-[16rem]">
                        <div className="font-bold text-slate-900 dark:text-white">{c.facility_name || '（施設名未設定）'}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{c.work_content || ''}</div>
                        {c.estimate_no && <div className="text-[11px] text-slate-400 mt-0.5">{c.estimate_no}</div>}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={c.response_type === '緊急' ? 'text-danger-600 dark:text-danger-400 font-medium' : 'text-slate-600 dark:text-slate-300'}>{c.response_type}</span>
                        <div className="text-[11px] text-slate-400">{c.type_category}</div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                        <span className={bizCls(c.estimate_bizdays, 8)}>{c.estimate_bizdays == null ? '—' : `${c.estimate_bizdays}日`}</span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-200">{yen(c.contract_amount)}</td>
                      <td className="px-3 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">{c.assignee_name || ''}</td>
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openDetail(c)} aria-label="編集" className="p-1.5 text-slate-400 hover:text-brand-500"><Pencil className="w-4 h-4" /></button>
                          {isAdmin && <button onClick={() => remove(c)} aria-label="削除" className="p-1.5 text-slate-400 hover:text-danger-500"><Trash2 className="w-4 h-4" /></button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <p className="text-xs text-slate-400 mt-6">
          営業日数は会社カレンダー（公休日）を用いた目安です。毎月10日提出の様式1-6は「様式1-6を生成」で、数式・色分け・集計シート付きの正式様式を自動生成できます（案件データから転記ゼロ）。
        </p>
      </main>

      {genOpen && (
        <ModalShell title="様式1-6 見積書・工事受注一覧表 を生成" onClose={() => !generating && setGenOpen(false)}>
          <div className="max-h-[70vh] overflow-y-auto pr-1">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {fy}年度の案件（{cases.length}件）から、公式書式（数式・色分け・集計シート付き）を自動生成します。
            </p>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Field label="報告日（様式の日付）" type="date" value={genDate} onChange={setGenDate} hint="通常は提出日（毎月10日）" />
              <Field label="担当支社（任意）" value={genBranch} onChange={setGenBranch} hint="例: 九州支社。空でテンプレ既定" />
            </div>

            <div className="flex justify-end gap-2 pt-4 mt-2">
              <Button variant="ghost" onClick={() => setGenOpen(false)} disabled={generating}>閉じる</Button>
              <Button variant="primary" onClick={runGenerate} disabled={generating || cases.length === 0}>
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                {generating ? '生成中…' : '生成する'}
              </Button>
            </div>

            <SectionTitle>生成履歴</SectionTitle>
            {submissions.length === 0 ? (
              <p className="text-xs text-slate-400">まだ生成履歴はありません。</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-ink-700">
                {submissions.map((s) => {
                  const st = s.status === 'done'
                    ? <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400"><CheckCircle2 className="w-3.5 h-3.5" />完了</span>
                    : s.status === 'error'
                      ? <span className="inline-flex items-center gap-1 text-danger-600 dark:text-danger-400"><XCircle className="w-3.5 h-3.5" />失敗</span>
                      : <span className="inline-flex items-center gap-1 text-slate-500"><Clock className="w-3.5 h-3.5 animate-pulse" />{s.status === 'processing' ? '生成中' : '待機中'}</span>
                  return (
                    <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-slate-700 dark:text-slate-200">{s.output_name || `様式1-6_${s.fiscal_year}`}</div>
                        <div className="text-[11px] text-slate-400">
                          {(s.created_at || '').slice(0, 16).replace('T', ' ')} ／ {s.case_count ?? '—'}件
                          {s.status === 'error' && s.message ? ` ／ ${s.message}` : ''}
                        </div>
                      </div>
                      {st}
                      {s.status === 'done' && (
                        <button onClick={() => downloadSubmission(s.id, s.output_name)} aria-label="ダウンロード"
                          className="p-1.5 text-brand-500 hover:text-brand-600"><Download className="w-4 h-4" /></button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </ModalShell>
      )}

      {ingestOpen && (
        <ModalShell title="AIで案件を起票" onClose={() => !ingesting && setIngestOpen(false)}>
          <div className="max-h-[70vh] overflow-y-auto pr-1">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              見積依頼メール（PDF化したもの）や緊急修繕依頼書・現況写真などを読み込ませると、
              施設名・工事内容・依頼者・受付日などをAIが読み取り、新規案件フォームにプリフィルします。
            </p>
            <label className={`mt-4 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center cursor-pointer transition ${ingesting ? 'opacity-60 pointer-events-none' : 'border-slate-300 dark:border-ink-600 hover:border-brand-400'}`}>
              {ingesting ? <Loader2 className="w-8 h-8 animate-spin text-brand-500" /> : <Sparkles className="w-8 h-8 text-brand-500" />}
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{ingesting ? 'AIが読み取り中…' : 'PDF・画像を選択（複数可）'}</span>
              <span className="text-[11px] text-slate-400">PDF / JPG / PNG に対応。読み取れない項目は空欄のままになります。</span>
              <input type="file" multiple accept=".pdf,image/*" className="hidden" disabled={ingesting}
                onChange={(e) => { const fs = Array.from(e.target.files || []); if (fs.length) runIngest(fs); e.target.value = '' }} />
            </label>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="ghost" onClick={() => setIngestOpen(false)} disabled={ingesting}>閉じる</Button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
