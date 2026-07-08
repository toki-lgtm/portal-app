import { useState, useEffect, useCallback, useMemo } from 'react'
import axios from 'axios'
import { Loader2, Plus, Pencil, Trash2, Siren } from 'lucide-react'
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

function Loading() {
  return <div className="text-center py-16"><Loader2 className="w-7 h-7 animate-spin mx-auto text-brand-500" /></div>
}

// ══════════════ 事故報告タブ ══════════════
const ACC_TYPES = ['工事関係者', '公衆災害', 'もらい事故']
const ACC_AFFIL = ['元請', '下請']
const ACC_STATUS_TONE = { '進行中': 'danger', '復帰待ち': 'warning', '完治': 'info', '完了': 'success' }

export function AccidentTab({ isAdmin, showToast }) {
  const [rows, setRows] = useState(null)
  const [modal, setModal] = useState(null) // {type:'new'|'edit', row}
  const [updatesFor, setUpdatesFor] = useState(null) // 続報モーダル対象の事故行

  const load = useCallback(async () => {
    try {
      const r = await axios.get(`${apiUrl}/api/iso/accidents`, authConfig())
      setRows(r.data || [])
    } catch {
      showToast('error', '事故報告の取得に失敗しました')
      setRows([])
    }
  }, [showToast])
  useEffect(() => { load() }, [load])

  const del = async (id) => {
    try { await axios.delete(`${apiUrl}/api/iso/accidents/${id}`, authConfig()); showToast('success', '削除しました'); load() }
    catch (e) { showToast('error', e.response?.data?.error || '削除に失敗しました') }
  }

  if (rows === null) return <Loading />

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">事故の第1報を起票し、続報で労基署・警察対応や事後対応を積み上げます（現場も起票可）。</p>
        <Button variant="primary" size="sm" onClick={() => setModal({ type: 'new' })}><Plus className="w-4 h-4" />事故を起票</Button>
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-ink-700">
                <th className="px-3 py-2 font-semibold">発生日時</th>
                <th className="px-3 py-2 font-semibold">工事名</th>
                <th className="px-3 py-2 font-semibold">区分</th>
                <th className="px-3 py-2 font-semibold">被災者</th>
                <th className="px-3 py-2 font-semibold">傷病名</th>
                <th className="px-3 py-2 font-semibold text-center">状況</th>
                <th className="px-3 py-2 font-semibold text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b border-slate-100 dark:border-ink-800 hover:bg-slate-50 dark:hover:bg-ink-900/50">
                  <td className="px-3 py-2 whitespace-nowrap align-top text-xs text-slate-500 dark:text-slate-400">{a.occurred_at ? String(a.occurred_at).replace('T', ' ').slice(0, 16) : '—'}</td>
                  <td className="px-3 py-2 align-top">{a.project_name || '—'}</td>
                  <td className="px-3 py-2 align-top whitespace-nowrap">{a.accident_type || '—'}</td>
                  <td className="px-3 py-2 align-top whitespace-nowrap">{a.victim_name || '—'}{a.victim_affiliation ? `（${a.victim_affiliation}）` : ''}</td>
                  <td className="px-3 py-2 align-top text-slate-600 dark:text-slate-300">{a.symptom || '—'}</td>
                  <td className="px-3 py-2 align-top text-center"><Badge tone={ACC_STATUS_TONE[a.status] || 'neutral'}>{a.status}</Badge></td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                      <button title="続報" onClick={() => setUpdatesFor(a)} className="p-1 text-slate-400 hover:text-brand-500"><Siren className="w-4 h-4" /></button>
                      {isAdmin && <button title="編集" onClick={() => setModal({ type: 'edit', row: a })} className="p-1 text-slate-400 hover:text-brand-500"><Pencil className="w-4 h-4" /></button>}
                      {isAdmin && <button title="削除" onClick={() => del(a.id)} className="p-1 text-slate-400 hover:text-danger-500"><Trash2 className="w-4 h-4" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-400">事故報告はありません</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {modal && <AccidentModal row={modal.row} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} showToast={showToast} />}
      {updatesFor && <AccidentUpdatesModal accident={updatesFor} isAdmin={isAdmin} onClose={() => setUpdatesFor(null)} showToast={showToast} />}
    </>
  )
}

