// 見積比較（quote_compare）P0 ── 骨格＋6類型分類の確認UI
//   設計書: 04.アプリ\見積比較_設計書.md（＝正）。
//   P0 範囲: プロジェクト一覧/作成・原本数量書取込（boqParser）・業者追加＋6類型自動分類＋
//            人による確認/上書き（書式軸×媒体軸トグル）。
//   ※ Excel直読抽出・PDFキュー抽出・横並び比較・最安・書き戻しは P1 以降で追加する。
import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import {
  ArrowLeft, Plus, X, Loader2, Upload, Trash2, FileSpreadsheet,
  Building2, AlertTriangle, CheckCircle2, Layers, FileText,
} from 'lucide-react'
import Badge from './ui/Badge'
import Toast from './ui/Toast'
import ModalShell from './ui/ModalShell'
import Field from './ui/Field'
import { API_URL as apiUrl, authConfig } from '../lib/api'
import { inputCls } from '../lib/ui'
import { useToast } from '../lib/useToast'

const DISCIPLINES = ['建築', '機械', '電気・通信']

// 分類の2軸（設計書 §3）。書式軸=照合アプローチ / 媒体軸=読込アプローチを決める。
const FORM_TYPES = [
  { key: 'official', label: '発注者書式' },
  { key: 'vendor', label: '各社書式' },
]
const MEDIA = [
  { key: 'excel', label: 'Excel' },
  { key: 'text_pdf', label: 'テキストPDF' },
  { key: 'image_pdf', label: '写真PDF' },
]
// 6類型ラベル（class_no→表示）
const CLASS_LABEL = {
  1: '① 発注者書式 × Excel',
  2: '② 各社書式 × Excel',
  3: '③ 発注者書式 × テキストPDF',
  4: '④ 発注者書式 × 写真PDF',
  5: '⑤ 各社書式 × テキストPDF',
  6: '⑥ 各社書式 × 写真PDF',
}

const yen = (n) => (n == null ? '—' : `¥${Number(n).toLocaleString()}`)

