import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { Loader2, Plus, Pencil } from 'lucide-react'
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

// ══════════════ 内部監査タブ（063） ══════════════
const AUDIT_FIND_CATEGORIES = ['適合', '観察', '不適合', '対象外']
const AUDIT_CATEGORY_TONE = { '適合': 'success', '観察': 'warning', '不適合': 'danger', '対象外': 'neutral' }

export function AuditTab({ isAdmin, showToast }) {
  const [rows, setRows] = useState(null)
  const [modal, setModal] = useState(null) // {type:'new'|'edit', audit}
  const [findModal, setFindModal] = useState(null) // {audit}

  const load = useCallback(async () => {
    try {
      const r = await axios.get(`${apiUrl}/api/iso/internal-audits`, authConfig())
      setRows(r.data || [])
    } catch {
      showToast('error', '監査記録の取得に失敗しました')
      setRows([])
    }
  }, [showToast])
  useEffect(() => { load() }, [load])

  if (rows === null) return <Loading />

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">内部監査の実施記録と指摘事項（審査懸念No.2の運用）</p>
        {isAdmin && <Button variant="primary" size="sm" onClick={() => setModal({ type: 'new' })}><Plus className="w-4 h-4" />監査を追加</Button>}
      </div>
      <div className="space-y-3">
        {rows.map((a) => (
          <Card key={a.id} className="p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-900 dark:text-white">{a.audit_year ? `${a.audit_year}年度 内部監査` : '内部監査'}</span>
                  {a.leader && <Badge tone="neutral">リーダー: {a.leader}</Badge>}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  監査員: {a.auditor || '—'} / 承認日: {a.approved_date || '—'}
                </p>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="secondary" size="sm" onClick={() => setFindModal({ audit: a })}><Plus className="w-4 h-4" />指摘を追加</Button>
                  <button title="編集" onClick={() => setModal({ type: 'edit', audit: a })} className="p-1 text-slate-400 hover:text-brand-500"><Pencil className="w-4 h-4" /></button>
                </div>
              )}
            </div>
            {(a.purpose || a.criteria) && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                {a.purpose && <>目的: {a.purpose}　</>}{a.criteria && <>基準: {a.criteria}</>}
              </p>
            )}
            {a.summary && <p className="text-sm text-slate-700 dark:text-slate-200 mt-2 whitespace-pre-line">{a.summary}</p>}
            {a.conclusion && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">結論: {a.conclusion}</p>}

            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-ink-700">
              {(a.findings || []).length === 0 ? (
                <p className="text-xs text-slate-400">指摘事項はまだありません</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-500 dark:text-slate-400">
                        <th className="pr-3 py-1 font-semibold">条項</th>
                        <th className="pr-3 py-1 font-semibold">部門</th>
                        <th className="pr-3 py-1 font-semibold">区分</th>
                        <th className="pr-3 py-1 font-semibold">指摘内容</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.findings.map((f) => (
                        <tr key={f.id} className="border-t border-slate-100 dark:border-ink-800">
                          <td className="pr-3 py-1 whitespace-nowrap align-top">{f.clause || '—'}</td>
                          <td className="pr-3 py-1 whitespace-nowrap align-top">{f.dept || '—'}</td>
                          <td className="pr-3 py-1 align-top"><Badge tone={AUDIT_CATEGORY_TONE[f.category] || 'neutral'}>{f.category || '—'}</Badge></td>
                          <td className="pr-3 py-1 align-top">{f.finding}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        ))}
        {rows.length === 0 && <p className="text-center text-slate-400 py-10">まだありません</p>}
      </div>

      {modal && <AuditModal modal={modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} showToast={showToast} />}
      {findModal && <FindingModal audit={findModal.audit} onClose={() => setFindModal(null)} onSaved={() => { setFindModal(null); load() }} showToast={showToast} />}
    </>
  )
}

function AuditModal({ modal, onClose, onSaved, showToast }) {
  const { type, audit } = modal
  const isNew = type === 'new'
  const [form, setForm] = useState({
    audit_year: audit?.audit_year || new Date().getFullYear(),
    auditor: audit?.auditor || '', purpose: audit?.purpose || '', criteria: audit?.criteria || '',
    summary: audit?.summary || '', conclusion: audit?.conclusion || '', leader: audit?.leader || '',
    approved_date: audit?.approved_date || '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const submit = async () => {
    setSaving(true)
    try {
      if (isNew) { await axios.post(`${apiUrl}/api/iso/internal-audits`, form, authConfig()); showToast('success', '監査記録を追加しました') }
      else { await axios.put(`${apiUrl}/api/iso/internal-audits/${audit.id}`, form, authConfig()); showToast('success', '更新しました') }
      onSaved()
    } catch (e) { showToast('error', e.response?.data?.error || '保存に失敗しました') }
    finally { setSaving(false) }
  }

  return (
    <ModalShell title={isNew ? '内部監査を追加' : `内部監査を編集：${audit.audit_year || ''}年度`} onClose={onClose} wide>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="実施年度"><input type="number" className={inputCls} value={form.audit_year} onChange={(e) => set('audit_year', e.target.value ? parseInt(e.target.value, 10) : '')} /></Field>
        <Field label="監査員"><input className={inputCls} value={form.auditor} onChange={(e) => set('auditor', e.target.value)} /></Field>
        <Field label="監査リーダー"><input className={inputCls} value={form.leader} onChange={(e) => set('leader', e.target.value)} /></Field>
        <Field label="承認日"><input type="date" className={inputCls} value={form.approved_date} onChange={(e) => set('approved_date', e.target.value)} /></Field>
        <div className="sm:col-span-2"><Field label="目的"><input className={inputCls} value={form.purpose} onChange={(e) => set('purpose', e.target.value)} /></Field></div>
        <div className="sm:col-span-2"><Field label="基準"><input className={inputCls} value={form.criteria} onChange={(e) => set('criteria', e.target.value)} /></Field></div>
        <div className="sm:col-span-2"><Field label="概要"><textarea className={inputCls} rows={3} value={form.summary} onChange={(e) => set('summary', e.target.value)} /></Field></div>
        <div className="sm:col-span-2"><Field label="結論"><textarea className={inputCls} rows={2} value={form.conclusion} onChange={(e) => set('conclusion', e.target.value)} /></Field></div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="secondary" onClick={onClose}>キャンセル</Button>
        <Button variant="primary" onClick={submit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin" />}保存</Button>
      </div>
    </ModalShell>
  )
}

function FindingModal({ audit, onClose, onSaved, showToast }) {
  const [form, setForm] = useState({ clause: '', dept: '', category: '適合', finding: '' })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const submit = async () => {
    if (!form.finding.trim()) { showToast('error', '指摘内容は必須です'); return }
    setSaving(true)
    try {
      await axios.post(`${apiUrl}/api/iso/internal-audits/${audit.id}/findings`, form, authConfig())
      showToast('success', '指摘を追加しました')
      onSaved()
    } catch (e) { showToast('error', e.response?.data?.error || '追加に失敗しました') }
    finally { setSaving(false) }
  }

  return (
    <ModalShell title={`指摘を追加：${audit.audit_year || ''}年度`} onClose={onClose} wide>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="条項"><input className={inputCls} value={form.clause} onChange={(e) => set('clause', e.target.value)} placeholder="例: 8.1" /></Field>
        <Field label="部門"><input className={inputCls} value={form.dept} onChange={(e) => set('dept', e.target.value)} /></Field>
        <Field label="区分">
          <select className={inputCls} value={form.category} onChange={(e) => set('category', e.target.value)}>
            {AUDIT_FIND_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <div className="sm:col-span-2"><Field label="指摘内容 *"><textarea className={inputCls} rows={3} value={form.finding} onChange={(e) => set('finding', e.target.value)} /></Field></div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="secondary" onClick={onClose}>キャンセル</Button>
        <Button variant="primary" onClick={submit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin" />}追加</Button>
      </div>
    </ModalShell>
  )
}

// ══════════════ 是正処置タブ（064・ISO最重要ワークフロー） ══════════════
const CA_SOURCE_LABEL = { complaint: '苦情', accident: '事故・災害', audit: '内部監査', monitoring: '監視測定', target: '目標未達', other: 'その他' }
const CA_SOURCE_TYPES = Object.keys(CA_SOURCE_LABEL)
const CA_STATUS_FLOW = ['draft', '原因特定', '計画', '実施', '有効性確認', '完了']
const CA_STATUS_META = {
  draft: { label: '起票', tone: 'neutral' },
  '原因特定': { label: '原因特定', tone: 'info' },
  '計画': { label: '是正計画', tone: 'info' },
  '実施': { label: '実施', tone: 'warning' },
  '有効性確認': { label: '有効性確認', tone: 'warning' },
  '完了': { label: '完了', tone: 'success' },
  '再計画': { label: '再計画（有効性なし）', tone: 'danger' },
}

export function CorrectiveTab({ isAdmin, showToast }) {
  const [rows, setRows] = useState(null)
  const [modal, setModal] = useState(null) // {row}（新規は row なし）

  const load = useCallback(async () => {
    try { const r = await axios.get(`${apiUrl}/api/iso/corrective-actions`, authConfig()); setRows(r.data || []) }
    catch { showToast('error', '是正処置の取得に失敗しました'); setRows([]) }
  }, [showToast])
  useEffect(() => { load() }, [load])

  const advance = async (row, nextStatus) => {
    try {
      await axios.put(`${apiUrl}/api/iso/corrective-actions/${row.id}`, { status: nextStatus }, authConfig())
      showToast('success', `状態を「${CA_STATUS_META[nextStatus]?.label || nextStatus}」にしました`)
      load()
    } catch (e) { showToast('error', e.response?.data?.error || '更新に失敗しました') }
  }

  if (rows === null) return <Loading />
  const openCount = rows.filter((r) => r.status !== '完了').length

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">不適合の是正処置ワークフロー（ISO 10.2 / 未完了 {openCount}件）</p>
        {isAdmin && <Button variant="primary" size="sm" onClick={() => setModal({})}><Plus className="w-4 h-4" />是正処置を起票</Button>}
      </div>
      <div className="space-y-3">
        {rows.map((r) => {
          const meta = CA_STATUS_META[r.status] || CA_STATUS_META.draft
          const isReplan = r.status === '再計画'
          const curIdx = CA_STATUS_FLOW.indexOf(isReplan ? '計画' : r.status)
          const nextStatus = !isReplan && curIdx >= 0 && curIdx < CA_STATUS_FLOW.length - 1 ? CA_STATUS_FLOW[curIdx + 1] : null
          return (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900 dark:text-white">{r.title}</span>
                    <Badge tone="neutral">{CA_SOURCE_LABEL[r.source_type] || r.source_type || '—'}</Badge>
                    {r.dept && <Badge tone="neutral">{r.dept}</Badge>}
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </div>
                  {r.nonconformity && <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">不適合: {r.nonconformity}</p>}
                  {r.planned_date && <p className="text-xs text-slate-400 mt-1">是正予定日: {r.planned_date}</p>}
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1 shrink-0">
                    {nextStatus && <Button variant="secondary" size="sm" onClick={() => advance(r, nextStatus)}>次へ: {CA_STATUS_META[nextStatus].label}</Button>}
                    <button title="編集" onClick={() => setModal({ row: r })} className="p-1 text-slate-400 hover:text-brand-500"><Pencil className="w-4 h-4" /></button>
                  </div>
                )}
              </div>

              {/* ワークフローの現在地 */}
              <div className="flex items-center gap-1 mt-3 flex-wrap">
                {CA_STATUS_FLOW.map((s, i) => {
                  const activeIdx = CA_STATUS_FLOW.indexOf(isReplan ? '計画' : r.status)
                  const done = i < activeIdx
                  const active = !isReplan && s === r.status
                  return (
                    <div key={s} className="flex items-center gap-1">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${active ? 'bg-brand-500 text-white font-semibold' : done ? 'bg-success-100 text-success-700 dark:bg-success-500/15 dark:text-success-400' : 'bg-slate-100 text-slate-400 dark:bg-ink-800'}`}>{CA_STATUS_META[s].label}</span>
                      {i < CA_STATUS_FLOW.length - 1 && <span className="text-slate-300 dark:text-slate-600">→</span>}
                    </div>
                  )
                })}
                {isReplan && <Badge tone="danger" className="ml-2">再計画へ差し戻し</Badge>}
              </div>
            </Card>
          )
        })}
        {rows.length === 0 && <p className="text-center text-slate-400 py-10">まだありません</p>}
      </div>

      {modal && <CorrectiveModal row={modal.row} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} showToast={showToast} />}
    </>
  )
}

function CorrectiveModal({ row, onClose, onSaved, showToast }) {
  const isNew = !row
  const [form, setForm] = useState({
    title: row?.title || '', dept: row?.dept || '', nonconformity: row?.nonconformity || '',
    correction: row?.correction || '', source_type: row?.source_type || 'other', source_ref: row?.source_ref || '',
    cause: row?.cause || '', similar_check: row?.similar_check || '', plan: row?.plan || '',
    result: row?.result || '', effectiveness: row?.effectiveness || '', status: row?.status || 'draft',
    ms_change: row?.ms_change || '', planned_date: row?.planned_date || '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const submit = async () => {
    if (!form.title.trim()) { showToast('error', 'タイトルは必須です'); return }
    const payload = { ...form, effectiveness: form.effectiveness || null, planned_date: form.planned_date || null }
    setSaving(true)
    try {
      if (isNew) { await axios.post(`${apiUrl}/api/iso/corrective-actions`, payload, authConfig()); showToast('success', '起票しました') }
      else { await axios.put(`${apiUrl}/api/iso/corrective-actions/${row.id}`, payload, authConfig()); showToast('success', '更新しました') }
      onSaved()
    } catch (e) { showToast('error', e.response?.data?.error || '保存に失敗しました') }
    finally { setSaving(false) }
  }

  return (
    <ModalShell title={isNew ? '是正処置を起票' : `是正処置を編集：${row.title}`} onClose={onClose} wide>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2"><Field label="タイトル *"><input className={inputCls} value={form.title} onChange={(e) => set('title', e.target.value)} /></Field></div>
        <Field label="部門"><input className={inputCls} value={form.dept} onChange={(e) => set('dept', e.target.value)} /></Field>
        <Field label="発生源">
          <select className={inputCls} value={form.source_type} onChange={(e) => set('source_type', e.target.value)}>
            {CA_SOURCE_TYPES.map((s) => <option key={s} value={s}>{CA_SOURCE_LABEL[s]}</option>)}
          </select>
        </Field>
        <div className="sm:col-span-2"><Field label="元レコードの参照" hint="苦情番号・事故記録リンク等"><input className={inputCls} value={form.source_ref} onChange={(e) => set('source_ref', e.target.value)} /></Field></div>
        <div className="sm:col-span-2"><Field label="不適合内容"><textarea className={inputCls} rows={2} value={form.nonconformity} onChange={(e) => set('nonconformity', e.target.value)} /></Field></div>
        <div className="sm:col-span-2"><Field label="応急処置（対処）"><textarea className={inputCls} rows={2} value={form.correction} onChange={(e) => set('correction', e.target.value)} /></Field></div>
        <div className="sm:col-span-2"><Field label="原因"><textarea className={inputCls} rows={2} value={form.cause} onChange={(e) => set('cause', e.target.value)} /></Field></div>
        <div className="sm:col-span-2"><Field label="類似事例の有無・確認"><input className={inputCls} value={form.similar_check} onChange={(e) => set('similar_check', e.target.value)} /></Field></div>
        <div className="sm:col-span-2"><Field label="是正処置計画" hint="5W1H"><textarea className={inputCls} rows={3} value={form.plan} onChange={(e) => set('plan', e.target.value)} /></Field></div>
        <Field label="是正予定日"><input type="date" className={inputCls} value={form.planned_date} onChange={(e) => set('planned_date', e.target.value)} /></Field>
        <Field label="状態">
          <select className={inputCls} value={form.status} onChange={(e) => set('status', e.target.value)}>
            {Object.keys(CA_STATUS_META).map((s) => <option key={s} value={s}>{CA_STATUS_META[s].label}</option>)}
          </select>
        </Field>
        <div className="sm:col-span-2"><Field label="結果"><textarea className={inputCls} rows={2} value={form.result} onChange={(e) => set('result', e.target.value)} /></Field></div>
        <Field label="有効性">
          <select className={inputCls} value={form.effectiveness} onChange={(e) => set('effectiveness', e.target.value)}>
            <option value="">未確認</option>
            <option value="有">有（効果あり）</option>
            <option value="無">無（再計画が必要）</option>
          </select>
        </Field>
        <Field label="マネジメントシステムへの変更"><input className={inputCls} value={form.ms_change} onChange={(e) => set('ms_change', e.target.value)} /></Field>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="secondary" onClick={onClose}>キャンセル</Button>
        <Button variant="primary" onClick={submit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin" />}保存</Button>
      </div>
    </ModalShell>
  )
}

// ══════════════ マネジメントレビュータブ（065） ══════════════
export function ReviewTab({ isAdmin, showToast }) {
  const [rows, setRows] = useState(null)
  const [modal, setModal] = useState(null) // {type:'new'|'edit', review}
  const [itemModal, setItemModal] = useState(null) // {review}

  const load = useCallback(async () => {
    try { const r = await axios.get(`${apiUrl}/api/iso/mgmt-reviews`, authConfig()); setRows(r.data || []) }
    catch { showToast('error', 'マネジメントレビューの取得に失敗しました'); setRows([]) }
  }, [showToast])
  useEffect(() => { load() }, [load])

  if (rows === null) return <Loading />

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">経営層によるマネジメントレビュー（ISO 9.3）</p>
        {isAdmin && <Button variant="primary" size="sm" onClick={() => setModal({ type: 'new' })}><Plus className="w-4 h-4" />レビューを追加</Button>}
      </div>
      <div className="space-y-3">
        {rows.map((rv) => {
          const inputs = (rv.items || []).filter((i) => i.io_type === 'input').sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
          const outputs = (rv.items || []).filter((i) => i.io_type === 'output').sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
          return (
            <Card key={rv.id} className="p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <span className="font-semibold text-slate-900 dark:text-white">{rv.review_date || '日付未記入'}</span>
                  {rv.location && <span className="text-xs text-slate-400 ml-2">{rv.location}</span>}
                  {rv.attendees && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">出席者: {rv.attendees}</p>}
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="secondary" size="sm" onClick={() => setItemModal({ review: rv })}><Plus className="w-4 h-4" />項目を追加</Button>
                    <button title="編集" onClick={() => setModal({ type: 'edit', review: rv })} className="p-1 text-slate-400 hover:text-brand-500"><Pencil className="w-4 h-4" /></button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">インプット</p>
                  {inputs.length === 0 ? <p className="text-xs text-slate-400">まだありません</p> : (
                    <ul className="space-y-1">
                      {inputs.map((i) => (
                        <li key={i.id} className="text-sm text-slate-700 dark:text-slate-200">
                          {i.clause_ref && <span className="text-xs text-slate-400 mr-1">[{i.clause_ref}]</span>}
                          {i.label && <span className="font-medium">{i.label}: </span>}{i.content}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">アウトプット</p>
                  {outputs.length === 0 ? <p className="text-xs text-slate-400">まだありません</p> : (
                    <ul className="space-y-1">
                      {outputs.map((i) => (
                        <li key={i.id} className="text-sm text-slate-700 dark:text-slate-200">
                          {i.clause_ref && <span className="text-xs text-slate-400 mr-1">[{i.clause_ref}]</span>}
                          {i.label && <span className="font-medium">{i.label}: </span>}{i.content}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
        {rows.length === 0 && <p className="text-center text-slate-400 py-10">まだありません</p>}
      </div>

      {modal && <ReviewModal modal={modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} showToast={showToast} />}
      {itemModal && <ReviewItemModal review={itemModal.review} onClose={() => setItemModal(null)} onSaved={() => { setItemModal(null); load() }} showToast={showToast} />}
    </>
  )
}

function ReviewModal({ modal, onClose, onSaved, showToast }) {
  const { type, review } = modal
  const isNew = type === 'new'
  const [form, setForm] = useState({
    review_date: review?.review_date || today(), location: review?.location || '', attendees: review?.attendees || '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const submit = async () => {
    setSaving(true)
    try {
      if (isNew) { await axios.post(`${apiUrl}/api/iso/mgmt-reviews`, form, authConfig()); showToast('success', '追加しました') }
      else { await axios.put(`${apiUrl}/api/iso/mgmt-reviews/${review.id}`, form, authConfig()); showToast('success', '更新しました') }
      onSaved()
    } catch (e) { showToast('error', e.response?.data?.error || '保存に失敗しました') }
    finally { setSaving(false) }
  }

  return (
    <ModalShell title={isNew ? 'マネジメントレビューを追加' : `レビューを編集：${review.review_date || ''}`} onClose={onClose} wide>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="実施日"><input type="date" className={inputCls} value={form.review_date} onChange={(e) => set('review_date', e.target.value)} /></Field>
        <Field label="場所"><input className={inputCls} value={form.location} onChange={(e) => set('location', e.target.value)} /></Field>
        <div className="sm:col-span-2"><Field label="出席者"><input className={inputCls} value={form.attendees} onChange={(e) => set('attendees', e.target.value)} /></Field></div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="secondary" onClick={onClose}>キャンセル</Button>
        <Button variant="primary" onClick={submit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin" />}保存</Button>
      </div>
    </ModalShell>
  )
}

function ReviewItemModal({ review, onClose, onSaved, showToast }) {
  const [form, setForm] = useState({ io_type: 'input', clause_ref: '', label: '', content: '', sort_order: 0 })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const submit = async () => {
    if (!form.content.trim()) { showToast('error', '内容は必須です'); return }
    setSaving(true)
    try {
      await axios.post(`${apiUrl}/api/iso/mgmt-reviews/${review.id}/items`, form, authConfig())
      showToast('success', '項目を追加しました')
      onSaved()
    } catch (e) { showToast('error', e.response?.data?.error || '追加に失敗しました') }
    finally { setSaving(false) }
  }

  return (
    <ModalShell title={`項目を追加：${review.review_date || ''}`} onClose={onClose} wide>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="区分">
          <select className={inputCls} value={form.io_type} onChange={(e) => set('io_type', e.target.value)}>
            <option value="input">インプット</option>
            <option value="output">アウトプット</option>
          </select>
        </Field>
        <Field label="条項"><input className={inputCls} value={form.clause_ref} onChange={(e) => set('clause_ref', e.target.value)} placeholder="例: 9.3.2(a)" /></Field>
        <Field label="表示順"><input type="number" className={inputCls} value={form.sort_order} onChange={(e) => set('sort_order', e.target.value ? parseInt(e.target.value, 10) : 0)} /></Field>
        <Field label="項目名"><input className={inputCls} value={form.label} onChange={(e) => set('label', e.target.value)} placeholder="例: 前回までの処置状況" /></Field>
        <div className="sm:col-span-2"><Field label="内容 *"><textarea className={inputCls} rows={3} value={form.content} onChange={(e) => set('content', e.target.value)} /></Field></div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="secondary" onClick={onClose}>キャンセル</Button>
        <Button variant="primary" onClick={submit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin" />}追加</Button>
      </div>
    </ModalShell>
  )
}
