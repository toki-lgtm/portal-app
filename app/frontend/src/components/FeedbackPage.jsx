import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  ArrowLeft, Plus, X, Save, Loader2, Bug, Lightbulb, Upload, Trash2,
  Download, Copy, Image as ImageIcon, ChevronRight,
} from 'lucide-react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import Toast from './ui/Toast'
import ModalShell from './ui/ModalShell'
import Field from './ui/Field'
import { API_URL as apiUrl, authConfig, authConfigMultipart } from '../lib/api'
import { inputCls } from '../lib/ui'

// 対象アプリの選択肢（server.js の FEEDBACK_APP_LABELS と一致させる）
const APP_OPTIONS = [
  { key: 'portal', label: 'ポータル全般' },
  { key: 'safety-patrol', label: '安全パトロール' },
  { key: 'employee-list', label: '社員一覧' },
  { key: 'announcements', label: 'お知らせ' },
  { key: 'bids', label: '入札案件管理' },
  { key: 'other', label: 'その他' },
]
const APP_LABEL = Object.fromEntries(APP_OPTIONS.map((a) => [a.key, a.label]))

const STATUS_DEFS = [
  { key: 'new', label: '未対応', tone: 'warning' },
  { key: 'triaged', label: '確認済', tone: 'info' },
  { key: 'in_progress', label: '対応中', tone: 'info' },
  { key: 'done', label: '完了', tone: 'success' },
  { key: 'wont_fix', label: '対応しない', tone: 'neutral' },
]
const STATUS_MAP = Object.fromEntries(STATUS_DEFS.map((s) => [s.key, s]))
const SEVERITY_OPTIONS = [
  { key: 'low', label: '低（軽微）' },
  { key: 'medium', label: '中' },
  { key: 'high', label: '高' },
  { key: 'critical', label: '致命的（業務停止）' },
]
const FREQ_OPTIONS = [
  { key: 'always', label: '毎回' },
  { key: 'sometimes', label: '時々' },
  { key: 'once', label: '一度だけ' },
]
const PRIORITY_OPTIONS = [
  { key: 'low', label: '低' },
  { key: 'normal', label: '通常' },
  { key: 'high', label: '高' },
]

function fmtDateTime(d) {
  if (!d) return ''
  const dt = new Date(d)
  return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
}

// 報告時に自動取得する発生環境
function captureEnv() {
  return {
    page_url: window.location.href,
    user_agent: navigator.userAgent,
    screen_info: `画面 ${window.screen.width}×${window.screen.height} / 表示 ${window.innerWidth}×${window.innerHeight}`,
    app_version: import.meta.env.VITE_APP_VERSION || null,
  }
}


function StatusBadge({ status }) {
  const def = STATUS_MAP[status] || { label: status, tone: 'neutral' }
  return <Badge tone={def.tone}>{def.label}</Badge>
}

