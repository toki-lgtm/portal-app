import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  ArrowLeft, HardHat, Users, RefreshCw, Plus, Pencil, Trash2,
  Loader2, ChevronLeft, ChevronRight,
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

// 人員1名を表すチップ。協力会社（company あり）は色を変えて人数を添える。
function MemberChip({ m }) {
  const isPartner = !!m.company
  const cls = isPartner
    ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200'
    : 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-medium ${cls}`}>
      {m.name}
      {isPartner && m.count > 1 && <span className="text-xs opacity-80">{m.count}名</span>}
    </span>
  )
}

// 人員配列の編集UI（名前／協力会社／人数）。
function MembersEditor({ members, onChange }) {
  const update = (i, key, val) => {
    const next = members.map((m, idx) => (idx === i ? { ...m, [key]: val } : m))
    onChange(next)
  }
  const remove = (i) => onChange(members.filter((_, idx) => idx !== i))
  const add = () => onChange([...members, { name: '', company: '', count: 1 }])

  return (
    <div className="space-y-2">
      {members.map((m, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            className="flex-1 min-w-0 rounded-lg border border-slate-300 dark:border-ink-600 bg-white dark:bg-ink-800 px-2 py-1.5 text-sm"
            placeholder="名前 / 協力会社名"
            value={m.name}
            onChange={(e) => update(i, 'name', e.target.value)}
          />
          <input
            className="w-24 rounded-lg border border-slate-300 dark:border-ink-600 bg-white dark:bg-ink-800 px-2 py-1.5 text-sm"
            placeholder="協力会社"
            value={m.company || ''}
            onChange={(e) => update(i, 'company', e.target.value)}
          />
          <input
            type="number"
            min="1"
            className="w-16 rounded-lg border border-slate-300 dark:border-ink-600 bg-white dark:bg-ink-800 px-2 py-1.5 text-sm tabular-nums"
            value={m.count ?? 1}
            onChange={(e) => update(i, 'count', Math.max(1, parseInt(e.target.value, 10) || 1))}
          />
          <button type="button" onClick={() => remove(i)} aria-label="削除"
            className="shrink-0 p-1.5 text-slate-400 hover:text-danger-500">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <Button variant="secondary" size="sm" onClick={add}>
        <Plus className="w-4 h-4" />人員を追加
      </Button>
      <p className="text-xs text-slate-400">
        協力会社をまとめて数える場合は「協力会社」に会社名、人数欄に人数を入れてください（例: 福建工業さん 5）。
      </p>
    </div>
  )
}

export default function SiteAssignmentsPage({ onBack }) {
  const [data, setData] = useState({ work_date: '', dates: [], assignments: [], total: 0, site_count: 0 })
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState(null) // 編集/追加モーダルの対象（{id?, work_date, site_name, work_content, members}）
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
      .then((res) => setIsAdmin(res.data?.role === 'admin'))
      .catch(() => setIsAdmin(false))
  }, [load])

  // 日付ナビ（登録のある作業日の中を前後移動）
  const dates = data.dates || []
  const idx = dates.indexOf(data.work_date)
  const goPrev = () => { if (idx >= 0 && idx < dates.length - 1) load(dates[idx + 1]) } // dates は新しい順
  const goNext = () => { if (idx > 0) load(dates[idx - 1]) }

  // 管理者：今夜（本日）の報告から再抽出 → 翌営業日ぶんを作り直して表示
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
      if (edit.id) {
        await axios.put(`${apiUrl}/api/site-assignments/${edit.id}`, body, authConfig())
      } else {
        await axios.post(`${apiUrl}/api/site-assignments`, { ...body, work_date: data.work_date }, authConfig())
      }
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

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-ink-950 transition-colors">
      {/* ヘッダー */}
      <header className="bg-white/80 dark:bg-ink-900/80 backdrop-blur border-b border-slate-200 dark:border-ink-800 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />戻る
          </Button>
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
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex items-center gap-1">
            <button onClick={goPrev} disabled={idx < 0 || idx >= dates.length - 1} aria-label="前の作業日"
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-ink-800 disabled:opacity-30">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <select
              value={data.work_date || ''}
              onChange={(e) => load(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-ink-600 bg-white dark:bg-ink-800 px-3 py-2 text-sm font-bold text-slate-900 dark:text-white"
            >
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
              <Button variant="secondary" size="sm"
                onClick={() => setEdit({ site_name: '', work_content: '', members: [] })}>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {assignments.map((row) => (
              <Card key={row.id} className="p-5">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-bold text-slate-900 dark:text-white text-lg leading-snug">{row.site_name}</h3>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge tone="neutral">{row.member_count} 名</Badge>
                    {row.edited && <Badge tone="warning">修正済</Badge>}
                  </div>
                </div>
                {row.work_content && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-3 whitespace-pre-wrap">{row.work_content}</p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {(row.members || []).map((m, i) => <MemberChip key={i} m={m} />)}
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-ink-700">
                  <span className="text-xs text-slate-400">
                    {row.source_sender ? `報告: ${row.source_sender}` : ''}
                    {row.group_name ? ` ・ ${row.group_name}` : ''}
                  </span>
                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEdit({ ...row, members: row.members || [] })}
                        aria-label="編集" className="p-1.5 text-slate-400 hover:text-brand-500">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => removeRow(row)}
                        aria-label="削除" className="p-1.5 text-slate-400 hover:text-danger-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
                {row.raw_text && (
                  <details className="mt-2">
                    <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600 dark:hover:text-slate-300">
                      元のメッセージを表示
                    </summary>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 whitespace-pre-wrap bg-slate-50 dark:bg-ink-800/60 rounded-lg p-2">
                      {row.raw_text}
                    </p>
                  </details>
                )}
              </Card>
            ))}
          </div>
        )}

        <p className="text-xs text-slate-400 dark:text-slate-500 mt-8 text-center">
          グループLINEの夜の報告をAIが読み取って自動集計しています（毎晩20時締め）。
          読み取り違いがあれば{isAdmin ? '各現場の編集ボタンから修正できます。' : '管理者に修正を依頼してください。'}
        </p>
      </main>

      {/* 編集／追加モーダル */}
      {edit && (
        <ModalShell
          title={edit.id ? '現場の人員を編集' : '現場を追加'}
          onClose={() => setEdit(null)}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">現場名</label>
              <input
                className="w-full rounded-lg border border-slate-300 dark:border-ink-600 bg-white dark:bg-ink-800 px-3 py-2 text-sm"
                value={edit.site_name || ''}
                onChange={(e) => setEdit({ ...edit, site_name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">作業内容</label>
              <textarea
                rows={2}
                className="w-full rounded-lg border border-slate-300 dark:border-ink-600 bg-white dark:bg-ink-800 px-3 py-2 text-sm"
                value={edit.work_content || ''}
                onChange={(e) => setEdit({ ...edit, work_content: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">人員</label>
              <MembersEditor members={edit.members || []} onChange={(members) => setEdit({ ...edit, members })} />
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
