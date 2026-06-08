import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import axios from 'axios'
import {
  ArrowLeft, Search, Plus, Upload, Award, Pencil, Trash2, X, Save,
  ShieldCheck, AlertTriangle, BadgeCheck, Users, FileSpreadsheet,
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

// インポート時の列名 → DBフィールドの対応（Excel/CSVのヘッダ名を吸収）
const IMPORT_HEADER_MAP = {
  '氏名': 'name', '名前': 'name', 'name': 'name',
  'ふりがな': 'furigana', 'フリガナ': 'furigana', 'furigana': 'furigana',
  'メール': 'email', 'メールアドレス': 'email', 'email': 'email',
  '職種': 'job_type', 'job_type': 'job_type',
  '部署': 'department', '所属': 'department', 'department': 'department',
  '技能者id': 'skill_id', '技能者ID': 'skill_id', 'skill_id': 'skill_id',
  '性別': 'gender', 'gender': 'gender',
  '生年月日': 'birth_date', 'birth_date': 'birth_date',
  '雇入年月日': 'hire_date', '入社日': 'hire_date', 'hire_date': 'hire_date',
  '電話': 'phone', '電話番号': 'phone', 'phone': 'phone',
}

// 認証付き axios 設定を作る
function authConfig() {
  const token = localStorage.getItem('authToken')
  return { headers: { Authorization: `Bearer ${token}` } }
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

  const [editing, setEditing] = useState(null) // 編集中の社員 or {} (新規)
  const [showImport, setShowImport] = useState(false)
  const [showQualMaster, setShowQualMaster] = useState(false)
  const [toast, setToast] = useState(null)

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

  // 部署の一覧（フィルタ用）
  const departments = useMemo(
    () => [...new Set(employees.map((e) => e.department).filter(Boolean))].sort(),
    [employees]
  )

  // 検索・フィルタ適用
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return employees.filter((e) => {
      if (deptFilter && e.department !== deptFilter) return false
      if (!q) return true
      return [e.name, e.furigana, e.email, e.job_type, e.department]
        .some((v) => v && String(v).toLowerCase().includes(q))
    })
  }, [employees, search, deptFilter])

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
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-ink-600 bg-white dark:bg-ink-700 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            <option value="">全部署</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          {canEdit && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setShowQualMaster(true)}>
                <Award className="w-4 h-4" />資格マスタ
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setShowImport(true)}>
                <Upload className="w-4 h-4" />インポート
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
                    <th className="px-4 py-3 font-semibold">氏名</th>
                    <th className="px-4 py-3 font-semibold hidden md:table-cell">職種 / 部署</th>
                    <th className="px-4 py-3 font-semibold hidden lg:table-cell">メール</th>
                    <th className="px-4 py-3 font-semibold">権限</th>
                    <th className="px-4 py-3 font-semibold">資格</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-ink-700">
                  {filtered.map((e) => (
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
                      <td className="px-4 py-3 hidden md:table-cell text-slate-600 dark:text-slate-300">
                        {e.job_type || '—'}
                        {e.department && <span className="text-slate-400"> / {e.department}</span>}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
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
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); loadAll() }}
          showToast={showToast}
        />
      )}

      {/* インポートモーダル */}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onDone={() => { setShowImport(false); loadAll() }}
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
    </div>
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

// 社員詳細・編集モーダル（基本情報 / アプリ権限 / 資格）
function EmployeeModal({ employee, isNew, canEdit, quals, onClose, onSaved, showToast }) {
  const [tab, setTab] = useState('basic')
  const [form, setForm] = useState({
    name: '', furigana: '', email: '', job_type: '', department: '',
    skill_id: '', gender: '', birth_date: '', hire_date: '', phone: '',
    app_role: 'member', report_cc: false, is_active: true,
    ...sanitize(employee),
  })
  const [perms, setPerms] = useState(employee.permissions || {})
  const [saving, setSaving] = useState(false)

  // null を空文字に直して input に渡せる形へ
  function sanitize(e) {
    const out = {}
    for (const k of ['name', 'furigana', 'email', 'job_type', 'department', 'skill_id', 'gender', 'birth_date', 'hire_date', 'phone', 'app_role']) {
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="氏名 *"><input className={inputCls} value={form.name} disabled={!canEdit} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="ふりがな"><input className={inputCls} value={form.furigana} disabled={!canEdit} onChange={(e) => set('furigana', e.target.value)} /></Field>
            <Field label="メールアドレス"><input className={inputCls} type="email" value={form.email} disabled={!canEdit} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="電話番号"><input className={inputCls} value={form.phone} disabled={!canEdit} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label="職種"><input className={inputCls} value={form.job_type} disabled={!canEdit} onChange={(e) => set('job_type', e.target.value)} /></Field>
            <Field label="部署"><input className={inputCls} value={form.department} disabled={!canEdit} onChange={(e) => set('department', e.target.value)} /></Field>
            <Field label="技能者ID"><input className={inputCls} value={form.skill_id} disabled={!canEdit} onChange={(e) => set('skill_id', e.target.value)} /></Field>
            <Field label="性別">
              <select className={inputCls} value={form.gender} disabled={!canEdit} onChange={(e) => set('gender', e.target.value)}>
                <option value="">—</option><option value="男">男</option><option value="女">女</option>
              </select>
            </Field>
            <Field label="生年月日"><input className={inputCls} type="date" value={form.birth_date} disabled={!canEdit} onChange={(e) => set('birth_date', e.target.value)} /></Field>
            <Field label="雇入年月日"><input className={inputCls} type="date" value={form.hire_date} disabled={!canEdit} onChange={(e) => set('hire_date', e.target.value)} /></Field>
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

// 社員の資格セクション
function QualSection({ staffId, quals, canEdit, showToast }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ qualification_id: '', acquired_date: '', expiry_date: '', cert_number: '', note: '' })

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

  const add = async () => {
    if (!draft.qualification_id) { showToast('error', '資格を選択してください'); return }
    try {
      await axios.post(`${apiUrl}/api/employees/${staffId}/qualifications`, draft, authConfig())
      setAdding(false)
      setDraft({ qualification_id: '', acquired_date: '', expiry_date: '', cert_number: '', note: '' })
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
                    {r.cert_number && <>No.{r.cert_number}</>}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="資格 *">
              <select className={inputCls} value={draft.qualification_id} onChange={(e) => setDraft((d) => ({ ...d, qualification_id: e.target.value }))}>
                <option value="">選択してください</option>
                {available.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
              </select>
            </Field>
            <Field label="取得（修了）日"><input type="date" className={inputCls} value={draft.acquired_date} onChange={(e) => setDraft((d) => ({ ...d, acquired_date: e.target.value }))} /></Field>
            <Field label={`有効期限${selectedMaster && !selectedMaster.has_expiry ? '（期限なし資格）' : ''}`}>
              <input type="date" className={inputCls} value={draft.expiry_date} onChange={(e) => setDraft((d) => ({ ...d, expiry_date: e.target.value }))} />
            </Field>
            <Field label="証明書番号"><input className={inputCls} value={draft.cert_number} onChange={(e) => setDraft((d) => ({ ...d, cert_number: e.target.value }))} /></Field>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>キャンセル</Button>
            <Button variant="primary" size="sm" onClick={add}>追加</Button>
          </div>
        </Card>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setAdding(true)} disabled={available.length === 0}>
          <Plus className="w-4 h-4" />資格を追加
        </Button>
      ))}
    </div>
  )
}