// 投稿フォーム
function SubmitModal({ onClose, onSubmitted, showToast }) {
  const [type, setType] = useState('bug')
  const [form, setForm] = useState({
    title: '', app_key: 'portal', app_label: '', description: '',
    steps: '', expected: '', actual: '', severity: '', frequency: '',
  })
  const [shots, setShots] = useState([]) // {url}
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setUploading(true)
    try {
      const urls = []
      for (const file of files) {
        const fd = new FormData()
        fd.append('photo', file)
        const res = await axios.post(`${apiUrl}/api/feedback/upload-photo`, fd, authConfigMultipart())
        urls.push(res.data.url)
      }
      setShots((s) => [...s, ...urls])
    } catch (err) {
      showToast('error', '画像のアップロードに失敗しました')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const submit = async () => {
    if (!form.title.trim()) { showToast('error', 'タイトルを入力してください'); return }
    setSaving(true)
    try {
      await axios.post(`${apiUrl}/api/feedback`, {
        type,
        ...form,
        screenshot_urls: shots,
        ...captureEnv(),
      }, authConfig())
      showToast('success', '報告を送信しました。ありがとうございます！')
      // 閉じる処理は onSubmitted 側に委ねる（キャンセル時の onClose と挙動を分けるため）
      onSubmitted()
    } catch (err) {
      showToast('error', err.response?.data?.error || '送信に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const isBug = type === 'bug'
  return (
    <ModalShell title="バグ報告・改善要望を送る" onClose={onClose} maxWidthOverride="max-w-xl">
      <div className="space-y-4">
        {/* 種別トグル */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { k: 'bug', label: 'バグ報告', icon: Bug, desc: '不具合・エラー' },
            { k: 'improvement', label: '改善要望', icon: Lightbulb, desc: 'こうしてほしい' },
          ].map(({ k, label, icon: Icon, desc }) => (
            <button
              key={k}
              type="button"
              onClick={() => setType(k)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition
                ${type === k
                  ? 'border-brand-400 bg-brand-50 dark:bg-brand-500/15 ring-2 ring-brand-400/40'
                  : 'border-slate-200 dark:border-ink-600 hover:bg-slate-50 dark:hover:bg-ink-700'}`}
            >
              <Icon className={`w-5 h-5 ${type === k ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400'}`} />
              <span>
                <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">{label}</span>
                <span className="block text-xs text-slate-400">{desc}</span>
              </span>
            </button>
          ))}
        </div>

        <Field label="タイトル *" hint="一行で要点を">
          <input className={inputCls} value={form.title} onChange={(e) => set('title', e.target.value)}
            placeholder={isBug ? '例: 入札一覧で金額が二重に表示される' : '例: 点検報告をまとめてPDF出力したい'} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="対象アプリ">
            <select className={inputCls} value={form.app_key} onChange={(e) => set('app_key', e.target.value)}>
              {APP_OPTIONS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
          </Field>
          {form.app_key === 'other' && (
            <Field label="アプリ名（その他）">
              <input className={inputCls} value={form.app_label} onChange={(e) => set('app_label', e.target.value)} />
            </Field>
          )}
        </div>

        <Field label={isBug ? '何が起きましたか *' : 'どうしたいですか *'}>
          <textarea className={inputCls} rows={3} value={form.description} onChange={(e) => set('description', e.target.value)}
            placeholder={isBug ? '状況をできるだけ具体的に' : '目的・背景も書いていただけると助かります'} />
        </Field>

        {isBug && (
          <>
            <Field label="再現手順" hint="①②③… の順で">
              <textarea className={inputCls} rows={3} value={form.steps} onChange={(e) => set('steps', e.target.value)}
                placeholder={'例:\n1. 入札案件管理を開く\n2. 一覧の金額列を見る'} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="期待する動作">
                <textarea className={inputCls} rows={2} value={form.expected} onChange={(e) => set('expected', e.target.value)} />
              </Field>
              <Field label="実際の動作">
                <textarea className={inputCls} rows={2} value={form.actual} onChange={(e) => set('actual', e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="深刻度">
                <select className={inputCls} value={form.severity} onChange={(e) => set('severity', e.target.value)}>
                  <option value="">未選択</option>
                  {SEVERITY_OPTIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </Field>
              <Field label="発生頻度">
                <select className={inputCls} value={form.frequency} onChange={(e) => set('frequency', e.target.value)}>
                  <option value="">未選択</option>
                  {FREQ_OPTIONS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
              </Field>
            </div>
          </>
        )}

        {/* スクリーンショット */}
        <Field label="スクリーンショット" hint="画面の写真があると解決が早くなります">
          <div className="flex flex-wrap gap-2 items-center">
            {shots.map((url, i) => (
              <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200 dark:border-ink-600">
                <img src={url} alt="" className="w-full h-full object-cover" />
                <button type="button" onClick={() => setShots((s) => s.filter((_, j) => j !== i))}
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <label className="w-16 h-16 rounded-lg border-2 border-dashed border-slate-300 dark:border-ink-600 flex items-center justify-center cursor-pointer hover:bg-slate-50 dark:hover:bg-ink-700">
              {uploading ? <Loader2 className="w-5 h-5 animate-spin text-slate-400" /> : <Upload className="w-5 h-5 text-slate-400" />}
              <input type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
          </div>
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>キャンセル</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            送信する
          </Button>
        </div>
      </div>
    </ModalShell>
  )
}

// 詳細 / トリアージ
function DetailModal({ item, isAdmin, onClose, onChanged, showToast }) {
  const [status, setStatus] = useState(item.status)
  const [priority, setPriority] = useState(item.priority)
  const [adminNote, setAdminNote] = useState(item.admin_note || '')
  const [resolution, setResolution] = useState(item.resolution_note || '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await axios.patch(`${apiUrl}/api/feedback/${item.id}`, {
        status, priority, admin_note: adminNote, resolution_note: resolution,
      }, authConfig())
      showToast('success', '更新しました')
      onChanged()
      onClose()
    } catch (err) {
      showToast('error', err.response?.data?.error || '更新に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirm('この報告を削除しますか？')) return
    try {
      await axios.delete(`${apiUrl}/api/feedback/${item.id}`, authConfig())
      showToast('success', '削除しました')
      onChanged()
      onClose()
    } catch (err) {
      showToast('error', '削除に失敗しました')
    }
  }

  const copyMarkdown = async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/feedback/${item.id}`, authConfig())
      await navigator.clipboard.writeText(res.data.markdown || '')
      showToast('success', 'Markdown をコピーしました')
    } catch {
      showToast('error', 'コピーに失敗しました')
    }
  }

  const row = (label, value) => value ? (
    <div className="py-2 border-b border-slate-100 dark:border-ink-700">
      <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap mt-0.5">{value}</div>
    </div>
  ) : null

  return (
    <ModalShell title={`#${item.id} ${item.title}`} onClose={onClose} maxWidthOverride="max-w-xl">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Badge tone={item.type === 'bug' ? 'danger' : 'info'}>
            {item.type === 'bug' ? '🐞 バグ' : '💡 改善要望'}
          </Badge>
          <StatusBadge status={item.status} />
          <span className="text-xs text-slate-400">{APP_LABEL[item.app_key] || item.app_key}</span>
        </div>

        {row('説明', item.description)}
        {row('再現手順', item.steps)}
        {row('期待する動作', item.expected)}
        {row('実際の動作', item.actual)}
        {item.screenshot_urls?.length > 0 && (
          <div className="py-2 border-b border-slate-100 dark:border-ink-700">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">スクリーンショット</div>
            <div className="flex flex-wrap gap-2">
              {item.screenshot_urls.map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="w-20 h-20 rounded-lg overflow-hidden border border-slate-200 dark:border-ink-600">
                  <img src={u} alt="" className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          </div>
        )}
        {row('報告者', [item.reporter_name, item.reporter_email].filter(Boolean).join(' / '))}
        {row('発生ページ', item.page_url)}
        {row('環境', [item.screen_info, item.user_agent].filter(Boolean).join(' / '))}
        {row('報告日時', fmtDateTime(item.created_at))}

        {isAdmin ? (
          <div className="mt-4 pt-3 border-t border-slate-200 dark:border-ink-700 space-y-3">
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400">トリアージ（管理者）</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="ステータス">
                <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
                  {STATUS_DEFS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </Field>
              <Field label="優先度">
                <select className={inputCls} value={priority} onChange={(e) => setPriority(e.target.value)}>
                  {PRIORITY_OPTIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </Field>
            </div>
            <Field label="管理メモ / Claude Code への指示">
              <textarea className={inputCls} rows={2} value={adminNote} onChange={(e) => setAdminNote(e.target.value)} />
            </Field>
            <Field label="対応内容（完了・見送り時）">
              <textarea className={inputCls} rows={2} value={resolution} onChange={(e) => setResolution(e.target.value)} />
            </Field>
            <div className="flex justify-between items-center pt-1">
              <Button variant="ghost" size="sm" onClick={copyMarkdown}>
                <Copy className="w-4 h-4" /> Markdownをコピー
              </Button>
              <div className="flex gap-2">
                <Button variant="danger" size="sm" onClick={remove}>
                  <Trash2 className="w-4 h-4" /> 削除
                </Button>
                <Button onClick={save} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} 保存
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {row('対応状況メモ', item.resolution_note)}
            <div className="flex justify-end pt-3">
              <Button variant="ghost" onClick={onClose}>閉じる</Button>
            </div>
          </>
        )}
      </div>
    </ModalShell>
  )
}

export default function FeedbackPage({ onBack, startInSubmit = false }) {
  const [isAdmin, setIsAdmin] = useState(false)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  // 右下のFABから開いた場合は、いきなり投稿フォームを表示する
  const [showSubmit, setShowSubmit] = useState(startInSubmit)
  const [detail, setDetail] = useState(null)
  const [toast, setToast] = useState(null)
  const [filter, setFilter] = useState({ status: '', type: '' })

  const showToast = useCallback((type, msg) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 2600)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter.status) params.set('status', filter.status)
      if (filter.type) params.set('type', filter.type)
      const res = await axios.get(`${apiUrl}/api/feedback?${params.toString()}`, authConfig())
      setIsAdmin(!!res.data.is_admin)
      setItems(res.data.items || [])
    } catch (err) {
      showToast('error', '読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [filter, showToast])

  useEffect(() => { load() }, [load])

  const exportBacklog = async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/feedback/export`, {
        ...authConfig(), responseType: 'text',
      })
      const blob = new Blob([res.data], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'FEEDBACK_BACKLOG.md'
      a.click()
      URL.revokeObjectURL(url)
      showToast('success', 'バックログをダウンロードしました')
    } catch (err) {
      showToast('error', 'エクスポートに失敗しました')
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-ink-950">
      <header className="bg-white/80 dark:bg-ink-900/80 backdrop-blur border-b border-slate-200 dark:border-ink-800 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-ink-800">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <Bug className="w-5 h-5 text-brand-500" />
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">バグ報告・改善要望</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button variant="ghost" size="sm" onClick={exportBacklog} title="未対応の報告を Claude Code 向け Markdown で出力">
                <Download className="w-4 h-4" /> <span className="hidden sm:inline">バックログ出力</span>
              </Button>
            )}
            <Button size="sm" onClick={() => setShowSubmit(true)}>
              <Plus className="w-4 h-4" /> 報告する
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* 管理者向けフィルタ */}
        {isAdmin && (
          <div className="flex flex-wrap gap-2 mb-5">
            <select className={`${inputCls} w-auto`} value={filter.status} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}>
              <option value="">すべての状態</option>
              {STATUS_DEFS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <select className={`${inputCls} w-auto`} value={filter.type} onChange={(e) => setFilter((f) => ({ ...f, type: e.target.value }))}>
              <option value="">すべての種別</option>
              <option value="bug">バグ</option>
              <option value="improvement">改善要望</option>
            </select>
          </div>
        )}

        {!isAdmin && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
            あなたが送った報告の一覧です。気づいたことは「報告する」からいつでも送ってください。
          </p>
        )}

        {loading ? (
          <div className="text-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-brand-500 mx-auto" />
          </div>
        ) : items.length === 0 ? (
          <Card className="p-12 text-center text-slate-400">
            まだ報告はありません。
          </Card>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => setDetail(item)}
                className="w-full text-left bg-white dark:bg-ink-800 rounded-xl border border-slate-200 dark:border-ink-700 p-4 hover:border-brand-200 dark:hover:border-brand-500/50 hover:shadow transition flex items-center gap-3"
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${item.type === 'bug' ? 'bg-danger-50 dark:bg-danger-500/15 text-danger-500' : 'bg-accent-50 dark:bg-accent-500/15 text-accent-500'}`}>
                  {item.type === 'bug' ? <Bug className="w-4 h-4" /> : <Lightbulb className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">#{item.id}</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">{item.title}</span>
                    {item.priority === 'high' && <Badge tone="danger">優先度:高</Badge>}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>{APP_LABEL[item.app_key] || item.app_key}</span>
                    <span>・{fmtDateTime(item.created_at)}</span>
                    {isAdmin && item.reporter_name && <span>・{item.reporter_name}</span>}
                    {item.screenshot_urls?.length > 0 && (
                      <span className="inline-flex items-center gap-0.5"><ImageIcon className="w-3 h-3" />{item.screenshot_urls.length}</span>
                    )}
                  </div>
                </div>
                <StatusBadge status={item.status} />
                <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </main>

      {showSubmit && (
        <SubmitModal
          // キャンセル/閉じる: FAB(右下ボタン)から来た場合はポータルへ戻る。一覧から開いた場合は一覧へ。
          onClose={() => { if (startInSubmit) onBack(); else setShowSubmit(false) }}
          // 送信成功: 一覧を再読み込みしてフォームを閉じる（自分の報告一覧＋送信トーストを表示）
          onSubmitted={() => { load(); setShowSubmit(false) }}
          showToast={showToast}
        />
      )}
      {detail && (
        <DetailModal item={detail} isAdmin={isAdmin} onClose={() => setDetail(null)} onChanged={load} showToast={showToast} />
      )}
      <Toast toast={toast} />
    </div>
  )
}
