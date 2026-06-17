import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import {
  ArrowLeft, Plus, Pencil, Trash2, X, Save, Search, Loader2,
  Camera, Upload, User, Building2, Phone, Mail, Sparkles,
} from 'lucide-react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000'

// 認証付き axios 設定
function authConfig() {
  const token = localStorage.getItem('authToken')
  return { headers: { Authorization: `Bearer ${token}` } }
}

// multipart 用 axios 設定
function authConfigMultipart() {
  // Content-Type は指定しない。axios が FormData を検出して
  // boundary 付きの multipart/form-data を自動設定する（手動指定すると
  // boundary が欠落し、サーバー側(multer)がファイルをパースできなくなる）。
  const token = localStorage.getItem('authToken')
  return { headers: { Authorization: `Bearer ${token}` } }
}

// 日付（YYYY/M/D）
function fmtDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()}`
}

// ─────────────────────────────────────────────────────────
// Toast
// ─────────────────────────────────────────────────────────
function Toast({ toast }) {
  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-semibold
        ${toast.type === 'success'
          ? 'bg-success-100 dark:bg-success-500/20 text-success-700 dark:text-success-300 border border-success-200 dark:border-success-500/30'
          : 'bg-danger-100 dark:bg-danger-500/20 text-danger-700 dark:text-danger-300 border border-danger-200 dark:border-danger-500/30'
        }`}
    >
      {toast.msg}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// ModalShell（背景クリックでは閉じない）
