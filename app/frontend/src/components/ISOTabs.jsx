import { useState, useEffect, useCallback, useMemo } from 'react'
import axios from 'axios'
import { Loader2, Plus, Pencil, Trash2, PackageCheck, PackageOpen, Wrench, CheckCircle2 } from 'lucide-react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import ModalShell from './ui/ModalShell'
import Field from './ui/Field'
import { API_URL as apiUrl, authConfig } from '../lib/api'

const inputCls =
  'w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-ink-600 bg-white dark:bg-ink-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 次回校正期限 → バッジ色（期限切れ=赤 / 60日以内=橙 / それ以外=緑）
function dueTone(date) {
  if (!date) return { tone: 'neutral', label: '未記録' }
  const days = Math.floor((new Date(date + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 86400000)
  if (days < 0) return { tone: 'danger', label: `期限切れ ${date}` }
  if (days < 60) return { tone: 'warning', label: `まもなく ${date}` }
  return { tone: 'success', label: date }
}

// ══════════════ 測定機器タブ ══════════════
export function InstrumentsTab({ isAdmin, showToast }) {
  const [rows, setRows] = useState(null)
  const [modal, setModal] = useState(null) // {type, inst}

  const load = useCallback(async () => {
    try {
      const r = await axios.get(`${apiUrl}/api/iso/instruments`, authConfig())
      setRows(r.data || [])
    } catch {
      showToast('error', '機器の取得に失敗しました')
      setRows([])
    }
  }, [showToast])
  useEffect(() => { load() }, [load])

  const doReturn = async (loanId) => {
    try {
      await axios.put(`${apiUrl}/api/iso/loans/${loanId}/return`, { return_date: today() }, authConfig())
      showToast('success', '返却しました')
      load()
    } catch (e) { showToast('error', e.response?.data?.error || '返却に失敗しました') }
  }

  if (rows === null) return <Loading />

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">個体番号・校正期限・現場貸出を管理（審査懸念No.3対応）</p>
        {isAdmin && <Button variant="primary" size="sm" onClick={() => setModal({ type: 'new' })}><Plus className="w-4 h-4" />機器を追加</Button>}
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-ink-700">
                <th className="px-3 py-2 font-semibold">個体番号</th>
                <th className="px-3 py-2 font-semibold">名称</th>
                <th className="px-3 py-2 font-semibold">校正会社</th>
                <th className="px-3 py-2 font-semibold">次回校正期限</th>
                <th className="px-3 py-2 font-semibold">貸出状況</th>
                {isAdmin && <th className="px-3 py-2 font-semibold text-center">操作</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((it) => {
                const due = dueTone(it.next_due_date)
                return (
                  <tr key={it.id} className="border-b border-slate-100 dark:border-ink-800 hover:bg-slate-50 dark:hover:bg-ink-900/50">
                    <td className="px-3 py-2 font-mono font-semibold text-slate-900 dark:text-white whitespace-nowrap">{it.serial_no || <span className="text-danger-500">未付番</span>}</td>
                    <td className="px-3 py-2">{it.name}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{it.vendor || '—'}</td>
                    <td className="px-3 py-2"><Badge tone={due.tone}>{due.label}</Badge></td>
                    <td className="px-3 py-2">
                      {it.current_loan
                        ? <Badge tone="warning">{it.current_loan.site_name || '貸出中'}{it.current_loan.borrower ? `（${it.current_loan.borrower}）` : ''}</Badge>
                        : <Badge tone="success">在庫</Badge>}
                    </td>
                    {isAdmin && (
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                          {it.current_loan
                            ? <button title="返却" onClick={() => doReturn(it.current_loan.id)} className="p-1 text-emerald-500 hover:text-emerald-600"><PackageCheck className="w-4 h-4" /></button>
                            : <button title="貸出" onClick={() => setModal({ type: 'loan', inst: it })} className="p-1 text-amber-500 hover:text-amber-600"><PackageOpen className="w-4 h-4" /></button>}
                          <button title="校正記録" onClick={() => setModal({ type: 'cal', inst: it })} className="p-1 text-slate-400 hover:text-brand-500"><Wrench className="w-4 h-4" /></button>
                          <button title="編集" onClick={() => setModal({ type: 'edit', inst: it })} className="p-1 text-slate-400 hover:text-brand-500"><Pencil className="w-4 h-4" /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
              {rows.length === 0 && <tr><td colSpan={isAdmin ? 6 : 5} className="px-3 py-10 text-center text-slate-400">機器が登録されていません</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {modal && <InstrumentModal modal={modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} showToast={showToast} />}
    </>
  )
}

function InstrumentModal({ modal, onClose, onSaved, showToast }) {
  const { type, inst } = modal
  const [form, setForm] = useState(() => {
    if (type === 'loan') return { site_name: '', borrower: '', loan_date: today() }
    if (type === 'cal') return { actual_date: today(), assignee: '', cert_link: '' }
    if (type === 'edit') return { serial_no: inst.serial_no || '', name: inst.name || '', model: inst.model || '', calibration_cycle_months: inst.calibration_cycle_months || '', calibration_method: inst.calibration_method || '外注', vendor: inst.vendor || '' }
    return { serial_no: '', name: '', model: '', calibration_cycle_months: 12, calibration_method: '外注', vendor: '' } // new
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const submit = async () => {
    setSaving(true)
    try {
      if (type === 'loan') {
        await axios.post(`${apiUrl}/api/iso/instruments/${inst.id}/loans`, form, authConfig())
        showToast('success', '貸出を登録しました')
      } else if (type === 'cal') {
        await axios.post(`${apiUrl}/api/iso/instruments/${inst.id}/calibrations`, form, authConfig())
        showToast('success', '校正記録を追加しました')
      } else if (type === 'edit') {
        await axios.put(`${apiUrl}/api/iso/instruments/${inst.id}`, form, authConfig())
        showToast('success', '機器を更新しました')
      } else {
        await axios.post(`${apiUrl}/api/iso/instruments`, form, authConfig())
        showToast('success', '機器を追加しました')
      }
      onSaved()
    } catch (e) { showToast('error', e.response?.data?.error || '保存に失敗しました') }
    finally { setSaving(false) }
  }

  const titles = { loan: '貸出を登録', cal: '校正記録を追加', edit: '機器を編集', new: '機器を追加' }
  return (
    <ModalShell title={`${titles[type]}${inst ? `：${inst.serial_no || inst.name}` : ''}`} onClose={onClose} wide>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {type === 'loan' && (<>
          <Field label="貸出先現場"><input className={inputCls} value={form.site_name} onChange={(e) => set('site_name', e.target.value)} placeholder="例: 海栗島火薬庫" /></Field>
          <Field label="借用者"><input className={inputCls} value={form.borrower} onChange={(e) => set('borrower', e.target.value)} /></Field>
          <Field label="貸出日"><input type="date" className={inputCls} value={form.loan_date} onChange={(e) => set('loan_date', e.target.value)} /></Field>
        </>)}
        {type === 'cal' && (<>
          <Field label="校正実施日"><input type="date" className={inputCls} value={form.actual_date} onChange={(e) => set('actual_date', e.target.value)} /></Field>
          <Field label="担当"><input className={inputCls} value={form.assignee} onChange={(e) => set('assignee', e.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label="校正証明書リンク" hint="Drive URL"><input className={inputCls} value={form.cert_link} onChange={(e) => set('cert_link', e.target.value)} /></Field></div>
        </>)}
        {(type === 'edit' || type === 'new') && (<>
          <Field label="個体番号"><input className={inputCls} value={form.serial_no} onChange={(e) => set('serial_no', e.target.value)} placeholder="例: AL-01" /></Field>
          <Field label="名称 *"><input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="型番"><input className={inputCls} value={form.model} onChange={(e) => set('model', e.target.value)} /></Field>
          <Field label="校正周期(月)"><input type="number" className={inputCls} value={form.calibration_cycle_months} onChange={(e) => set('calibration_cycle_months', e.target.value ? parseInt(e.target.value, 10) : '')} /></Field>
          <Field label="校正方法"><input className={inputCls} value={form.calibration_method} onChange={(e) => set('calibration_method', e.target.value)} /></Field>
          <Field label="校正会社"><input className={inputCls} value={form.vendor} onChange={(e) => set('vendor', e.target.value)} /></Field>
        </>)}
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="secondary" onClick={onClose}>キャンセル</Button>
        <Button variant="primary" onClick={submit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin" />}保存</Button>
      </div>
    </ModalShell>
  )
}

// ══════════════ リスクアセスタブ ══════════════
export function RiskTab({ isAdmin, showToast }) {
  const [rows, setRows] = useState(null)
  const [locs, setLocs] = useState([])
  const [locFilter, setLocFilter] = useState('')
  const [modal, setModal] = useState(null)

  const load = useCallback(async () => {
    try {
      const [ra, lc] = await Promise.all([
        axios.get(`${apiUrl}/api/iso/risk-assessments`, authConfig()),
        axios.get(`${apiUrl}/api/iso/locations`, authConfig()),
      ])
      setRows(ra.data || [])
      setLocs(lc.data || [])
    } catch {
      showToast('error', 'リスクアセスの取得に失敗しました')
      setRows([])
    }
  }, [showToast])
  useEffect(() => { load() }, [load])

  const locName = (id) => locs.find((l) => l.id === id)?.name || '—'
  const filtered = useMemo(() => rows === null ? [] : rows.filter((r) => !locFilter || String(r.location_id) === locFilter), [rows, locFilter])

  const del = async (id) => {
    try { await axios.delete(`${apiUrl}/api/iso/risk-assessments/${id}`, authConfig()); showToast('success', '削除しました'); load() }
    catch (e) { showToast('error', e.response?.data?.error || '削除に失敗しました') }
  }

  if (rows === null) return <Loading />

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">場所別に危険源を評価（審査懸念No.4：資材置場・駐車場対応）</p>
        <select value={locFilter} onChange={(e) => setLocFilter(e.target.value)} className={`${inputCls} w-auto`}>
          <option value="">場所: すべて</option>
          {locs.map((l) => <option key={l.id} value={String(l.id)}>{l.name}</option>)}
        </select>
        {isAdmin && <Button variant="primary" size="sm" className="ml-auto" onClick={() => setModal({ locs })}><Plus className="w-4 h-4" />追加</Button>}
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-ink-700">
                <th className="px-3 py-2 font-semibold">場所</th>
                <th className="px-3 py-2 font-semibold">危険源</th>
                <th className="px-3 py-2 font-semibold">想定被害</th>
                <th className="px-3 py-2 font-semibold">対策</th>
                <th className="px-3 py-2 font-semibold text-center">管理策</th>
                <th className="px-3 py-2 font-semibold text-center">頻度</th>
                <th className="px-3 py-2 font-semibold text-center">重大</th>
                <th className="px-3 py-2 font-semibold text-center">評価点</th>
                {isAdmin && <th className="px-3 py-2 font-semibold text-center">操作</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className={`border-b border-slate-100 dark:border-ink-800 ${r.priority_flag ? 'bg-danger-50 dark:bg-danger-500/10' : 'hover:bg-slate-50 dark:hover:bg-ink-900/50'}`}>
                  <td className="px-3 py-2 whitespace-nowrap align-top">{locName(r.location_id)}</td>
                  <td className="px-3 py-2 align-top font-medium">{r.hazard}</td>
                  <td className="px-3 py-2 align-top text-slate-600 dark:text-slate-300">{r.damage}</td>
                  <td className="px-3 py-2 align-top text-xs text-slate-500 dark:text-slate-400 whitespace-pre-line max-w-xs">{r.measures}</td>
                  <td className="px-3 py-2 align-top text-center text-xs whitespace-pre-line">{r.control_codes}</td>
                  <td className="px-3 py-2 align-top text-center">{r.frequency}</td>
                  <td className="px-3 py-2 align-top text-center">{r.severity}</td>
                  <td className="px-3 py-2 align-top text-center">
                    <Badge tone={r.priority_flag ? 'danger' : 'neutral'}>{r.score}{r.priority_flag ? ' 重点' : ''}</Badge>
                  </td>
                  {isAdmin && (
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center justify-center gap-1">
                        <button title="編集" onClick={() => setModal({ row: r, locs })} className="p-1 text-slate-400 hover:text-brand-500"><Pencil className="w-4 h-4" /></button>
                        <button title="削除" onClick={() => del(r.id)} className="p-1 text-slate-400 hover:text-danger-500"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={isAdmin ? 9 : 8} className="px-3 py-10 text-center text-slate-400">該当データがありません</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs text-slate-400 mt-3">評価点 = 発生頻度 + 重大性（5点以上で重点管理）。管理策 A除去/B代替/C工学的/D標識教育/E保護具。</p>

      {modal && <RiskModal row={modal.row} locs={modal.locs} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} showToast={showToast} />}
    </>
  )
}

function RiskModal({ row, locs, onClose, onSaved, showToast }) {
  const isNew = !row
  const [form, setForm] = useState({
    location_id: row?.location_id || (locs[0]?.id ?? ''),
    process: row?.process || '', hazard: row?.hazard || '', scene: row?.scene || '',
    damage: row?.damage || '', measures: row?.measures || '', control_codes: row?.control_codes || '',
    frequency: row?.frequency || 1, severity: row?.severity || 1, legal_flag: row?.legal_flag || false,
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))
  const score = (parseInt(form.frequency, 10) || 0) + (parseInt(form.severity, 10) || 0)

  const submit = async () => {
    if (!form.hazard.trim()) { showToast('error', '危険源は必須です'); return }
    setSaving(true)
    try {
      if (isNew) { await axios.post(`${apiUrl}/api/iso/risk-assessments`, form, authConfig()); showToast('success', '追加しました') }
      else { await axios.put(`${apiUrl}/api/iso/risk-assessments/${row.id}`, form, authConfig()); showToast('success', '更新しました') }
      onSaved()
    } catch (e) { showToast('error', e.response?.data?.error || '保存に失敗しました') }
    finally { setSaving(false) }
  }

  return (
    <ModalShell title={isNew ? 'リスクを追加' : 'リスクを編集'} onClose={onClose} wide>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="場所">
          <select className={inputCls} value={form.location_id} onChange={(e) => set('location_id', parseInt(e.target.value, 10))}>
            {locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Field>
        <Field label="工程・工種"><input className={inputCls} value={form.process} onChange={(e) => set('process', e.target.value)} /></Field>
        <Field label="危険源 *"><input className={inputCls} value={form.hazard} onChange={(e) => set('hazard', e.target.value)} /></Field>
        <Field label="どこで・どんな場面で"><input className={inputCls} value={form.scene} onChange={(e) => set('scene', e.target.value)} /></Field>
        <div className="sm:col-span-2"><Field label="どんな事故・災害"><input className={inputCls} value={form.damage} onChange={(e) => set('damage', e.target.value)} /></Field></div>
        <div className="sm:col-span-2"><Field label="現在の対策"><textarea className={inputCls} rows={3} value={form.measures} onChange={(e) => set('measures', e.target.value)} /></Field></div>
        <Field label="管理策コード" hint="A-E 改行/スラッシュ区切り"><input className={inputCls} value={form.control_codes} onChange={(e) => set('control_codes', e.target.value)} placeholder="C/D/E" /></Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="発生頻度"><select className={inputCls} value={form.frequency} onChange={(e) => set('frequency', parseInt(e.target.value, 10))}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select></Field>
          <Field label="重大性"><select className={inputCls} value={form.severity} onChange={(e) => set('severity', parseInt(e.target.value, 10))}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select></Field>
          <Field label="評価点"><div className={`${inputCls} flex items-center ${score >= 5 ? 'text-danger-600 font-bold' : ''}`}>{score}{score >= 5 ? ' 重点' : ''}</div></Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 sm:col-span-2">
          <input type="checkbox" checked={form.legal_flag} onChange={(e) => set('legal_flag', e.target.checked)} />法的要求・利害関係者に該当
        </label>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="secondary" onClick={onClose}>キャンセル</Button>
        <Button variant="primary" onClick={submit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin" />}保存</Button>
      </div>
    </ModalShell>
  )
}

// ══════════════ スケジュールタブ ══════════════
const STD_LABEL = { Q: '品質', S: '労安', E: '環境' }
const STATUS_META = { planned: { tone: 'info', label: '予定' }, done: { tone: 'success', label: '実施済' }, skipped: { tone: 'neutral', label: '見送り' } }

export function ScheduleTab({ isAdmin, showToast }) {
  const [rows, setRows] = useState(null)
  const [modal, setModal] = useState(null)

  const load = useCallback(async () => {
    try { const r = await axios.get(`${apiUrl}/api/iso/schedule`, authConfig()); setRows(r.data || []) }
    catch { showToast('error', 'スケジュールの取得に失敗しました'); setRows([]) }
  }, [showToast])
  useEffect(() => { load() }, [load])

  const markDone = async (r) => {
    try { await axios.put(`${apiUrl}/api/iso/schedule/${r.id}`, { status: 'done', actual_date: today() }, authConfig()); showToast('success', '実施済にしました'); load() }
    catch (e) { showToast('error', e.response?.data?.error || '更新に失敗しました') }
  }

  if (rows === null) return <Loading />

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">内部監査・レビュー・審査の予定（審査懸念No.2：実施時期の明文化）</p>
        {isAdmin && <Button variant="primary" size="sm" onClick={() => setModal({})}><Plus className="w-4 h-4" />予定を追加</Button>}
      </div>
      <div className="space-y-2">
        {rows.map((r) => {
          const sm = STATUS_META[r.status] || STATUS_META.planned
          return (
            <Card key={r.id} className="p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {(r.standard || []).map((s) => <Badge key={s} tone="neutral">{STD_LABEL[s] || s}</Badge>)}
                  <span className="font-semibold text-slate-900 dark:text-white">{r.title}</span>
                  <Badge tone={sm.tone}>{sm.label}</Badge>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  予定: {r.planned_date || r.planned_note || '—'}
                  {r.actual_date && ` / 実施: ${r.actual_date}`}
                </p>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-1 shrink-0">
                  {r.status !== 'done' && <button title="実施済にする" onClick={() => markDone(r)} className="p-1 text-emerald-500 hover:text-emerald-600"><CheckCircle2 className="w-5 h-5" /></button>}
                  <button title="編集" onClick={() => setModal({ row: r })} className="p-1 text-slate-400 hover:text-brand-500"><Pencil className="w-4 h-4" /></button>
                </div>
              )}
            </Card>
          )
        })}
        {rows.length === 0 && <p className="text-center text-slate-400 py-10">予定がありません</p>}
      </div>

      {modal && <ScheduleModal row={modal.row} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} showToast={showToast} />}
    </>
  )
}

function ScheduleModal({ row, onClose, onSaved, showToast }) {
  const isNew = !row
  const [form, setForm] = useState({
    event_type: row?.event_type || '内部監査', title: row?.title || '',
    standard: (row?.standard || []).join(','), planned_date: row?.planned_date || '',
    planned_note: row?.planned_note || '', actual_date: row?.actual_date || '',
    status: row?.status || 'planned', note: row?.note || '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const submit = async () => {
    if (!form.title.trim()) { showToast('error', 'タイトルは必須です'); return }
    const payload = { ...form, standard: form.standard ? form.standard.split(',').map((s) => s.trim()).filter(Boolean) : [], planned_date: form.planned_date || null, actual_date: form.actual_date || null }
    setSaving(true)
    try {
      if (isNew) { await axios.post(`${apiUrl}/api/iso/schedule`, payload, authConfig()); showToast('success', '追加しました') }
      else { await axios.put(`${apiUrl}/api/iso/schedule/${row.id}`, payload, authConfig()); showToast('success', '更新しました') }
      onSaved()
    } catch (e) { showToast('error', e.response?.data?.error || '保存に失敗しました') }
    finally { setSaving(false) }
  }

  return (
    <ModalShell title={isNew ? '予定を追加' : '予定を編集'} onClose={onClose} wide>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="種別"><input className={inputCls} value={form.event_type} onChange={(e) => set('event_type', e.target.value)} placeholder="内部監査 / 審査 等" /></Field>
        <Field label="対象規格" hint="Q,S,E カンマ区切り"><input className={inputCls} value={form.standard} onChange={(e) => set('standard', e.target.value)} placeholder="Q,S" /></Field>
        <div className="sm:col-span-2"><Field label="タイトル *"><input className={inputCls} value={form.title} onChange={(e) => set('title', e.target.value)} /></Field></div>
        <Field label="予定日"><input type="date" className={inputCls} value={form.planned_date} onChange={(e) => set('planned_date', e.target.value)} /></Field>
        <Field label="予定の補足"><input className={inputCls} value={form.planned_note} onChange={(e) => set('planned_note', e.target.value)} placeholder="毎年11月 等" /></Field>
        <Field label="実施日"><input type="date" className={inputCls} value={form.actual_date} onChange={(e) => set('actual_date', e.target.value)} /></Field>
        <Field label="状態">
          <select className={inputCls} value={form.status} onChange={(e) => set('status', e.target.value)}>
            <option value="planned">予定</option><option value="done">実施済</option><option value="skipped">見送り</option>
          </select>
        </Field>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="secondary" onClick={onClose}>キャンセル</Button>
        <Button variant="primary" onClick={submit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin" />}保存</Button>
      </div>
    </ModalShell>
  )
}

function Loading() {
  return <div className="text-center py-16"><Loader2 className="w-7 h-7 animate-spin mx-auto text-brand-500" /></div>
}
