import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  ArrowLeft, Mail, Plus, Pencil, Trash2, Loader2, Download, Search, AlertTriangle,
} from 'lucide-react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import Toast from './ui/Toast'
import ModalShell from './ui/ModalShell'
import { API_URL as apiUrl, authConfig } from '../lib/api'
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

  const openNew = () => setEdit({
    fiscal_year: fy || new Date().getFullYear(), status: 'estimate_drafting',
    response_type: '一般', area: '長崎県対馬エリア', company: '㈱中原建設',
    is_pre_movein: false, is_policy_work: false,
  })

  const save = async () => {
    setSaving(true)
    try {
      const body = { ...edit }
      // 数値項目を整数化（空は null）
      for (const k of ['seq_no', 'fiscal_year', 'contract_amount', 'assessed_amount', 'classification_code']) {
        if (body[k] === '' || body[k] == null) body[k] = null
        else body[k] = Number(String(body[k]).replace(/[^0-9-]/g, '')) || null
      }
      if (edit.id) await axios.put(`${apiUrl}/api/post-office/cases/${edit.id}`, body, authConfig())
      else await axios.post(`${apiUrl}/api/post-office/cases`, body, authConfig())
      setEdit(null)
      showToast('success', '保存しました')
      refresh()
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
      refresh()
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

  const staffOptions = [{ value: '', label: '（未設定）' }, ...staff.map((s) => ({ value: s.id, label: s.name }))]

  // 見積提出営業日数の色（目標8以下）
  const bizCls = (n, target) => n == null ? 'text-slate-300' : (n > target ? 'text-danger-600 dark:text-danger-400 font-bold' : 'text-slate-600 dark:text-slate-300')

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
            {years.map((y) => <option key={y} value={y}>{y}年度</option>)}
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
                    <tr key={c.id} className="align-top hover:bg-slate-50/60 dark:hover:bg-ink-800/30 cursor-pointer" onClick={() => setEdit({ ...c })}>
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
                          <button onClick={() => setEdit({ ...c })} aria-label="編集" className="p-1.5 text-slate-400 hover:text-brand-500"><Pencil className="w-4 h-4" /></button>
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
          営業日数は会社カレンダー（公休日）を用いた目安です。毎月10日提出の様式1-6は「一覧をExcel出力」で列データを取得できます（正式様式への自動流し込みは次段階で対応予定）。
        </p>
      </main>

      {edit && (
        <ModalShell title={edit.id ? '案件を編集' : '案件を追加'} onClose={() => setEdit(null)}>
          <div className="max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="年度" type="number" value={edit.fiscal_year} onChange={(v) => setEdit({ ...edit, fiscal_year: v })} />
              <Field label="整理番号" type="number" value={edit.seq_no} onChange={(v) => setEdit({ ...edit, seq_no: v })} hint="空で自動採番" />
              <Field label="依頼状況" type="select" value={edit.status} onChange={(v) => setEdit({ ...edit, status: v })}
                options={STATUS_ORDER.map((s) => ({ value: s, label: STATUS_META[s].label }))} />
            </div>

            <SectionTitle>依頼</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="対応の種別" type="select" value={edit.response_type} onChange={(v) => setEdit({ ...edit, response_type: v })}
                options={[{ value: '一般', label: '一般' }, { value: '緊急', label: '緊急' }]} />
              <Field label="区分" type="select" value={edit.category || ''} onChange={(v) => setEdit({ ...edit, category: v })}
                options={[{ value: '', label: '（未設定）' }, { value: '旧郵便事業', label: '旧郵便事業' }, { value: '旧郵便局', label: '旧郵便局' }, { value: '社宅', label: '社宅' }]} />
              <Field label="営繕サポート受付番号" value={edit.eizen_recv_no} onChange={(v) => setEdit({ ...edit, eizen_recv_no: v })} hint="7桁" />
              <Field label="識別番号（見積発行番号）" value={edit.estimate_no} onChange={(v) => setEdit({ ...edit, estimate_no: v })} hint="例 25-0001" />
              <Field label="施設名称（局名/社宅）" value={edit.facility_name} onChange={(v) => setEdit({ ...edit, facility_name: v })} />
              <Field label="見積依頼受付日" type="date" value={edit.request_recv_date} onChange={(v) => setEdit({ ...edit, request_recv_date: v })} />
              <Field label="依頼者 所属・役職" value={edit.requester_org} onChange={(v) => setEdit({ ...edit, requester_org: v })} />
              <Field label="依頼者 氏名" value={edit.requester_name} onChange={(v) => setEdit({ ...edit, requester_name: v })} />
              <Field label="" type="checkbox" value={edit.is_pre_movein} onChange={(v) => setEdit({ ...edit, is_pre_movein: v })} hint="社宅入居前修繕" />
              <Field label="" type="checkbox" value={edit.is_policy_work} onChange={(v) => setEdit({ ...edit, is_policy_work: v })} hint="施策工事" />
            </div>
            <div className="mt-3"><Field label="工事内容" type="textarea" span1 value={edit.work_content} onChange={(v) => setEdit({ ...edit, work_content: v })} /></div>

            <SectionTitle>見積</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="郵便局等 連絡日" type="date" value={edit.first_contact_date} onChange={(v) => setEdit({ ...edit, first_contact_date: v })} />
              <Field label="最終調査 指定日" type="date" value={edit.survey_designated_date} onChange={(v) => setEdit({ ...edit, survey_designated_date: v })} />
              <Field label="最終調査 完了日" type="date" value={edit.survey_done_date} onChange={(v) => setEdit({ ...edit, survey_done_date: v })} />
              <Field label="見積書 提出日" type="date" value={edit.estimate_submit_date} onChange={(v) => setEdit({ ...edit, estimate_submit_date: v })} />
            </div>
            {edit.id && (
              <p className="text-xs text-slate-400 mt-2">
                連絡までの営業日数：<b className={bizCls(edit.contact_bizdays, 2)}>{edit.contact_bizdays ?? '—'}</b>（目標2以下） ／
                見積提出の営業日数：<b className={bizCls(edit.estimate_bizdays, 8)}>{edit.estimate_bizdays ?? '—'}</b>（目標8以下）
              </p>
            )}

            <SectionTitle>契約・工期確認</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="工事契約日" type="date" value={edit.contract_date} onChange={(v) => setEdit({ ...edit, contract_date: v })} />
              <Field label="契約金額（税込）" type="number" value={edit.contract_amount} onChange={(v) => setEdit({ ...edit, contract_amount: v })} />
              <Field label="契約後 連絡日" type="date" value={edit.contract_contact_date} onChange={(v) => setEdit({ ...edit, contract_contact_date: v })} />
              <Field label="契約番号（BPO）" value={edit.contract_number} onChange={(v) => setEdit({ ...edit, contract_number: v })} />
              <Field label="営繕管理番号" value={edit.eizen_mgmt_no} onChange={(v) => setEdit({ ...edit, eizen_mgmt_no: v })} />
              <Field label="局番号" value={edit.office_number} onChange={(v) => setEdit({ ...edit, office_number: v })} />
              <Field label="査定額（税抜）" type="number" value={edit.assessed_amount} onChange={(v) => setEdit({ ...edit, assessed_amount: v })} />
              <Field label="完成期限" type="date" value={edit.completion_deadline} onChange={(v) => setEdit({ ...edit, completion_deadline: v })}
                hint={edit.completion_deadline_calc ? `自動: ${edit.completion_deadline_calc}（契約日+4ヶ月後20日）` : '契約日+4ヶ月後20日'} />
            </div>

            <SectionTitle>施工・完成・請求</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="現地工事 開始日" type="date" value={edit.work_start_date} onChange={(v) => setEdit({ ...edit, work_start_date: v })} />
              <Field label="現地工事 完了日" type="date" value={edit.work_done_date} onChange={(v) => setEdit({ ...edit, work_done_date: v })} />
              <Field label="完成書類 提出日" type="date" value={edit.completion_docs_date} onChange={(v) => setEdit({ ...edit, completion_docs_date: v })} />
              <Field label="請求書 提出日" type="date" value={edit.invoice_date} onChange={(v) => setEdit({ ...edit, invoice_date: v })} />
              <Field label="入金 確認日" type="date" value={edit.payment_date} onChange={(v) => setEdit({ ...edit, payment_date: v })} />
            </div>

            <SectionTitle>管理</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="担当" type="select" value={edit.assignee_id || ''} onChange={(v) => setEdit({ ...edit, assignee_id: v })} options={staffOptions} />
              <Field label="分類コード（支社）" type="number" value={edit.classification_code} onChange={(v) => setEdit({ ...edit, classification_code: v })} hint="0〜4" />
              <Field label="案件フォルダURL" value={edit.drive_folder_url} onChange={(v) => setEdit({ ...edit, drive_folder_url: v })} />
            </div>
            <div className="mt-3"><Field label="備考" type="textarea" span1 value={edit.remarks} onChange={(v) => setEdit({ ...edit, remarks: v })} /></div>
          </div>

          <div className="flex justify-end gap-2 pt-4 mt-2 border-t border-slate-100 dark:border-ink-700">
            <Button variant="ghost" onClick={() => setEdit(null)}>キャンセル</Button>
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}保存
            </Button>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
