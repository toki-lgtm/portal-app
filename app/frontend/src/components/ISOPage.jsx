import { useState, useEffect, useMemo, useCallback } from 'react'
import axios from 'axios'
import { ArrowLeft, ClipboardList, Loader2, ExternalLink, Pencil, Plus, History } from 'lucide-react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import Toast from './ui/Toast'
import ModalShell from './ui/ModalShell'
import Field from './ui/Field'
import { InstrumentsTab, RiskTab, ScheduleTab } from './ISOTabs'
import { API_URL as apiUrl, authConfig } from '../lib/api'
import { useToast } from '../lib/useToast'

// 保管期間 → バッジ色。永年=重要(赤)/年限=中立/更新まで=情報/退職系=警告。
const RETENTION_TONE = {
  '永年': 'danger',
  '更新まで': 'info',
  '退職まで': 'warning',
  '退職後2年': 'warning',
  '3年': 'neutral',
  '5年': 'neutral',
  '7年': 'neutral',
}
const RETENTIONS = ['更新まで', '3年', '5年', '7年', '永年', '退職まで', '退職後2年']
const DEPTS = ['総務', '工事']
const APPROVERS = ['社長', '専務', '部長']

// F0では「台帳」タブのみ稼働。F1で測定機器/リスクアセス/スケジュールを追加予定。
const TABS = [
  { key: 'ledger', label: '文書記録台帳', ready: true },
  { key: 'instruments', label: '測定機器', ready: true },
  { key: 'risk', label: 'リスクアセス', ready: true },
  { key: 'schedule', label: 'スケジュール', ready: true },
]

const inputCls =
  'w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-ink-600 bg-white dark:bg-ink-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'