// Excel/CSV インポートモーダル
function ImportModal({ onClose, onDone, showToast }) {
  const [rows, setRows] = useState([])     // マッピング済みの行
  const [rawHeaders, setRawHeaders] = useState([])
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)

  // ファイル選択 → SheetJSで解析 → ヘッダをマッピング
  const onFile = async (file) => {
    if (!file) return
    setFileName(file.name)
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false })
      if (json.length === 0) { showToast('error', 'データ行が見つかりません'); return }
      setRawHeaders(Object.keys(json[0]))
      const mapped = json.map((r) => {
        const out = {}
        for (const [col, val] of Object.entries(r)) {
          const key = IMPORT_HEADER_MAP[String(col).trim().toLowerCase()] || IMPORT_HEADER_MAP[String(col).trim()]
          if (key && val !== '') out[key] = String(val).trim()
        }
        return out
      }).filter((r) => r.name || r.email)
      setRows(mapped)
      if (mapped.length === 0) showToast('error', '「氏名」「メール」列が認識できませんでした。ヘッダ名をご確認ください。')
    } catch (err) {
      console.error(err)
      showToast('error', 'ファイルの解析に失敗しました')
    }
  }

  const doImport = async () => {
    setBusy(true)
    try {
      const res = await axios.post(`${apiUrl}/api/employees/import`, { rows }, authConfig())
      const { inserted, updated, errors } = res.data
      showToast('success', `インポート完了：新規 ${inserted}件 / 更新 ${updated}件${errors.length ? ` / エラー ${errors.length}件` : ''}`)
      onDone()
    } catch (err) {
      showToast('error', err.response?.data?.error || 'インポートに失敗しました')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell title="社員データのインポート" onClose={onClose} wide>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Excel(.xlsx) または CSV を選択してください。1行目を見出しとして読み取ります。</p>
      <p className="text-xs text-slate-400 mb-4">
        認識する列名：氏名 / ふりがな / メール / 職種 / 部署 / 技能者ID / 性別 / 生年月日 / 雇入年月日 / 電話　（メールが一致する社員は上書き更新）
      </p>

      <div
        className="border-2 border-dashed border-slate-300 dark:border-ink-600 rounded-2xl p-8 text-center cursor-pointer hover:border-brand-400 transition"
        onClick={() => inputRef.current?.click()}
      >
        <FileSpreadsheet className="w-8 h-8 mx-auto text-slate-400 mb-2" />
        <p className="text-sm text-slate-500">{fileName || 'クリックしてファイルを選択'}</p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </div>

      {rows.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            プレビュー（{rows.length}件）<span className="text-xs font-normal text-slate-400 ml-2">検出列: {rawHeaders.join(', ')}</span>
          </p>
          <div className="max-h-60 overflow-auto border border-slate-100 dark:border-ink-700 rounded-xl">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-ink-900/40 text-slate-500 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left">氏名</th>
                  <th className="px-3 py-2 text-left">ふりがな</th>
                  <th className="px-3 py-2 text-left">メール</th>
                  <th className="px-3 py-2 text-left">職種</th>
                  <th className="px-3 py-2 text-left">部署</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-ink-700">
                {rows.slice(0, 50).map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5 text-slate-700 dark:text-slate-200">{r.name || '—'}</td>
                    <td className="px-3 py-1.5 text-slate-500">{r.furigana || '—'}</td>
                    <td className="px-3 py-1.5 text-slate-500">{r.email || '—'}</td>
                    <td className="px-3 py-1.5 text-slate-500">{r.job_type || '—'}</td>
                    <td className="px-3 py-1.5 text-slate-500">{r.department || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={onClose}>キャンセル</Button>
            <Button variant="primary" onClick={doImport} disabled={busy}>
              <Upload className="w-4 h-4" />{busy ? '取込中...' : `${rows.length}件を取り込む`}
            </Button>
          </div>
        </div>
      )}
    </ModalShell>
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