function AccidentModal({ row, onClose, onSaved, showToast }) {
  const isNew = !row
  const [form, setForm] = useState({
    project_name: row?.project_name || '', ordering_agency: row?.ordering_agency || '',
    occurred_at: row?.occurred_at ? String(row.occurred_at).slice(0, 16) : '',
    accident_type: row?.accident_type || ACC_TYPES[0], victim_affiliation: row?.victim_affiliation || ACC_AFFIL[0],
    victim_name: row?.victim_name || '', victim_age: row?.victim_age ?? '', victim_gender: row?.victim_gender || '',
    symptom: row?.symptom || '', occupation: row?.occupation || '', summary: row?.summary || '',
    status: row?.status || '進行中',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const submit = async () => {
    setSaving(true)
    try {
      const payload = { ...form, victim_age: form.victim_age === '' ? null : parseInt(form.victim_age, 10), occurred_at: form.occurred_at || null }
      if (isNew) { await axios.post(`${apiUrl}/api/iso/accidents`, payload, authConfig()); showToast('success', '事故を起票しました') }
      else { await axios.put(`${apiUrl}/api/iso/accidents/${row.id}`, payload, authConfig()); showToast('success', '更新しました') }
      onSaved()
    } catch (e) { showToast('error', e.response?.data?.error || '保存に失敗しました') }
    finally { setSaving(false) }
  }

  return (
    <ModalShell title={isNew ? '事故を起票（第1報）' : '事故報告を編集'} onClose={onClose} wide>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="工事名"><input className={inputCls} value={form.project_name} onChange={(e) => set('project_name', e.target.value)} /></Field>
        <Field label="発注機関"><input className={inputCls} value={form.ordering_agency} onChange={(e) => set('ordering_agency', e.target.value)} /></Field>
        <Field label="発生日時"><input type="datetime-local" className={inputCls} value={form.occurred_at} onChange={(e) => set('occurred_at', e.target.value)} /></Field>
        <Field label="区分">
          <select className={inputCls} value={form.accident_type} onChange={(e) => set('accident_type', e.target.value)}>
            {ACC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="被災者所属">
          <select className={inputCls} value={form.victim_affiliation} onChange={(e) => set('victim_affiliation', e.target.value)}>
            {ACC_AFFIL.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="被災者氏名"><input className={inputCls} value={form.victim_name} onChange={(e) => set('victim_name', e.target.value)} /></Field>
        <Field label="被災者年齢"><input type="number" className={inputCls} value={form.victim_age} onChange={(e) => set('victim_age', e.target.value)} /></Field>
        <Field label="被災者性別"><input className={inputCls} value={form.victim_gender} onChange={(e) => set('victim_gender', e.target.value)} /></Field>
        <Field label="職種"><input className={inputCls} value={form.occupation} onChange={(e) => set('occupation', e.target.value)} /></Field>
        <Field label="傷病名・症状"><input className={inputCls} value={form.symptom} onChange={(e) => set('symptom', e.target.value)} /></Field>
        <div className="sm:col-span-2"><Field label="発生状況"><textarea className={inputCls} rows={3} value={form.summary} onChange={(e) => set('summary', e.target.value)} /></Field></div>
        <Field label="対応状況">
          <select className={inputCls} value={form.status} onChange={(e) => set('status', e.target.value)}>
            {Object.keys(ACC_STATUS_TONE).map((s) => <option key={s} value={s}>{s}</option>)}
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

function AccidentUpdatesModal({ accident, isAdmin, onClose, showToast }) {
  const [items, setItems] = useState(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ report_no: '', report_date: today(), cause_factors: '', labor_bureau: '', police: '', followup: '', note: '' })
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const load = useCallback(async () => {
    try {
      const r = await axios.get(`${apiUrl}/api/iso/accidents/${accident.id}/updates`, authConfig())
      setItems(r.data || [])
    } catch { setItems([]) }
  }, [accident.id])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (items && !form.report_no) set('report_no', String(items.length + 2)) // 第1報の次=第2報から
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  const addUpdate = async () => {
    try {
      const payload = { ...form, report_no: form.report_no ? parseInt(form.report_no, 10) : null }
      await axios.post(`${apiUrl}/api/iso/accidents/${accident.id}/updates`, payload, authConfig())
      showToast('success', '続報を追加しました')
      setForm({ report_no: '', report_date: today(), cause_factors: '', labor_bureau: '', police: '', followup: '', note: '' })
      setAdding(false)
      load()
    } catch (e) { showToast('error', e.response?.data?.error || '追加に失敗しました') }
  }

  return (
    <ModalShell title={`続報：${accident.project_name || accident.victim_name || '事故'}`} onClose={onClose} wide>
      {items === null ? <div className="text-center py-6"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand-500" /></div> : (
        <div className="space-y-2">
          {items.length === 0 && <p className="text-sm text-slate-400 py-4 text-center">続報はまだありません（第1報のみ）</p>}
          {items.map((u) => (
            <div key={u.id} className="p-3 rounded-lg bg-slate-50 dark:bg-ink-900/50 text-sm">
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
                <Badge tone="neutral">第{u.report_no}報</Badge><span>{u.report_date || '—'}</span>
              </div>
              {u.cause_factors && <p>要因: {u.cause_factors}</p>}
              {u.labor_bureau && <p>労基署対応: {u.labor_bureau}</p>}
              {u.police && <p>警察対応: {u.police}</p>}
              {u.followup && <p>事後対応: {u.followup}</p>}
              {u.note && <p className="text-slate-500 dark:text-slate-400">備考: {u.note}</p>}
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-ink-700">
          {adding ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="報番号"><input type="number" className={inputCls} value={form.report_no} onChange={(e) => set('report_no', e.target.value)} /></Field>
                <Field label="報告日"><input type="date" className={inputCls} value={form.report_date} onChange={(e) => set('report_date', e.target.value)} /></Field>
                <div className="sm:col-span-2"><Field label="原因（人的/物的/環境的）"><input className={inputCls} value={form.cause_factors} onChange={(e) => set('cause_factors', e.target.value)} /></Field></div>
                <Field label="労基署対応"><input className={inputCls} value={form.labor_bureau} onChange={(e) => set('labor_bureau', e.target.value)} /></Field>
                <Field label="警察対応"><input className={inputCls} value={form.police} onChange={(e) => set('police', e.target.value)} /></Field>
                <div className="sm:col-span-2"><Field label="事後対応"><textarea className={inputCls} rows={2} value={form.followup} onChange={(e) => set('followup', e.target.value)} /></Field></div>
                <div className="sm:col-span-2"><Field label="備考"><input className={inputCls} value={form.note} onChange={(e) => set('note', e.target.value)} /></Field></div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setAdding(false)}>キャンセル</Button>
                <Button variant="primary" size="sm" onClick={addUpdate}>続報を追加</Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setAdding(true)}><Plus className="w-4 h-4" />続報を追加</Button>
          )}
        </div>
      )}
    </ModalShell>
  )
}

// ══════════════ 苦情タブ ══════════════
const COMPLAINT_METHODS = ['一般', '施主', 'その他']
const COMPLAINT_STATUS = { open: { tone: 'danger', label: '未対応' }, '対応中': { tone: 'warning', label: '対応中' }, closed: { tone: 'success', label: '完了' } }

export function ComplaintTab({ isAdmin, showToast }) {
  const [rows, setRows] = useState(null)
  const [modal, setModal] = useState(null) // {mode:'quick'|'full', row}

  const load = useCallback(async () => {
    try {
      const r = await axios.get(`${apiUrl}/api/iso/complaints`, authConfig())
      setRows(r.data || [])
    } catch {
      showToast('error', '苦情の取得に失敗しました')
      setRows([])
    }
  }, [showToast])
  useEffect(() => { load() }, [load])

  const del = async (id) => {
    try { await axios.delete(`${apiUrl}/api/iso/complaints/${id}`, authConfig()); showToast('success', '削除しました'); load() }
    catch (e) { showToast('error', e.response?.data?.error || '削除に失敗しました') }
  }

  if (rows === null) return <Loading />

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">受付日・方法・内容だけでも素早く起票できます。原因・対応・是正効果は後から詳細編集。</p>
        <Button variant="primary" size="sm" onClick={() => setModal({ mode: 'quick' })}><Plus className="w-4 h-4" />苦情を起票</Button>
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-ink-700">
                <th className="px-3 py-2 font-semibold">受付日</th>
                <th className="px-3 py-2 font-semibold">方法</th>
                <th className="px-3 py-2 font-semibold">工事名</th>
                <th className="px-3 py-2 font-semibold">申出者</th>
                <th className="px-3 py-2 font-semibold">内容</th>
                <th className="px-3 py-2 font-semibold text-center">状況</th>
                {isAdmin && <th className="px-3 py-2 font-semibold text-center">操作</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const sm = COMPLAINT_STATUS[c.status] || COMPLAINT_STATUS.open
                return (
                  <tr key={c.id} className="border-b border-slate-100 dark:border-ink-800 hover:bg-slate-50 dark:hover:bg-ink-900/50">
                    <td className="px-3 py-2 whitespace-nowrap align-top">{c.received_date || '—'}</td>
                    <td className="px-3 py-2 align-top whitespace-nowrap">{c.method || '—'}</td>
                    <td className="px-3 py-2 align-top">{c.project_name || '—'}</td>
                    <td className="px-3 py-2 align-top whitespace-nowrap">{c.complainant || '—'}</td>
                    <td className="px-3 py-2 align-top max-w-sm text-slate-600 dark:text-slate-300">{c.content}</td>
                    <td className="px-3 py-2 align-top text-center"><Badge tone={sm.tone}>{sm.label}</Badge></td>
                    {isAdmin && (
                      <td className="px-3 py-2 align-top">
                        <div className="flex items-center justify-center gap-1">
                          <button title="詳細編集" onClick={() => setModal({ mode: 'full', row: c })} className="p-1 text-slate-400 hover:text-brand-500"><Pencil className="w-4 h-4" /></button>
                          <button title="削除" onClick={() => del(c.id)} className="p-1 text-slate-400 hover:text-danger-500"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
              {rows.length === 0 && <tr><td colSpan={isAdmin ? 7 : 6} className="px-3 py-10 text-center text-slate-400">苦情の記録はありません</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {modal && <ComplaintModal mode={modal.mode} row={modal.row} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} showToast={showToast} />}
    </>
  )
}

function ComplaintModal({ mode, row, onClose, onSaved, showToast }) {
  const isNew = !row
  const [form, setForm] = useState({
    received_date: row?.received_date || today(), receiver: row?.receiver || '', method: row?.method || COMPLAINT_METHODS[0],
    project_name: row?.project_name || '', complainant: row?.complainant || '', content: row?.content || '',
    cause: row?.cause || '', response: row?.response || '', prevention: row?.prevention || '',
    effectiveness: row?.effectiveness || '', approver: row?.approver || '', status: row?.status || 'open',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const submit = async () => {
    if (!form.content.trim()) { showToast('error', '内容は必須です'); return }
    setSaving(true)
    try {
      if (isNew) { await axios.post(`${apiUrl}/api/iso/complaints`, form, authConfig()); showToast('success', '起票しました') }
      else { await axios.put(`${apiUrl}/api/iso/complaints/${row.id}`, form, authConfig()); showToast('success', '更新しました') }
      onSaved()
    } catch (e) { showToast('error', e.response?.data?.error || '保存に失敗しました') }
    finally { setSaving(false) }
  }

  return (
    <ModalShell title={isNew ? '苦情を起票' : `苦情を詳細編集：${row.complainant || row.project_name || ''}`} onClose={onClose} wide>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="受付日"><input type="date" className={inputCls} value={form.received_date} onChange={(e) => set('received_date', e.target.value)} /></Field>
        <Field label="方法">
          <select className={inputCls} value={form.method} onChange={(e) => set('method', e.target.value)}>
            {COMPLAINT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        <div className="sm:col-span-2"><Field label="内容 *"><textarea className={inputCls} rows={3} value={form.content} onChange={(e) => set('content', e.target.value)} /></Field></div>
        {mode === 'full' && (<>
          <Field label="受付者"><input className={inputCls} value={form.receiver} onChange={(e) => set('receiver', e.target.value)} /></Field>
          <Field label="工事名"><input className={inputCls} value={form.project_name} onChange={(e) => set('project_name', e.target.value)} /></Field>
          <Field label="申出者"><input className={inputCls} value={form.complainant} onChange={(e) => set('complainant', e.target.value)} /></Field>
          <Field label="状況">
            <select className={inputCls} value={form.status} onChange={(e) => set('status', e.target.value)}>
              {Object.entries(COMPLAINT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          <div className="sm:col-span-2"><Field label="原因"><textarea className={inputCls} rows={2} value={form.cause} onChange={(e) => set('cause', e.target.value)} /></Field></div>
          <div className="sm:col-span-2"><Field label="対応内容"><textarea className={inputCls} rows={2} value={form.response} onChange={(e) => set('response', e.target.value)} /></Field></div>
          <div className="sm:col-span-2"><Field label="再発防止策"><textarea className={inputCls} rows={2} value={form.prevention} onChange={(e) => set('prevention', e.target.value)} /></Field></div>
          <Field label="是正効果の確認"><input className={inputCls} value={form.effectiveness} onChange={(e) => set('effectiveness', e.target.value)} /></Field>
          <Field label="承認者"><input className={inputCls} value={form.approver} onChange={(e) => set('approver', e.target.value)} /></Field>
        </>)}
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="secondary" onClick={onClose}>キャンセル</Button>
        <Button variant="primary" onClick={submit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin" />}{isNew ? '起票する' : '保存'}</Button>
      </div>
    </ModalShell>
  )
}

// ══════════════ 顧客満足度タブ ══════════════
const CSAT_SOURCES = ['民間調査', '公共評定']

export function SatisfactionTab({ isAdmin, showToast }) {
  const [rows, setRows] = useState(null)
  const [modal, setModal] = useState(null)

  const load = useCallback(async () => {
    try {
      const r = await axios.get(`${apiUrl}/api/iso/customer-satisfaction`, authConfig())
      setRows(r.data || [])
    } catch {
      showToast('error', '顧客満足度の取得に失敗しました')
      setRows([])
    }
  }, [showToast])
  useEffect(() => { load() }, [load])

  const avg = useMemo(() => {
    if (!rows || rows.length === 0) return null
    const vals = rows.map((r) => r.normalized_score).filter((v) => v !== null && v !== undefined)
    if (vals.length === 0) return null
    return (vals.reduce((a, b) => a + Number(b), 0) / vals.length).toFixed(1)
  }, [rows])

  const del = async (id) => {
    try { await axios.delete(`${apiUrl}/api/iso/customer-satisfaction/${id}`, authConfig()); showToast('success', '削除しました'); load() }
    catch (e) { showToast('error', e.response?.data?.error || '削除に失敗しました') }
  }

  if (rows === null) return <Loading />

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <p className="text-sm text-slate-500 dark:text-slate-400 flex-1">アンケート・評定の集約結果（登録・編集は管理者のみ）。</p>
        {avg !== null && <Badge tone="info">平均正規化点 {avg}</Badge>}
        {isAdmin && <Button variant="primary" size="sm" onClick={() => setModal({})}><Plus className="w-4 h-4" />調査結果を追加</Button>}
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-ink-700">
                <th className="px-3 py-2 font-semibold">工事名</th>
                <th className="px-3 py-2 font-semibold">種別</th>
                <th className="px-3 py-2 font-semibold">顧客</th>
                <th className="px-3 py-2 font-semibold">送付/回収</th>
                <th className="px-3 py-2 font-semibold text-center">Q1</th>
                <th className="px-3 py-2 font-semibold text-center">Q2</th>
                <th className="px-3 py-2 font-semibold text-center">正規化点</th>
                {isAdmin && <th className="px-3 py-2 font-semibold text-center">操作</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 dark:border-ink-800 hover:bg-slate-50 dark:hover:bg-ink-900/50">
                  <td className="px-3 py-2 align-top">{r.project_name || '—'}</td>
                  <td className="px-3 py-2 align-top whitespace-nowrap">{r.source_type}</td>
                  <td className="px-3 py-2 align-top whitespace-nowrap">{r.customer || '—'}</td>
                  <td className="px-3 py-2 align-top text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{r.sent_date || '—'} → {r.received_date || '—'}</td>
                  <td className="px-3 py-2 align-top text-center">{r.q1_score ?? '—'}</td>
                  <td className="px-3 py-2 align-top text-center">{r.q2_score ?? '—'}</td>
                  <td className="px-3 py-2 align-top text-center font-semibold">{r.normalized_score ?? '—'}</td>
                  {isAdmin && (
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center justify-center gap-1">
                        <button title="編集" onClick={() => setModal({ row: r })} className="p-1 text-slate-400 hover:text-brand-500"><Pencil className="w-4 h-4" /></button>
                        <button title="削除" onClick={() => del(r.id)} className="p-1 text-slate-400 hover:text-danger-500"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={isAdmin ? 8 : 7} className="px-3 py-10 text-center text-slate-400">調査結果がありません</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {modal && <SatisfactionModal row={modal.row} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} showToast={showToast} />}
    </>
  )
}

function SatisfactionModal({ row, onClose, onSaved, showToast }) {
  const isNew = !row
  const [form, setForm] = useState({
    project_name: row?.project_name || '', source_type: row?.source_type || CSAT_SOURCES[0], customer: row?.customer || '',
    sent_date: row?.sent_date || '', received_date: row?.received_date || '',
    q1_score: row?.q1_score ?? '', q1_comment: row?.q1_comment || '',
    q2_score: row?.q2_score ?? '', q2_comment: row?.q2_comment || '',
    other_comment: row?.other_comment || '', normalized_score: row?.normalized_score ?? '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  // Q1・Q2平均×20の目安値をワンクリックで反映（正規化点は編集可）
  const suggestScore = () => {
    const q1 = parseInt(form.q1_score, 10)
    const q2 = parseInt(form.q2_score, 10)
    const vals = [q1, q2].filter((v) => Number.isInteger(v))
    if (vals.length === 0) return
    set('normalized_score', Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 20))
  }

  const submit = async () => {
    setSaving(true)
    try {
      const payload = {
        ...form,
        q1_score: form.q1_score === '' ? null : parseInt(form.q1_score, 10),
        q2_score: form.q2_score === '' ? null : parseInt(form.q2_score, 10),
        normalized_score: form.normalized_score === '' ? null : Number(form.normalized_score),
        sent_date: form.sent_date || null, received_date: form.received_date || null,
      }
      if (isNew) { await axios.post(`${apiUrl}/api/iso/customer-satisfaction`, payload, authConfig()); showToast('success', '追加しました') }
      else { await axios.put(`${apiUrl}/api/iso/customer-satisfaction/${row.id}`, payload, authConfig()); showToast('success', '更新しました') }
      onSaved()
    } catch (e) { showToast('error', e.response?.data?.error || '保存に失敗しました') }
    finally { setSaving(false) }
  }

  return (
    <ModalShell title={isNew ? '調査結果を追加' : '調査結果を編集'} onClose={onClose} wide>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="工事名"><input className={inputCls} value={form.project_name} onChange={(e) => set('project_name', e.target.value)} /></Field>
        <Field label="種別">
          <select className={inputCls} value={form.source_type} onChange={(e) => set('source_type', e.target.value)}>
            {CSAT_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="顧客・発注者"><input className={inputCls} value={form.customer} onChange={(e) => set('customer', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="送付日"><input type="date" className={inputCls} value={form.sent_date} onChange={(e) => set('sent_date', e.target.value)} /></Field>
          <Field label="回収日"><input type="date" className={inputCls} value={form.received_date} onChange={(e) => set('received_date', e.target.value)} /></Field>
        </div>
        <Field label="Q1 点数(1-5)"><input type="number" min={1} max={5} className={inputCls} value={form.q1_score} onChange={(e) => set('q1_score', e.target.value)} /></Field>
        <Field label="Q1 コメント"><input className={inputCls} value={form.q1_comment} onChange={(e) => set('q1_comment', e.target.value)} /></Field>
        <Field label="Q2 点数(1-5)"><input type="number" min={1} max={5} className={inputCls} value={form.q2_score} onChange={(e) => set('q2_score', e.target.value)} /></Field>
        <Field label="Q2 コメント"><input className={inputCls} value={form.q2_comment} onChange={(e) => set('q2_comment', e.target.value)} /></Field>
        <div className="sm:col-span-2"><Field label="その他コメント"><textarea className={inputCls} rows={2} value={form.other_comment} onChange={(e) => set('other_comment', e.target.value)} /></Field></div>
        <Field label="正規化点数" hint="比較用（任意入力）">
          <div className="flex gap-2">
            <input type="number" className={inputCls} value={form.normalized_score} onChange={(e) => set('normalized_score', e.target.value)} />
            <Button variant="secondary" size="sm" onClick={suggestScore} type="button">Q1Q2から算出</Button>
          </div>
        </Field>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="secondary" onClick={onClose}>キャンセル</Button>
        <Button variant="primary" onClick={submit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin" />}保存</Button>
      </div>
    </ModalShell>
  )
}
