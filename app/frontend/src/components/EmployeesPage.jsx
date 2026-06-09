import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import axios from 'axios'
import {
  ArrowLeft, Search, Plus, Download, Award, Pencil, Trash2, X, Save,
  ShieldCheck, AlertTriangle, BadgeCheck, Users,
  ChevronUp, ChevronDown, ChevronsUpDown,
  ScanLine, Loader2, ExternalLink, UploadCloud, CheckCircle2,
  Eye, EyeOff, Copy, Check, Mail,
} from 'lucide-react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000'

// アプリキー → 表示名（権限設定UI用）
const APP_LABELS = {
  'safety-patrol': '安全パトロール',
  'employee-list': '社員一覧',
  'mailer': 'メーラー',
  'file-manager': 'ファイル管理',
  'evaluation': '社員評価',
  'dormitory': '宿舎予約',
}
const APP_KEYS = Object.keys(APP_LABELS)

// 権限レベルの選択肢
const LEVELS = [
  { value: 'none', label: 'なし' },
  { value: 'member', label: '利用可' },
  { value: 'admin', label: '管理者' },
]

// 資格区分の選択肢
const CATEGORIES = ['特別教育', '技能講習', '免許', 'その他']

// ソート対象列のキー → 比較値の取り出し方。文字列は ja ロケール、数値はそのまま比較。
const SORT_ACCESSORS = {
  name: (e) => e.furigana || e.name || '',
  company: (e) => e.company || '',
  job: (e) => `${e.job_type || ''} ${e.department || ''}`.trim(),
  hire: (e) => e.hire_date || '',
  qual: (e) => e.qualification_count || 0,
}

// 現在表示中の行を CSV（UTF-8 BOM付き＝Excelで文字化けしない）でダウンロード
function exportEmployeesCsv(rows) {
  const headers = ['社員ID', '氏名', 'ふりがな', '会社', '職種', '部署', 'メール', '電話',
    '郵便番号', '住所', '入社日', '勤続年数', '生年月日', '在籍', '資格数', '期限切れ', '期限間近']
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const lines = [headers.join(',')]
  for (const e of rows) {
    const y = yearsOfService(e.hire_date)
    lines.push([
      e.id, e.name, e.furigana, e.company, e.job_type, e.department, e.email, e.phone,
      e.postal_code, e.address, e.hire_date, y != null ? y : '', e.birth_date,
      e.is_active === false ? '退職' : '在籍', e.qualification_count || 0,
      e.qualification_expired || 0, e.qualification_expiring || 0,
    ].map(esc).join(','))
  }
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `社員一覧_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ソート可能なテーブルヘッダ
function SortTh({ label, k, sort, onSort, className = '' }) {
  const active = sort.key === k
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ChevronUp : ChevronDown
  return (
    <th className={`px-4 py-3 font-semibold ${className}`}>
      <button
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 ${active ? 'text-slate-700 dark:text-slate-200' : ''}`}
      >
        {label}
        <Icon className={`w-3.5 h-3.5 ${active ? '' : 'opacity-30'}`} />
      </button>
    </th>
  )
}

// 認証付き axios 設定を作る
function authConfig() {
  const token = localStorage.getItem('authToken')
  return { headers: { Authorization: `Bearer ${token}` } }
}

// 入社日から勤続年数（満年数）を計算。日付不正/未設定なら null。
function yearsOfService(hireDate) {
  if (!hireDate) return null
  const h = new Date(hireDate)
  if (isNaN(h)) return null
  const now = new Date()
  let y = now.getFullYear() - h.getFullYear()
  const m = now.getMonth() - h.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < h.getDate())) y--
  return y < 0 ? null : y
}

// 有効期限の状態を返す: 'expired' | 'soon'(90日以内) | 'ok' | null(期限なし)
function expiryState(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const now = new Date()
  const soon = new Date(now.getTime() + 90 * 86400000)
  if (d < now) return 'expired'
  if (d <= soon) return 'soon'
  return 'ok'
}

