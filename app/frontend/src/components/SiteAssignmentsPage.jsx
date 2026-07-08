import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import axios from 'axios'
import {
  ArrowLeft, HardHat, Users, RefreshCw, Plus, Pencil, Trash2,
  Loader2, ChevronLeft, ChevronRight, ChevronDown, Check,
} from 'lucide-react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import Toast from './ui/Toast'
import ModalShell from './ui/ModalShell'
import { API_URL as apiUrl, authConfig } from '../lib/api'
import { useToast } from '../lib/useToast'

const WEEK = ['日', '月', '火', '水', '木', '金', '土']

// 'YYYY-MM-DD' → 曜日つき表記＋相対ラベル（本日/明日）
function fmtDate(d) {
  if (!d) return ''
  const dt = new Date(`${d}T00:00:00+09:00`)
  const label = `${dt.getMonth() + 1}月${dt.getDate()}日（${WEEK[dt.getDay()]}）`
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
  const tomorrow = new Date(Date.now() + 9 * 3600 * 1000 + 24 * 3600 * 1000).toISOString().slice(0, 10)
  if (d === today) return `${label}・本日`
  if (d === tomorrow) return `${label}・明日`
  return label
}

// 人員1名の表示。協力会社=琥珀色＋人数、名簿未一致の個人=グレー＋注記。
function MemberChip({ m }) {
  if (m.company) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
        {m.name}{m.count > 1 && <span className="text-xs opacity-80">{m.count}名</span>}
      </span>
    )
  }
  const unmatched = m.matched === false
  const cls = unmatched
    ? 'bg-slate-100 text-slate-500 dark:bg-ink-700 dark:text-slate-400'
    : 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium ${cls}`}
      title={unmatched ? `社員名簿に一致せず（元の呼び名: ${m.raw_name || m.name}）` : (m.raw_name && m.raw_name !== m.name ? `元の呼び名: ${m.raw_name}` : undefined)}
    >
      {m.name}{unmatched && <span className="text-xs">?</span>}
    </span>
  )
}

// 氏名欄のコンボボックス。タップで社員一覧が開き、入力で絞り込み。
// 名簿外（協力会社・応援）はそのまま自由入力も可。
function StaffNameInput({ value, staffOptions, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('touchstart', onDoc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('touchstart', onDoc)
    }
  }, [])

  const qRaw = (value || '').trim()
  const isExact = staffOptions.includes(qRaw)
  // 敬称（さん/くん等）を外し、空白を無視して部分一致で絞り込む。
  const norm = (s) => s.replace(/\s/g, '')
  const q = norm(qRaw.replace(/(さん|くん|君|ちゃん|様|氏)$/,''))
  let filtered = (!qRaw || isExact) ? staffOptions : staffOptions.filter((n) => norm(n).includes(q))
  // 絞り込みで0件になったら全社員を出す（一覧が空で選べなくならないように）
  if (!isExact && filtered.length === 0) filtered = staffOptions

  return (
    <div className="relative flex-1 min-w-0" ref={ref}>
      <input
        className="w-full rounded-lg border border-slate-300 dark:border-ink-600 bg-white dark:bg-ink-800 px-2 py-1.5 pr-7 text-sm"
        placeholder="社員を選択 / 協力会社名"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
      />
      <button type="button" tabIndex={-1} aria-label="社員一覧" onClick={() => setOpen((v) => !v)}
        className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-slate-400">
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 dark:border-ink-600 bg-white dark:bg-ink-800 shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-400">該当なし（自由入力できます）</div>
          ) : (
            filtered.map((n) => (
              <button key={n} type="button"
                onClick={() => { onChange(n); setOpen(false) }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-brand-50 dark:hover:bg-brand-500/15">
                <span>{n}</span>
                {q === n && <Check className="w-4 h-4 text-brand-500" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// 人員配列の編集UI（名前／協力会社／人数）。
function MembersEditor({ members, onChange, staffOptions = [] }) {
  const update = (i, key, val) => onChange(members.map((m, idx) => (idx === i ? { ...m, [key]: val } : m)))
  const remove = (i) => onChange(members.filter((_, idx) => idx !== i))
  const add = () => onChange([...members, { name: '', company: '', count: 1 }])
  return (
    <div className="space-y-2">
      {members.map((m, i) => {
        const isStaff = staffOptions.includes((m.name || '').trim())
        return (
          <div key={i} className="flex items-center gap-2">
            <StaffNameInput value={m.name} staffOptions={staffOptions} onChange={(val) => update(i, 'name', val)} />
            <span className={`shrink-0 text-xs w-8 text-center ${isStaff ? 'text-success-600 dark:text-success-400' : 'text-slate-300 dark:text-slate-600'}`}>
              {isStaff ? '社員' : ''}
            </span>
            <input className="w-24 rounded-lg border border-slate-300 dark:border-ink-600 bg-white dark:bg-ink-800 px-2 py-1.5 text-sm"
              placeholder="協力会社" value={m.company || ''} onChange={(e) => update(i, 'company', e.target.value)} />
            <input type="number" min="1"
              className="w-16 rounded-lg border border-slate-300 dark:border-ink-600 bg-white dark:bg-ink-800 px-2 py-1.5 text-sm tabular-nums"
              value={m.count ?? 1} onChange={(e) => update(i, 'count', Math.max(1, parseInt(e.target.value, 10) || 1))} />
            <button type="button" onClick={() => remove(i)} aria-label="削除" className="shrink-0 p-1.5 text-slate-400 hover:text-danger-500">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )
      })}
      <Button variant="secondary" size="sm" onClick={add}><Plus className="w-4 h-4" />人員を追加</Button>
      <p className="text-xs text-slate-400">氏名欄をタップすると社員一覧が開きます。協力会社はそのまま会社名を入力し、人数欄に人数を入れてください（例: 福建工業 5）。</p>
    </div>
  )
}

export default function SiteAssignmentsPage({ onBack }) {
  const [data, setData] = useState({ work_date: '', dates: [], assignments: [], total: 0, site_count: 0 })
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState(null)
  const [expanded, setExpanded] = useState(null) // 元メッセージを開いている行id
  const [staffOptions, setStaffOptions] = useState([]) // 氏名ピッカー用の社員名リスト
  const { toast, showToast } = useToast()

  const load = useCallback(async (date) => {
    setLoading(true)
    try {
      const q = date ? `?date=${date}` : ''
      const res = await axios.get(`${apiUrl}/api/site-assignments${q}`, authConfig())
      setData(res.data)
    } catch (e) {
      showToast('error', e.response?.data?.error || '人員配置の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    load()
    axios.get(`${apiUrl}/api/my-permissions`, authConfig())
      .then((res) => {
        const admin = res.data?.role === 'admin'
        setIsAdmin(admin)
        if (admin) {
          // 管理者のみ氏名ピッカー用の社員一覧を取得
          axios.get(`${apiUrl}/api/site-assignments/staff`, authConfig())
            .then((r) => setStaffOptions((r.data || []).map((s) => s.name)))
            .catch(() => setStaffOptions([]))
        }
      })
      .catch(() => setIsAdmin(false))
  }, [load])

  const dates = data.dates || []
  const idx = dates.indexOf(data.work_date)
  const goPrev = () => { if (idx >= 0 && idx < dates.length - 1) load(dates[idx + 1]) } // dates は新しい順
  const goNext = () => { if (idx > 0) load(dates[idx - 1]) }

  const reExtract = async () => {
    setBusy(true)
    try {
      const res = await axios.post(`${apiUrl}/api/site-assignments/extract`, {}, authConfig())
      showToast('success', `抽出しました（${res.data.work_date}：${res.data.sites}現場・延べ${res.data.total}名）`)
      await load(res.data.work_date)
    } catch (e) {
      showToast('error', e.response?.data?.error || '抽出に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  const saveEdit = async () => {
    const body = {
      site_name: edit.site_name,
      work_content: edit.work_content,
      members: (edit.members || []).filter((m) => (m.name || '').trim()),
    }
    try {
      if (edit.id) await axios.put(`${apiUrl}/api/site-assignments/${edit.id}`, body, authConfig())
      else await axios.post(`${apiUrl}/api/site-assignments`, { ...body, work_date: data.work_date }, authConfig())
      setEdit(null)
      showToast('success', '保存しました')
      await load(data.work_date)
    } catch (e) {
      showToast('error', e.response?.data?.error || '保存に失敗しました')
    }
  }

  const removeRow = async (row) => {
    if (!window.confirm(`「${row.site_name}」を削除しますか？`)) return
    try {
      await axios.delete(`${apiUrl}/api/site-assignments/${row.id}`, authConfig())
      showToast('success', '削除しました')
      await load(data.work_date)
    } catch (e) {
      showToast('error', e.response?.data?.error || '削除に失敗しました')
    }
  }

  const assignments = data.assignments || []
  const colSpan = isAdmin ? 5 : 4

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-ink-950 transition-colors">
      <header className="bg-white/80 dark:bg-ink-900/80 backdrop-blur border-b border-slate-200 dark:border-ink-800 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4" />戻る</Button>
          <div className="flex items-center gap-2">
            <HardHat className="w-5 h-5 text-brand-500" />
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">翌日の人員配置</h1>
          </div>
          {isAdmin && (
            <div className="ml-auto">
              <Button variant="secondary" size="sm" onClick={reExtract} disabled={busy}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                <span className="hidden sm:inline">メッセージから再抽出</span>
              </Button>
            </div>
          )}
        </div>
      </header>

      {toast && <Toast toast={toast} />}

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* 日付ナビ＋サマリ */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="flex items-center gap-1">
            <button onClick={goPrev} disabled={idx < 0 || idx >= dates.length - 1} aria-label="前の作業日"
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-ink-800 disabled:opacity-30">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <select value={data.work_date || ''} onChange={(e) => load(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-ink-600 bg-white dark:bg-ink-800 px-3 py-2 text-sm font-bold text-slate-900 dark:text-white">
              {dates.length === 0 && <option value="">—</option>}
              {dates.map((d) => <option key={d} value={d}>{fmtDate(d)}</option>)}
            </select>
            <button onClick={goNext} disabled={idx <= 0} aria-label="次の作業日"
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-ink-800 disabled:opacity-30">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Badge tone="info">{data.site_count || 0} 現場</Badge>
            <Badge tone="success"><Users className="w-3.5 h-3.5" />延べ {data.total || 0} 名</Badge>
          </div>
          {isAdmin && data.work_date && (
            <div className="ml-auto">
              <Button variant="secondary" size="sm" onClick={() => setEdit({ site_name: '', work_content: '', members: [] })}>
                <Plus className="w-4 h-4" />現場を追加
              </Button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="text-center py-20">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-brand-500" />
            <p className="text-slate-500 dark:text-slate-400 mt-3">読み込み中...</p>
          </div>
        ) : assignments.length === 0 ? (
          <Card className="p-10 text-center text-slate-400 dark:text-slate-500">
            <HardHat className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>この日の人員配置はまだありません。</p>
            <p className="text-xs mt-1">グループLINEに翌日の報告が投稿され、夜20時に自動集計されます。</p>
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-ink-800/60 text-slate-500 dark:text-slate-400 text-left">
                    <th className="px-4 py-3 font-semibold">現場</th>
                    <th className="px-4 py-3 font-semibold">作業内容</th>
                    <th className="px-4 py-3 font-semibold">人員</th>
                    <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">人数</th>
                    {isAdmin && <th className="px-4 py-3 font-semibold text-right">操作</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-ink-700">
                  {assignments.map((row) => (
                    <Fragment key={row.id}>
                      <tr className="align-top hover:bg-slate-50/60 dark:hover:bg-ink-800/30">
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                            className="flex items-start gap-1 text-left font-bold text-slate-900 dark:text-white"
                            title="元のメッセージを表示"
                          >
                            <ChevronDown className={`w-4 h-4 mt-0.5 shrink-0 text-slate-400 transition-transform ${expanded === row.id ? '' : '-rotate-90'}`} />
                            <span>
                              {row.site_name}
                              {row.edited && <Badge tone="warning" className="ml-1 align-middle">修正済</Badge>}
                            </span>
                          </button>
                          {row.source_sender && (
                            <div className="text-xs text-slate-400 mt-1 pl-5">報告: {row.source_sender}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-pre-wrap min-w-[10rem]">
                          {row.work_content || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {(row.members || []).map((m, i) => <MemberChip key={i} m={m} />)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white tabular-nums whitespace-nowrap">
                          {row.member_count}
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => setEdit({ ...row, members: row.members || [] })} aria-label="編集"
                                className="p-1.5 text-slate-400 hover:text-brand-500"><Pencil className="w-4 h-4" /></button>
                              <button onClick={() => removeRow(row)} aria-label="削除"
                                className="p-1.5 text-slate-400 hover:text-danger-500"><Trash2 className="w-4 h-4" /></button>
                            </div>
                          </td>
                        )}
                      </tr>
                      {expanded === row.id && row.raw_text && (
                        <tr className="bg-slate-50 dark:bg-ink-800/40">
                          <td colSpan={colSpan} className="px-4 py-3">
                            <p className="text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap">
                              <span className="font-semibold">元のメッセージ：</span>{'\n'}{row.raw_text}
                            </p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 dark:bg-ink-800/60 font-bold text-slate-900 dark:text-white">
                    <td className="px-4 py-3" colSpan={colSpan - 2}>合計</td>
                    <td className="px-4 py-3 text-right">{data.site_count} 現場</td>
                    <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">延べ {data.total} 名</td>
                    {isAdmin && <td />}
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        )}

        <p className="text-xs text-slate-400 dark:text-slate-500 mt-6">
          グループLINEの夜の報告をAIが読み取り、社員名簿と照合して正式氏名で集計しています（毎晩20時締め）。
          「?」付き・グレーの氏名は名簿と一致しなかった呼び名です。{isAdmin ? '各行の編集ボタンから修正できます。' : '修正は管理者へ。'}
        </p>
      </main>

      {edit && (
        <ModalShell title={edit.id ? '現場の人員を編集' : '現場を追加'} onClose={() => setEdit(null)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">現場名</label>
              <input className="w-full rounded-lg border border-slate-300 dark:border-ink-600 bg-white dark:bg-ink-800 px-3 py-2 text-sm"
                value={edit.site_name || ''} onChange={(e) => setEdit({ ...edit, site_name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">作業内容</label>
              <textarea rows={2} className="w-full rounded-lg border border-slate-300 dark:border-ink-600 bg-white dark:bg-ink-800 px-3 py-2 text-sm"
                value={edit.work_content || ''} onChange={(e) => setEdit({ ...edit, work_content: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">人員</label>
              <MembersEditor members={edit.members || []} staffOptions={staffOptions} onChange={(members) => setEdit({ ...edit, members })} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEdit(null)}>キャンセル</Button>
              <Button variant="primary" onClick={saveEdit} disabled={!(edit.site_name || '').trim()}>保存</Button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
