import { useState, useEffect, useCallback, useMemo } from 'react'
import axios from 'axios'
import { Loader2, Plus, Pencil, Trash2, Leaf, Snowflake, AlertOctagon } from 'lucide-react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import ModalShell from './ui/ModalShell'
import Field from './ui/Field'
import { API_URL as apiUrl, authConfig } from '../lib/api'

// ISO14001 環境モジュール（14001初回審査=2026年11月に向けた運用実績づくり）
// 069 月次環境使用量 / 070 エネルギー換算係数 / 071 環境側面 / 072 フロン簡易点検

const inputCls =
  'w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-ink-600 bg-white dark:bg-ink-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function Loading() {
  return <div className="text-center py-16"><Loader2 className="w-7 h-7 animate-spin mx-auto text-brand-500" /></div>
}

const ENV_LOCATIONS = ['本社', '福岡支社']
const ENV_CATEGORIES = ['電気', '燃料', '水道', 'ガス', '紙', '産廃']

// ══════════════ 月次環境使用量タブ（069＋070） ══════════════
export function EnvUsageTab({ isAdmin, showToast }) {
  const [rows, setRows] = useState(null)
  const [factors, setFactors] = useState([])
  const [fYear, setFYear] = useState('')
  const [fLoc, setFLoc] = useState('')
  const [modal, setModal] = useState(null) // {row?}

  const load = useCallback(async () => {
    try {
      const [u, f] = await Promise.all([
        axios.get(`${apiUrl}/api/iso/env-usage`, authConfig()),
        axios.get(`${apiUrl}/api/iso/energy-factors`, authConfig()),
      ])
      setRows(u.data || [])
      setFactors(f.data || [])
    } catch {
      showToast('error', '月次使用量の取得に失敗しました')
      setRows([])
    }
  }, [showToast])
  useEffect(() => { load() }, [load])

  const years = useMemo(() => [...new Set((rows || []).map((r) => r.fiscal_year).filter(Boolean))].sort(), [rows])

  const filtered = useMemo(() => {
    if (rows === null) return []
    return rows.filter((r) => (!fYear || r.fiscal_year === fYear) && (!fLoc || r.location === fLoc))
  }, [rows, fYear, fLoc])

  // 品目名がエネルギー換算係数のfuel_typeと一致すればCO2排出量(t)を推計
  const co2Of = (r) => {
    const f = factors.find((x) => x.fuel_type === r.item)
    if (!f || !r.quantity || f.co2_factor === null || f.co2_factor === undefined) return null
    return Number(r.quantity) * Number(f.heat_value) * Number(f.co2_factor)
  }

  const totalCo2 = useMemo(() => {
    const vals = filtered.map(co2Of).filter((v) => v !== null)
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null
  }, [filtered, factors])

  const del = async (id) => {
    try { await axios.delete(`${apiUrl}/api/iso/env-usage/${id}`, authConfig()); showToast('success', '削除しました'); load() }
    catch (e) { showToast('error', e.response?.data?.error || '削除に失敗しました') }
  }

  if (rows === null) return <Loading />

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Leaf className="w-4 h-4 text-success-500" />
        <p className="text-sm text-slate-500 dark:text-slate-400">電気・燃料・水道・ガス・紙・産廃の月次使用量（14001初回審査の運用実績）</p>
        <select value={fYear} onChange={(e) => setFYear(e.target.value)} className={`${inputCls} w-auto`}>
          <option value="">年度: すべて</option>
          {years.map((y) => <option key={y} value={y}>{y}年度</option>)}
        </select>
        <select value={fLoc} onChange={(e) => setFLoc(e.target.value)} className={`${inputCls} w-auto`}>
          <option value="">拠点: すべて</option>
          {ENV_LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        {isAdmin && <Button variant="primary" size="sm" className="ml-auto" onClick={() => setModal({})}><Plus className="w-4 h-4" />使用量を入力</Button>}
      </div>

      {totalCo2 !== null && (
        <Card className="p-4 mb-3 max-w-xs">
          <p className="text-xs text-slate-500 dark:text-slate-400">表示中の合計CO2排出量（換算可能な品目のみ）</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{totalCo2.toFixed(2)}<span className="text-sm font-normal ml-1">t-CO2</span></p>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-ink-700">
                <th className="px-3 py-2 font-semibold">年月</th>
                <th className="px-3 py-2 font-semibold">拠点</th>
                <th className="px-3 py-2 font-semibold">区分</th>
                <th className="px-3 py-2 font-semibold">品目</th>
                <th className="px-3 py-2 font-semibold">購入先</th>
                <th className="px-3 py-2 font-semibold text-right">使用量</th>
                <th className="px-3 py-2 font-semibold text-right">CO2換算</th>
                {isAdmin && <th className="px-3 py-2 font-semibold text-center">操作</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const co2 = co2Of(r)
                return (
                  <tr key={r.id} className="border-b border-slate-100 dark:border-ink-800 hover:bg-slate-50 dark:hover:bg-ink-900/50">
                    <td className="px-3 py-2 whitespace-nowrap">{r.ym}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.location}</td>
                    <td className="px-3 py-2"><Badge tone="neutral">{r.category}</Badge></td>
                    <td className="px-3 py-2">{r.item || '—'}</td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{r.vendor || '—'}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{r.quantity ?? '—'} {r.unit || ''}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{co2 !== null ? `${co2.toFixed(2)} t` : <span className="text-slate-300 dark:text-slate-600">—</span>}</td>
                    {isAdmin && (
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button title="編集" onClick={() => setModal({ row: r })} className="p-1 text-slate-400 hover:text-brand-500"><Pencil className="w-4 h-4" /></button>
                          <button title="削除" onClick={() => del(r.id)} className="p-1 text-slate-400 hover:text-danger-500"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
              {filtered.length === 0 && <tr><td colSpan={isAdmin ? 8 : 7} className="px-3 py-10 text-center text-slate-400">該当データがありません</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs text-slate-400 mt-3">CO2換算 = 使用量 × 単位発熱量 × CO2排出係数（エネルギー換算係数マスタと品目名が一致する場合のみ表示）。電気は排出係数が未設定のため空欄。</p>

      {modal && <EnvUsageModal row={modal.row} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} showToast={showToast} />}
    </>
  )
}

function EnvUsageModal({ row, onClose, onSaved, showToast }) {
  const isNew = !row
  const [form, setForm] = useState({
    fiscal_year: row?.fiscal_year || String(new Date().getFullYear()),
    location: row?.location || ENV_LOCATIONS[0],
    category: row?.category || ENV_CATEGORIES[0],
    item: row?.item || '', vendor: row?.vendor || '',
    ym: row?.ym || today().slice(0, 7),
    quantity: row?.quantity ?? '', unit: row?.unit || '', note: row?.note || '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const submit = async () => {
    if (!/^\d{4}-\d{2}$/.test(form.ym)) { showToast('error', '年月は YYYY-MM で入力してください'); return }
    const payload = { ...form, quantity: form.quantity === '' ? null : Number(form.quantity) }
    setSaving(true)
    try {
      if (isNew) { await axios.post(`${apiUrl}/api/iso/env-usage`, payload, authConfig()); showToast('success', '追加しました') }
      else { await axios.put(`${apiUrl}/api/iso/env-usage/${row.id}`, payload, authConfig()); showToast('success', '更新しました') }
      onSaved()
    } catch (e) { showToast('error', e.response?.data?.error || '保存に失敗しました') }
    finally { setSaving(false) }
  }

  return (
    <ModalShell title={isNew ? '使用量を入力' : '使用量を編集'} onClose={onClose} wide>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="年月 *"><input type="month" className={inputCls} value={form.ym} onChange={(e) => set('ym', e.target.value)} /></Field>
        <Field label="年度"><input className={inputCls} value={form.fiscal_year} onChange={(e) => set('fiscal_year', e.target.value)} placeholder="例: 2026" /></Field>
        <Field label="拠点">
          <select className={inputCls} value={form.location} onChange={(e) => set('location', e.target.value)}>
            {ENV_LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </Field>
        <Field label="区分">
          <select className={inputCls} value={form.category} onChange={(e) => set('category', e.target.value)}>
            {ENV_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="品目" hint="エネルギー換算係数と同名にするとCO2自動換算"><input className={inputCls} value={form.item} onChange={(e) => set('item', e.target.value)} placeholder="例: ガソリン、都市ガス、コピー用紙" /></Field>
        <Field label="購入先"><input className={inputCls} value={form.vendor} onChange={(e) => set('vendor', e.target.value)} /></Field>
        <Field label="使用量"><input type="number" step="any" className={inputCls} value={form.quantity} onChange={(e) => set('quantity', e.target.value)} /></Field>
        <Field label="単位"><input className={inputCls} value={form.unit} onChange={(e) => set('unit', e.target.value)} placeholder="kL / t / 千kWh / m3 / 枚" /></Field>
        <div className="sm:col-span-2"><Field label="備考"><input className={inputCls} value={form.note} onChange={(e) => set('note', e.target.value)} /></Field></div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="secondary" onClick={onClose}>キャンセル</Button>
        <Button variant="primary" onClick={submit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin" />}保存</Button>
      </div>
    </ModalShell>
  )
}

// ══════════════ 環境側面タブ（071） ══════════════
const ASPECT_CATEGORIES = ['通常', '非通常', '緊急時']
const ASPECT_FLAGS = [
  ['policy_flag', '方針'],
  ['legal_flag', '法規制'],
  ['stakeholder_flag', '利害関係者'],
  ['hazard_flag', '危険性'],
]

export function EnvAspectTab({ isAdmin, showToast }) {
  const [rows, setRows] = useState(null)
  const [cat, setCat] = useState('')
  const [modal, setModal] = useState(null)

  const load = useCallback(async () => {
    try { const r = await axios.get(`${apiUrl}/api/iso/env-aspects`, authConfig()); setRows(r.data || []) }
    catch { showToast('error', '環境側面の取得に失敗しました'); setRows([]) }
  }, [showToast])
  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => rows === null ? [] : rows.filter((r) => !cat || r.category === cat), [rows, cat])
  const sigCount = useMemo(() => (rows || []).filter((r) => r.significant).length, [rows])

  const del = async (id) => {
    try { await axios.delete(`${apiUrl}/api/iso/env-aspects/${id}`, authConfig()); showToast('success', '削除しました'); load() }
    catch (e) { showToast('error', e.response?.data?.error || '削除に失敗しました') }
  }

  if (rows === null) return <Loading />

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">部門・工程ごとの環境側面／環境影響。方針・法規制・利害関係者・危険性のいずれか該当で「著しい環境側面」</p>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className={`${inputCls} w-auto`}>
          <option value="">区分: すべて</option>
          {ASPECT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-xs text-slate-400">著しい側面 {sigCount}件 / 全{rows.length}件</span>
        {isAdmin && <Button variant="primary" size="sm" className="ml-auto" onClick={() => setModal({})}><Plus className="w-4 h-4" />追加</Button>}
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-ink-700">
                <th className="px-3 py-2 font-semibold">区分</th>
                <th className="px-3 py-2 font-semibold">部門・工程</th>
                <th className="px-3 py-2 font-semibold">環境側面</th>
                <th className="px-3 py-2 font-semibold">環境影響</th>
                <th className="px-3 py-2 font-semibold">該当フラグ</th>
                <th className="px-3 py-2 font-semibold text-center">著しい側面</th>
                {isAdmin && <th className="px-3 py-2 font-semibold text-center">操作</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className={`border-b border-slate-100 dark:border-ink-800 ${r.significant ? 'bg-danger-50 dark:bg-danger-500/10' : 'hover:bg-slate-50 dark:hover:bg-ink-900/50'}`}>
                  <td className="px-3 py-2 align-top whitespace-nowrap">{r.category}</td>
                  <td className="px-3 py-2 align-top whitespace-nowrap">{r.dept}{r.process ? `／${r.process}` : ''}</td>
                  <td className="px-3 py-2 align-top font-medium">{r.aspect}</td>
                  <td className="px-3 py-2 align-top text-slate-600 dark:text-slate-300">{r.impact || '—'}</td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex flex-wrap gap-1">
                      {ASPECT_FLAGS.filter(([k]) => r[k]).map(([k, label]) => <Badge key={k} tone="warning">{label}</Badge>)}
                      {ASPECT_FLAGS.every(([k]) => !r[k]) && <span className="text-slate-300 dark:text-slate-600">—</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top text-center">
                    <Badge tone={r.significant ? 'danger' : 'neutral'}>{r.significant ? '著しい' : '通常'}</Badge>
                  </td>
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
              {filtered.length === 0 && <tr><td colSpan={isAdmin ? 7 : 6} className="px-3 py-10 text-center text-slate-400">該当データがありません</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {modal && <EnvAspectModal row={modal.row} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} showToast={showToast} />}
    </>
  )
}

function EnvAspectModal({ row, onClose, onSaved, showToast }) {
  const isNew = !row
  const [form, setForm] = useState({
    category: row?.category || '通常', dept: row?.dept || '', process: row?.process || '',
    aspect: row?.aspect || '', impact: row?.impact || '',
    policy_flag: row?.policy_flag || false, legal_flag: row?.legal_flag || false,
    stakeholder_flag: row?.stakeholder_flag || false, hazard_flag: row?.hazard_flag || false,
    note: row?.note || '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))
  const willBeSignificant = form.policy_flag || form.legal_flag || form.stakeholder_flag || form.hazard_flag

  const submit = async () => {
    if (!form.aspect.trim()) { showToast('error', '環境側面は必須です'); return }
    setSaving(true)
    try {
      if (isNew) { await axios.post(`${apiUrl}/api/iso/env-aspects`, form, authConfig()); showToast('success', '追加しました') }
      else { await axios.put(`${apiUrl}/api/iso/env-aspects/${row.id}`, form, authConfig()); showToast('success', '更新しました') }
      onSaved()
    } catch (e) { showToast('error', e.response?.data?.error || '保存に失敗しました') }
    finally { setSaving(false) }
  }

  return (
    <ModalShell title={isNew ? '環境側面を追加' : '環境側面を編集'} onClose={onClose} wide>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="区分">
          <select className={inputCls} value={form.category} onChange={(e) => set('category', e.target.value)}>
            {ASPECT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="部門"><input className={inputCls} value={form.dept} onChange={(e) => set('dept', e.target.value)} /></Field>
        <Field label="工程"><input className={inputCls} value={form.process} onChange={(e) => set('process', e.target.value)} /></Field>
        <div className="sm:col-span-2"><Field label="環境側面 *"><input className={inputCls} value={form.aspect} onChange={(e) => set('aspect', e.target.value)} placeholder="例: 重機の燃料使用" /></Field></div>
        <div className="sm:col-span-2"><Field label="環境影響"><textarea className={inputCls} rows={2} value={form.impact} onChange={(e) => set('impact', e.target.value)} placeholder="例: CO2排出による地球温暖化" /></Field></div>
      </div>
      <div className="mt-4">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">該当フラグ（いずれか該当で著しい環境側面と自動判定）</p>
        <div className="flex flex-wrap gap-4">
          {ASPECT_FLAGS.map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input type="checkbox" checked={form[k]} onChange={(e) => set(k, e.target.checked)} />{label}
            </label>
          ))}
        </div>
        <div className="mt-3">
          <Badge tone={willBeSignificant ? 'danger' : 'neutral'}>{willBeSignificant ? '著しい環境側面' : '通常の側面'}</Badge>
        </div>
      </div>
      <div className="mt-4"><Field label="備考"><input className={inputCls} value={form.note} onChange={(e) => set('note', e.target.value)} /></Field></div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="secondary" onClick={onClose}>キャンセル</Button>
        <Button variant="primary" onClick={submit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin" />}保存</Button>
      </div>
    </ModalShell>
  )
}

// ══════════════ フロン簡易点検タブ（072） ══════════════
const FREON_ITEMS = [
  ['check_vibration', '異常な振動'],
  ['check_oil', '油にじみ'],
  ['check_damage', '配管損傷'],
  ['check_frost', '着霜・氷結'],
]
const FREON_CYCLE_MONTHS = 3

function addMonths(dateStr, months) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00')
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

function freonDueTone(dueDate) {
  if (!dueDate) return { tone: 'neutral', label: '点検記録なし' }
  const days = Math.floor((new Date(dueDate + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 86400000)
  if (days < 0) return { tone: 'danger', label: `期限超過 ${dueDate}` }
  if (days < 30) return { tone: 'warning', label: `まもなく ${dueDate}` }
  return { tone: 'success', label: dueDate }
}

export function FreonTab({ isAdmin, showToast }) {
  const [rows, setRows] = useState(null) // 機器一覧（+last_inspect_date付与はここで計算）
  const [eqModal, setEqModal] = useState(null) // {row?}
  const [inspModal, setInspModal] = useState(null) // {equipment}

  const load = useCallback(async () => {
    try {
      const eq = await axios.get(`${apiUrl}/api/iso/freon-equipment`, authConfig())
      const list = eq.data || []
      const withHistory = await Promise.all(list.map(async (e) => {
        try {
          const h = await axios.get(`${apiUrl}/api/iso/freon-equipment/${e.id}/inspections`, authConfig())
          const insp = h.data || []
          const last = insp[0] || null
          return { ...e, inspections: insp, last_inspect_date: last?.inspect_date || null }
        } catch { return { ...e, inspections: [], last_inspect_date: null } }
      }))
      setRows(withHistory)
    } catch {
      showToast('error', '機器一覧の取得に失敗しました')
      setRows([])
    }
  }, [showToast])
  useEffect(() => { load() }, [load])

  const delEq = async (id) => {
    try { await axios.delete(`${apiUrl}/api/iso/freon-equipment/${id}`, authConfig()); showToast('success', '削除しました'); load() }
    catch (e) { showToast('error', e.response?.data?.error || '削除に失敗しました') }
  }

  if (rows === null) return <Loading />

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Snowflake className="w-4 h-4 text-brand-500" />
          <p className="text-sm text-slate-500 dark:text-slate-400">フロン簡易点検（3か月に1回・振動/油/損傷/霜付きを○×で記録）</p>
        </div>
        {isAdmin && <Button variant="primary" size="sm" onClick={() => setEqModal({})}><Plus className="w-4 h-4" />機器を追加</Button>}
      </div>
      <div className="space-y-2">
        {rows.map((e) => {
          const due = freonDueTone(addMonths(e.last_inspect_date, FREON_CYCLE_MONTHS))
          return (
            <Card key={e.id} className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[180px]">
                  <p className="font-semibold text-slate-900 dark:text-white">{e.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{e.location || '—'}{e.unit_no ? `（${e.unit_no}）` : ''}</p>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  前回点検: {e.last_inspect_date || '—'}
                </div>
                <Badge tone={due.tone}>次回目安: {due.label}</Badge>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="secondary" size="sm" onClick={() => setInspModal({ equipment: e })}>点検記録</Button>
                  {isAdmin && (
                    <>
                      <button title="編集" onClick={() => setEqModal({ row: e })} className="p-1 text-slate-400 hover:text-brand-500"><Pencil className="w-4 h-4" /></button>
                      <button title="削除" onClick={() => delEq(e.id)} className="p-1 text-slate-400 hover:text-danger-500"><Trash2 className="w-4 h-4" /></button>
                    </>
                  )}
                </div>
              </div>
              {e.inspections?.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-ink-800 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-400">
                        <th className="pr-3 py-1 font-semibold">点検日</th>
                        <th className="pr-3 py-1 font-semibold">点検者</th>
                        {FREON_ITEMS.map(([k, label]) => <th key={k} className="pr-3 py-1 font-semibold text-center">{label}</th>)}
                        <th className="pr-3 py-1 font-semibold">対応</th>
                      </tr>
                    </thead>
                    <tbody>
                      {e.inspections.map((r) => (
                        <tr key={r.id} className="border-t border-slate-50 dark:border-ink-900">
                          <td className="pr-3 py-1 whitespace-nowrap">{r.inspect_date}</td>
                          <td className="pr-3 py-1 whitespace-nowrap">{r.inspector || '—'}</td>
                          {FREON_ITEMS.map(([k]) => (
                            <td key={k} className={`pr-3 py-1 text-center font-bold ${r[k] === '×' ? 'text-danger-500' : 'text-slate-500'}`}>{r[k] || '—'}</td>
                          ))}
                          <td className="pr-3 py-1">{r.response || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )
        })}
        {rows.length === 0 && <p className="text-center text-slate-400 py-10">機器が登録されていません</p>}
      </div>

      {eqModal && <FreonEquipmentModal row={eqModal.row} onClose={() => setEqModal(null)} onSaved={() => { setEqModal(null); load() }} showToast={showToast} />}
      {inspModal && <FreonInspectionModal equipment={inspModal.equipment} onClose={() => setInspModal(null)} onSaved={() => { setInspModal(null); load() }} showToast={showToast} />}
    </>
  )
}

function FreonEquipmentModal({ row, onClose, onSaved, showToast }) {
  const isNew = !row
  const [form, setForm] = useState({ name: row?.name || '', location: row?.location || '', unit_no: row?.unit_no || '', note: row?.note || '' })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const submit = async () => {
    if (!form.name.trim()) { showToast('error', '機器名は必須です'); return }
    setSaving(true)
    try {
      if (isNew) { await axios.post(`${apiUrl}/api/iso/freon-equipment`, form, authConfig()); showToast('success', '追加しました') }
      else { await axios.put(`${apiUrl}/api/iso/freon-equipment/${row.id}`, form, authConfig()); showToast('success', '更新しました') }
      onSaved()
    } catch (e) { showToast('error', e.response?.data?.error || '保存に失敗しました') }
    finally { setSaving(false) }
  }

  return (
    <ModalShell title={isNew ? '機器を追加' : '機器を編集'} onClose={onClose}>
      <div className="grid grid-cols-1 gap-3">
        <Field label="機器名 *"><input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="例: 本社事務所エアコン室外機" /></Field>
        <Field label="設置場所"><input className={inputCls} value={form.location} onChange={(e) => set('location', e.target.value)} /></Field>
        <Field label="管理番号・号機"><input className={inputCls} value={form.unit_no} onChange={(e) => set('unit_no', e.target.value)} /></Field>
        <Field label="備考"><input className={inputCls} value={form.note} onChange={(e) => set('note', e.target.value)} /></Field>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="secondary" onClick={onClose}>キャンセル</Button>
        <Button variant="primary" onClick={submit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin" />}保存</Button>
      </div>
    </ModalShell>
  )
}

function FreonInspectionModal({ equipment, onClose, onSaved, showToast }) {
  const [form, setForm] = useState({
    inspect_date: today(), inspector: '',
    check_vibration: '○', check_oil: '○', check_damage: '○', check_frost: '○',
    response: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))
  const hasNg = FREON_ITEMS.some(([k]) => form[k] === '×')

  const submit = async () => {
    setSaving(true)
    try {
      await axios.post(`${apiUrl}/api/iso/freon-equipment/${equipment.id}/inspections`, form, authConfig())
      showToast('success', '点検記録を追加しました')
      onSaved()
    } catch (e) { showToast('error', e.response?.data?.error || '保存に失敗しました') }
    finally { setSaving(false) }
  }

  return (
    <ModalShell title={`点検記録：${equipment.name}`} onClose={onClose} wide>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <Field label="点検日 *"><input type="date" className={inputCls} value={form.inspect_date} onChange={(e) => set('inspect_date', e.target.value)} /></Field>
        <Field label="点検者"><input className={inputCls} value={form.inspector} onChange={(e) => set('inspector', e.target.value)} /></Field>
      </div>
      <div className="space-y-2">
        {FREON_ITEMS.map(([k, label]) => (
          <div key={k} className="flex items-center gap-2">
            <span className="text-sm text-slate-700 dark:text-slate-200 w-32 shrink-0">{label}</span>
            <div className="flex gap-1">
              {['○', '×'].map((m) => (
                <button key={m} type="button" onClick={() => set(k, m)}
                  className={`w-9 h-8 rounded-lg text-sm font-bold border transition ${form[k] === m ? (m === '×' ? 'bg-danger-500 text-white border-danger-500' : 'bg-brand-500 text-white border-brand-500') : 'border-slate-300 dark:border-ink-600 text-slate-500 hover:bg-slate-100 dark:hover:bg-ink-700'}`}>{m}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {hasNg && (
        <div className="mt-3 flex items-start gap-2 text-danger-600 dark:text-danger-400 text-sm">
          <AlertOctagon className="w-4 h-4 shrink-0 mt-0.5" />
          <span>×の項目があります。対応内容を記録してください。</span>
        </div>
      )}
      <div className="mt-3"><Field label="対応"><input className={inputCls} value={form.response} onChange={(e) => set('response', e.target.value)} placeholder="例: 業者に補修依頼" /></Field></div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="secondary" onClick={onClose}>キャンセル</Button>
        <Button variant="primary" onClick={submit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin" />}記録する</Button>
      </div>
    </ModalShell>
  )
}