export default function ISOPage({ onBack }) {
  const [tab, setTab] = useState('ledger')
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const { toast, showToast } = useToast()

  // フィルタ
  const [q, setQ] = useState('')
  const [fDept, setFDept] = useState('')
  const [fRet, setFRet] = useState('')

  // モーダル
  const [editDoc, setEditDoc] = useState(null) // 編集/新規対象（{...} or 'new'）
  const [revDoc, setRevDoc] = useState(null)    // 改訂履歴を見る対象

  const loadDocs = useCallback(async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/iso/documents`, authConfig())
      setDocs(res.data || [])
    } catch (e) {
      console.error('Failed to load iso documents:', e)
      showToast('error', '台帳の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    loadDocs()
    axios
      .get(`${apiUrl}/api/my-permissions`, authConfig())
      .then((res) => setIsAdmin(res.data?.role === 'admin'))
      .catch(() => setIsAdmin(false))
  }, [loadDocs])

  const filtered = useMemo(() => {
    const kw = q.trim()
    return docs.filter((d) => {
      if (fDept && d.dept !== fDept) return false
      if (fRet && d.retention !== fRet) return false
      if (kw && !(`${d.title}${d.clause || ''}`.includes(kw))) return false
      return true
    })
  }, [docs, q, fDept, fRet])

  const stats = useMemo(() => {
    const total = docs.length
    const eternal = docs.filter((d) => d.retention === '永年').length
    const timed = docs.filter((d) => ['3年', '5年', '7年'].includes(d.retention)).length
    return { total, eternal, timed }
  }, [docs])

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-ink-950 transition-colors">
      <header className="bg-white/80 dark:bg-ink-900/80 backdrop-blur border-b border-slate-200 dark:border-ink-800 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />
            戻る
          </Button>
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-brand-500" />
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">ISO管理</h1>
            <span className="hidden sm:inline text-xs text-slate-400">9001 / 45001 / 14001 統合MS</span>
          </div>
        </div>
        {/* タブ */}
        <div className="max-w-7xl mx-auto px-6 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              disabled={!t.ready}
              onClick={() => t.ready && setTab(t.key)}
              className={`px-4 py-2 text-sm font-semibold border-b-2 whitespace-nowrap transition ${
                tab === t.key
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : t.ready
                  ? 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  : 'border-transparent text-slate-300 dark:text-slate-600 cursor-not-allowed'
              }`}
            >
              {t.label}
              {!t.ready && <span className="ml-1 text-[10px]">近日</span>}
            </button>
          ))}
        </div>
      </header>

      {toast && <Toast toast={toast} />}

      <main className="max-w-7xl mx-auto px-6 py-6">
        {tab === 'instruments' && <InstrumentsTab isAdmin={isAdmin} showToast={showToast} />}
        {tab === 'risk' && <RiskTab isAdmin={isAdmin} showToast={showToast} />}
        {tab === 'schedule' && <ScheduleTab isAdmin={isAdmin} showToast={showToast} />}
        {tab === 'ledger' && (loading ? (
          <div className="text-center py-20">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-brand-500" />
            <p className="text-slate-500 dark:text-slate-400 mt-3">読み込み中...</p>
          </div>
        ) : (
          <>
            {/* サマリ */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <Card className="p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">管理文書・記録</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.total}<span className="text-sm font-normal ml-1">種</span></p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">永年保管</p>
                <p className="text-2xl font-bold text-danger-600 dark:text-danger-400">{stats.eternal}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">年限保管（3/5/7年）</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.timed}</p>
              </Card>
            </div>

            {/* フィルタ + 追加 */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="タイトル・条項で検索"
                className={`${inputCls} max-w-xs`}
              />
              <select value={fDept} onChange={(e) => setFDept(e.target.value)} className={`${inputCls} w-auto`}>
                <option value="">部門: すべて</option>
                {DEPTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <select value={fRet} onChange={(e) => setFRet(e.target.value)} className={`${inputCls} w-auto`}>
                <option value="">保管期間: すべて</option>
                {RETENTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <span className="text-xs text-slate-400">{filtered.length}件</span>
              {isAdmin && (
                <Button variant="primary" size="sm" className="ml-auto" onClick={() => setEditDoc('new')}>
                  <Plus className="w-4 h-4" />
                  文書を追加
                </Button>
              )}
            </div>

            {/* 台帳テーブル */}
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-ink-700">
                      <th className="px-3 py-2 font-semibold">条項</th>
                      <th className="px-3 py-2 font-semibold">タイトル</th>
                      <th className="px-3 py-2 font-semibold text-center">版</th>
                      <th className="px-3 py-2 font-semibold">管理部門</th>
                      <th className="px-3 py-2 font-semibold">承認</th>
                      <th className="px-3 py-2 font-semibold">保管期間</th>
                      <th className="px-3 py-2 font-semibold text-center">実体</th>
                      <th className="px-3 py-2 font-semibold text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((d) => (
                      <tr key={d.id} className="border-b border-slate-100 dark:border-ink-800 hover:bg-slate-50 dark:hover:bg-ink-900/50">
                        <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap align-top">{d.clause}</td>
                        <td className="px-3 py-2 text-slate-900 dark:text-white align-top">{d.title}</td>
                        <td className="px-3 py-2 text-center align-top">{d.version}</td>
                        <td className="px-3 py-2 whitespace-nowrap align-top">{d.dept}</td>
                        <td className="px-3 py-2 whitespace-nowrap align-top">{d.approver}</td>
                        <td className="px-3 py-2 align-top">
                          <Badge tone={RETENTION_TONE[d.retention] || 'neutral'}>{d.retention}</Badge>
                        </td>
                        <td className="px-3 py-2 text-center align-top">
                          {d.storage_link ? (
                            <a href={d.storage_link} target="_blank" rel="noreferrer" className="inline-flex text-brand-500 hover:text-brand-600" title="保管先を開く">
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-600">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => setRevDoc(d)} title="改訂履歴" className="p-1 text-slate-400 hover:text-brand-500">
                              <History className="w-4 h-4" />
                            </button>
                            {isAdmin && (
                              <button onClick={() => setEditDoc(d)} title="編集" className="p-1 text-slate-400 hover:text-brand-500">
                                <Pencil className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr><td colSpan={8} className="px-3 py-10 text-center text-slate-400">該当する文書がありません</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
            <p className="text-xs text-slate-400 mt-4">
              出典: ISO文書記録保管庫「文書記録管理台帳」（58分類）。閲覧は全社員、編集はISO管理者のみ。
            </p>
          </>
        ))}
      </main>

      {editDoc && (
        <DocEditModal
          doc={editDoc === 'new' ? null : editDoc}
          onClose={() => setEditDoc(null)}
          onSaved={() => { setEditDoc(null); loadDocs() }}
          showToast={showToast}
        />
      )}
      {revDoc && (
        <RevisionsModal
          doc={revDoc}
          isAdmin={isAdmin}
          onClose={() => setRevDoc(null)}
          onChanged={() => loadDocs()}
          showToast={showToast}
        />
      )}
    </div>
  )
}

// ── 文書の追加/編集 ─────────────────────────────
function DocEditModal({ doc, onClose, onSaved, showToast }) {
  const isNew = !doc
  const [form, setForm] = useState({
    clause: doc?.clause || '',
    title: doc?.title || '',
    dept: doc?.dept || '総務',
    approver: doc?.approver || '専務',
    retention: doc?.retention || '更新まで',
    category_no: doc?.category_no || '',
    storage_link: doc?.storage_link || '',
    note: doc?.note || '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const save = async () => {
    if (!form.title.trim()) { showToast('error', 'タイトルは必須です'); return }
    setSaving(true)
    try {
      if (isNew) {
        await axios.post(`${apiUrl}/api/iso/documents`, form, authConfig())
        showToast('success', '文書を追加しました')
      } else {
        await axios.put(`${apiUrl}/api/iso/documents/${doc.id}`, form, authConfig())
        showToast('success', '文書を更新しました')
      }
      onSaved()
    } catch (e) {
      showToast('error', e.response?.data?.error || '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title={isNew ? '文書を追加' : '文書を編集'} onClose={onClose} wide>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="タイトル *">
          <input className={inputCls} value={form.title} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="関連条項">
          <input className={inputCls} value={form.clause} onChange={(e) => set('clause', e.target.value)} placeholder="例: 8.1" />
        </Field>
        <Field label="管理部門">
          <select className={inputCls} value={form.dept} onChange={(e) => set('dept', e.target.value)}>
            {DEPTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="承認者">
          <select className={inputCls} value={form.approver} onChange={(e) => set('approver', e.target.value)}>
            {APPROVERS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </Field>
        <Field label="保管期間">
          <select className={inputCls} value={form.retention} onChange={(e) => set('retention', e.target.value)}>
            {RETENTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="分類No" hint="保管庫連番 000-058">
          <input className={inputCls} value={form.category_no} onChange={(e) => set('category_no', e.target.value)} placeholder="例: 053" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="保管先リンク" hint="Driveフォルダ/ファイルのURL">
            <input className={inputCls} value={form.storage_link} onChange={(e) => set('storage_link', e.target.value)} placeholder="https://drive.google.com/..." />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="備考">
            <input className={inputCls} value={form.note} onChange={(e) => set('note', e.target.value)} />
          </Field>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="secondary" onClick={onClose}>キャンセル</Button>
        <Button variant="primary" onClick={save} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          保存
        </Button>
      </div>
    </ModalShell>
  )
}

// ── 改訂履歴 ─────────────────────────────
function RevisionsModal({ doc, isAdmin, onClose, onChanged, showToast }) {
  const [revs, setRevs] = useState(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ rev_date: '', rev_content: '', created_by: '', approved_by: '' })
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/iso/documents/${doc.id}/revisions`, authConfig())
      setRevs(res.data || [])
    } catch {
      setRevs([])
    }
  }, [doc.id])

  useEffect(() => { load() }, [load])

  const addRev = async () => {
    if (!form.rev_content.trim()) { showToast('error', '改訂内容は必須です'); return }
    try {
      await axios.post(`${apiUrl}/api/iso/documents/${doc.id}/revisions`, form, authConfig())
      showToast('success', `改訂を追加しました（版が上がりました）`)
      setForm({ rev_date: '', rev_content: '', created_by: '', approved_by: '' })
      setAdding(false)
      load()
      onChanged()
    } catch (e) {
      showToast('error', e.response?.data?.error || '追加に失敗しました')
    }
  }

  return (
    <ModalShell title={`改訂履歴：${doc.title}`} onClose={onClose} wide>
      {revs === null ? (
        <div className="text-center py-6"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand-500" /></div>
      ) : (
        <div className="space-y-2">
          {revs.length === 0 && <p className="text-sm text-slate-400 py-4 text-center">改訂履歴はまだありません</p>}
          {revs.map((r) => (
            <div key={r.id} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-ink-900/50 text-sm">
              <span className="text-xs text-slate-400 whitespace-nowrap w-24">{r.rev_date || '—'}</span>
              <div className="flex-1">
                <p className="text-slate-900 dark:text-white">{r.rev_content}</p>
                <p className="text-xs text-slate-400 mt-0.5">作成: {r.created_by || '—'} / 承認: {r.approved_by || '—'}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-ink-700">
          {adding ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="改訂日"><input type="date" className={inputCls} value={form.rev_date} onChange={(e) => set('rev_date', e.target.value)} /></Field>
                <Field label="改訂内容 *"><input className={inputCls} value={form.rev_content} onChange={(e) => set('rev_content', e.target.value)} placeholder="例: 内部と外部の課題の一部削除" /></Field>
                <Field label="作成"><input className={inputCls} value={form.created_by} onChange={(e) => set('created_by', e.target.value)} /></Field>
                <Field label="承認"><input className={inputCls} value={form.approved_by} onChange={(e) => set('approved_by', e.target.value)} /></Field>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setAdding(false)}>キャンセル</Button>
                <Button variant="primary" size="sm" onClick={addRev}>改訂を記録（版+1）</Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
              <Plus className="w-4 h-4" />
              改訂を追加
            </Button>
          )}
        </div>
      )}
    </ModalShell>
  )
}
