import { useState, useEffect, useCallback, useMemo } from 'react'
import axios from 'axios'
import { Loader2, Plus, Pencil, Trash2, AlertTriangle, Copy, ChevronDown, ChevronUp } from 'lucide-react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import ModalShell from './ui/ModalShell'
import Field from './ui/Field'
import { API_URL as apiUrl, authConfig } from '../lib/api'

// ISO管理・日常運用4モジュール（自主検査/アルコールチェック/目標達成計画/安全衛生委員会）
// ※ ISOTabs.jsx とは別ファイル（既存タブに影響を与えないため新規分離）

const inputCls =
  'w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-ink-600 bg-white dark:bg-ink-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const thisMonth = () => today().slice(0, 7)

function Loading() {
  return <div className="text-center py-16"><Loader2 className="w-7 h-7 animate-spin mx-auto text-brand-500" /></div>
}

// ══════════════ 自主検査タブ（073） ══════════════
const INSPECTION_TYPES = ['始業時', '月次', '年次']

// 種別ごとに「これより古いと期限切れ」とみなす日数
const INSPECTION_STALE_DAYS = { 始業時: 1, 月次: 35, 年次: 400 }

function inspectionDue(latestDate) {
  if (!latestDate) return { tone: 'neutral', label: '未実施' }
  const days = Math.floor((new Date(today() + 'T00:00:00') - new Date(latestDate + 'T00:00:00')) / 86400000)
  return days
}

