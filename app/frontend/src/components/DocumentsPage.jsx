import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  ArrowLeft, X, Search, Loader2, FileText,
  AlertTriangle, CheckCircle2, Eye, FolderOpen,
  Plus, Trash2, ChevronDown, Users, Upload,
  Inbox, Send, BarChart3,
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

const DOC_TYPES = ['通達', '案内', '依頼', '報告', 'その他']

// 日付フォーマット
function fmtDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()}`
}


// ──────────────────────────────────────────────
// 詳細モーダル（受信トレイから開く）
// ──────────────────────────────────────────────
function CircularDetailModal({ id, onClose, showToast, onUpdated }) {
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [flagging, setFlagging] = useState(false)
  const [doneing, setDoneing] = useState(false)
  const [showResponses, setShowResponses] = useState(false)
  const [responses, setResponses] = useState(null)
  const [responsesLoading, setResponsesLoading] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/circulars/${id}`, authConfig())
      setItem(res.data)
    } catch {
      showToast('error', '書類の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [id, showToast])

  useEffect(() => { load() }, [load])

  const handleFlag = async (actionLabel) => {
    setFlagging(true)
    try {
      await axios.post(`${apiUrl}/api/circulars/${id}/flag`, { action_label: actionLabel }, authConfig())
      showToast('success', `「${actionLabel}」に設定しました`)
      load()
      onUpdated?.()
    } catch {
      showToast('error', 'フラグの設定に失敗しました')
    } finally {
      setFlagging(false)
    }
  }

  const handleActionDone = async () => {
    setDoneing(true)
    try {
      await axios.post(`${apiUrl}/api/circulars/${id}/action-done`, {}, authConfig())
      showToast('success', '対応済にしました')
      load()
      onUpdated?.()
    } catch {
      showToast('error', '対応済への変更に失敗しました')
    } finally {
      setDoneing(false)
    }
  }

  const loadResponses = async () => {
    if (responses !== null) { setShowResponses((v) => !v); return }
    setResponsesLoading(true)
    try {
      const res = await axios.get(`${apiUrl}/api/circulars/${id}/responses`, authConfig())
      setResponses(res.data)
      setShowResponses(true)
    } catch {
      showToast('error', '到達状況の取得に失敗しました')
    } finally {
      setResponsesLoading(false)
    }
  }

  if (loading || !item) {
    return (
      <ModalShell title="読み込み中..." onClose={onClose} wide>
        <div className="py-10 text-center text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin inline" />
        </div>
      </ModalShell>
    )
  }

  const my = item.my || {}
  const isActionRequired = my.action_label === '要対応'
  const isImportant = my.action_label === '重要'
  const isDone = my.action_status === '対応済'

  return (
    <ModalShell title={item.title || '（件名なし）'} onClose={onClose} extraWide>
      {/* メタ情報 */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {item.doc_type && <Badge tone="neutral">{item.doc_type}</Badge>}
        {isActionRequired && !isDone && <Badge tone="danger"><AlertTriangle className="w-3 h-3" />要対応</Badge>}
        {isActionRequired && isDone && <Badge tone="success"><CheckCircle2 className="w-3 h-3" />対応済</Badge>}
        {isImportant && <Badge tone="warning">重要</Badge>}
      </div>

      <div className="text-xs text-slate-400 mb-5 flex flex-wrap gap-3">
        {item.sender && <span>差出人: {item.sender}</span>}
        <span>日付: {fmtDate(item.created_at)}</span>
      </div>

      {/* サマリ */}
      {item.summary && (
        <div className="mb-4 p-3 rounded-xl bg-brand-50 dark:bg-brand-500/10 border border-brand-200 dark:border-brand-500/30">
          <p className="text-xs font-bold text-brand-700 dark:text-brand-300 mb-1">AI要約</p>
          <p className="text-sm text-slate-700 dark:text-slate-300">{item.summary}</p>
        </div>
      )}

      {/* 原本ビューア */}
      {item.original_url && (
        <div className="mb-5">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">原本</p>
          <div className="border border-slate-200 dark:border-ink-600 rounded-xl overflow-hidden bg-slate-50 dark:bg-ink-900/40" style={{ height: '400px' }}>
            <iframe
              src={item.original_url}
              title="原本ビューア"
              className="w-full h-full"
              style={{ border: 'none' }}
            />
          </div>
          <a
            href={item.original_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline"
          >
            <Eye className="w-3.5 h-3.5" />別タブで開く
          </a>
        </div>
      )}

      {/* OCRテキスト本文 */}
      {item.ocr_text && (
        <div className="mb-5 border-t border-slate-100 dark:border-ink-700 pt-4">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">本文（テキスト）</p>
          <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed bg-slate-50 dark:bg-ink-900/40 rounded-xl p-4 max-h-60 overflow-y-auto">
            {item.ocr_text}
          </div>
        </div>
      )}

      {/* アクションボタン群 */}
      <div className="border-t border-slate-100 dark:border-ink-700 pt-4 space-y-3">
        {/* 要対応→対応済 */}
        {isActionRequired && !isDone && (
          <div className="p-4 rounded-xl bg-danger-50 dark:bg-danger-500/10 border border-danger-200 dark:border-danger-500/30 flex items-center justify-between gap-3">
            <p className="text-sm text-danger-700 dark:text-danger-400 font-semibold">
              この書類には対応が必要です
            </p>
            <Button variant="primary" size="sm" onClick={handleActionDone} disabled={doneing}>
              {doneing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              対応済にする
            </Button>
          </div>
        )}
        {isActionRequired && isDone && (
          <div className="p-3 rounded-xl bg-success-50 dark:bg-success-500/10 border border-success-200 dark:border-success-500/30 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-success-500" />
            <span className="text-sm text-success-700 dark:text-success-400 font-semibold">対応済みです</span>
          </div>
        )}

        {/* 重要フラグ */}
        <div className="flex flex-wrap gap-2">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 w-full">フラグを設定</p>
          <Button
            variant={isActionRequired ? 'danger' : 'secondary'}
            size="sm"
            onClick={() => handleFlag('要対応')}
            disabled={flagging}
          >
            <AlertTriangle className="w-4 h-4" />要対応
          </Button>
          <Button
            variant={isImportant ? 'accent' : 'secondary'}
            size="sm"
            onClick={() => handleFlag('重要')}
            disabled={flagging}
          >
            重要
          </Button>
        </div>

        {/* 管理者：到達状況 */}
        <button
          onClick={loadResponses}
          className="flex items-center gap-1.5 text-sm font-semibold text-brand-600 dark:text-brand-400 hover:underline"
        >
          <Users className="w-4 h-4" />
          到達状況を確認
          {responsesLoading && <Loader2 className="w-3 h-3 animate-spin" />}
          {!responsesLoading && <ChevronDown className={`w-3 h-3 transition-transform ${showResponses ? 'rotate-180' : ''}`} />}
        </button>

        {showResponses && responses && (
          <ResponsesSummary responses={responses} />
        )}
      </div>
    </ModalShell>
  )
}

// 到達状況サマリー（管理タブでも流用）
function ResponsesSummary({ responses }) {
  const s = responses.summary || {}
  return (
    <div className="bg-slate-50 dark:bg-ink-900/40 rounded-xl p-4">
      <div className="flex flex-wrap gap-4 mb-3 text-sm">
        <span className="text-brand-600 dark:text-brand-400">
          既読: <strong>{s['read'] ?? 0}</strong>
        </span>
        <span className="text-danger-600 dark:text-danger-400">
          要対応: <strong>{s['要対応'] ?? 0}</strong>
        </span>
        <span className="text-warning-600 dark:text-warning-400">
          重要: <strong>{s['重要'] ?? 0}</strong>
        </span>
        <span className="text-success-600 dark:text-success-400">
          対応済: <strong>{s['対応済'] ?? 0}</strong>
        </span>
      </div>
      {responses.responses && responses.responses.length > 0 && (
        <div className="max-h-48 overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 text-left border-b border-slate-200 dark:border-ink-600">
                <th className="pb-1">ユーザー</th>
                <th className="pb-1">既読日時</th>
                <th className="pb-1">フラグ</th>
                <th className="pb-1">対応状況</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-ink-700">
              {responses.responses.map((r, i) => (
                <tr key={i} className="text-slate-600 dark:text-slate-300">
                  <td className="py-1">{r.user_name || r.user_email || '—'}</td>
                  <td className="py-1">{r.read_at ? fmtDate(r.read_at) : <span className="text-slate-300 dark:text-ink-600">—</span>}</td>
                  <td className="py-1">{r.action_label || '—'}</td>
                  <td className="py-1">{r.action_status || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────
// 受信トレイカード（一覧用）
// ──────────────────────────────────────────────
function CircularCard({ item, onClick }) {
  const isUnread = !item.read
  const isActionRequired = item.action_label === '要対応'

  return (
    <button
      type="button"
      onClick={() => onClick(item.id)}
      className={`w-full text-left p-4 rounded-2xl border transition hover:shadow-md hover:-translate-y-0.5 duration-200 cursor-pointer relative
        ${isUnread
          ? 'border-l-4 border-l-accent-400 border-slate-200 dark:border-ink-700 bg-white dark:bg-ink-800'
          : 'border-slate-200 dark:border-ink-700 bg-white dark:bg-ink-800 opacity-90'
        }`}
    >
      {/* バッジ（右上） */}
      <div className="absolute top-3 right-3 flex gap-1">
        {isActionRequired && (
          <Badge tone="danger"><AlertTriangle className="w-3 h-3" />要対応</Badge>
        )}
      </div>

      {/* 件名 */}
      <div className={`text-sm pr-24 mb-1 ${isUnread ? 'font-bold text-slate-900 dark:text-white' : 'font-semibold text-slate-700 dark:text-slate-200'}`}>
        {item.title || '（件名なし）'}
      </div>

      {/* サマリー抜粋 */}
      {item.summary && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 line-clamp-2">{item.summary}</p>
      )}

      {/* メタ情報フッター */}
      <div className="flex flex-wrap items-center gap-2">
        {item.doc_type && <Badge tone="neutral">{item.doc_type}</Badge>}
        {item.status && <Badge tone="neutral">{item.status}</Badge>}
        {isUnread && <Badge tone="info">未読</Badge>}
        <span className="ml-auto text-xs text-slate-400">
          {item.sender && <span className="mr-2">{item.sender}</span>}
          {fmtDate(item.created_at)}
        </span>
      </div>
    </button>
  )
}

// ──────────────────────────────────────────────
// 受信トレイタブ
// ──────────────────────────────────────────────
function InboxTab({ showToast, onCountChange }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [actionFilter, setActionFilter] = useState('')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (unreadOnly) params.set('unread_only', '1')
      if (actionFilter) params.set('action', actionFilter)
      const res = await axios.get(`${apiUrl}/api/circulars?${params}`, authConfig())
      setItems(res.data)
    } catch {
      showToast('error', '回覧一覧の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [unreadOnly, actionFilter, showToast])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  const handleUpdated = useCallback(() => {
    load()
    onCountChange?.()
  }, [load, onCountChange])

  const filtered = items.filter((a) => {
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return [a.title, a.sender, a.doc_type, a.summary]
      .some((v) => v && String(v).toLowerCase().includes(q))
  })

  const unreadCount = items.filter((a) => !a.read).length

  return (
    <>
      {/* ツールバー */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="件名・差出人・内容で検索"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-ink-600 bg-white dark:bg-ink-700 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
          />
          未読のみ
        </label>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-ink-600 bg-white dark:bg-ink-700 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          <option value="">全て</option>
          <option value="要対応">要対応</option>
          <option value="重要">重要</option>
        </select>
      </div>

      {/* ヘッダーカウント */}
      {unreadCount > 0 && (
        <div className="mb-4 flex items-center gap-2">
          <Badge tone="info">{unreadCount}件未読</Badge>
        </div>
      )}

      {/* 一覧 */}
      {loading ? (
        <div className="text-center py-20">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600"></div>
          <p className="text-slate-500 dark:text-slate-400 mt-4">読み込み中...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400 dark:text-slate-500">
          {items.length === 0 ? '回覧書類はありません' : '条件に一致する書類がありません'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <CircularCard key={item.id} item={item} onClick={setSelectedId} />
          ))}
        </div>
      )}

      {/* 詳細モーダル */}
      {selectedId && (
        <CircularDetailModal
          id={selectedId}
          onClose={() => setSelectedId(null)}
          showToast={showToast}
          onUpdated={handleUpdated}
        />
      )}
    </>
  )
}

// ──────────────────────────────────────────────
// 分割ウィザード（発信タブ内で使用）
// ──────────────────────────────────────────────
function SplitWizard({ batchRef, pageCount, initialSplits, onCancel, onComplete, showToast }) {
  const [splits, setSplits] = useState(
    initialSplits.map((s, i) => ({
      ...s,
      _id: i,
      target_type: 'all',
      targets: [],
      _targetValue: '',
    }))
  )
  const [saving, setSaving] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(null)

  const updateSplit = (idx, key, value) => {
    setSplits((prev) => prev.map((s, i) => i === idx ? { ...s, [key]: value } : s))
  }

  const addSplit = () => {
    setSplits((prev) => [
      ...prev,
      {
        _id: Date.now(),
        start_page: 1,
        end_page: pageCount || 1,
        doc_type: 'その他',
        sender: '',
        title: '',
        ocr_text: '',
        target_type: 'all',
        targets: [],
        _targetValue: '',
      },
    ])
  }

  const removeSplit = (idx) => {
    setSplits((prev) => prev.filter((_, i) => i !== idx))
  }

  const addTarget = (idx) => {
    const split = splits[idx]
    const v = (split._targetValue || '').trim()
    if (!v) return
    const kind = split.target_type === 'company' ? 'company'
      : split.target_type === 'department' ? 'department'
      : 'user'
    updateSplit(idx, 'targets', [
      ...(split.targets || []).filter((t) => !(t.kind === kind && t.value === v)),
      { kind, value: v },
    ])
    updateSplit(idx, '_targetValue', '')
  }

  const removeTarget = (splitIdx, tIdx) => {
    setSplits((prev) =>
      prev.map((s, i) =>
        i === splitIdx ? { ...s, targets: s.targets.filter((_, j) => j !== tIdx) } : s
      )
    )
  }

  const submit = async () => {
    for (const s of splits) {
      if (!s.title.trim()) {
        showToast('error', '件名は必須です（全書類に入力してください）')
        return
      }
    }
    setSaving(true)
    try {
      const documents = splits.map((s) => ({
        start_page: s.start_page,
        end_page: s.end_page,
        title: s.title,
        doc_type: s.doc_type,
        sender: s.sender,
        ocr_text: s.ocr_text,
        target_type: s.target_type,
        targets: s.target_type === 'all' ? [] : (s.targets || []),
      }))
      await axios.post(`${apiUrl}/api/circulars`, { batch_ref: batchRef, documents }, authConfig())
      showToast('success', '回覧書類を送信しました')
      onComplete()
    } catch (err) {
      showToast('error', err.response?.data?.error || '送信に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-slate-900 dark:text-white">
            分割ウィザード（全 {pageCount} ページ）
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            各書類のページ範囲・宛先・種別を確認・編集してから「送信」してください
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={addSplit}>
          <Plus className="w-4 h-4" />書類を追加
        </Button>
      </div>

      {splits.length === 0 && (
        <div className="text-center py-8 text-slate-400">書類がありません。「書類を追加」で追加してください</div>
      )}

      {splits.map((s, idx) => (
        <Card key={s._id} className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">書類 {idx + 1}</p>
            <button
              type="button"
              onClick={() => removeSplit(idx)}
              className="p-1.5 rounded-lg text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-500/10"
              title="この書類を削除"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* ページ範囲 */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="開始ページ">
              <input
                type="number"
                min={1}
                max={pageCount || 9999}
                className={inputCls}
                value={s.start_page}
                onChange={(e) => updateSplit(idx, 'start_page', Number(e.target.value))}
              />
            </Field>
            <Field label="終了ページ">
              <input
                type="number"
                min={1}
                max={pageCount || 9999}
                className={inputCls}
                value={s.end_page}
                onChange={(e) => updateSplit(idx, 'end_page', Number(e.target.value))}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="種別">
              <select
                className={inputCls}
                value={s.doc_type}
                onChange={(e) => updateSplit(idx, 'doc_type', e.target.value)}
              >
                {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="差出人">
              <input
                className={inputCls}
                value={s.sender}
                onChange={(e) => updateSplit(idx, 'sender', e.target.value)}
                placeholder="例: 営業部"
              />
            </Field>
          </div>

          <Field label="件名 *">
            <input
              className={inputCls}
              value={s.title}
              onChange={(e) => updateSplit(idx, 'title', e.target.value)}
              placeholder="件名を入力"
            />
          </Field>

          {/* 宛先 */}
          <Field label="宛先">
            <select
              className={inputCls}
              value={s.target_type}
              onChange={(e) => updateSplit(idx, 'target_type', e.target.value)}
            >
              <option value="all">全員</option>
              <option value="company">会社指定</option>
              <option value="department">部署指定</option>
              <option value="user">ユーザー指定</option>
            </select>
          </Field>

          {s.target_type !== 'all' && (
            <div>
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  value={s._targetValue || ''}
                  onChange={(e) => updateSplit(idx, '_targetValue', e.target.value)}
                  placeholder={
                    s.target_type === 'company' ? '会社名' :
                    s.target_type === 'department' ? '部署名' : 'メールアドレス'
                  }
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTarget(idx))}
                />
                <Button variant="secondary" size="sm" onClick={() => addTarget(idx)}>
                  <Plus className="w-4 h-4" />追加
                </Button>
              </div>
              {(s.targets || []).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {s.targets.map((t, ti) => (
                    <span key={ti} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-brand-100 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300">
                      {t.value}
                      <button onClick={() => removeTarget(idx, ti)} className="hover:text-danger-500">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* OCRテキスト（折りたたみ） */}
          {s.ocr_text && (
            <details className="text-xs">
              <summary className="cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 select-none">
                本文テキスト（OCR）を表示
              </summary>
              <div className="mt-2 bg-slate-50 dark:bg-ink-900/40 rounded-xl p-3 whitespace-pre-wrap text-slate-600 dark:text-slate-300 max-h-40 overflow-y-auto">
                {s.ocr_text}
              </div>
            </details>
          )}
        </Card>
      ))}

      {splits.length > 0 && (
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>キャンセル</Button>
          <Button variant="primary" onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {saving ? '送信中...' : `${splits.length}件の書類を送信`}
          </Button>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────
// 発信タブ（admin）
// ──────────────────────────────────────────────
function SendTab({ showToast }) {
  const [uploading, setUploading] = useState(false)
  const [analyzeResult, setAnalyzeResult] = useState(null) // { batch_ref, page_count, splits }
  const [wizardFile, setWizardFile] = useState(null) // 元ファイル名（表示用）

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    setAnalyzeResult(null)
    setWizardFile(file.name)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await axios.post(`${apiUrl}/api/circulars/analyze`, fd, {
        headers: { ...authConfig().headers, 'Content-Type': 'multipart/form-data' },
      })
      setAnalyzeResult(res.data)
    } catch (err) {
      showToast('error', err.response?.data?.error || 'ファイルの解析に失敗しました')
      setWizardFile(null)
    } finally {
      setUploading(false)
    }
  }

  const handleComplete = () => {
    setAnalyzeResult(null)
    setWizardFile(null)
  }

  const handleCancel = () => {
    setAnalyzeResult(null)
    setWizardFile(null)
  }

  if (analyzeResult) {
    return (
      <SplitWizard
        batchRef={analyzeResult.batch_ref}
        pageCount={analyzeResult.page_count}
        initialSplits={analyzeResult.splits || []}
        onCancel={handleCancel}
        onComplete={handleComplete}
        showToast={showToast}
      />
    )
  }

  return (
    <div className="max-w-lg">
      <div className="rounded-2xl border border-brand-200 dark:border-brand-500/30 bg-brand-50/60 dark:bg-brand-500/10 p-6">
        <div className="flex items-center gap-2 mb-2">
          <Upload className="w-5 h-5 text-brand-600 dark:text-brand-400" />
          <p className="text-sm font-bold text-brand-700 dark:text-brand-300">ファイルをアップロードして回覧</p>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
          PDF または画像ファイルをアップロードします。AIが書類を自動分割し、ページ範囲・種別・件名などを解析します。内容を確認・編集してから送信してください。
        </p>
        {uploading ? (
          <div className="flex items-center gap-3 text-sm text-brand-600 dark:text-brand-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            解析中... しばらくお待ちください
          </div>
        ) : (
          <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 cursor-pointer transition">
            <Upload className="w-4 h-4" />
            ファイルを選択
            <input
              type="file"
              accept=".pdf,image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
        )}
        {wizardFile && !analyzeResult && !uploading && (
          <p className="mt-3 text-xs text-slate-400">{wizardFile}</p>
        )}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
// 管理タブ（admin）
// ──────────────────────────────────────────────
function ManageTab({ showToast }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [responses, setResponses] = useState({}) // { [id]: responses }
  const [loadingId, setLoadingId] = useState(null)
  const [openId, setOpenId] = useState(null)

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/circulars?manage=1`, authConfig())
      setItems(res.data)
    } catch {
      showToast('error', '書類一覧の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  const loadResponses = async (id) => {
    if (openId === id) { setOpenId(null); return }
    if (responses[id]) { setOpenId(id); return }
    setLoadingId(id)
    try {
      const res = await axios.get(`${apiUrl}/api/circulars/${id}/responses`, authConfig())
      setResponses((prev) => ({ ...prev, [id]: res.data }))
      setOpenId(id)
    } catch {
      showToast('error', '到達状況の取得に失敗しました')
    } finally {
      setLoadingId(null)
    }
  }

  if (loading) {
    return (
      <div className="text-center py-20">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600"></div>
        <p className="text-slate-500 dark:text-slate-400 mt-4">読み込み中...</p>
      </div>
    )
  }

  if (items.length === 0) {
    return <div className="text-center py-16 text-slate-400 dark:text-slate-500">書類はありません</div>
  }

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const resp = responses[item.id]
        const s = resp?.summary || {}
        const isOpen = openId === item.id
        return (
          <Card key={item.id} className="p-5">
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-brand-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{item.title || '（件名なし）'}</p>
                  <div className="flex gap-1 shrink-0">
                    {item.doc_type && <Badge tone="neutral">{item.doc_type}</Badge>}
                  </div>
                </div>
                <p className="text-xs text-slate-400 mb-3">
                  {item.sender && <span className="mr-2">{item.sender}</span>}
                  {fmtDate(item.created_at)}
                </p>

                {/* 簡易KPI（取得済みの場合） */}
                {resp && (
                  <div className="flex flex-wrap gap-3 mb-3 text-xs">
                    <span className="text-brand-600 dark:text-brand-400">既読: <strong>{s['read'] ?? 0}</strong></span>
                    <span className="text-danger-600 dark:text-danger-400">要対応: <strong>{s['要対応'] ?? 0}</strong></span>
                    <span className="text-warning-600 dark:text-warning-400">重要: <strong>{s['重要'] ?? 0}</strong></span>
                    <span className="text-success-600 dark:text-success-400">対応済: <strong>{s['対応済'] ?? 0}</strong></span>
                  </div>
                )}

                <button
                  onClick={() => loadResponses(item.id)}
                  className="flex items-center gap-1.5 text-sm font-semibold text-brand-600 dark:text-brand-400 hover:underline"
                >
                  <Users className="w-4 h-4" />
                  到達状況
                  {loadingId === item.id && <Loader2 className="w-3 h-3 animate-spin" />}
                  {loadingId !== item.id && (
                    <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  )}
                </button>

                {isOpen && resp && (
                  <div className="mt-3">
                    <ResponsesSummary responses={resp} />
                  </div>
                )}
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

// ──────────────────────────────────────────────
// メインページ
// ──────────────────────────────────────────────
export default function DocumentsPage({ onBack, onCountChange }) {
  const [tab, setTab] = useState('inbox') // 'inbox' | 'send' | 'manage'
  const [canAdmin, setCanAdmin] = useState(false)
  const { toast, showToast } = useToast()

  useEffect(() => {
    axios.get(`${apiUrl}/api/my-permissions`, authConfig())
      .then((res) => {
        const d = res.data
        setCanAdmin(d.role === 'admin' || d.apps?.['documents'] === 'admin')
      })
      .catch(() => setCanAdmin(false))
  }, [])

  const TABS = [
    { key: 'inbox', label: '受信トレイ', icon: Inbox },
    ...(canAdmin ? [
      { key: 'send', label: '発信', icon: Send },
      { key: 'manage', label: '管理', icon: BarChart3 },
    ] : []),
  ]

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
            <FolderOpen className="w-5 h-5 text-brand-500" />
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">文書回覧</h1>
          </div>

          {/* タブ切替 */}
          <div className="ml-2 flex gap-1">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold transition
                  ${tab === key
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-ink-800'
                  }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {toast && <Toast toast={toast} />}

      <main className="max-w-6xl mx-auto px-6 py-8">
        {tab === 'inbox' && (
          <InboxTab showToast={showToast} onCountChange={onCountChange} />
        )}
        {tab === 'send' && canAdmin && (
          <SendTab showToast={showToast} />
        )}
        {tab === 'manage' && canAdmin && (
          <ManageTab showToast={showToast} />
        )}
      </main>
    </div>
  )
}