// ─────────────────────────────────────────────────────────────
// セグメントトグル（書式軸/媒体軸のワンタッチ上書き）
function Segmented({ options, value, onChange, disabled }) {
  return (
    <div className="inline-flex rounded-xl border border-slate-200 dark:border-ink-600 overflow-hidden">
      {options.map((o) => {
        const active = o.key === value
        return (
          <button
            key={o.key}
            type="button"
            disabled={disabled}
            onClick={() => !active && onChange(o.key)}
            className={`px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50
              ${active
                ? 'bg-brand-600 text-white'
                : 'bg-white dark:bg-ink-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-ink-600'}`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 業者カード（分類確認UIが主役）
function VendorCard({ vendor, onReclassify, onDelete, busy }) {
  const lowConf = vendor.classify_confidence === 'low'
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-ink-700 bg-white dark:bg-ink-800 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="font-bold text-slate-900 dark:text-white truncate">{vendor.name}</span>
            <Badge tone="info">{CLASS_LABEL[vendor.class_no] || '未分類'}</Badge>
            {lowConf
              ? <Badge tone="danger"><AlertTriangle className="w-3 h-3" />確認必須</Badge>
              : <Badge tone="success"><CheckCircle2 className="w-3 h-3" />確信:高</Badge>}
            {vendor.auto_classified
              ? <Badge tone="neutral">自動判定</Badge>
              : <Badge tone="warning">手動確認済</Badge>}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            添付 {Array.isArray(vendor.source_drive_ids) ? vendor.source_drive_ids.length : 0} 件 ／ 状態: {vendor.status}
          </div>
        </div>
        <button
          onClick={() => onDelete(vendor)}
          disabled={busy}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-danger-50 hover:text-danger-600 disabled:opacity-50 shrink-0"
          title="業者を削除"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* 分類の上書き（誤分類が全工程を壊すため最も目立たせる） */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">書式軸（照合）</div>
          <Segmented
            options={FORM_TYPES}
            value={vendor.form_type}
            disabled={busy}
            onChange={(v) => onReclassify(vendor, { form_type: v })}
          />
        </div>
        <div>
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">媒体軸（読込）</div>
          <Segmented
            options={MEDIA}
            value={vendor.medium}
            disabled={busy}
            onChange={(v) => onReclassify(vendor, { medium: v })}
          />
        </div>
      </div>
      {lowConf && (
        <p className="text-xs text-danger-600 dark:text-danger-400 mt-2">
          自動判定の確信度が低い見積です。書式・媒体が正しいか確認し、違えばトグルで上書きしてください。
        </p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
export default function QuoteComparePage({ onBack }) {
  const { toast, showToast } = useToast()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState(null)   // 選択中プロジェクト（業者含む）
  const [tab, setTab] = useState('boq')         // 'boq' | 'vendors'
  const [boq, setBoq] = useState(null)          // { rows, total, imported_at, template_filename }
  const [busy, setBusy] = useState(false)

  const [showNew, setShowNew] = useState(false)
  const [showAddVendor, setShowAddVendor] = useState(false)

  const loadProjects = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await axios.get(`${apiUrl}/api/quote-compare/projects`, authConfig())
      setProjects(data || [])
    } catch (e) {
      showToast('error', e.response?.data?.error || '一覧の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { loadProjects() }, [loadProjects])

  const openDetail = useCallback(async (id) => {
    setBusy(true)
    try {
      const [{ data: d }, { data: b }] = await Promise.all([
        axios.get(`${apiUrl}/api/quote-compare/projects/${id}`, authConfig()),
        axios.get(`${apiUrl}/api/quote-compare/projects/${id}/boq`, authConfig()),
      ])
      setDetail(d)
      setBoq(b)
      setTab('boq')
    } catch (e) {
      showToast('error', e.response?.data?.error || '詳細の取得に失敗しました')
    } finally {
      setBusy(false)
    }
  }, [showToast])

  const refreshDetail = useCallback(async () => {
    if (!detail) return
    try {
      const [{ data: d }, { data: b }] = await Promise.all([
        axios.get(`${apiUrl}/api/quote-compare/projects/${detail.id}`, authConfig()),
        axios.get(`${apiUrl}/api/quote-compare/projects/${detail.id}/boq`, authConfig()),
      ])
      setDetail(d)
      setBoq(b)
    } catch { /* noop */ }
  }, [detail])

  // ── プロジェクト作成 ──
  const createProject = async (form) => {
    if (!form.name.trim()) { showToast('error', 'プロジェクト名は必須です'); return }
    setBusy(true)
    try {
      const { data } = await axios.post(`${apiUrl}/api/quote-compare/projects`, form, authConfig())
      setShowNew(false)
      await loadProjects()
      openDetail(data.id)
      showToast('success', 'プロジェクトを作成しました')
    } catch (e) {
      showToast('error', e.response?.data?.error || '作成に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  const deleteProject = async (p) => {
    if (!window.confirm(`「${p.name}」を削除します。よろしいですか？`)) return
    setBusy(true)
    try {
      await axios.delete(`${apiUrl}/api/quote-compare/projects/${p.id}`, authConfig())
      if (detail?.id === p.id) setDetail(null)
      await loadProjects()
      showToast('success', '削除しました')
    } catch (e) {
      showToast('error', e.response?.data?.error || '削除に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  // ── 原本数量書 取込 ──
  const importTemplate = async (file) => {
    if (!file) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await axios.post(
        `${apiUrl}/api/quote-compare/projects/${detail.id}/import-template`, fd, authConfig())
      await refreshDetail()
      showToast('success', `数量書を取込みました（${data.line_count}行）`)
    } catch (e) {
      showToast('error', e.response?.data?.error || '取込に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  // ── 業者追加＋自動分類 ──
  const addVendor = async ({ name, files }) => {
    if (!name.trim()) { showToast('error', '業者名は必須です'); return }
    if (!files || !files.length) { showToast('error', '見積ファイルを選択してください'); return }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('name', name)
      for (const f of files) fd.append('files', f)
      const { data } = await axios.post(
        `${apiUrl}/api/quote-compare/projects/${detail.id}/vendors`, fd, authConfig())
      setShowAddVendor(false)
      await refreshDetail()
      const low = data.classify_confidence === 'low'
      showToast(low ? 'error' : 'success',
        low ? `自動判定: ${CLASS_LABEL[data.class_no]}（確信度 低・要確認）` : `自動判定: ${CLASS_LABEL[data.class_no]}`)
    } catch (e) {
      showToast('error', e.response?.data?.error || '業者の追加に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  const reclassify = async (vendor, patch) => {
    setBusy(true)
    try {
      await axios.patch(`${apiUrl}/api/quote-compare/vendors/${vendor.id}/classification`, patch, authConfig())
      await refreshDetail()
    } catch (e) {
      showToast('error', e.response?.data?.error || '分類の更新に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  const deleteVendor = async (vendor) => {
    if (!window.confirm(`「${vendor.name}」を削除します。よろしいですか？`)) return
    setBusy(true)
    try {
      await axios.delete(`${apiUrl}/api/quote-compare/vendors/${vendor.id}`, authConfig())
      await refreshDetail()
    } catch (e) {
      showToast('error', e.response?.data?.error || '削除に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  // ── 一覧ビュー ──
  if (!detail) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6">
        <Toast toast={toast} />
        <div className="flex items-center justify-between mb-5">
          <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
            <ArrowLeft className="w-4 h-4" />ダッシュボード
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-700">
            <Plus className="w-4 h-4" />新規比較
          </button>
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-1">見積比較</h1>
        <p className="text-sm text-slate-500 mb-5">相見積の単価を発注者の数量書に当てて横並び比較し、最安見積を作成します（築城方式）。</p>

        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-12 justify-center"><Loader2 className="w-4 h-4 animate-spin" />読込中…</div>
        ) : projects.length === 0 ? (
          <div className="text-center text-slate-400 text-sm py-16 border border-dashed border-slate-200 dark:border-ink-700 rounded-2xl">
            まだ比較プロジェクトがありません。「新規比較」から作成してください。
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => openDetail(p.id)}
                className="text-left rounded-2xl border border-slate-200 dark:border-ink-700 bg-white dark:bg-ink-800 p-4 hover:border-brand-400 transition">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-900 dark:text-white">{p.name}</span>
                  {p.discipline && <Badge tone="info">{p.discipline}</Badge>}
                </div>
                <div className="text-xs text-slate-500 mt-1">{p.client || '発注者未設定'}</div>
                <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                  <span>業者 {p.vendor_count} 社</span>
                  <span>直接工事費 {yen(p.boq_total)}</span>
                  <span>{p.boq_imported_at ? '数量書 取込済' : '数量書 未取込'}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {showNew && <NewProjectModal busy={busy} onClose={() => setShowNew(false)} onSubmit={createProject} />}
      </div>
    )
  }

  // ── 詳細ビュー ──
  const vendors = detail.vendors || []
  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <Toast toast={toast} />
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => { setDetail(null); loadProjects() }} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
          <ArrowLeft className="w-4 h-4" />一覧へ
        </button>
        <button
          onClick={() => deleteProject(detail)}
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-danger-600">
          <Trash2 className="w-4 h-4" />プロジェクト削除
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-1">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">{detail.name}</h1>
        {detail.discipline && <Badge tone="info">{detail.discipline}</Badge>}
      </div>
      <div className="text-sm text-slate-500 mb-4">{detail.client || '発注者未設定'}</div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <KPI label="業者数" value={`${vendors.length} 社`} />
        <KPI label="直接工事費" value={yen(detail.boq_total)} />
        <KPI label="BOQ行数" value={`${detail.boq_row_count ?? 0} 行`} />
      </div>

      {/* タブ */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-ink-700 mb-4">
        {[
          { key: 'boq', label: '数量書', icon: Layers },
          { key: 'vendors', label: `業者・分類${vendors.length ? `（${vendors.length}）` : ''}`, icon: FileText },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition
              ${tab === t.key
                ? 'border-brand-600 text-brand-700 dark:text-brand-300'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {/* タブ1: 数量書（原本取込＝比較の骨格） */}
      {tab === 'boq' && (
        <div>
          <div className="rounded-2xl border border-slate-200 dark:border-ink-700 bg-white dark:bg-ink-800 p-4 mb-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-accent-500" />入札時積算数量書（原本）
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {boq?.template_filename
                    ? `取込済: ${boq.template_filename}（${boq.rows?.length || 0}行・直接工事費 ${yen(boq.total)}）`
                    : 'xlsx を取込むと、各社見積を当てる比較の骨格（BOQ行）になります。'}
                </div>
              </div>
              <label className="inline-flex items-center gap-2 rounded-xl bg-brand-600 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-700 cursor-pointer">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {boq?.template_filename ? '再取込' : '原本を取込'}
                <input type="file" accept=".xlsx,.xlsm" className="hidden" disabled={busy}
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; importTemplate(f) }} />
              </label>
            </div>
          </div>

          {boq?.rows?.length ? (
            <BoqPreview rows={boq.rows} />
          ) : (
            <div className="text-center text-slate-400 text-sm py-12 border border-dashed border-slate-200 dark:border-ink-700 rounded-2xl">
              数量書が未取込です。
            </div>
          )}
        </div>
      )}

      {/* タブ2: 業者・分類（6類型 自動判定＋確認） */}
      {tab === 'vendors' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-slate-500">
              アップロード直後に6類型を自動判定します。<span className="text-danger-600 dark:text-danger-400 font-semibold">誤分類は以降の抽出・照合を総崩れさせる</span>ため、必ず確認してください。
            </p>
            <button
              onClick={() => setShowAddVendor(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-700 shrink-0">
              <Plus className="w-4 h-4" />業者追加
            </button>
          </div>
          {vendors.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-12 border border-dashed border-slate-200 dark:border-ink-700 rounded-2xl">
              業者が未登録です。「業者追加」から見積をアップロードしてください。
            </div>
          ) : (
            <div className="grid gap-3">
              {vendors.map((v) => (
                <VendorCard key={v.id} vendor={v} busy={busy} onReclassify={reclassify} onDelete={deleteVendor} />
              ))}
            </div>
          )}
        </div>
      )}

      {showAddVendor && <AddVendorModal busy={busy} onClose={() => setShowAddVendor(false)} onSubmit={addVendor} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
function KPI({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-ink-700 bg-white dark:bg-ink-800 p-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">{value}</div>
    </div>
  )
}

// 数量書 4階層の簡易プレビュー（インデント表示）。フル比較表示は P1。
function BoqPreview({ rows }) {
  const [open, setOpen] = useState(false)
  const shown = open ? rows : rows.slice(0, 30)
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-ink-700 bg-white dark:bg-ink-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-ink-900 text-slate-500">
            <tr>
              <th className="text-left font-semibold px-3 py-2">名称</th>
              <th className="text-right font-semibold px-3 py-2 whitespace-nowrap">数量</th>
              <th className="text-left font-semibold px-3 py-2 whitespace-nowrap">単位</th>
              <th className="text-left font-semibold px-3 py-2 whitespace-nowrap">シート/行</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 dark:border-ink-700">
                <td className="px-3 py-1.5 text-slate-800 dark:text-slate-200" style={{ paddingLeft: `${12 + (r.level || 0) * 16}px` }}>
                  <span className="text-slate-400 text-xs mr-1">{r.kind}</span>{r.item_name}
                </td>
                <td className="px-3 py-1.5 text-right text-slate-600 dark:text-slate-300 whitespace-nowrap">{r.quantity_num ?? '—'}</td>
                <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">{r.unit || ''}</td>
                <td className="px-3 py-1.5 text-slate-400 text-xs whitespace-nowrap">{r.sheet_name || '—'}{r.excel_row ? ` / ${r.excel_row}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 30 && (
        <button onClick={() => setOpen((o) => !o)} className="w-full py-2 text-xs font-semibold text-brand-700 dark:text-brand-300 hover:bg-slate-50 dark:hover:bg-ink-700 border-t border-slate-100 dark:border-ink-700">
          {open ? '折りたたむ' : `すべて表示（残り ${rows.length - 30} 行）`}
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
function NewProjectModal({ onClose, onSubmit, busy }) {
  const [form, setForm] = useState({ name: '', client: '', discipline: '' })
  return (
    <ModalShell title="新規 見積比較" onClose={onClose}>
      <div className="grid gap-4">
        <Field label="プロジェクト名" hint="例: 築城(8)宿舎改修 その1 建築">
          <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        </Field>
        <Field label="発注者" hint="任意">
          <input className={inputCls} value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} placeholder="例: 九州防衛局" />
        </Field>
        <Field label="分野" hint="任意">
          <select className={inputCls} value={form.discipline} onChange={(e) => setForm({ ...form, discipline: e.target.value })}>
            <option value="">未設定</option>
            {DISCIPLINES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-ink-700">キャンセル</button>
          <button onClick={() => onSubmit(form)} disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}作成
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

function AddVendorModal({ onClose, onSubmit, busy }) {
  const [name, setName] = useState('')
  const [files, setFiles] = useState([])
  const inputRef = useRef(null)
  return (
    <ModalShell title="業者を追加（見積アップロード）" onClose={onClose}>
      <div className="grid gap-4">
        <Field label="業者名">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="例: ギケンテック" />
        </Field>
        <Field label="見積ファイル" hint="Excel または PDF（1業者＝1アップロード）。複数ファイル可">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".xlsx,.xlsm,.pdf"
            className={inputCls}
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
          />
        </Field>
        {files.length > 0 && (
          <div className="text-xs text-slate-500">
            {files.map((f) => f.name).join(', ')}
          </div>
        )}
        <p className="text-xs text-slate-400">
          アップロード後、6類型（書式軸×媒体軸）を自動判定します。判定が違う場合は業者カードのトグルで上書きできます。
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-ink-700">キャンセル</button>
          <button onClick={() => onSubmit({ name, files })} disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}追加して分類
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