export function SelfInspectionTab({ isAdmin, showToast }) {
  const [rows, setRows] = useState(null)
  const [fMachine, setFMachine] = useState('')
  const [fType, setFType] = useState('')
  const [modal, setModal] = useState(null) // {row?}

  const load = useCallback(async () => {
    try {
      const r = await axios.get(`${apiUrl}/api/iso/self-inspections`, authConfig())
      setRows(r.data || [])
    } catch {
      showToast('error', '自主検査記録の取得に失敗しました')
      setRows([])
    }
  }, [showToast])
  useEffect(() => { load() }, [load])

  const machines = useMemo(() => rows === null ? [] : [...new Set(rows.map((r) => r.machine).filter(Boolean))], [rows])

  const filtered = useMemo(() => {
    if (rows === null) return []
    return rows.filter((r) => (!fMachine || r.machine === fMachine) && (!fType || r.inspection_type === fType))
  }, [rows, fMachine, fType])

  // 機種×号機ごとに、種別ごとの最新実施日を集計 → 期限意識バッジ
  const groups = useMemo(() => {
    if (rows === null) return []
    const map = new Map()
    for (const r of rows) {
      const key = `${r.machine}__${r.machine_no || ''}`
      if (!map.has(key)) map.set(key, { machine: r.machine, machine_no: r.machine_no, latest: {} })
      const g = map.get(key)
      const cur = g.latest[r.inspection_type]
      if (!cur || r.inspect_date > cur) g.latest[r.inspection_type] = r.inspect_date
    }
    return [...map.values()]
  }, [rows])

  const del = async (id) => {
    try { await axios.delete(`${apiUrl}/api/iso/self-inspections/${id}`, authConfig()); showToast('success', '削除しました'); load() }
    catch (e) { showToast('error', e.response?.data?.error || '削除に失敗しました') }
  }

  if (rows === null) return <Loading />

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">重機・機械の自主検査記録（始業時/月次/年次・記録は3年保管）</p>
        <Button variant="primary" size="sm" className="ml-auto" onClick={() => setModal({})}><Plus className="w-4 h-4" />記録を追加</Button>
      </div>

      {/* 機種×号機ごとの期限意識カード */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
        {groups.map((g) => (
          <Card key={`${g.machine}__${g.machine_no}`} className="p-4">
            <p className="font-semibold text-slate-900 dark:text-white">{g.machine}{g.machine_no ? `（${g.machine_no}）` : ''}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {INSPECTION_TYPES.map((t) => {
                const latest = g.latest[t]
                const days = inspectionDue(latest)
                let tone = 'neutral', label = '未実施'
                if (typeof days === 'number') {
                  const stale = days > INSPECTION_STALE_DAYS[t]
                  tone = stale ? 'danger' : 'success'
                  label = `${t}: ${latest}${stale ? '（期限切れ）' : ''}`
                } else {
                  label = `${t}: 未実施`
                }
                return <Badge key={t} tone={tone}>{label}</Badge>
              })}
            </div>
          </Card>
        ))}
        {groups.length === 0 && <p className="text-sm text-slate-400 py-4">記録がまだありません</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={fMachine} onChange={(e) => setFMachine(e.target.value)} className={`${inputCls} w-auto`}>
          <option value="">機種: すべて</option>
          {machines.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={fType} onChange={(e) => setFType(e.target.value)} className={`${inputCls} w-auto`}>
          <option value="">種別: すべて</option>
          {INSPECTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className="text-xs text-slate-400">{filtered.length}件</span>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-ink-700">
                <th className="px-3 py-2 font-semibold">検査日</th>
                <th className="px-3 py-2 font-semibold">機種</th>
                <th className="px-3 py-2 font-semibold">号機</th>
                <th className="px-3 py-2 font-semibold">種別</th>
                <th className="px-3 py-2 font-semibold">検査者</th>
                <th className="px-3 py-2 font-semibold text-center">結果</th>
                <th className="px-3 py-2 font-semibold">指摘</th>
                <th className="px-3 py-2 font-semibold text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 dark:border-ink-800 hover:bg-slate-50 dark:hover:bg-ink-900/50">
                  <td className="px-3 py-2 whitespace-nowrap align-top">{r.inspect_date}</td>
                  <td className="px-3 py-2 align-top">{r.machine}</td>
                  <td className="px-3 py-2 align-top">{r.machine_no || '—'}</td>
                  <td className="px-3 py-2 align-top">{r.inspection_type}</td>
                  <td className="px-3 py-2 align-top">{r.inspector || '—'}</td>
                  <td className="px-3 py-2 align-top text-center"><Badge tone={r.result === '良' ? 'success' : 'danger'}>{r.result}</Badge></td>
                  <td className="px-3 py-2 align-top text-xs text-slate-500 dark:text-slate-400">{r.defects || '—'}</td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex items-center justify-center gap-1">
                      {r.doc_link && <a href={r.doc_link} target="_blank" rel="noreferrer" className="text-xs text-brand-500 hover:underline">記録</a>}
                      {isAdmin && (<>
                        <button title="編集" onClick={() => setModal({ row: r })} className="p-1 text-slate-400 hover:text-brand-500"><Pencil className="w-4 h-4" /></button>
                        <button title="削除" onClick={() => del(r.id)} className="p-1 text-slate-400 hover:text-danger-500"><Trash2 className="w-4 h-4" /></button>
                      </>)}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} className="px-3 py-10 text-center text-slate-400">記録がありません</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {modal && <SelfInspectionModal row={modal.row} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} showToast={showToast} />}
    </>
  )
}

function SelfInspectionModal({ row, onClose, onSaved, showToast }) {
  const isNew = !row
  const [form, setForm] = useState({
    machine: row?.machine || '', machine_no: row?.machine_no || '',
    inspection_type: row?.inspection_type || '始業時', inspect_date: row?.inspect_date || today(),
    inspector: row?.inspector || '', result: row?.result || '良',
    defects: row?.defects || '', doc_link: row?.doc_link || '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const submit = async () => {
    if (!form.machine.trim()) { showToast('error', '機種は必須です'); return }
    setSaving(true)
    try {
      if (isNew) { await axios.post(`${apiUrl}/api/iso/self-inspections`, form, authConfig()); showToast('success', '記録を追加しました') }
      else { await axios.put(`${apiUrl}/api/iso/self-inspections/${row.id}`, form, authConfig()); showToast('success', '更新しました') }
      onSaved()
    } catch (e) { showToast('error', e.response?.data?.error || '保存に失敗しました') }
    finally { setSaving(false) }
  }

  return (
    <ModalShell title={isNew ? '自主検査記録を追加' : '自主検査記録を編集'} onClose={onClose} wide>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="機種 *"><input className={inputCls} value={form.machine} onChange={(e) => set('machine', e.target.value)} placeholder="例: バックホウ" /></Field>
        <Field label="号機・管理番号"><input className={inputCls} value={form.machine_no} onChange={(e) => set('machine_no', e.target.value)} /></Field>
        <Field label="種別">
          <select className={inputCls} value={form.inspection_type} onChange={(e) => set('inspection_type', e.target.value)}>
            {INSPECTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="検査日"><input type="date" className={inputCls} value={form.inspect_date} onChange={(e) => set('inspect_date', e.target.value)} /></Field>
        <Field label="検査者"><input className={inputCls} value={form.inspector} onChange={(e) => set('inspector', e.target.value)} /></Field>
        <Field label="結果">
          <select className={inputCls} value={form.result} onChange={(e) => set('result', e.target.value)}>
            <option value="良">良</option><option value="否">否</option>
          </select>
        </Field>
        <div className="sm:col-span-2"><Field label="指摘事項"><textarea className={inputCls} rows={2} value={form.defects} onChange={(e) => set('defects', e.target.value)} /></Field></div>
        <div className="sm:col-span-2"><Field label="記録PDFリンク" hint="Drive URL"><input className={inputCls} value={form.doc_link} onChange={(e) => set('doc_link', e.target.value)} /></Field></div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="secondary" onClick={onClose}>キャンセル</Button>
        <Button variant="primary" onClick={submit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin" />}保存</Button>
      </div>
    </ModalShell>
  )
}

// ══════════════ アルコールチェックタブ（074） ══════════════
const AL_TIMINGS = ['出発', '帰着']
const AL_METHODS = ['目視', '検知器', 'リモート']

// ── 点呼ワンタップ記録パネル（名簿から未記録者をまとめて非検知/検知器で記録）──
function RollCallPanel({ showToast, onRecorded }) {
  const [date, setDate] = useState(today())
  const [timing, setTiming] = useState('出発')
  const [checker, setChecker] = useState('')
  const [data, setData] = useState(null) // {drivers:[{driver,recorded}], confirmers:[]}
  const [selected, setSelected] = useState(() => new Set())
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setData(null)
    try {
      const r = await axios.get(`${apiUrl}/api/iso/alcohol-roster`, { params: { date, timing }, ...authConfig() })
      setData(r.data)
      // 既定で未記録者を全選択
      setSelected(new Set((r.data.drivers || []).filter((d) => !d.recorded).map((d) => d.driver)))
      if (!checker && r.data.confirmers?.length) setChecker(r.data.confirmers[0])
    } catch { showToast('error', '名簿の取得に失敗しました'); setData({ drivers: [], confirmers: [] }) }
  }, [date, timing]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load])

  const drivers = data?.drivers || []
  const pending = drivers.filter((d) => !d.recorded)
  const doneCount = drivers.length - pending.length
  const toggle = (name) => setSelected((p) => { const n = new Set(p); n.has(name) ? n.delete(name) : n.add(name); return n })
  const allPendingSelected = pending.length > 0 && pending.every((d) => selected.has(d.driver))
  const toggleAll = () => setSelected(allPendingSelected ? new Set() : new Set(pending.map((d) => d.driver)))

  const submit = async () => {
    const list = [...selected]
    if (list.length === 0) { showToast('error', '記録する運転者を選んでください'); return }
    setSaving(true)
    try {
      const r = await axios.post(`${apiUrl}/api/iso/alcohol-checks/batch`,
        { check_date: date, timing, method: '検知器', checker, drivers: list }, authConfig())
      showToast('success', `${r.data.inserted}名を記録しました${r.data.skipped ? `（既存${r.data.skipped}名はスキップ）` : ''}`)
      await load()
      onRecorded?.()
    } catch (e) { showToast('error', e.response?.data?.error || '記録に失敗しました') }
    finally { setSaving(false) }
  }

  return (
    <Card className="p-4 mb-5 border-2 border-brand-200 dark:border-brand-500/30">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base font-bold text-slate-900 dark:text-white">点呼ワンタップ記録</span>
        <span className="text-xs text-slate-400">名簿から未記録者をまとめて記録（検知器・非検知）</span>
      </div>
      <div className="flex flex-wrap items-end gap-3 mb-3">
        <Field label="日付"><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="タイミング">
          <div className="flex rounded-lg overflow-hidden border border-slate-300 dark:border-ink-600">
            {['出発', '帰着'].map((t) => (
              <button key={t} onClick={() => setTiming(t)}
                className={`px-4 py-2 text-sm font-semibold ${timing === t ? 'bg-brand-600 text-white' : 'bg-white dark:bg-ink-900 text-slate-600 dark:text-slate-300'}`}>{t}</button>
            ))}
          </div>
        </Field>
        <Field label="確認者">
          <select className={inputCls} value={checker} onChange={(e) => setChecker(e.target.value)}>
            <option value="">（選択）</option>
            {(data?.confirmers || []).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>

      {data === null ? <Loading /> : (
        <>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-slate-500 dark:text-slate-400">
              対象 {drivers.length}名 ・ <span className="text-success-600 dark:text-success-400 font-semibold">記録済 {doneCount}</span> ・ <span className="text-warning-600 dark:text-warning-400 font-semibold">未記録 {pending.length}</span>
            </div>
            <button onClick={toggleAll} className="text-sm font-semibold text-brand-600 dark:text-brand-300 hover:underline" disabled={pending.length === 0}>
              {allPendingSelected ? '未記録の選択を解除' : '未記録を全選択'}
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 max-h-72 overflow-y-auto p-1">
            {drivers.map((d) => (
              <label key={d.driver}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm cursor-pointer select-none ${d.recorded ? 'bg-success-50 dark:bg-success-500/10 text-slate-400' : selected.has(d.driver) ? 'bg-brand-50 dark:bg-brand-500/15 ring-1 ring-brand-300' : 'bg-slate-50 dark:bg-ink-900 hover:bg-slate-100'}`}>
                <input type="checkbox" disabled={d.recorded} checked={d.recorded || selected.has(d.driver)} onChange={() => toggle(d.driver)} className="accent-brand-600" />
                <span className={`truncate ${d.recorded ? 'line-through' : 'text-slate-800 dark:text-slate-100'}`}>{d.driver}</span>
                {d.recorded && <span className="ml-auto text-[10px] text-success-500 font-semibold">済</span>}
              </label>
            ))}
          </div>
          <div className="flex justify-end mt-3">
            <Button variant="primary" onClick={submit} disabled={saving || selected.size === 0}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}選択した {selected.size}名を記録
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}

export function AlcoholTab({ isAdmin, showToast }) {
  const [rows, setRows] = useState(null)
  const [quick, setQuick] = useState({ check_date: today(), driver: '', timing: '出発', method: '目視', result: '非検知', value: '', checker: '' })
  const [saving, setSaving] = useState(false)
  const [editModal, setEditModal] = useState(null)

  const load = useCallback(async () => {
    try { const r = await axios.get(`${apiUrl}/api/iso/alcohol-checks`, authConfig()); setRows(r.data || []) }
    catch { showToast('error', 'アルコールチェック記録の取得に失敗しました'); setRows([]) }
  }, [showToast])
  useEffect(() => { load() }, [load])

  const setQ = (k, v) => setQuick((p) => ({ ...p, [k]: v }))

  const quickSubmit = async () => {
    if (!quick.driver.trim()) { showToast('error', '運転者は必須です'); return }
    setSaving(true)
    try {
      const payload = { ...quick, value: quick.value === '' ? null : Number(quick.value) }
      await axios.post(`${apiUrl}/api/iso/alcohol-checks`, payload, authConfig())
      showToast('success', '記録しました')
      setQuick({ check_date: today(), driver: '', timing: quick.timing, method: quick.method, result: '非検知', value: '', checker: quick.checker })
      load()
    } catch (e) { showToast('error', e.response?.data?.error || '記録に失敗しました') }
    finally { setSaving(false) }
  }

  const del = async (id) => {
    try { await axios.delete(`${apiUrl}/api/iso/alcohol-checks/${id}`, authConfig()); showToast('success', '削除しました'); load() }
    catch (e) { showToast('error', e.response?.data?.error || '削除に失敗しました') }
  }

  if (rows === null) return <Loading />

  return (
    <>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">運転前後の酒気帯び確認を記録（誰でも記録できます）。点呼はまとめて、例外は個別に。</p>

      <RollCallPanel showToast={showToast} onRecorded={load} />

      <details className="mb-5">
        <summary className="text-sm font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">個別に記録する（例外・検知時など）</summary>
      <Card className="p-4 mt-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2 items-end">
          <Field label="日付"><input type="date" className={inputCls} value={quick.check_date} onChange={(e) => setQ('check_date', e.target.value)} /></Field>
          <Field label="運転者 *"><input className={inputCls} value={quick.driver} onChange={(e) => setQ('driver', e.target.value)} /></Field>
          <Field label="タイミング">
            <select className={inputCls} value={quick.timing} onChange={(e) => setQ('timing', e.target.value)}>{AL_TIMINGS.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          </Field>
          <Field label="方法">
            <select className={inputCls} value={quick.method} onChange={(e) => setQ('method', e.target.value)}>{AL_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</select>
          </Field>
          <Field label="結果">
            <select className={inputCls} value={quick.result} onChange={(e) => setQ('result', e.target.value)}>
              <option value="非検知">非検知</option><option value="検知">検知</option>
            </select>
          </Field>
          <Field label="数値"><input type="number" step="0.01" className={inputCls} value={quick.value} onChange={(e) => setQ('value', e.target.value)} /></Field>
          <Field label="確認者"><input className={inputCls} value={quick.checker} onChange={(e) => setQ('checker', e.target.value)} /></Field>
        </div>
        <div className="flex justify-end mt-3">
          <Button variant="primary" size="sm" onClick={quickSubmit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin" />}<Plus className="w-4 h-4" />記録する</Button>
        </div>
      </Card>
      </details>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-ink-700">
                <th className="px-3 py-2 font-semibold">日付</th>
                <th className="px-3 py-2 font-semibold">運転者</th>
                <th className="px-3 py-2 font-semibold">タイミング</th>
                <th className="px-3 py-2 font-semibold">方法</th>
                <th className="px-3 py-2 font-semibold text-center">結果</th>
                <th className="px-3 py-2 font-semibold text-center">数値</th>
                <th className="px-3 py-2 font-semibold">確認者</th>
                {isAdmin && <th className="px-3 py-2 font-semibold text-center">操作</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={`border-b border-slate-100 dark:border-ink-800 ${r.result === '検知' ? 'bg-danger-50 dark:bg-danger-500/10' : 'hover:bg-slate-50 dark:hover:bg-ink-900/50'}`}>
                  <td className="px-3 py-2 whitespace-nowrap">{r.check_date}</td>
                  <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">{r.driver}</td>
                  <td className="px-3 py-2">{r.timing}</td>
                  <td className="px-3 py-2">{r.method}</td>
                  <td className="px-3 py-2 text-center"><Badge tone={r.result === '検知' ? 'danger' : 'success'}>{r.result}</Badge></td>
                  <td className="px-3 py-2 text-center">{r.value ?? '—'}</td>
                  <td className="px-3 py-2">{r.checker || '—'}</td>
                  {isAdmin && (
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <button title="編集" onClick={() => setEditModal({ row: r })} className="p-1 text-slate-400 hover:text-brand-500"><Pencil className="w-4 h-4" /></button>
                        <button title="削除" onClick={() => del(r.id)} className="p-1 text-slate-400 hover:text-danger-500"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={isAdmin ? 8 : 7} className="px-3 py-10 text-center text-slate-400">記録がありません</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {editModal && <AlcoholEditModal row={editModal.row} onClose={() => setEditModal(null)} onSaved={() => { setEditModal(null); load() }} showToast={showToast} />}
    </>
  )
}

function AlcoholEditModal({ row, onClose, onSaved, showToast }) {
  const [form, setForm] = useState({
    check_date: row.check_date || today(), driver: row.driver || '', timing: row.timing || '出発',
    method: row.method || '目視', result: row.result || '非検知', value: row.value ?? '', checker: row.checker || '', note: row.note || '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const submit = async () => {
    setSaving(true)
    try {
      const payload = { ...form, value: form.value === '' ? null : Number(form.value) }
      await axios.put(`${apiUrl}/api/iso/alcohol-checks/${row.id}`, payload, authConfig())
      showToast('success', '更新しました')
      onSaved()
    } catch (e) { showToast('error', e.response?.data?.error || '保存に失敗しました') }
    finally { setSaving(false) }
  }

  return (
    <ModalShell title="アルコールチェック記録を編集" onClose={onClose} wide>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="日付"><input type="date" className={inputCls} value={form.check_date} onChange={(e) => set('check_date', e.target.value)} /></Field>
        <Field label="運転者"><input className={inputCls} value={form.driver} onChange={(e) => set('driver', e.target.value)} /></Field>
        <Field label="タイミング"><select className={inputCls} value={form.timing} onChange={(e) => set('timing', e.target.value)}>{AL_TIMINGS.map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>
        <Field label="方法"><select className={inputCls} value={form.method} onChange={(e) => set('method', e.target.value)}>{AL_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</select></Field>
        <Field label="結果"><select className={inputCls} value={form.result} onChange={(e) => set('result', e.target.value)}><option value="非検知">非検知</option><option value="検知">検知</option></select></Field>
        <Field label="数値"><input type="number" step="0.01" className={inputCls} value={form.value} onChange={(e) => set('value', e.target.value)} /></Field>
        <Field label="確認者"><input className={inputCls} value={form.checker} onChange={(e) => set('checker', e.target.value)} /></Field>
        <div className="sm:col-span-2"><Field label="備考"><input className={inputCls} value={form.note} onChange={(e) => set('note', e.target.value)} /></Field></div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="secondary" onClick={onClose}>キャンセル</Button>
        <Button variant="primary" onClick={submit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin" />}保存</Button>
      </div>
    </ModalShell>
  )
}

// ══════════════ 目標達成計画タブ（075） ══════════════
const GOAL_CATEGORY_TONE = { '品質': 'info', '労働安全衛生': 'warning', '環境': 'success' }

export function GoalTab({ isAdmin, showToast }) {
  const [goals, setGoals] = useState(null)
  const [progress, setProgress] = useState({}) // { [goalId]: rows }
  const [open, setOpen] = useState({}) // { [goalId]: bool }
  const [modal, setModal] = useState(null) // {goalId}

  const load = useCallback(async () => {
    try {
      const r = await axios.get(`${apiUrl}/api/iso/goals`, authConfig())
      const gs = r.data || []
      setGoals(gs)
      const entries = await Promise.all(gs.map(async (g) => {
        try { const pr = await axios.get(`${apiUrl}/api/iso/goals/${g.id}/progress`, authConfig()); return [g.id, pr.data || []] }
        catch { return [g.id, []] }
      }))
      setProgress(Object.fromEntries(entries))
    } catch {
      showToast('error', '目標達成計画の取得に失敗しました')
      setGoals([])
    }
  }, [showToast])
  useEffect(() => { load() }, [load])

  const toggle = (id) => setOpen((p) => ({ ...p, [id]: !p[id] }))

  if (goals === null) return <Loading />

  return (
    <>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">6.2品質・労働安全衛生目標達成計画書。月次で結果・評価を積み上げます。</p>
      <div className="space-y-3">
        {goals.map((g) => {
          const rows = progress[g.id] || []
          const isOpen = !!open[g.id]
          return (
            <Card key={g.id} className="p-4">
              <div className="flex items-start justify-between gap-3 cursor-pointer" onClick={() => toggle(g.id)}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge tone={GOAL_CATEGORY_TONE[g.category] || 'neutral'}>{g.category}</Badge>
                    <span className="text-xs text-slate-400">{g.fiscal_year}年度</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{g.title}</span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{g.target}</p>
                </div>
                <button className="p-1 text-slate-400 shrink-0">{isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</button>
              </div>

              {isOpen && (
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-ink-700">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mb-3">
                    <p><span className="font-semibold">現状: </span>{g.baseline || '—'}</p>
                    <p><span className="font-semibold">責任者: </span>{g.owner || '—'}</p>
                    <p><span className="font-semibold">達成期限: </span>{g.deadline || '—'}</p>
                    <p><span className="font-semibold">事業プロセス: </span>{g.ms_clause || '—'}</p>
                    <p className="sm:col-span-2"><span className="font-semibold">評価方法: </span>{g.eval_method || '—'}</p>
                  </div>

                  <div className="space-y-1.5">
                    {rows.map((p) => (
                      <div key={p.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-50 dark:bg-ink-900/50 text-sm">
                        <span className="text-xs text-slate-400 whitespace-nowrap w-16 shrink-0">{p.ym}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-slate-900 dark:text-white">{p.result || '—'}</p>
                          {p.evaluation && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">評価{p.evaluator ? `（${p.evaluator}）` : ''}: {p.evaluation}</p>}
                        </div>
                      </div>
                    ))}
                    {rows.length === 0 && <p className="text-xs text-slate-400 py-2">月次の記録はまだありません</p>}
                  </div>

                  {isAdmin && (
                    <div className="mt-3">
                      <Button variant="secondary" size="sm" onClick={() => setModal({ goalId: g.id })}><Plus className="w-4 h-4" />月次進捗を追加</Button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )
        })}
        {goals.length === 0 && <p className="text-center text-slate-400 py-10">目標が登録されていません</p>}
      </div>

      {modal && <GoalProgressModal goalId={modal.goalId} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} showToast={showToast} />}
    </>
  )
}

function GoalProgressModal({ goalId, onClose, onSaved, showToast }) {
  const [form, setForm] = useState({ ym: thisMonth(), result: '', evaluation: '', evaluator: '' })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const submit = async () => {
    if (!form.ym) { showToast('error', '対象月は必須です'); return }
    setSaving(true)
    try {
      await axios.post(`${apiUrl}/api/iso/goals/${goalId}/progress`, form, authConfig())
      showToast('success', '進捗を追加しました')
      onSaved()
    } catch (e) { showToast('error', e.response?.data?.error || '保存に失敗しました') }
    finally { setSaving(false) }
  }

  return (
    <ModalShell title="月次進捗を追加" onClose={onClose} wide>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="対象月 *"><input type="month" className={inputCls} value={form.ym} onChange={(e) => set('ym', e.target.value)} /></Field>
        <Field label="評価者"><input className={inputCls} value={form.evaluator} onChange={(e) => set('evaluator', e.target.value)} /></Field>
        <div className="sm:col-span-2"><Field label="結果"><textarea className={inputCls} rows={2} value={form.result} onChange={(e) => set('result', e.target.value)} /></Field></div>
        <div className="sm:col-span-2"><Field label="評価"><textarea className={inputCls} rows={2} value={form.evaluation} onChange={(e) => set('evaluation', e.target.value)} /></Field></div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="secondary" onClick={onClose}>キャンセル</Button>
        <Button variant="primary" onClick={submit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin" />}保存</Button>
      </div>
    </ModalShell>
  )
}

// ══════════════ 安全衛生委員会タブ（076） ══════════════
export function CommitteeTab({ isAdmin, showToast }) {
  const [rows, setRows] = useState(null)
  const [detail, setDetail] = useState(null) // row
  const [modal, setModal] = useState(null) // {row?, copyFrom?}

  const load = useCallback(async () => {
    try { const r = await axios.get(`${apiUrl}/api/iso/safety-committee`, authConfig()); setRows(r.data || []) }
    catch { showToast('error', '安全衛生委員会の記録取得に失敗しました'); setRows([]) }
  }, [showToast])
  useEffect(() => { load() }, [load])

  const sorted = useMemo(() => rows === null ? [] : [...rows].sort((a, b) => (b.meeting_date || '').localeCompare(a.meeting_date || '')), [rows])
  const latest = sorted[0]

  if (rows === null) return <Loading />

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">月次の安全衛生委員会 議事録</p>
        {isAdmin && (
          <div className="ml-auto flex gap-2">
            {latest && <Button variant="secondary" size="sm" onClick={() => setModal({ copyFrom: latest })}><Copy className="w-4 h-4" />前回からコピー</Button>}
            <Button variant="primary" size="sm" onClick={() => setModal({})}><Plus className="w-4 h-4" />議事録を追加</Button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {sorted.map((r) => (
          <Card key={r.id} className="p-4">
            <div className="flex items-start gap-3">
              {r.accident_count > 0 && <AlertTriangle className="w-5 h-5 text-danger-500 shrink-0 mt-0.5" />}
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setDetail(r)}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-900 dark:text-white">{r.meeting_date}</span>
                  {r.location && <span className="text-xs text-slate-400">📍{r.location}</span>}
                  {r.chair && <span className="text-xs text-slate-400">議長: {r.chair}</span>}
                  <Badge tone={r.accident_count > 0 ? 'danger' : 'success'}>災害{r.accident_count ?? 0}件</Badge>
                </div>
                {r.summary && <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 line-clamp-2">{r.summary}</p>}
              </div>
              {isAdmin && (
                <button title="編集" onClick={() => setModal({ row: r })} className="p-1 text-slate-400 hover:text-brand-500 shrink-0"><Pencil className="w-4 h-4" /></button>
              )}
            </div>
          </Card>
        ))}
        {sorted.length === 0 && <p className="text-center text-slate-400 py-10">議事録がまだありません</p>}
      </div>

      {detail && <CommitteeDetailModal row={detail} onClose={() => setDetail(null)} />}
      {modal && <CommitteeEditModal row={modal.row} copyFrom={modal.copyFrom} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} showToast={showToast} />}
    </>
  )
}

function CommitteeDetailModal({ row, onClose }) {
  return (
    <ModalShell title={`安全衛生委員会：${row.meeting_date}`} onClose={onClose} wide>
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          <p><span className="font-semibold">開催場所: </span>{row.location || '—'}</p>
          <p><span className="font-semibold">議長: </span>{row.chair || '—'}</p>
          <p className="sm:col-span-2"><span className="font-semibold">出席者: </span>{row.attendees || '—'}</p>
          <p><span className="font-semibold">災害件数: </span>{row.accident_count ?? 0}件</p>
          <p><span className="font-semibold">次回開催: </span>{row.next_date || '—'}</p>
        </div>
        {row.ky_report && <p><span className="font-semibold">KY活動報告: </span>{row.ky_report}</p>}
        {row.patrol_result && <p><span className="font-semibold">巡回結果: </span>{row.patrol_result}</p>}
        {row.notes && <p><span className="font-semibold">注意事項: </span>{row.notes}</p>}
        {row.discussion && <p><span className="font-semibold">協議事項: </span>{row.discussion}</p>}
        {row.summary && <p><span className="font-semibold">総評{row.summary_by ? `（${row.summary_by}）` : ''}: </span>{row.summary}</p>}
      </div>
      <div className="flex justify-end mt-5"><Button variant="secondary" onClick={onClose}>閉じる</Button></div>
    </ModalShell>
  )
}

function CommitteeEditModal({ row, copyFrom, onClose, onSaved, showToast }) {
  const isNew = !row
  const base = row || copyFrom
  const [form, setForm] = useState({
    meeting_date: row?.meeting_date || today(),
    location: base?.location || '', chair: base?.chair || '', attendees: base?.attendees || '',
    accident_count: row?.accident_count ?? 0, ky_report: row?.ky_report || '', patrol_result: row?.patrol_result || '',
    notes: row?.notes || '', discussion: row?.discussion || '', next_date: row?.next_date || '',
    summary_by: base?.summary_by || '', summary: row?.summary || '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const submit = async () => {
    if (!form.meeting_date) { showToast('error', '開催日は必須です'); return }
    setSaving(true)
    try {
      const payload = { ...form, accident_count: form.accident_count === '' ? 0 : Number(form.accident_count) }
      if (isNew) { await axios.post(`${apiUrl}/api/iso/safety-committee`, payload, authConfig()); showToast('success', '議事録を追加しました') }
      else { await axios.put(`${apiUrl}/api/iso/safety-committee/${row.id}`, payload, authConfig()); showToast('success', '更新しました') }
      onSaved()
    } catch (e) { showToast('error', e.response?.data?.error || '保存に失敗しました') }
    finally { setSaving(false) }
  }

  return (
    <ModalShell title={isNew ? (copyFrom ? '議事録を追加（前回からコピー）' : '議事録を追加') : '議事録を編集'} onClose={onClose} wide>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="開催日 *"><input type="date" className={inputCls} value={form.meeting_date} onChange={(e) => set('meeting_date', e.target.value)} /></Field>
        <Field label="次回開催日"><input type="date" className={inputCls} value={form.next_date} onChange={(e) => set('next_date', e.target.value)} /></Field>
        <Field label="開催場所"><input className={inputCls} value={form.location} onChange={(e) => set('location', e.target.value)} /></Field>
        <Field label="議長"><input className={inputCls} value={form.chair} onChange={(e) => set('chair', e.target.value)} /></Field>
        <div className="sm:col-span-2"><Field label="出席者"><input className={inputCls} value={form.attendees} onChange={(e) => set('attendees', e.target.value)} /></Field></div>
        <Field label="災害件数"><input type="number" className={inputCls} value={form.accident_count} onChange={(e) => set('accident_count', e.target.value)} /></Field>
        <Field label="総評者"><input className={inputCls} value={form.summary_by} onChange={(e) => set('summary_by', e.target.value)} /></Field>
        <div className="sm:col-span-2"><Field label="KY活動報告"><textarea className={inputCls} rows={2} value={form.ky_report} onChange={(e) => set('ky_report', e.target.value)} /></Field></div>
        <div className="sm:col-span-2"><Field label="巡回結果"><textarea className={inputCls} rows={2} value={form.patrol_result} onChange={(e) => set('patrol_result', e.target.value)} /></Field></div>
        <div className="sm:col-span-2"><Field label="注意事項"><textarea className={inputCls} rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field></div>
        <div className="sm:col-span-2"><Field label="協議事項"><textarea className={inputCls} rows={2} value={form.discussion} onChange={(e) => set('discussion', e.target.value)} /></Field></div>
        <div className="sm:col-span-2"><Field label="総評"><textarea className={inputCls} rows={2} value={form.summary} onChange={(e) => set('summary', e.target.value)} /></Field></div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="secondary" onClick={onClose}>キャンセル</Button>
        <Button variant="primary" onClick={submit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin" />}保存</Button>
      </div>
    </ModalShell>
  )
}
