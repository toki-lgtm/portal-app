import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import {
  ArrowLeft, Plus, Pin, Megaphone, Eye, CheckCircle2,
  AlertTriangle, Pencil, Trash2, X, Save, Search,
  ChevronDown, Users, Loader2, Paperclip, Download, Upload, FileText,
} from 'lucide-react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import Toast from './ui/Toast'
import ModalShell from './ui/ModalShell'
import Field from './ui/Field'
import { API_URL as apiUrl, authConfig } from '../lib/api'
import { useToast } from '../lib/useToast'
import { inputCls } from '../lib/ui'

// カテゴリ選択肢
const CATEGORIES = ['全般', '安全', '人事', '業務', '施設', 'その他']

// 日付フォーマット（月/日）
function fmtDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()}`
}

// ファイルサイズを読みやすく整形（B/KB/MB）
function fmtSize(bytes) {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// 本文から抜粋（改行・タグを除去して最大80文字）
function excerpt(body, maxLen = 80) {
  if (!body) return ''
  const plain = body.replace(/\r?\n/g, ' ').trim()
  return plain.length <= maxLen ? plain : plain.slice(0, maxLen) + '…'
}


// ──────────────────────────────────────────────
// 詳細表示モーダル
// ──────────────────────────────────────────────
function AnnouncementDetailModal({ item, canAdmin, onClose, onRead, onAck, onEdit, onDelete, showToast }) {
  const [reads, setReads] = useState(null)
  const [readsLoading, setReadsLoading] = useState(false)
  const [showReads, setShowReads] = useState(false)

  // 開いたら既読化（未読のみ）
  useEffect(() => {
    if (!item.is_read) {
      onRead(item.id)
    }
  }, [item.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadReads = async () => {
    if (reads !== null) { setShowReads((v) => !v); return }
    setReadsLoading(true)
    try {
      const res = await axios.get(`${apiUrl}/api/announcements/${item.id}/reads`, authConfig())
      setReads(res.data)
      setShowReads(true)
    } catch (err) {
      showToast('error', '到達率の取得に失敗しました')
    } finally {
      setReadsLoading(false)
    }
  }

  const handleAck = async () => {
    try {
      await axios.post(`${apiUrl}/api/announcements/${item.id}/acknowledge`, {}, authConfig())
      onAck(item.id)
    } catch {
      showToast('error', '確認の送信に失敗しました')
    }
  }

  const handleDelete = async () => {
    if (!confirm(`「${item.title}」を削除しますか？`)) return
    try {
      await axios.delete(`${apiUrl}/api/announcements/${item.id}`, authConfig())
      showToast('success', '削除しました')
      onDelete(item.id)
      onClose()
    } catch {
      showToast('error', '削除に失敗しました')
    }
  }

  // 添付ファイルを署名付きURLで開く（120秒有効）
  const downloadAttachment = async (path) => {
    try {
      const res = await axios.get(`${apiUrl}/api/announcements/${item.id}/attachment-url`, {
        ...authConfig(), params: { path },
      })
      window.open(res.data.url, '_blank', 'noopener')
    } catch {
      showToast('error', 'ファイルのダウンロードに失敗しました')
    }
  }

  return (
    <ModalShell title={item.title} onClose={onClose} wide>
      {/* メタ情報 */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {item.is_pinned && (
          <Badge tone="info"><Pin className="w-3 h-3" />ピン留め</Badge>
        )}
        {item.priority === 'important' && (
          <Badge tone="warning"><AlertTriangle className="w-3 h-3" />重要</Badge>
        )}
        {item.category && (
          <Badge tone="neutral">{item.category}</Badge>
        )}
        {item.requires_ack && !item.is_acknowledged && (
          <Badge tone="danger">要確認</Badge>
        )}
        {item.requires_ack && item.is_acknowledged && (
          <Badge tone="success"><CheckCircle2 className="w-3 h-3" />確認済</Badge>
        )}
      </div>

      <div className="text-xs text-slate-400 mb-5 flex flex-wrap gap-3">
        <span>投稿者: {item.author_name || '—'}</span>
        <span>日付: {fmtDate(item.publish_at || item.created_at)}</span>
        {item.expire_at && <span>掲載期限: {fmtDate(item.expire_at)}</span>}
      </div>

      {/* 本文 */}
      <div className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed border-t border-slate-100 dark:border-ink-700 pt-4 mb-5">
        {item.body || '（本文なし）'}
      </div>

      {/* 添付ファイル */}
      {item.attachments?.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
            <Paperclip className="w-3.5 h-3.5" />添付ファイル（{item.attachments.length}）
          </div>
          <ul className="space-y-1">
            {item.attachments.map((a, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => downloadAttachment(a.path)}
                  className="w-full flex items-center gap-2 text-sm bg-slate-50 dark:bg-ink-900/40 hover:bg-slate-100 dark:hover:bg-ink-700 rounded-lg px-3 py-2 text-left transition"
                >
                  <FileText className="w-4 h-4 text-brand-500 shrink-0" />
                  <span className="flex-1 truncate text-slate-700 dark:text-slate-200">{a.name}</span>
                  {a.size != null && <span className="text-xs text-slate-400">{fmtSize(a.size)}</span>}
                  <Download className="w-4 h-4 text-slate-400 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 「確認しました」ボタン */}
      {item.requires_ack && !item.is_acknowledged && (
        <div className="mb-5 p-4 rounded-xl bg-accent-50 dark:bg-accent-500/10 border border-accent-200 dark:border-accent-500/30 flex items-center justify-between gap-3">
          <p className="text-sm text-accent-700 dark:text-accent-400 font-semibold">
            このお知らせには確認が必要です
          </p>
          <Button variant="accent" size="sm" onClick={handleAck}>
            <CheckCircle2 className="w-4 h-4" />確認しました
          </Button>
        </div>
      )}
      {item.requires_ack && item.is_acknowledged && (
        <div className="mb-5 p-3 rounded-xl bg-success-50 dark:bg-success-500/10 border border-success-200 dark:border-success-500/30 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-success-500" />
          <span className="text-sm text-success-700 dark:text-success-400 font-semibold">確認済みです</span>
        </div>
      )}

      {/* 管理者: 到達率 / 編集 / 削除 */}
      {canAdmin && (
        <div className="border-t border-slate-100 dark:border-ink-700 pt-4 space-y-3">
          <button
            onClick={loadReads}
            className="flex items-center gap-1.5 text-sm font-semibold text-brand-600 dark:text-brand-400 hover:underline"
          >
            <Eye className="w-4 h-4" />
            到達率を確認
            {readsLoading && <Loader2 className="w-3 h-3 animate-spin" />}
            {!readsLoading && <ChevronDown className={`w-3 h-3 transition-transform ${showReads ? 'rotate-180' : ''}`} />}
          </button>

          {showReads && reads && (
            <div className="bg-slate-50 dark:bg-ink-900/40 rounded-xl p-4">
              <div className="flex flex-wrap gap-4 mb-3 text-sm">
                <span className="text-slate-600 dark:text-slate-300">
                  対象: <strong className="text-slate-900 dark:text-white">{reads.targets_total}</strong> 名
                </span>
                <span className="text-brand-600 dark:text-brand-400">
                  既読: <strong>{reads.read_count}</strong> 名
                </span>
                {reads.ack_count > 0 && (
                  <span className="text-success-600 dark:text-success-400">
                    確認済: <strong>{reads.ack_count}</strong> 名
                  </span>
                )}
              </div>
              {reads.recipients && reads.recipients.length > 0 && (
                <div className="max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-400 text-left border-b border-slate-200 dark:border-ink-600">
                        <th className="pb-1">氏名</th>
                        <th className="pb-1">既読日時</th>
                        {reads.ack_count > 0 && <th className="pb-1">確認日時</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-ink-700">
                      {reads.recipients.map((r) => (
                        <tr key={r.user_email} className="text-slate-600 dark:text-slate-300">
                          <td className="py-1">{r.name || r.user_email}</td>
                          <td className="py-1">{r.read_at ? fmtDate(r.read_at) : <span className="text-slate-300 dark:text-ink-600">—</span>}</td>
                          {reads.ack_count > 0 && (
                            <td className="py-1">{r.acknowledged_at ? fmtDate(r.acknowledged_at) : <span className="text-slate-300 dark:text-ink-600">—</span>}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="danger" size="sm" onClick={handleDelete}>
              <Trash2 className="w-4 h-4" />削除
            </Button>
            <Button variant="secondary" size="sm" onClick={() => { onClose(); onEdit(item) }}>
              <Pencil className="w-4 h-4" />編集
            </Button>
          </div>
        </div>
      )}
    </ModalShell>
  )
}

// ──────────────────────────────────────────────
// 投稿フォームモーダル（新規作成・編集共用）
// ──────────────────────────────────────────────
const EMPTY_FORM = {
  title: '',
  body: '',
  category: '全般',
  priority: 'normal',
  target_type: 'all',
  targets: [],
  is_pinned: false,
  requires_ack: false,
  publish_at: '',
  expire_at: '',
  attachments: [],
}

function AnnouncementFormModal({ item, onClose, onSaved, showToast }) {
  const isNew = !item?.id
  const [form, setForm] = useState(() => {
    if (!item) return EMPTY_FORM
    return {
      title: item.title || '',
      body: item.body || '',
      category: item.category || '全般',
      priority: item.priority || 'normal',
      target_type: item.target_type || 'all',
      targets: item.targets || [],
      is_pinned: item.is_pinned || false,
      requires_ack: item.requires_ack || false,
      publish_at: item.publish_at ? item.publish_at.slice(0, 16) : '',
      expire_at: item.expire_at ? item.expire_at.slice(0, 16) : '',
      attachments: item.attachments || [],
    }
  })
  const [targetValue, setTargetValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  // 複数ファイルをアップロードし、返却メタ {name, path, size} を attachments に積む
  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setUploading(true)
    try {
      const uploaded = []
      for (const file of files) {
        const fd = new FormData()
        fd.append('file', file)
        const res = await axios.post(`${apiUrl}/api/announcements/upload-file`, fd, {
          headers: { ...authConfig().headers, 'Content-Type': 'multipart/form-data' },
        })
        uploaded.push(res.data)
      }
      setForm((f) => ({ ...f, attachments: [...(f.attachments || []), ...uploaded] }))
    } catch (err) {
      showToast('error', err.response?.data?.error || 'ファイルのアップロードに失敗しました')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const removeAttachment = (idx) =>
    setForm((f) => ({ ...f, attachments: f.attachments.filter((_, i) => i !== idx) }))

  const addTarget = () => {
    const v = targetValue.trim()
    if (!v) return
    const kind = form.target_type === 'company' ? 'company' : 'department'
    setForm((f) => ({
      ...f,
      targets: [...f.targets.filter((t) => !(t.kind === kind && t.value === v)), { kind, value: v }],
    }))
    setTargetValue('')
  }

  const removeTarget = (idx) =>
    setForm((f) => ({ ...f, targets: f.targets.filter((_, i) => i !== idx) }))

  const save = async () => {
    if (!form.title.trim()) { showToast('error', '件名は必須です'); return }
    setSaving(true)
    try {
      const payload = {
        ...form,
        publish_at: form.publish_at || undefined,
        expire_at: form.expire_at || undefined,
        targets: form.target_type === 'all' ? [] : form.targets,
      }
      if (isNew) {
        await axios.post(`${apiUrl}/api/announcements`, payload, authConfig())
        showToast('success', 'お知らせを投稿しました')
      } else {
        await axios.put(`${apiUrl}/api/announcements/${item.id}`, payload, authConfig())
        showToast('success', 'お知らせを更新しました')
      }
      onSaved()
      onClose()
    } catch (err) {
      showToast('error', err.response?.data?.error || '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title={isNew ? '新規お知らせ投稿' : 'お知らせを編集'} onClose={onClose} wide>
      <div className="space-y-4">
        <Field label="件名 *">
          <input
            className={inputCls}
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="件名を入力"
          />
        </Field>

        <Field label="本文">
          <textarea
            className={inputCls + ' min-h-[120px] resize-y'}
            value={form.body}
            onChange={(e) => set('body', e.target.value)}
            placeholder="本文を入力"
          />
        </Field>

        {/* 添付ファイル（複数可） */}
        <Field label="添付ファイル">
          <div className="space-y-2">
            {form.attachments?.length > 0 && (
              <ul className="space-y-1">
                {form.attachments.map((a, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm bg-slate-50 dark:bg-ink-900/40 rounded-lg px-3 py-2">
                    <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="flex-1 truncate text-slate-700 dark:text-slate-200">{a.name}</span>
                    {a.size != null && <span className="text-xs text-slate-400">{fmtSize(a.size)}</span>}
                    <button type="button" onClick={() => removeAttachment(i)} className="text-slate-400 hover:text-danger-500">
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-slate-300 dark:border-ink-600 text-sm text-slate-600 dark:text-slate-300 cursor-pointer hover:bg-slate-50 dark:hover:bg-ink-700">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? 'アップロード中...' : 'ファイルを選択（複数可）'}
              <input type="file" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
          </div>
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="カテゴリ">
            <select className={inputCls} value={form.category} onChange={(e) => set('category', e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>

          <Field label="重要度">
            <select className={inputCls} value={form.priority} onChange={(e) => set('priority', e.target.value)}>
              <option value="normal">通常</option>
              <option value="important">重要</option>
            </select>
          </Field>

          <Field label="掲載開始日時">
            <input type="datetime-local" className={inputCls} value={form.publish_at} onChange={(e) => set('publish_at', e.target.value)} />
          </Field>

          <Field label="掲載終了日時">
            <input type="datetime-local" className={inputCls} value={form.expire_at} onChange={(e) => set('expire_at', e.target.value)} />
          </Field>
        </div>

        {/* 宛先 */}
        <Field label="宛先">
          <select className={inputCls} value={form.target_type} onChange={(e) => set('target_type', e.target.value)}>
            <option value="all">全員</option>
            <option value="company">会社指定</option>
            <option value="department">部署指定</option>
          </select>
        </Field>

        {form.target_type !== 'all' && (
          <div>
            <div className="flex gap-2">
              <input
                className={inputCls}
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                placeholder={form.target_type === 'company' ? '会社名を入力' : '部署名を入力'}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTarget())}
              />
              <Button variant="secondary" size="sm" onClick={addTarget}>
                <Plus className="w-4 h-4" />追加
              </Button>
            </div>
            {form.targets.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {form.targets.map((t, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-brand-100 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300">
                    {t.value}
                    <button onClick={() => removeTarget(i)} className="hover:text-danger-500">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* フラグ群 */}
        <div className="flex flex-wrap gap-5 mt-2">
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
            <input type="checkbox" checked={form.is_pinned} onChange={(e) => set('is_pinned', e.target.checked)} />
            ピン留め
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
            <input type="checkbox" checked={form.requires_ack} onChange={(e) => set('requires_ack', e.target.checked)} />
            確認ボタンを付ける（回覧）
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-6">
        <Button variant="ghost" size="sm" onClick={onClose}>キャンセル</Button>
        <Button variant="primary" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? '保存中...' : (isNew ? '投稿する' : '更新する')}
        </Button>
      </div>
    </ModalShell>
  )
}

// ──────────────────────────────────────────────
// お知らせカード（一覧用）
// ──────────────────────────────────────────────
function AnnouncementCard({ item, onClick }) {
  const isUnread = !item.is_read
  const isImportant = item.priority === 'important'

  return (
    <button
      type="button"
      onClick={() => onClick(item)}
      className={`w-full text-left p-4 rounded-2xl border transition hover:shadow-md hover:-translate-y-0.5 duration-200 cursor-pointer relative
        ${isUnread
          ? 'border-l-4 border-l-accent-400 border-slate-200 dark:border-ink-700 bg-white dark:bg-ink-800'
          : 'border-slate-200 dark:border-ink-700 bg-white dark:bg-ink-800 opacity-90'
        }`}
    >
      {/* ピン留め・重要バッジ（右上） */}
      <div className="absolute top-3 right-3 flex gap-1">
        {item.is_pinned && (
          <Badge tone="info"><Pin className="w-3 h-3" />固定</Badge>
        )}
        {isImportant && (
          <Badge tone="warning"><AlertTriangle className="w-3 h-3" />重要</Badge>
        )}
      </div>

      {/* 件名 */}
      <div className={`text-sm pr-24 mb-1 ${isUnread ? 'font-bold text-slate-900 dark:text-white' : 'font-semibold text-slate-700 dark:text-slate-200'}`}>
        {item.title}
      </div>

      {/* 抜粋 */}
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 line-clamp-2">
        {excerpt(item.body)}
      </p>

      {/* メタ情報フッター */}
      <div className="flex flex-wrap items-center gap-2">
        {item.category && (
          <Badge tone="neutral">{item.category}</Badge>
        )}
        {isUnread && (
          <Badge tone="info">未読</Badge>
        )}
        {item.requires_ack && !item.is_acknowledged && (
          <Badge tone="danger">要確認</Badge>
        )}
        {item.requires_ack && item.is_acknowledged && (
          <Badge tone="success"><CheckCircle2 className="w-3 h-3" />確認済</Badge>
        )}
        <span className="ml-auto text-xs text-slate-400">
          {item.author_name && <span className="mr-2">{item.author_name}</span>}
          {fmtDate(item.publish_at || item.created_at)}
        </span>
      </div>
    </button>
  )
}

// ──────────────────────────────────────────────
// メインページ
// ──────────────────────────────────────────────
export default function AnnouncementsPage({ onBack }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [canAdmin, setCanAdmin] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [manageMode, setManageMode] = useState(false) // 管理者: 全件表示モード

  const [selected, setSelected] = useState(null)   // 詳細表示中のitem
  const [editing, setEditing] = useState(null)      // フォーム編集中のitem（{}=新規）
  const { toast, showToast } = useToast()

  const loadAnnouncements = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (categoryFilter) params.set('category', categoryFilter)
      if (unreadOnly) params.set('unread_only', '1')
      if (manageMode && canAdmin) params.set('manage', '1')
      const res = await axios.get(`${apiUrl}/api/announcements?${params}`, authConfig())
      setItems(res.data)
    } catch (err) {
      console.error('お知らせの取得に失敗:', err)
      showToast('error', 'お知らせの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [categoryFilter, unreadOnly, manageMode, canAdmin, showToast])

  useEffect(() => {
    // 権限を取得（EmployeesPage と同じ作り）
    axios.get(`${apiUrl}/api/my-permissions`, authConfig())
      .then((res) => {
        const d = res.data
        setCanAdmin(d.role === 'admin' || d.apps?.['announcements'] === 'admin')
      })
      .catch(() => setCanAdmin(false))
  }, [])

  useEffect(() => {
    setLoading(true)
    loadAnnouncements()
  }, [loadAnnouncements])

  // 既読化をローカル反映
  const handleRead = useCallback(async (id) => {
    try {
      await axios.post(`${apiUrl}/api/announcements/${id}/read`, {}, authConfig())
      setItems((prev) => prev.map((a) => a.id === id ? { ...a, is_read: true } : a))
    } catch {
      // サイレント失敗（表示は壊さない）
    }
  }, [])

  // 確認済みをローカル反映
  const handleAck = useCallback((id) => {
    setItems((prev) => prev.map((a) => a.id === id ? { ...a, is_acknowledged: true } : a))
    // selectedも更新
    setSelected((prev) => prev?.id === id ? { ...prev, is_acknowledged: true } : prev)
  }, [])

  // 削除後の一覧更新
  const handleDelete = useCallback((id) => {
    setItems((prev) => prev.filter((a) => a.id !== id))
  }, [])

  // 検索フィルタ（クライアントサイド）
  const filtered = items.filter((a) => {
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return [a.title, a.body, a.author_name, a.category]
      .some((v) => v && String(v).toLowerCase().includes(q))
  })

  // ピン留めを先頭に（APIがpinned→新しい順を返すが、クライアントでもソート保証）
  const sorted = [...filtered].sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1
    if (!a.is_pinned && b.is_pinned) return 1
    return new Date(b.publish_at || b.created_at) - new Date(a.publish_at || a.created_at)
  })

  const unreadCount = items.filter((a) => !a.is_read).length

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-ink-950 transition-colors">
      {/* ヘッダー */}
      <header className="bg-white/80 dark:bg-ink-900/80 backdrop-blur border-b border-slate-200 dark:border-ink-800 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />
            戻る
          </Button>
          <div className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-brand-500" />
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">掲示板・お知らせ</h1>
            {unreadCount > 0 && (
              <Badge tone="info">{unreadCount}件未読</Badge>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {canAdmin && (
              <>
                <Button
                  variant={manageMode ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setManageMode((v) => !v)}
                >
                  <Users className="w-4 h-4" />
                  {manageMode ? '管理モード中' : '管理モード'}
                </Button>
                <Button variant="primary" size="sm" onClick={() => setEditing({})}>
                  <Plus className="w-4 h-4" />新規投稿
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {toast && <Toast toast={toast} />}

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* ツールバー */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {/* 検索 */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="件名・本文・投稿者で検索"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-ink-600 bg-white dark:bg-ink-700 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>

          {/* カテゴリフィルタ */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-ink-600 bg-white dark:bg-ink-700 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            <option value="">全カテゴリ</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* 未読フィルタ */}
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
            />
            未読のみ
          </label>
        </div>

        {/* 一覧 */}
        {loading ? (
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600"></div>
            <p className="text-slate-500 dark:text-slate-400 mt-4">読み込み中...</p>
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-16 text-slate-400 dark:text-slate-500">
            {items.length === 0 ? 'お知らせはありません' : '条件に一致するお知らせがありません'}
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((item) => (
              <AnnouncementCard key={item.id} item={item} onClick={setSelected} />
            ))}
          </div>
        )}
      </main>

      {/* 詳細モーダル */}
      {selected && (
        <AnnouncementDetailModal
          item={selected}
          canAdmin={canAdmin}
          onClose={() => setSelected(null)}
          onRead={handleRead}
          onAck={handleAck}
          onEdit={(item) => setEditing(item)}
          onDelete={handleDelete}
          showToast={showToast}
        />
      )}

      {/* 投稿/編集フォーム */}
      {editing !== null && (
        <AnnouncementFormModal
          item={editing?.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); loadAnnouncements() }}
          showToast={showToast}
        />
      )}
    </div>
  )
}