export default function EmployeesPage({ onBack }) {
  const [employees, setEmployees] = useState([])
  const [quals, setQuals] = useState([]) // 資格マスタ
  const [loading, setLoading] = useState(true)
  const [canEdit, setCanEdit] = useState(false) // 社員一覧の管理者か
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const [activeFilter, setActiveFilter] = useState('active') // 'all' | 'active' | 'inactive'
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' }) // 並び替え

  const [editing, setEditing] = useState(null) // 編集中の社員 or {} (新規)
  const [showQualMaster, setShowQualMaster] = useState(false)
  const [showShared, setShowShared] = useState(false) // 共有メール一覧
  const [certImportFiles, setCertImportFiles] = useState(null) // 資格者証一括取込の対象ファイル
  const [toast, setToast] = useState(null)
  const certImportRef = useRef(null)

  const showToast = useCallback((type, msg) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const loadAll = useCallback(async () => {
    try {
      const [empRes, qualRes] = await Promise.all([
        axios.get(`${apiUrl}/api/employees`, authConfig()),
        axios.get(`${apiUrl}/api/qualifications`, authConfig()),
      ])
      setEmployees(empRes.data)
      setQuals(qualRes.data)
    } catch (err) {
      console.error('社員一覧の取得に失敗:', err)
      showToast('error', err.response?.data?.error || '社員一覧の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    // 現在ユーザーの権限を判定
    axios.get(`${apiUrl}/api/my-permissions`, authConfig())
      .then((res) => {
        const d = res.data
        setCanEdit(d.role === 'admin' || d.apps?.['employee-list'] === 'admin')
      })
      .catch(() => setCanEdit(false))
    loadAll()
  }, [loadAll])

  // 部署・会社の一覧（フィルタ用）
  const departments = useMemo(
    () => [...new Set(employees.map((e) => e.department).filter(Boolean))].sort(),
    [employees]
  )
  const companies = useMemo(
    () => [...new Set(employees.map((e) => e.company).filter(Boolean))].sort(),
    [employees]
  )
  // 入力サジェスト用（過去に登録された値の候補）。会社/職種/部署。
  const jobTypes = useMemo(
    () => [...new Set(employees.map((e) => e.job_type).filter(Boolean))].sort(),
    [employees]
  )
  const suggestions = useMemo(
    () => ({ company: companies, job_type: jobTypes, department: departments }),
    [companies, jobTypes, departments]
  )

  // 検索・フィルタ適用
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return employees.filter((e) => {
      if (deptFilter && e.department !== deptFilter) return false
      if (companyFilter && e.company !== companyFilter) return false
      if (activeFilter === 'active' && e.is_active === false) return false
      if (activeFilter === 'inactive' && e.is_active !== false) return false
      if (!q) return true
      return [e.name, e.furigana, e.email, e.job_type, e.department, e.company, e.phone, e.address]
        .some((v) => v && String(v).toLowerCase().includes(q))
    })
  }, [employees, search, deptFilter, companyFilter, activeFilter])

  // 並び替え適用（空値は常に末尾）
  const sorted = useMemo(() => {
    const accessor = SORT_ACCESSORS[sort.key] || SORT_ACCESSORS.name
    const arr = [...filtered]
    arr.sort((a, b) => {
      const av = accessor(a), bv = accessor(b)
      if (typeof av === 'number' || typeof bv === 'number') {
        return sort.dir === 'asc' ? (av - bv) : (bv - av)
      }
      if (!av && bv) return 1
      if (av && !bv) return -1
      const r = String(av).localeCompare(String(bv), 'ja')
      return sort.dir === 'asc' ? r : -r
    })
    return arr
  }, [filtered, sort])

  // ヘッダクリックでソート切替（同列なら昇降反転、別列なら昇順から）
  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))

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
            <Users className="w-5 h-5 text-brand-500" />
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">社員一覧</h1>
            <span className="text-sm text-slate-400">{employees.length}名</span>
          </div>
        </div>
      </header>

      {toast && <Toast toast={toast} />}

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* ツールバー */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="氏名・ふりがな・メール・職種で検索"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-ink-600 bg-white dark:bg-ink-700 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          {companies.length > 0 && (
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-ink-600 bg-white dark:bg-ink-700 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <option value="">全会社</option>
              {companies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {departments.length > 0 && (
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-ink-600 bg-white dark:bg-ink-700 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <option value="">全部署</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-ink-600 bg-white dark:bg-ink-700 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            <option value="active">在籍中</option>
            <option value="inactive">退職</option>
            <option value="all">全て</option>
          </select>
          <Button variant="secondary" size="sm" onClick={() => exportEmployeesCsv(sorted)} disabled={sorted.length === 0}>
            <Download className="w-4 h-4" />CSV出力
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowShared(true)}>
            <Mail className="w-4 h-4" />共有メール
          </Button>
          {canEdit && (
            <>
              <input
                ref={certImportRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  const fs = Array.from(e.target.files || [])
                  if (fs.length) setCertImportFiles(fs)
                  e.target.value = ''
                }}
              />
              <Button variant="secondary" size="sm" onClick={() => certImportRef.current?.click()}>
                <UploadCloud className="w-4 h-4" />資格者証を取込
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setShowQualMaster(true)}>
                <Award className="w-4 h-4" />資格マスタ
              </Button>
              <Button variant="primary" size="sm" onClick={() => setEditing({ _new: true, app_role: 'member', is_active: true })}>
                <Plus className="w-4 h-4" />社員を追加
              </Button>
            </>
          )}
        </div>

        {/* 一覧テーブル */}
        <Card className="overflow-hidden">
          {loading ? (
            <div className="text-center py-16 text-slate-400">読み込み中...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              {employees.length === 0 ? '社員が登録されていません' : '該当する社員がいません'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-ink-700">
                    <SortTh label="氏名" k="name" sort={sort} onSort={toggleSort} />
                    <SortTh label="会社" k="company" sort={sort} onSort={toggleSort} className="hidden sm:table-cell" />
                    <th className="px-4 py-3 font-semibold hidden md:table-cell">電話</th>
                    <SortTh label="職種 / 部署" k="job" sort={sort} onSort={toggleSort} className="hidden lg:table-cell" />
                    <SortTh label="入社日 / 勤続" k="hire" sort={sort} onSort={toggleSort} className="hidden lg:table-cell" />
                    <th className="px-4 py-3 font-semibold hidden xl:table-cell">メール</th>
                    <th className="px-4 py-3 font-semibold">権限</th>
                    <SortTh label="資格" k="qual" sort={sort} onSort={toggleSort} />
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-ink-700">
                  {sorted.map((e) => (
                    <tr
                      key={e.id}
                      className="hover:bg-slate-50 dark:hover:bg-ink-700/40 cursor-pointer transition"
                      onClick={() => setEditing(e)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800 dark:text-slate-100">
                          {e.name || '(未設定)'}
                          {e.is_active === false && (
                            <span className="ml-2 text-xs text-slate-400">退職</span>
                          )}
                        </div>
                        {e.furigana && <div className="text-xs text-slate-400">{e.furigana}</div>}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-slate-600 dark:text-slate-300">
                        {e.company || '—'}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {e.phone || '—'}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-slate-600 dark:text-slate-300">
                        {e.job_type || '—'}
                        {e.department && <span className="text-slate-400"> / {e.department}</span>}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {e.hire_date || '—'}
                        {yearsOfService(e.hire_date) != null && <span className="text-slate-400"> ・ {yearsOfService(e.hire_date)}年</span>}
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                        {e.email || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <PermissionBadges perms={e.permissions} />
                      </td>
                      <td className="px-4 py-3">
                        <QualSummary e={e} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Pencil className="w-4 h-4 text-slate-300 inline" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </main>

      {/* 社員詳細・編集モーダル */}
      {editing && (
        <EmployeeModal
          employee={editing}
          isNew={!!editing._new}
          canEdit={canEdit}
          quals={quals}
          suggestions={suggestions}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); loadAll() }}
          showToast={showToast}
        />
      )}

      {/* 共有メールアドレス一覧モーダル */}
      {showShared && (
        <SharedMailboxModal
          canEdit={canEdit}
          onClose={() => setShowShared(false)}
          showToast={showToast}
        />
      )}

      {/* 資格マスタ管理モーダル */}
      {showQualMaster && (
        <QualMasterModal
          quals={quals}
          canEdit={canEdit}
          onClose={() => setShowQualMaster(false)}
          onChanged={loadAll}
          showToast={showToast}
        />
      )}

      {/* 資格者証 一括取込（AIで氏名→社員へ自動振り分け）モーダル */}
      {certImportFiles && (
        <CertImportModal
          files={certImportFiles}
          employees={employees}
          quals={quals}
          onClose={() => setCertImportFiles(null)}
          onSaved={() => { setCertImportFiles(null); loadAll() }}
          showToast={showToast}
        />
      )}
    </div>
  )
}

// 資格者証の一括取込モーダル：
// アップした各画像/PDFを順に Gemini で読取→氏名から社員・資格名からマスタを自動突合し、
// 確認リストを作る。人が担当社員/資格を確認・修正してから「すべて保存」で一括登録する。
function CertImportModal({ files, employees, quals, onClose, onSaved, showToast }) {
  const [rows, setRows] = useState([])
  const [scanning, setScanning] = useState(true)
  const [savingAll, setSavingAll] = useState(false)

  // 社員ドロップダウン（ふりがな順）
  const staffOptions = useMemo(
    () => [...employees].sort((a, b) =>
      String(a.furigana || a.name || '').localeCompare(String(b.furigana || b.name || ''), 'ja')),
    [employees]
  )

  // マウント時に全ファイルを順次スキャン（Geminiのレート制限を避けるため逐次）
  useEffect(() => {
    let cancelled = false
    const uid = () => Math.random().toString(36).slice(2)
    ;(async () => {
      const out = []
      for (const file of files) {
        const base = { id: uid(), fileName: file.name, saveState: 'pending', error: '' }
        try {
          const fd = new FormData()
          fd.append('cert', file)
          const res = await axios.post(`${apiUrl}/api/qualifications/scan`, fd, {
            headers: { ...authConfig().headers, 'Content-Type': 'multipart/form-data' },
          })
          const d = res.data
          out.push({
            ...base,
            certPath: d.cert_image_path, certUrl: d.cert_image_url,
            personName: d.extracted.person_name || '',
            staffId: d.matched_staff_id || '',
            qualId: d.matched_qualification_id || (d.extracted.name ? '__new__' : ''),
            newQualName: d.extracted.name || '',
            newQualCategory: d.extracted.category || 'その他',
            acquired_date: d.extracted.acquired_date || '',
            expiry_date: d.extracted.expiry_date || '',
            cert_number: d.extracted.cert_number || '',
          })
        } catch (err) {
          out.push({
            ...base, saveState: 'error', error: err.response?.data?.error || 'AI読取に失敗',
            certPath: '', certUrl: '', personName: '', staffId: '', qualId: '',
            newQualName: '', newQualCategory: 'その他', acquired_date: '', expiry_date: '', cert_number: '',
          })
        }
        if (cancelled) return
        setRows([...out])
      }
      if (!cancelled) setScanning(false)
    })()
    return () => { cancelled = true }
  }, [files])

  const upd = (id, patch) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const removeRow = (id) => setRows((rs) => rs.filter((r) => r.id !== id))

  const saveAll = async () => {
    setSavingAll(true)
    let ok = 0, fail = 0
    for (const r of rows) {
      if (r.saveState === 'done') { ok++; continue }
      if (!r.staffId) { upd(r.id, { saveState: 'error', error: '社員を選択してください' }); fail++; continue }
      if (r.qualId === '__new__' && !r.newQualName.trim()) { upd(r.id, { saveState: 'error', error: '資格名を入力してください' }); fail++; continue }
      if (!r.qualId) { upd(r.id, { saveState: 'error', error: '資格を選択してください' }); fail++; continue }
      upd(r.id, { saveState: 'saving', error: '' })
      try {
        let qid = r.qualId
        if (qid === '__new__') {
          const mres = await axios.post(`${apiUrl}/api/qualifications`,
            { name: r.newQualName.trim(), category: r.newQualCategory || 'その他', has_expiry: !!r.expiry_date }, authConfig())
          qid = mres.data.id
        }
        await axios.post(`${apiUrl}/api/employees/${r.staffId}/qualifications`, {
          qualification_id: qid,
          acquired_date: r.acquired_date,
          expiry_date: r.expiry_date,
          cert_number: r.cert_number,
          cert_image_path: r.certPath || undefined,
        }, authConfig())
        upd(r.id, { saveState: 'done' }); ok++
      } catch (err) {
        upd(r.id, { saveState: 'error', error: err.response?.data?.error || '保存に失敗' }); fail++
      }
    }
    setSavingAll(false)
    showToast(fail ? 'error' : 'success', `保存しました（成功 ${ok} 件${fail ? ` / 失敗 ${fail} 件` : ''}）`)
    if (fail === 0) onSaved()
  }

  const savable = rows.some((r) => r.saveState !== 'done')

  return (
    <ModalShell title={`資格者証を取込（${files.length}件）`} onClose={onClose} wide>
      <p className="text-xs text-slate-400 mb-4">
        AIが資格者証を読み取り、氏名から社員を自動で割り当てました。<br />
        担当社員と資格の内容を確認・修正してから「すべて保存」してください。氏名が読み取れない場合は社員を選んでください。
      </p>

      {scanning && (
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-3">
          <Loader2 className="w-4 h-4 animate-spin" />AI読取中...（{rows.length}/{files.length}）
        </div>
      )}

      <div className="space-y-3">
        {rows.map((r) => (
          <Card key={r.id} className="p-3 bg-slate-50 dark:bg-ink-900/40">
            <div className="flex gap-3">
              {r.certUrl
                ? <img src={r.certUrl} alt="" className="w-16 h-16 object-cover rounded-md border border-slate-200 dark:border-ink-600 shrink-0" />
                : <div className="w-16 h-16 rounded-md bg-slate-200 dark:bg-ink-700 shrink-0" />}
              <div className="flex-1 min-w-0">
                {r.saveState === 'error' && r.error && (
                  <p className="text-xs text-danger-500 mb-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{r.error}</p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Field label={`社員${r.personName ? `（読取: ${r.personName}）` : '（氏名未読取）'}`}>
                    <select className={inputCls} value={r.staffId} onChange={(e) => upd(r.id, { staffId: e.target.value })}>
                      <option value="">選択してください</option>
                      {staffOptions.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}{s.is_active === false ? '（退職）' : ''}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="資格">
                    <select className={inputCls} value={r.qualId} onChange={(e) => upd(r.id, { qualId: e.target.value })}>
                      <option value="">選択してください</option>
                      {r.newQualName && <option value="__new__">＋新規登録: {r.newQualName}</option>}
                      {quals.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
                    </select>
                  </Field>
                  {r.qualId === '__new__' && (
                    <>
                      <Field label="新規資格名">
                        <input className={inputCls} value={r.newQualName} onChange={(e) => upd(r.id, { newQualName: e.target.value })} />
                      </Field>
                      <Field label="区分">
                        <select className={inputCls} value={r.newQualCategory} onChange={(e) => upd(r.id, { newQualCategory: e.target.value })}>
                          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </Field>
                    </>
                  )}
                  <Field label="取得（修了）日">
                    <input type="date" className={inputCls} value={r.acquired_date} onChange={(e) => upd(r.id, { acquired_date: e.target.value })} />
                  </Field>
                  <Field label="有効期限">
                    <input type="date" className={inputCls} value={r.expiry_date} onChange={(e) => upd(r.id, { expiry_date: e.target.value })} />
                  </Field>
                  <Field label="証明書番号">
                    <input className={inputCls} value={r.cert_number} onChange={(e) => upd(r.id, { cert_number: e.target.value })} />
                  </Field>
                </div>
              </div>
              <div className="flex flex-col items-center gap-2 shrink-0">
                {r.saveState === 'saving' && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                {r.saveState === 'done' && <CheckCircle2 className="w-5 h-5 text-success-500" />}
                {r.saveState !== 'done' && r.saveState !== 'saving' && (
                  <button onClick={() => removeRow(r.id)} className="text-slate-300 hover:text-danger-500 p-1" title="この行を除外">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </Card>
        ))}
        {!scanning && rows.length === 0 && (
          <p className="text-sm text-slate-400 py-6 text-center">読み取れる資格者証がありませんでした</p>
        )}
      </div>

      <div className="flex justify-end gap-2 mt-5">
        <Button variant="ghost" size="sm" onClick={onClose}>閉じる</Button>
        <Button variant="primary" size="sm" onClick={saveAll} disabled={scanning || savingAll || !savable}>
          {savingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {savingAll ? '保存中...' : 'すべて保存'}
        </Button>
      </div>
    </ModalShell>
  )
}

// 権限バッジ（一覧用）。admin のアプリだけ強調、member はまとめて件数表示。
function PermissionBadges({ perms }) {
  const entries = Object.entries(perms || {})
  if (entries.length === 0) return <span className="text-xs text-slate-400">—</span>
  const admins = entries.filter(([, v]) => v === 'admin').map(([k]) => k)
  const memberCount = entries.filter(([, v]) => v === 'member').length
  return (
    <div className="flex flex-wrap gap-1">
      {admins.map((k) => (
        <Badge key={k} tone="info">
          <ShieldCheck className="w-3 h-3" />{APP_LABELS[k] || k}
        </Badge>
      ))}
      {memberCount > 0 && <Badge tone="neutral">利用可 {memberCount}</Badge>}
    </div>
  )
}

// 資格サマリ（件数＋期限アラート）
function QualSummary({ e }) {
  if (!e.qualification_count) return <span className="text-xs text-slate-400">—</span>
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge tone="neutral"><BadgeCheck className="w-3 h-3" />{e.qualification_count}</Badge>
      {e.qualification_expired > 0 && (
        <Badge tone="danger"><AlertTriangle className="w-3 h-3" />期限切れ{e.qualification_expired}</Badge>
      )}
      {e.qualification_expiring > 0 && (
        <Badge tone="warning"><AlertTriangle className="w-3 h-3" />期限間近{e.qualification_expiring}</Badge>
      )}
    </div>
  )
}

// トースト
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

// モーダルの外枠
function ModalShell({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div
        className={`bg-white dark:bg-ink-800 rounded-2xl shadow-xl border border-slate-200 dark:border-ink-700 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} my-8`}
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-ink-700 sticky top-0 bg-white dark:bg-ink-800 rounded-t-2xl">
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

// 入力フィールド共通
function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}
const inputCls = 'w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-ink-600 bg-white dark:bg-ink-700 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-60'

// メールパスワード入力欄：既定は伏字、目アイコンで表示切替、コピーボタン付き。
function PasswordField({ value, onChange }) {
  const [show, setShow] = useState(false)
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* クリップボード不可環境は無視 */ }
  }
  return (
    <div className="flex items-center gap-2">
      <input
        className={inputCls + ' font-mono'}
        type={show ? 'text' : 'password'}
        value={value || ''}
        autoComplete="new-password"
        placeholder="未設定"
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" onClick={() => setShow((s) => !s)} title={show ? '隠す' : '表示'}
        className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-ink-700">
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
      <button type="button" onClick={copy} disabled={!value} title="コピー"
        className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-ink-700 disabled:opacity-40">
        {copied ? <Check className="w-4 h-4 text-success-500" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  )
}

// クリップボードへコピーする小さなボタン（テキスト用）
function CopyButton({ value, title = 'コピー' }) {
  const [copied, setCopied] = useState(false)
  const copy = async (e) => {
    e.stopPropagation()
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* 無視 */ }
  }
  return (
    <button type="button" onClick={copy} disabled={!value} title={title}
      className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-ink-700 disabled:opacity-40">
      {copied ? <Check className="w-3.5 h-3.5 text-success-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

// 共有メールアドレス一覧モーダル（個人に紐付かない共用メール）
// 閲覧は誰でも、パスワードと追加/編集/削除は管理者(canEdit)のみ。
function SharedMailboxModal({ canEdit, onClose, showToast }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null) // 編集中の行id or '_new'
  const [draft, setDraft] = useState({ email: '', label: '', email_password: '' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/shared-mailboxes`, authConfig())
      setRows(res.data)
    } catch (err) {
      showToast('error', err.response?.data?.error || '共有メールの取得に失敗しました')
    } finally { setLoading(false) }
  }, [showToast])

  useEffect(() => { load() }, [load])

  const startNew = () => { setDraft({ email: '', label: '', email_password: '' }); setEditingId('_new') }
  const startEdit = (r) => { setDraft({ email: r.email || '', label: r.label || '', email_password: r.email_password || '' }); setEditingId(r.id) }
  const cancel = () => { setEditingId(null) }

  const save = async () => {
    if (!draft.email.trim()) { showToast('error', 'メールアドレスは必須です'); return }
    setBusy(true)
    try {
      if (editingId === '_new') {
        await axios.post(`${apiUrl}/api/shared-mailboxes`, draft, authConfig())
      } else {
        await axios.put(`${apiUrl}/api/shared-mailboxes/${editingId}`, draft, authConfig())
      }
      setEditingId(null)
      await load()
      showToast('success', '保存しました')
    } catch (err) {
      showToast('error', err.response?.data?.error || '保存に失敗しました')
    } finally { setBusy(false) }
  }

  const remove = async (r) => {
    if (!confirm(`${r.label || r.email} を削除しますか？`)) return
    try {
      await axios.delete(`${apiUrl}/api/shared-mailboxes/${r.id}`, authConfig())
      await load()
    } catch (err) {
      showToast('error', err.response?.data?.error || '削除に失敗しました')
    }
  }

  return (
    <ModalShell title="共有メールアドレス" onClose={onClose} wide>
      <p className="text-xs text-slate-400 mb-4">
        拠点・部署・用途で共用するメールアドレスの一覧です。
        {canEdit ? 'パスワードは管理者のみ表示されます。' : 'パスワードは管理者のみ閲覧できます。'}
      </p>

      {loading ? (
        <div className="text-center py-10 text-slate-400 text-sm">読み込み中...</div>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-ink-700">
          {rows.length === 0 && editingId !== '_new' && (
            <li className="text-sm text-slate-400 py-6 text-center">共有メールが登録されていません</li>
          )}
          {rows.map((r) => (
            <li key={r.id} className="py-3">
              {editingId === r.id ? (
                <SharedMailboxForm draft={draft} setDraft={setDraft} canEdit={canEdit} onSave={save} onCancel={cancel} busy={busy} />
              ) : (
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{r.label || '(用途未設定)'}</div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-sm text-slate-600 dark:text-slate-300 font-mono truncate">{r.email}</span>
                      <CopyButton value={r.email} title="メールをコピー" />
                    </div>
                    {canEdit && (
                      <div className="mt-1 max-w-xs">
                        <PasswordField value={r.email_password} onChange={() => {}} />
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => startEdit(r)} className="text-slate-300 hover:text-brand-500 p-1" title="編集"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => remove(r)} className="text-slate-300 hover:text-danger-500 p-1" title="削除"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
          {editingId === '_new' && (
            <li className="py-3">
              <SharedMailboxForm draft={draft} setDraft={setDraft} canEdit={canEdit} onSave={save} onCancel={cancel} busy={busy} isNew />
            </li>
          )}
        </ul>
      )}

      {canEdit && editingId === null && (
        <div className="flex justify-end mt-5">
          <Button variant="primary" size="sm" onClick={startNew}><Plus className="w-4 h-4" />共有メールを追加</Button>
        </div>
      )}
    </ModalShell>
  )
}

// 共有メールの追加/編集フォーム
function SharedMailboxForm({ draft, setDraft, canEdit, onSave, onCancel, busy, isNew }) {
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }))
  return (
    <Card className="p-3 bg-slate-50 dark:bg-ink-900/40">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="用途/拠点名"><input className={inputCls} value={draft.label} onChange={(e) => set('label', e.target.value)} placeholder="例: 対馬本社" /></Field>
        <Field label="メールアドレス *"><input className={inputCls} type="email" value={draft.email} onChange={(e) => set('email', e.target.value)} /></Field>
        {canEdit && (
          <div className="sm:col-span-2">
            <Field label="メールパスワード（管理者のみ）">
              <PasswordField value={draft.email_password} onChange={(v) => set('email_password', v)} />
            </Field>
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <Button variant="ghost" size="sm" onClick={onCancel}>キャンセル</Button>
        <Button variant="primary" size="sm" onClick={onSave} disabled={busy}>
          <Save className="w-4 h-4" />{busy ? '保存中...' : (isNew ? '追加' : '保存')}
        </Button>
      </div>
    </Card>
  )
}

// 社員詳細・編集モーダル（基本情報 / アプリ権限 / 資格）
function EmployeeModal({ employee, isNew, canEdit, quals, suggestions = {}, onClose, onSaved, showToast }) {
  const [tab, setTab] = useState('basic')
  const [form, setForm] = useState({
    name: '', furigana: '', email: '', email_password: '', job_type: '', department: '', company: '',
    skill_id: '', gender: '', birth_date: '', hire_date: '', phone: '',
    postal_code: '', address: '',
    app_role: 'member', report_cc: false, is_active: true,
    ...sanitize(employee),
  })
  const [perms, setPerms] = useState(employee.permissions || {})
  const [saving, setSaving] = useState(false)

  // null を空文字に直して input に渡せる形へ
  function sanitize(e) {
    const out = {}
    for (const k of ['name', 'furigana', 'email', 'email_password', 'job_type', 'department', 'company', 'skill_id', 'gender', 'birth_date', 'hire_date', 'phone', 'postal_code', 'address', 'app_role']) {
      if (e[k] != null) out[k] = e[k]
    }
    if (e.report_cc != null) out.report_cc = e.report_cc
    if (e.is_active != null) out.is_active = e.is_active
    return out
  }

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const saveBasic = async () => {
    if (!form.name?.trim()) { showToast('error', '氏名は必須です'); return }
    setSaving(true)
    try {
      if (isNew) {
        const res = await axios.post(`${apiUrl}/api/employees`, form, authConfig())
        // 新規作成直後に権限も保存（noneでないものがあれば）
        if (Object.keys(perms).length) {
          await axios.put(`${apiUrl}/api/employees/${res.data.id}/permissions`, { permissions: perms }, authConfig())
        }
        showToast('success', '社員を追加しました')
      } else {
        await axios.put(`${apiUrl}/api/employees/${employee.id}`, form, authConfig())
        showToast('success', '基本情報を更新しました')
      }
      onSaved()
    } catch (err) {
      showToast('error', err.response?.data?.error || '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const savePerms = async () => {
    setSaving(true)
    try {
      await axios.put(`${apiUrl}/api/employees/${employee.id}/permissions`, { permissions: perms }, authConfig())
      showToast('success', '権限を更新しました')
      onSaved()
    } catch (err) {
      showToast('error', err.response?.data?.error || '権限の保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirm(`${employee.name} を削除します。よろしいですか？`)) return
    setSaving(true)
    try {
      await axios.delete(`${apiUrl}/api/employees/${employee.id}`, authConfig())
      showToast('success', '社員を削除しました')
      onSaved()
    } catch (err) {
      showToast('error', err.response?.data?.error || '削除に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const tabs = isNew
    ? [['basic', '基本情報'], ['perm', 'アプリ権限']]
    : [['basic', '基本情報'], ['perm', 'アプリ権限'], ['qual', '資格']]

  return (
    <ModalShell title={isNew ? '社員を追加' : (employee.name || '社員')} onClose={onClose} wide>
      {/* タブ */}
      <div className="flex gap-1 mb-5 border-b border-slate-100 dark:border-ink-700">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition
              ${tab === k ? 'border-brand-500 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 基本情報 */}
      {tab === 'basic' && (
        <div>
          {/* 過去入力値のサジェスト候補（自由入力も可） */}
          <datalist id="dl-company">{(suggestions.company || []).map((v) => <option key={v} value={v} />)}</datalist>
          <datalist id="dl-job_type">{(suggestions.job_type || []).map((v) => <option key={v} value={v} />)}</datalist>
          <datalist id="dl-department">{(suggestions.department || []).map((v) => <option key={v} value={v} />)}</datalist>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="氏名 *"><input className={inputCls} value={form.name} disabled={!canEdit} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="ふりがな"><input className={inputCls} value={form.furigana} disabled={!canEdit} onChange={(e) => set('furigana', e.target.value)} /></Field>
            <Field label="メールアドレス"><input className={inputCls} type="email" value={form.email} disabled={!canEdit} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="電話番号"><input className={inputCls} value={form.phone} disabled={!canEdit} onChange={(e) => set('phone', e.target.value)} /></Field>
            {/* メールパスワードは管理者のみ表示・編集（APIも管理者にのみ返す） */}
            {canEdit && (
              <div className="sm:col-span-2">
                <Field label="メールパスワード（管理者のみ・社内メール設定用）">
                  <PasswordField value={form.email_password} onChange={(v) => set('email_password', v)} />
                </Field>
              </div>
            )}
            <Field label="会社"><input className={inputCls} list="dl-company" value={form.company} disabled={!canEdit} onChange={(e) => set('company', e.target.value)} /></Field>
            <Field label="職種"><input className={inputCls} list="dl-job_type" value={form.job_type} disabled={!canEdit} onChange={(e) => set('job_type', e.target.value)} /></Field>
            <Field label="部署"><input className={inputCls} list="dl-department" value={form.department} disabled={!canEdit} onChange={(e) => set('department', e.target.value)} /></Field>
            <Field label="技能者ID"><input className={inputCls} value={form.skill_id} disabled={!canEdit} onChange={(e) => set('skill_id', e.target.value)} /></Field>
            <Field label="性別">
              <select className={inputCls} value={form.gender} disabled={!canEdit} onChange={(e) => set('gender', e.target.value)}>
                <option value="">—</option><option value="男">男</option><option value="女">女</option>
              </select>
            </Field>
            <Field label="生年月日"><input className={inputCls} type="date" value={form.birth_date} disabled={!canEdit} onChange={(e) => set('birth_date', e.target.value)} /></Field>
            <Field label="雇入年月日"><input className={inputCls} type="date" value={form.hire_date} disabled={!canEdit} onChange={(e) => set('hire_date', e.target.value)} /></Field>
            <Field label="勤続年数"><input className={inputCls} value={yearsOfService(form.hire_date) != null ? `${yearsOfService(form.hire_date)} 年` : '—'} disabled readOnly /></Field>
            <Field label="郵便番号"><input className={inputCls} value={form.postal_code} disabled={!canEdit} onChange={(e) => set('postal_code', e.target.value)} /></Field>
            <div className="sm:col-span-2">
              <Field label="住所"><input className={inputCls} value={form.address} disabled={!canEdit} onChange={(e) => set('address', e.target.value)} /></Field>
            </div>
          </div>
          <div className="flex flex-wrap gap-5 mt-4">
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={!!form.is_active} disabled={!canEdit} onChange={(e) => set('is_active', e.target.checked)} />在籍中
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={!!form.report_cc} disabled={!canEdit} onChange={(e) => set('report_cc', e.target.checked)} />点検報告メールにCC
            </label>
          </div>
          {canEdit && (
            <div className="flex justify-between mt-6">
              {!isNew ? (
                <Button variant="danger" size="sm" onClick={remove} disabled={saving}><Trash2 className="w-4 h-4" />削除</Button>
              ) : <span />}
              <Button variant="primary" onClick={saveBasic} disabled={saving}>
                <Save className="w-4 h-4" />{saving ? '保存中...' : (isNew ? '追加' : '保存')}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* アプリ権限 */}
      {tab === 'perm' && (
        <div>
          <p className="text-xs text-slate-400 mb-4">社員ごとに各アプリの利用可否とアプリ内ロールを設定します。</p>
          <div className="space-y-2">
            {APP_KEYS.map((key) => {
              const cur = perms[key] || 'none'
              return (
                <div key={key} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-ink-700">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{APP_LABELS[key]}</span>
                  <div className="flex gap-1">
                    {LEVELS.map((lv) => (
                      <button
                        key={lv.value}
                        disabled={!canEdit}
                        onClick={() => setPerms((p) => ({ ...p, [key]: lv.value }))}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition
                          ${cur === lv.value
                            ? 'bg-brand-600 text-white'
                            : 'bg-slate-100 dark:bg-ink-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-ink-600'} disabled:opacity-60`}
                      >
                        {lv.label}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          {canEdit && !isNew && (
            <div className="flex justify-end mt-6">
              <Button variant="primary" onClick={savePerms} disabled={saving}>
                <Save className="w-4 h-4" />{saving ? '保存中...' : '権限を保存'}
              </Button>
            </div>
          )}
          {isNew && <p className="text-xs text-slate-400 mt-4">※ 権限は「基本情報」タブで社員を追加すると一緒に保存されます。</p>}
        </div>
      )}

      {/* 資格 */}
      {tab === 'qual' && !isNew && (
        <QualSection staffId={employee.id} quals={quals} canEdit={canEdit} showToast={showToast} />
      )}
    </ModalShell>
  )
}

// 資格セクションの空ドラフト
const EMPTY_QUAL_DRAFT = {
  qualification_id: '', acquired_date: '', expiry_date: '', cert_number: '', note: '',
  _newMasterName: '', _newMasterCategory: 'その他', _certPath: '', _certUrl: '',
}

// 社員の資格セクション
function QualSection({ staffId, quals, canEdit, showToast }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [draft, setDraft] = useState(EMPTY_QUAL_DRAFT)
  const fileRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/employees/${staffId}/qualifications`, authConfig())
      setRows(res.data)
    } catch (err) {
      showToast('error', '資格の取得に失敗しました')
    } finally { setLoading(false) }
  }, [staffId, showToast])

  useEffect(() => { load() }, [load])

  // 未登録の資格だけ選択肢に出す
  const available = quals.filter((q) => !rows.some((r) => r.qualification_id === q.id))
  const selectedMaster = quals.find((q) => q.id === draft.qualification_id)
  // 新規マスタ作成モード（スキャンで既存マスタに該当が無かった場合）
  const isNewMaster = !!draft._newMasterName && !draft.qualification_id

  const resetDraft = () => { setDraft(EMPTY_QUAL_DRAFT); setAdding(false) }

  // 資格者証をアップロード → AI 読取 → 確認フォームを開く
  const scanCert = async (file) => {
    if (!file) return
    setScanning(true)
    try {
      const fd = new FormData()
      fd.append('cert', file)
      const res = await axios.post(
        `${apiUrl}/api/employees/${staffId}/qualifications/scan`,
        fd,
        { headers: { ...authConfig().headers, 'Content-Type': 'multipart/form-data' } }
      )
      const { extracted, matched_qualification_id, cert_image_path, cert_image_url } = res.data
      setDraft({
        qualification_id: matched_qualification_id || '',
        acquired_date: extracted.acquired_date || '',
        expiry_date: extracted.expiry_date || '',
        cert_number: extracted.cert_number || '',
        note: '',
        _newMasterName: matched_qualification_id ? '' : (extracted.name || ''),
        _newMasterCategory: extracted.category || 'その他',
        _certPath: cert_image_path || '',
        _certUrl: cert_image_url || '',
      })
      setAdding(true)
      showToast('success', matched_qualification_id
        ? 'AI読取が完了しました。内容を確認・修正してください'
        : '読取完了。未登録の資格のため新規作成します。内容をご確認ください')
    } catch (err) {
      showToast('error', err.response?.data?.error || 'AI読取に失敗しました')
    } finally {
      setScanning(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const add = async () => {
    try {
      let qid = draft.qualification_id
      // 既存マスタに該当が無ければ、まず資格マスタを新規作成
      if (!qid && isNewMaster) {
        if (!draft._newMasterName.trim()) { showToast('error', '資格名を入力してください'); return }
        const res = await axios.post(`${apiUrl}/api/qualifications`, {
          name: draft._newMasterName.trim(),
          category: draft._newMasterCategory || 'その他',
          has_expiry: !!draft.expiry_date,
        }, authConfig())
        qid = res.data.id
      }
      if (!qid) { showToast('error', '資格を選択してください'); return }
      await axios.post(`${apiUrl}/api/employees/${staffId}/qualifications`, {
        qualification_id: qid,
        acquired_date: draft.acquired_date,
        expiry_date: draft.expiry_date,
        cert_number: draft.cert_number,
        note: draft.note,
        cert_image_path: draft._certPath || undefined,
      }, authConfig())
      resetDraft()
      load()
      showToast('success', '資格を追加しました')
    } catch (err) {
      showToast('error', err.response?.data?.error || '資格の追加に失敗しました')
    }
  }

  const removeRow = async (qid) => {
    if (!confirm('この資格を削除しますか？')) return
    try {
      await axios.delete(`${apiUrl}/api/employees/${staffId}/qualifications/${qid}`, authConfig())
      load()
    } catch (err) {
      showToast('error', '削除に失敗しました')
    }
  }

  if (loading) return <div className="text-center py-8 text-slate-400 text-sm">読み込み中...</div>

  return (
    <div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400 py-4 text-center">登録された資格はありません</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-ink-700 mb-4">
          {rows.map((r) => {
            const m = r.qualification_master || {}
            const st = expiryState(r.expiry_date)
            return (
              <li key={r.id} className="flex items-start gap-3 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{m.name || r.qualification_id}</span>
                    <Badge tone="neutral">{m.category}</Badge>
                    {st === 'expired' && <Badge tone="danger">期限切れ</Badge>}
                    {st === 'soon' && <Badge tone="warning">期限間近</Badge>}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {r.acquired_date && <>取得 {r.acquired_date}　</>}
                    {r.expiry_date && <>有効期限 {r.expiry_date}　</>}
                    {r.cert_number && <>No.{r.cert_number}　</>}
                    {r.cert_image_url && (
                      <a href={r.cert_image_url} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-0.5 text-brand-500 hover:underline" onClick={(ev) => ev.stopPropagation()}>
                        <ExternalLink className="w-3 h-3" />資格者証
                      </a>
                    )}
                  </div>
                </div>
                {canEdit && (
                  <button onClick={() => removeRow(r.id)} className="text-slate-300 hover:text-danger-500 p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {canEdit && (adding ? (
        <Card className="p-4 bg-slate-50 dark:bg-ink-900/40">
          {/* AI読取の元画像プレビュー */}
          {draft._certUrl && (
            <div className="flex items-start gap-3 mb-3 p-2 rounded-lg bg-brand-50 dark:bg-brand-500/10 border border-brand-100 dark:border-brand-500/20">
              <img src={draft._certUrl} alt="資格者証" className="w-16 h-16 object-cover rounded-md border border-slate-200 dark:border-ink-600" />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                AIが資格者証を読み取りました。<br />内容を確認し、誤りがあれば修正して保存してください。
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {isNewMaster ? (
              <>
                <Field label="資格名 *（新規登録）">
                  <input className={inputCls} value={draft._newMasterName}
                    onChange={(e) => setDraft((d) => ({ ...d, _newMasterName: e.target.value }))} />
                </Field>
                <Field label="区分">
                  <select className={inputCls} value={draft._newMasterCategory}
                    onChange={(e) => setDraft((d) => ({ ...d, _newMasterCategory: e.target.value }))}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
              </>
            ) : (
              <Field label="資格 *">
                <select className={inputCls} value={draft.qualification_id} onChange={(e) => setDraft((d) => ({ ...d, qualification_id: e.target.value }))}>
                  <option value="">選択してください</option>
                  {available.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
                </select>
              </Field>
            )}
            <Field label="取得（修了）日"><input type="date" className={inputCls} value={draft.acquired_date} onChange={(e) => setDraft((d) => ({ ...d, acquired_date: e.target.value }))} /></Field>
            <Field label={`有効期限${selectedMaster && !selectedMaster.has_expiry ? '（期限なし資格）' : ''}`}>
              <input type="date" className={inputCls} value={draft.expiry_date} onChange={(e) => setDraft((d) => ({ ...d, expiry_date: e.target.value }))} />
            </Field>
            <Field label="証明書番号"><input className={inputCls} value={draft.cert_number} onChange={(e) => setDraft((d) => ({ ...d, cert_number: e.target.value }))} /></Field>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="ghost" size="sm" onClick={resetDraft}>キャンセル</Button>
            <Button variant="primary" size="sm" onClick={add}>追加</Button>
          </div>
        </Card>
      ) : (
        <div className="flex flex-wrap gap-2">
          {/* 資格者証をAIで読み取って追加 */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => scanCert(e.target.files?.[0])}
          />
          <Button variant="primary" size="sm" onClick={() => fileRef.current?.click()} disabled={scanning}>
            {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
            {scanning ? 'AI読取中...' : '資格者証をスキャン（AI読取）'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)} disabled={available.length === 0}>
            <Plus className="w-4 h-4" />手入力で追加
          </Button>
        </div>
      ))}
    </div>
  )
}

// 資格マスタ管理モーダル
function QualMasterModal({ quals, canEdit, onClose, onChanged, showToast }) {
  const [list, setList] = useState(quals)
  const [draft, setDraft] = useState({ name: '', category: '技能講習', has_expiry: false })
  const [busy, setBusy] = useState(false)

  useEffect(() => { setList(quals) }, [quals])

  const add = async () => {
    if (!draft.name.trim()) { showToast('error', '資格名を入力してください'); return }
    setBusy(true)
    try {
      const res = await axios.post(`${apiUrl}/api/qualifications`, { ...draft, sort_order: (list.length + 1) * 10 }, authConfig())
      setList((l) => [...l, res.data])
      setDraft({ name: '', category: '技能講習', has_expiry: false })
      onChanged()
      showToast('success', '資格を追加しました')
    } catch (err) {
      showToast('error', err.response?.data?.error || '追加に失敗しました')
    } finally { setBusy(false) }
  }

  const remove = async (id) => {
    if (!confirm('この資格マスタを削除すると、社員にひも付いた同資格も削除されます。よろしいですか？')) return
    try {
      await axios.delete(`${apiUrl}/api/qualifications/${id}`, authConfig())
      setList((l) => l.filter((q) => q.id !== id))
      onChanged()
    } catch (err) {
      showToast('error', '削除に失敗しました')
    }
  }

  const grouped = CATEGORIES.map((c) => [c, list.filter((q) => q.category === c)]).filter(([, arr]) => arr.length)

  return (
    <ModalShell title="資格マスタ" onClose={onClose} wide>
      {canEdit && (
        <Card className="p-4 bg-slate-50 dark:bg-ink-900/40 mb-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="資格名 *"><input className={inputCls} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} /></Field>
            <Field label="区分">
              <select className={inputCls} value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <div className="flex items-end gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 pb-2">
                <input type="checkbox" checked={draft.has_expiry} onChange={(e) => setDraft((d) => ({ ...d, has_expiry: e.target.checked }))} />有効期限あり
              </label>
              <Button variant="primary" size="sm" onClick={add} disabled={busy}><Plus className="w-4 h-4" />追加</Button>
            </div>
          </div>
        </Card>
      )}

      <div className="space-y-5">
        {grouped.map(([cat, arr]) => (
          <div key={cat}>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">{cat}</p>
            <ul className="divide-y divide-slate-100 dark:divide-ink-700">
              {arr.map((q) => (
                <li key={q.id} className="flex items-center gap-2 py-2">
                  <span className="flex-1 text-sm text-slate-700 dark:text-slate-200">{q.name}</span>
                  {q.has_expiry && <Badge tone="warning">期限管理</Badge>}
                  {canEdit && (
                    <button onClick={() => remove(q.id)} className="text-slate-300 hover:text-danger-500 p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </ModalShell>
  )
}