// ─────────────────────────────────────────────────────────
function ModalShell({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div
        className={`bg-white dark:bg-ink-800 rounded-2xl shadow-xl border border-slate-200 dark:border-ink-700 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} my-8`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-ink-700 sticky top-0 bg-white dark:bg-ink-800 rounded-t-2xl z-10">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-ink-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// フォームパーツ
// ─────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}
const inputCls = 'w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-ink-600 bg-white dark:bg-ink-700 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-60'

// ─────────────────────────────────────────────────────────
// 名刺サムネイル
// ─────────────────────────────────────────────────────────
function CardThumb({ imageUrl, name }) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name || '名刺'}
        className="w-full h-28 object-cover rounded-xl bg-slate-100 dark:bg-ink-700"
      />
    )
  }
  return (
    <div className="w-full h-28 rounded-xl bg-slate-100 dark:bg-ink-700 flex items-center justify-center">
      <User className="w-10 h-10 text-slate-300 dark:text-ink-500" />
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// 空フォーム定義
// ─────────────────────────────────────────────────────────
const EMPTY_FORM = {
  full_name: '',
  company: '',
  department: '',
  title: '',
  phone: '',
  mobile: '',
  email: '',
  fax: '',
  postal_code: '',
  address: '',
  website: '',
  qualifications: '',
  note: '',
  visibility: 'private',
}

// ─────────────────────────────────────────────────────────
// 登録/編集フォームモーダル
// ─────────────────────────────────────────────────────────
function CardFormModal({ item, onClose, onSaved, showToast }) {
  const isNew = !item?.id
  const [form, setForm] = useState(() => {
    if (!item) return EMPTY_FORM
    const pick = (v) => (v == null ? '' : String(v))
    return {
      full_name: pick(item.full_name),
      company: pick(item.company),
      department: pick(item.department),
      title: pick(item.title),
      phone: pick(item.phone),
      mobile: pick(item.mobile),
      email: pick(item.email),
      fax: pick(item.fax),
      postal_code: pick(item.postal_code),
      address: pick(item.address),
      website: pick(item.website),
      qualifications: pick(item.qualifications),
      note: pick(item.note),
      visibility: item.visibility || 'private',
    }
  })
  const [saving, setSaving] = useState(false)
  const [imageFile, setImageFile] = useState(null)        // 新しく選択した画像
  const [imagePreview, setImagePreview] = useState(item?.image_url || null)
  const [scanning, setScanning] = useState(false)         // OCR中

  const cameraRef = useRef(null)
  const fileRef = useRef(null)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  // 画像を選択したとき: プレビュー＋自動OCR
  const handleImageSelect = async (file) => {
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))

    // OCR で自動入力
    setScanning(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await axios.post(`${apiUrl}/api/cards/scan`, fd, authConfigMultipart())
      // API は { extracted: {...} } 形式で返す（直下ではなく extracted を読む）
      const fields = res.data?.extracted || res.data || {}
      setForm((prev) => {
        const next = { ...prev }
        const keys = ['full_name','company','department','title','phone','mobile','email','fax','postal_code','address','website','qualifications','note']
        for (const k of keys) {
          if (fields[k] != null && fields[k] !== '') next[k] = String(fields[k])
        }
        return next
      })
      showToast('success', '名刺から情報を読み取りました。内容を確認してください')
    } catch (err) {
      showToast('error', err.response?.data?.error || '名刺の読み取りに失敗しました。手入力してください')
    } finally {
      setScanning(false)
    }
  }

  const save = async () => {
    if (!form.full_name.trim() && !form.company.trim()) {
      showToast('error', '氏名または会社名は必須です')
      return
    }
    setSaving(true)
    try {
      const fd = new FormData()
      if (imageFile) fd.append('file', imageFile)
      const fields = ['full_name','company','department','title','phone','mobile','email','fax','postal_code','address','website','qualifications','note','visibility']
      for (const k of fields) fd.append(k, form[k])

      if (isNew) {
        await axios.post(`${apiUrl}/api/cards`, fd, authConfigMultipart())
        showToast('success', '名刺を登録しました')
      } else {
        await axios.patch(`${apiUrl}/api/cards/${item.id}`, fd, authConfigMultipart())
        showToast('success', '名刺を更新しました')
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
    <ModalShell title={isNew ? '名刺を登録' : '名刺を編集'} onClose={onClose} wide>
      {/* 画像選択エリア */}
      <div className="mb-5 rounded-2xl border border-brand-200 dark:border-brand-500/30 bg-brand-50/60 dark:bg-brand-500/10 p-4">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-brand-600 dark:text-brand-400" />
          <p className="text-sm font-bold text-brand-700 dark:text-brand-300">
            {isNew ? '名刺を撮影・選択して自動入力' : '名刺画像を変更'}
          </p>
        </div>
        {isNew && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            スマホのカメラで撮影、またはファイルを選択すると、AIが名刺の情報を読み取って自動入力します。
            画像なしの手入力のみでも登録できます。
          </p>
        )}

        {/* プレビュー */}
        {imagePreview && (
          <div className="mb-3 relative w-fit">
            <img
              src={imagePreview}
              alt="名刺プレビュー"
              className="h-32 rounded-xl object-cover border border-slate-200 dark:border-ink-600"
            />
            {scanning && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl">
                <Loader2 className="w-6 h-6 text-white animate-spin" />
                <span className="ml-2 text-white text-sm font-semibold">読み取り中...</span>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {/* カメラ撮影（スマホ背面カメラ） */}
          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-ink-600 bg-white dark:bg-ink-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-ink-600 cursor-pointer">
            <Camera className="w-4 h-4" />
            カメラで撮影
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => { handleImageSelect(e.target.files?.[0]); e.target.value = '' }}
            />
          </label>

          {/* ファイル選択（PCや既存写真） */}
          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-ink-600 bg-white dark:bg-ink-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-ink-600 cursor-pointer">
            <Upload className="w-4 h-4" />
            ファイルを選択
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { handleImageSelect(e.target.files?.[0]); e.target.value = '' }}
            />
          </label>
        </div>
      </div>

      {/* フォーム */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="氏名">
            <input className={inputCls} value={form.full_name} onChange={(e) => set('full_name', e.target.value)} placeholder="例: 山田 太郎" />
          </Field>
          <Field label="会社名">
            <input className={inputCls} value={form.company} onChange={(e) => set('company', e.target.value)} placeholder="例: 株式会社◯◯" />
          </Field>
          <Field label="部署">
            <input className={inputCls} value={form.department} onChange={(e) => set('department', e.target.value)} placeholder="例: 営業部" />
          </Field>
          <Field label="役職">
            <input className={inputCls} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="例: 部長" />
          </Field>
          <Field label="電話番号">
            <input className={inputCls} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="例: 092-000-0000" />
          </Field>
          <Field label="携帯番号">
            <input className={inputCls} value={form.mobile} onChange={(e) => set('mobile', e.target.value)} placeholder="例: 090-0000-0000" />
          </Field>
          <Field label="メールアドレス">
            <input type="email" className={inputCls} value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="例: yamada@example.co.jp" />
          </Field>
          <Field label="FAX">
            <input className={inputCls} value={form.fax} onChange={(e) => set('fax', e.target.value)} />
          </Field>
          <Field label="郵便番号">
            <input className={inputCls} value={form.postal_code} onChange={(e) => set('postal_code', e.target.value)} placeholder="例: 810-0001" />
          </Field>
          <Field label="ウェブサイト">
            <input className={inputCls} value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="例: https://example.co.jp" />
          </Field>
        </div>

        <Field label="住所">
          <input className={inputCls} value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="例: 福岡県福岡市中央区◯◯" />
        </Field>

        <Field label="保有資格">
          <textarea
            className={inputCls + ' min-h-[60px] resize-y'}
            value={form.qualifications}
            onChange={(e) => set('qualifications', e.target.value)}
            placeholder="例: 一級土木施工管理技士、測量士"
          />
        </Field>

        <Field label="メモ">
          <textarea
            className={inputCls + ' min-h-[80px] resize-y'}
            value={form.note}
            onChange={(e) => set('note', e.target.value)}
            placeholder="社内メモ（相手には見えません）"
          />
        </Field>

        <Field label="公開範囲">
          <select className={inputCls} value={form.visibility} onChange={(e) => set('visibility', e.target.value)}>
            <option value="private">個人のみ（自分だけ閲覧可）</option>
            <option value="shared">全社共有</option>
          </select>
        </Field>
      </div>

      <div className="flex justify-end gap-2 mt-6">
        <Button variant="ghost" size="sm" onClick={onClose}>キャンセル</Button>
        <Button variant="primary" onClick={save} disabled={saving || scanning}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? '保存中...' : (isNew ? '登録する' : '更新する')}
        </Button>
      </div>
    </ModalShell>
  )
}

// ─────────────────────────────────────────────────────────
// 詳細/編集モーダル
// ─────────────────────────────────────────────────────────
function CardDetailModal({ card, isAdmin, currentUserEmail, onClose, onEdit, onDeleted, showToast }) {
  const [deleting, setDeleting] = useState(false)

  const canEdit = isAdmin || card.owner_email === currentUserEmail

  const handleDelete = async () => {
    if (!confirm(`「${card.full_name || card.company || '名刺'}」を削除しますか？`)) return
    setDeleting(true)
    try {
      await axios.delete(`${apiUrl}/api/cards/${card.id}`, authConfig())
      showToast('success', '削除しました')
      onDeleted()
      onClose()
    } catch {
      showToast('error', '削除に失敗しました')
      setDeleting(false)
    }
  }

  return (
    <ModalShell title={card.full_name || card.company || '名刺詳細'} onClose={onClose} wide>
      <div className="flex flex-col sm:flex-row gap-5">
        {/* 画像 */}
        <div className="sm:w-48 shrink-0">
          <CardThumb imageUrl={card.image_url} name={card.full_name} />
          <div className="mt-2 flex justify-center">
            <Badge tone={card.visibility === 'shared' ? 'info' : 'neutral'}>
              {card.visibility === 'shared' ? '全社共有' : '個人'}
            </Badge>
          </div>
        </div>

        {/* 情報 */}
        <div className="flex-1 space-y-2">
          {card.full_name && (
            <p className="text-xl font-bold text-slate-900 dark:text-white">{card.full_name}</p>
          )}
          {(card.company || card.department || card.title) && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {[card.company, card.department, card.title].filter(Boolean).join(' / ')}
            </p>
          )}

          <div className="pt-2 space-y-1.5">
            {card.phone && (
              <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <a href={`tel:${card.phone}`} className="hover:text-brand-600 dark:hover:text-brand-400">{card.phone}</a>
              </div>
            )}
            {card.mobile && (
              <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <a href={`tel:${card.mobile}`} className="hover:text-brand-600 dark:hover:text-brand-400">{card.mobile} (携帯)</a>
              </div>
            )}
            {card.email && (
              <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <a href={`mailto:${card.email}`} className="hover:text-brand-600 dark:hover:text-brand-400 truncate">{card.email}</a>
              </div>
            )}
            {card.fax && (
              <p className="text-sm text-slate-600 dark:text-slate-400">FAX: {card.fax}</p>
            )}
            {(card.postal_code || card.address) && (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {card.postal_code ? `〒${card.postal_code} ` : ''}{card.address}
              </p>
            )}
            {card.website && (
              <a
                href={card.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-brand-600 dark:text-brand-400 hover:underline truncate block"
              >
                {card.website}
              </a>
            )}
          </div>
        </div>
      </div>

      {card.qualifications && (
        <div className="mt-4">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">保有資格</p>
          <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap bg-slate-50 dark:bg-ink-900/40 rounded-xl p-3">
            {card.qualifications}
          </div>
        </div>
      )}

      {card.note && (
        <div className="mt-3">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">メモ（社内）</p>
          <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap bg-slate-50 dark:bg-ink-900/40 rounded-xl p-3">
            {card.note}
          </div>
        </div>
      )}

      <p className="text-xs text-slate-400 dark:text-slate-500 mt-3">
        登録: {fmtDate(card.created_at)}
        {card.owner_email ? ` ・ 登録者: ${card.owner_email}` : ''}
      </p>

      {canEdit && (
        <div className="flex justify-end gap-2 mt-5">
          {canEdit && (
            <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              削除
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => { onClose(); onEdit(card) }}>
            <Pencil className="w-4 h-4" />編集
          </Button>
        </div>
      )}
    </ModalShell>
  )
}

// ─────────────────────────────────────────────────────────
// メインページ
// ─────────────────────────────────────────────────────────
export default function BusinessCardsPage({ onBack }) {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState('all') // 'all' | 'mine' | 'shared'
  const [selectedCard, setSelectedCard] = useState(null)  // 詳細表示中の名刺オブジェクト
  const [editing, setEditing] = useState(null)            // null=非表示 / {}=新規 / item=編集
  const [toast, setToast] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [currentUserEmail, setCurrentUserEmail] = useState('')

  const showToast = useCallback((type, msg) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const loadCards = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('q', search.trim())
      if (scope) params.set('scope', scope)
      const res = await axios.get(`${apiUrl}/api/cards?${params}`, authConfig())
      setCards(res.data)
    } catch {
      showToast('error', '名刺一覧の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [search, scope, showToast])

  useEffect(() => {
    setLoading(true)
    loadCards()
  }, [loadCards])

  // 権限とログインユーザー情報の取得
  useEffect(() => {
    axios.get(`${apiUrl}/api/my-permissions`, authConfig())
      .then((res) => {
        setIsAdmin(res.data?.role === 'admin' || res.data?.apps?.cards === 'admin')
        if (res.data?.email) setCurrentUserEmail(res.data.email)
      })
      .catch(() => {
        setIsAdmin(false)
        // localStorage からフォールバック
        try {
          const u = JSON.parse(localStorage.getItem('user') || '{}')
          if (u.email) setCurrentUserEmail(u.email)
        } catch {}
      })
  }, [])

  const SCOPE_OPTIONS = [
    { value: 'all',    label: 'すべて' },
    { value: 'mine',   label: '自分が登録' },
    { value: 'shared', label: '全社共有' },
  ]

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-ink-950 transition-colors">
      {/* ヘッダー */}
      <header className="bg-white/80 dark:bg-ink-900/80 backdrop-blur border-b border-slate-200 dark:border-ink-800 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />戻る
          </Button>
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-brand-500" />
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">名刺管理</h1>
          </div>
          <div className="ml-auto">
            <Button variant="primary" size="sm" onClick={() => setEditing({})}>
              <Plus className="w-4 h-4" />名刺を登録
            </Button>
          </div>
        </div>
      </header>

      {toast && <Toast toast={toast} />}

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* 検索バー + スコープ切替 */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="氏名・会社・役職・資格で検索"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-ink-600 bg-white dark:bg-ink-700 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          <div className="flex rounded-xl border border-slate-200 dark:border-ink-600 overflow-hidden bg-white dark:bg-ink-700">
            {SCOPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setScope(opt.value)}
                className={`px-3 py-2 text-sm font-semibold transition
                  ${scope === opt.value
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-ink-600'
                  }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 一覧 */}
        {loading ? (
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600"></div>
            <p className="text-slate-500 dark:text-slate-400 mt-4">読み込み中...</p>
          </div>
        ) : cards.length === 0 ? (
          <div className="text-center py-16 text-slate-400 dark:text-slate-500">
            <User className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>名刺が見つかりません</p>
            {scope !== 'all' && (
              <p className="text-xs mt-1">条件を変えて検索してみてください</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {cards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => setSelectedCard(card)}
                className="text-left bg-white dark:bg-ink-800 rounded-2xl border border-slate-200 dark:border-ink-700 shadow-sm hover:shadow-md hover:border-brand-300 dark:hover:border-brand-500/50 transition p-4 flex flex-col gap-2"
              >
                {/* サムネイル */}
                <CardThumb imageUrl={card.image_url} name={card.full_name} />

                {/* 名前・会社 */}
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 dark:text-white truncate text-sm">
                    {card.full_name || '（氏名未登録）'}
                  </p>
                  {card.company && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{card.company}</p>
                  )}
                  {card.title && (
                    <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{card.title}</p>
                  )}
                  {card.department && (
                    <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{card.department}</p>
                  )}
                </div>

                {/* 連絡先 */}
                <div className="space-y-0.5 min-w-0">
                  {card.phone && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <Phone className="w-3 h-3 shrink-0" />
                      <span className="truncate">{card.phone}</span>
                    </div>
                  )}
                  {card.email && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <Mail className="w-3 h-3 shrink-0" />
                      <span className="truncate">{card.email}</span>
                    </div>
                  )}
                  {card.qualifications && (
                    <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{card.qualifications}</p>
                  )}
                </div>

                {/* バッジ */}
                <div className="mt-auto pt-1">
                  <Badge tone={card.visibility === 'shared' ? 'info' : 'neutral'}>
                    {card.visibility === 'shared' ? '全社共有' : '個人'}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {/* 詳細モーダル */}
      {selectedCard && (
        <CardDetailModal
          card={selectedCard}
          isAdmin={isAdmin}
          currentUserEmail={currentUserEmail}
          onClose={() => setSelectedCard(null)}
          onEdit={(item) => setEditing(item)}
          onDeleted={loadCards}
          showToast={showToast}
        />
      )}

      {/* 登録/編集フォームモーダル */}
      {editing !== null && (
        <CardFormModal
          item={editing?.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={loadCards}
          showToast={showToast}
        />
      )}
    </div>
  )
}
