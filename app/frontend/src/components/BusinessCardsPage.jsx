import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import axios from 'axios'
import {
  ArrowLeft, Plus, Pencil, Trash2, X, Save, Search, Loader2,
  Camera, Upload, User, Building2, Phone, Mail, Sparkles, Tag,
  LayoutGrid, Table2, ChevronUp, ChevronDown, ChevronsUpDown,
} from 'lucide-react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import Toast from './ui/Toast'
import ModalShell from './ui/ModalShell'
import Field from './ui/Field'
import { API_URL as apiUrl, authConfig, authConfigMultipart } from '../lib/api'
import { useToast } from '../lib/useToast'
import { inputCls } from '../lib/ui'
import { isPdfFile, pdfToImageFiles } from '../lib/pdf'

// 日付（YYYY/M/D）
function fmtDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()}`
}

// ─────────────────────────────────────────────────────────
// フォームパーツ用セクションヘッダ（Field/ModalShellはui/からimport済み）
// ─────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────
// 名刺サムネイル
// ─────────────────────────────────────────────────────────
function CardThumb({ imageUrl, name, onZoom }) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name || '名刺'}
        loading="lazy"
        decoding="async"
        onClick={onZoom ? (e) => { e.stopPropagation(); onZoom(imageUrl) } : undefined}
        className={`w-full h-28 object-cover rounded-xl bg-slate-100 dark:bg-ink-700 ${onZoom ? 'cursor-zoom-in hover:opacity-90 transition' : ''}`}
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
// 画像ライトボックス（拡大表示）
// ※ 名刺画像の拡大用。背景クリック / Esc / × で閉じる（ライトボックスは例外的に背景クリック可）
// ─────────────────────────────────────────────────────────
function ImageLightbox({ url, onClose }) {
  useEffect(() => {
    if (!url) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [url, onClose])
  if (!url) return null
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        aria-label="閉じる"
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
      >
        <X className="w-6 h-6" />
      </button>
      <img
        src={url}
        alt="名刺拡大"
        onClick={(e) => e.stopPropagation()}
        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
      />
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
  visibility: 'shared',  // (2) デフォルトを全社共有に変更
  category: '',
}

// ─────────────────────────────────────────────────────────
// 登録/編集フォームモーダル
// mode: 'scan' = 撮影・ファイル登録（画像エリアを最初から表示）
//       'manual' = 手入力（画像エリアは初期非表示）
//       undefined = 編集時（従来どおり画像差し替え可）
// ─────────────────────────────────────────────────────────
function CardFormModal({ item, mode, onClose, onSaved, showToast, onMulti }) {
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
      visibility: item.visibility || 'shared',
      category: pick(item.category),
    }
  })
  const [saving, setSaving] = useState(false)
  const [imageFile, setImageFile] = useState(null)        // 新しく選択した表面画像
  const [imagePreview, setImagePreview] = useState(item?.image_url || null)
  const [backImageFile, setBackImageFile] = useState(null)          // 新しく選択した裏面画像
  const [backImagePreview, setBackImagePreview] = useState(item?.back_image_url || null)
  const [removeBack, setRemoveBack] = useState(false)     // 既存の裏面を削除するか（編集時）
  const [scanning, setScanning] = useState(false)         // OCR中
  const [categoryOptions, setCategoryOptions] = useState([])  // (4) カテゴリ候補
  // manual モードで画像添付エリアを表示するかどうか
  const [showImageArea, setShowImageArea] = useState(mode !== 'manual')

  // 画像添付ボタン共通スタイル（表面/裏面 × カメラ/ファイルで再利用）
  const attachBtnCls = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-ink-600 bg-white dark:bg-ink-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-ink-600 cursor-pointer'

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  // (5) 業種カテゴリ自動提案
  const [suggesting, setSuggesting] = useState(false)        // 提案問い合わせ中
  const [suggestSource, setSuggestSource] = useState(null)   // 'existing' | 'researched' | null
  const lastSuggestRef = useRef('')                          // 直前に問い合わせた会社名（二重防止）

  // 会社名からカテゴリを自動提案。カテゴリ未入力のときだけ反映し、ユーザー入力は上書きしない。
  const suggestCategory = async (companyRaw, { force = false } = {}) => {
    const company = String(companyRaw || '').trim()
    if (!company) return
    if (!force && lastSuggestRef.current === company) return  // 同じ会社名は投げ直さない
    lastSuggestRef.current = company
    setSuggesting(true)
    try {
      const res = await axios.post(`${apiUrl}/api/cards/suggest-category`, { company }, authConfig())
      const cat = res.data?.category
      const source = res.data?.source
      if (cat) {
        let applied = false
        setForm((prev) => {
          if (prev.category && prev.category.trim()) return prev  // 既に入力あり → 尊重
          applied = true
          return { ...prev, category: cat }
        })
        // 反映できたときだけ提案元バッジを表示
        if (applied) setSuggestSource(source === 'existing' || source === 'researched' ? source : null)
      }
    } catch {
      // 提案失敗は黙って無視（手入力で対応可能）
    } finally {
      setSuggesting(false)
    }
  }

  // (4) フォームを開く際にカテゴリ候補を取得
  useEffect(() => {
    axios.get(`${apiUrl}/api/cards/categories`, authConfig())
      .then((res) => {
        // レスポンス形式: { categories: [...] }
        setCategoryOptions(res.data?.categories || [])
      })
      .catch(() => {
        // 候補取得失敗は無視（空のままで手入力可能）
        setCategoryOptions([])
      })
  }, [])

  // 表面画像を確定してOCR自動入力（引数は画像File。PDFは呼び出し前に画像へ変換済み）
  const handleFrontImage = async (file) => {
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))

    // OCR で自動入力
    setScanning(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      // OCR は複数回の画像解析が走るため長め。ただし無限待ちにはしない（120秒で打ち切り）
      const res = await axios.post(`${apiUrl}/api/cards/scan`, fd, { ...authConfigMultipart(), timeout: 120000 })

      // 1画像に複数枚の名刺が写っていた場合 → 複数名刺レビュー画面へ切り替え
      const detected = res.data?.cards
      if (onMulti && res.data?.count > 1 && Array.isArray(detected) && detected.length > 1) {
        setScanning(false)
        showToast('success', `${detected.length}枚の名刺を検出しました。内容を確認してください`)
        onMulti(file, detected)
        return
      }

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
      // OCR で会社名が取れたら、そのままカテゴリも自動提案
      if (fields.company) suggestCategory(fields.company)
      showToast('success', '名刺から情報を読み取りました。内容を確認してください')
    } catch (err) {
      showToast('error', err.response?.data?.error || '名刺の読み取りに失敗しました。手入力してください')
    } finally {
      setScanning(false)
    }
  }

  // 裏面画像を確定（OCRなし・画像として保存するだけ）
  const setBackImage = (file) => {
    if (!file) return
    setBackImageFile(file)
    setBackImagePreview(URL.createObjectURL(file))
    setRemoveBack(false)
  }

  // 表面の入力（カメラ/ファイル）。PDFなら 1p=表・2p=裏に自動分解する。
  const handleFrontSelect = async (raw) => {
    if (!raw) return
    if (isPdfFile(raw)) {
      setScanning(true)
      try {
        const pages = await pdfToImageFiles(raw, { maxPages: 2, baseName: 'front' })
        if (pages.length === 0) { showToast('error', 'PDFからページを読み取れませんでした'); setScanning(false); return }
        if (pages.length >= 2) {
          setBackImage(pages[1])
          showToast('success', 'PDFから表・裏の2面を読み取りました')
        }
        await handleFrontImage(pages[0])   // 表面（1ページ目）でOCR
      } catch {
        setScanning(false)
        showToast('error', 'PDFの読み込みに失敗しました')
      }
      return
    }
    await handleFrontImage(raw)
  }

  // 裏面の入力（カメラ/ファイル）。PDFなら1ページ目を裏面画像として使う。
  const handleBackSelect = async (raw) => {
    if (!raw) return
    if (isPdfFile(raw)) {
      try {
        const pages = await pdfToImageFiles(raw, { maxPages: 1, baseName: 'back' })
        if (pages.length > 0) setBackImage(pages[0])
      } catch {
        showToast('error', 'PDFの読み込みに失敗しました')
      }
      return
    }
    setBackImage(raw)
  }

  // 裏面を外す（編集時は既存裏面の削除フラグを立てる）
  const clearBackImage = () => {
    setBackImageFile(null)
    setBackImagePreview(null)
    setRemoveBack(true)
  }

  const save = async () => {
    if (!form.full_name.trim() && !form.company.trim()) {
      showToast('error', '氏名または会社名は必須です')
      return
    }
    setSaving(true)
    try {
      const fd = new FormData()
      if (imageFile) fd.append('file', imageFile)            // 表面
      if (backImageFile) fd.append('back_file', backImageFile)  // 裏面
      if (!isNew && removeBack && !backImageFile) fd.append('remove_back', '1')  // 既存裏面を削除
      // (3) category を追加したフィールドリストで送信
      const fields = ['full_name','company','department','title','phone','mobile','email','fax','postal_code','address','website','qualifications','note','visibility','category']
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

  // モーダルタイトルを mode に応じて決定
  const modalTitle = isNew
    ? (mode === 'manual' ? '手入力で登録' : '撮影・ファイルで登録')
    : '名刺を編集'

  return (
    <ModalShell title={modalTitle} onClose={onClose} wide>
      {/* (1) 画像選択エリア: scan モードは常時表示、manual モードはトグルで表示、編集時は常時表示 */}
      {showImageArea ? (
        <div className="mb-5 rounded-2xl border border-brand-200 dark:border-brand-500/30 bg-brand-50/60 dark:bg-brand-500/10 p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              <p className="text-sm font-bold text-brand-700 dark:text-brand-300">
                {isNew ? '名刺を撮影・選択して自動入力' : '名刺画像を変更'}
              </p>
            </div>
            {/* manual モードでは画像エリアを閉じるボタンを表示 */}
            {mode === 'manual' && isNew && (
              <button
                type="button"
                onClick={() => setShowImageArea(false)}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline"
              >
                閉じる
              </button>
            )}
          </div>
          {isNew && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              カメラ撮影またはファイルを選ぶと、AIが表面の情報を読み取って自動入力します。裏面がある場合は「裏面」に追加してください。
              <span className="font-semibold">2ページのPDFは1枚目＝表・2枚目＝裏に自動で振り分けます。</span>
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 表面（OCR対象） */}
            <div>
              <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">表面（自動読み取り）</p>
              {imagePreview ? (
                <div className="mb-2 relative w-fit">
                  <img src={imagePreview} alt="表面プレビュー" className="h-32 rounded-xl object-cover border border-slate-200 dark:border-ink-600" />
                  {scanning && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl">
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                      <span className="ml-2 text-white text-sm font-semibold">読み取り中...</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mb-2 h-32 w-full max-w-[13rem] rounded-xl border border-dashed border-slate-300 dark:border-ink-600 flex items-center justify-center text-slate-300 dark:text-ink-500">
                  <User className="w-8 h-8" />
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <label className={attachBtnCls}>
                  <Camera className="w-4 h-4" />撮影
                  <input type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={(e) => { handleFrontSelect(e.target.files?.[0]); e.target.value = '' }} />
                </label>
                <label className={attachBtnCls}>
                  <Upload className="w-4 h-4" />ファイル/PDF
                  <input type="file" accept="image/*,application/pdf" className="hidden"
                    onChange={(e) => { handleFrontSelect(e.target.files?.[0]); e.target.value = '' }} />
                </label>
              </div>
            </div>

            {/* 裏面（任意・保存のみ） */}
            <div>
              <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">裏面（任意）</p>
              {backImagePreview ? (
                <div className="mb-2 relative w-fit">
                  <img src={backImagePreview} alt="裏面プレビュー" className="h-32 rounded-xl object-cover border border-slate-200 dark:border-ink-600" />
                  <button type="button" onClick={clearBackImage} aria-label="裏面を削除"
                    className="absolute -top-2 -right-2 p-1 rounded-full bg-white dark:bg-ink-700 border border-slate-300 dark:border-ink-500 shadow text-slate-500 hover:text-red-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="mb-2 h-32 w-full max-w-[13rem] rounded-xl border border-dashed border-slate-300 dark:border-ink-600 flex items-center justify-center text-slate-400 dark:text-ink-500 text-xs">
                  裏面なし
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <label className={attachBtnCls}>
                  <Camera className="w-4 h-4" />撮影
                  <input type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={(e) => { handleBackSelect(e.target.files?.[0]); e.target.value = '' }} />
                </label>
                <label className={attachBtnCls}>
                  <Upload className="w-4 h-4" />ファイル/PDF
                  <input type="file" accept="image/*,application/pdf" className="hidden"
                    onChange={(e) => { handleBackSelect(e.target.files?.[0]); e.target.value = '' }} />
                </label>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* manual モードで画像エリアが非表示のとき: 添付ボタンを表示 */
        mode === 'manual' && isNew && (
          <div className="mb-5">
            <button
              type="button"
              onClick={() => setShowImageArea(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-ink-600 bg-white dark:bg-ink-700 text-sm font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-ink-600"
            >
              <Upload className="w-4 h-4" />
              画像を添付（任意）
            </button>
          </div>
        )
      )}

      {/* フォーム */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="氏名">
            <input className={inputCls} value={form.full_name} onChange={(e) => set('full_name', e.target.value)} placeholder="例: 山田 太郎" />
          </Field>
          <Field label="会社名">
            <input className={inputCls} value={form.company} onChange={(e) => set('company', e.target.value)} onBlur={(e) => suggestCategory(e.target.value)} placeholder="例: 株式会社◯◯" />
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

        {/* (3) カテゴリ入力（datalist で既存候補表示 + 自由入力 + 業種自動提案） */}
        <Field label="カテゴリ">
          <div className="flex items-center gap-2">
            <input
              className={inputCls}
              value={form.category}
              onChange={(e) => { set('category', e.target.value); setSuggestSource(null) }}
              list="card-category-list"
              placeholder="例: 官公庁、協力会社（任意）"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => suggestCategory(form.company, { force: true })}
              disabled={suggesting || !form.company.trim()}
              title="会社名から業種を調べてカテゴリを提案します"
            >
              {suggesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              自動提案
            </Button>
          </div>
          <datalist id="card-category-list">
            {categoryOptions.map((opt) => (
              <option key={opt} value={opt} />
            ))}
          </datalist>
          {suggesting && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">会社名から業種を調べています...</p>
          )}
          {!suggesting && suggestSource && (
            <p className="mt-1 text-xs text-brand-600 dark:text-brand-300">
              {suggestSource === 'existing'
                ? '✓ 同じ会社の既存名刺からカテゴリを引き継ぎました'
                : '✓ 業種を調べてカテゴリを提案しました（内容を確認してください）'}
            </p>
          )}
        </Field>

        <Field label="公開範囲">
          <select className={inputCls} value={form.visibility} onChange={(e) => set('visibility', e.target.value)}>
            <option value="shared">全社共有</option>
            <option value="private">個人のみ（自分だけ閲覧可）</option>
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
// 複数名刺レビューモーダル
// 1画像に複数枚の名刺が写っていた場合に表示。検出された各名刺を
// 切り出しプレビュー付きで個別に確認・編集し、まとめて登録する。
// ─────────────────────────────────────────────────────────
const MULTI_FIELDS = ['full_name','company','department','title','phone','mobile','email','fax','postal_code','address','website','qualifications','note']

function MultiCardReviewModal({ file, cards, onClose, onSaved, showToast }) {
  const [rows, setRows] = useState(() =>
    cards.map((c) => {
      const ex = c.extracted || {}
      const r = { box_2d: c.box_2d || null, include: true, expanded: false, category: '', visibility: 'shared', preview: null }
      for (const k of MULTI_FIELDS) r[k] = ex[k] == null ? '' : String(ex[k])
      return r
    })
  )
  const [saving, setSaving] = useState(false)
  const [categoryOptions, setCategoryOptions] = useState([])

  const setRow = (idx, k, v) => setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, [k]: v } : r)))

  // カテゴリ候補
  useEffect(() => {
    axios.get(`${apiUrl}/api/cards/categories`, authConfig())
      .then((res) => setCategoryOptions(res.data?.categories || []))
      .catch(() => setCategoryOptions([]))
  }, [])

  // 元画像から box_2d ごとにクライアント側で切り出してプレビュー生成
  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const W = img.naturalWidth, H = img.naturalHeight
      setRows((rs) => rs.map((r) => {
        const box = r.box_2d
        try {
          let sx = 0, sy = 0, sw = W, sh = H
          if (Array.isArray(box) && box.length === 4) {
            const [ymin, xmin, ymax, xmax] = box.map(Number)
            const pad = Math.min(W, H) * 0.03
            sx = Math.max(0, (Math.min(xmin, xmax) / 1000) * W - pad)
            sy = Math.max(0, (Math.min(ymin, ymax) / 1000) * H - pad)
            const rx = Math.min(W, (Math.max(xmin, xmax) / 1000) * W + pad)
            const ry = Math.min(H, (Math.max(ymin, ymax) / 1000) * H + pad)
            sw = Math.max(1, rx - sx)
            sh = Math.max(1, ry - sy)
          }
          const scale = Math.min(1, 360 / sw)
          const cv = document.createElement('canvas')
          cv.width = Math.max(1, Math.round(sw * scale))
          cv.height = Math.max(1, Math.round(sh * scale))
          cv.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height)
          return { ...r, preview: cv.toDataURL('image/jpeg', 0.8) }
        } catch {
          return r
        }
      }))
      URL.revokeObjectURL(url)
    }
    img.onerror = () => URL.revokeObjectURL(url)
    img.src = url
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  const selectedCount = rows.filter((r) => r.include).length

  const setAllVisibility = (v) => setRows((rs) => rs.map((r) => ({ ...r, visibility: v })))

  const save = async () => {
    const targets = rows.filter((r) => r.include)
    if (targets.length === 0) { showToast('error', '登録する名刺を1枚以上選択してください'); return }
    const invalid = targets.find((r) => !r.full_name.trim() && !r.company.trim())
    if (invalid) { showToast('error', '各名刺に氏名または会社名が必要です（未入力の名刺があります）'); return }

    setSaving(true)
    try {
      const payload = targets.map((r) => {
        const o = { box_2d: r.box_2d, category: r.category, visibility: r.visibility }
        for (const k of MULTI_FIELDS) o[k] = r[k]
        return o
      })
      const fd = new FormData()
      fd.append('file', file)
      fd.append('cards', JSON.stringify(payload))
      const res = await axios.post(`${apiUrl}/api/cards/batch`, fd, authConfigMultipart())
      showToast('success', `${res.data?.count ?? targets.length}件の名刺を登録しました`)
      onSaved()
      onClose()
    } catch (err) {
      showToast('error', err.response?.data?.error || '一括登録に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title={`複数の名刺を確認（${rows.length}枚検出）`} onClose={onClose} wide>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          1枚の画像から複数の名刺を検出しました。内容を確認・修正し、登録する名刺だけにチェックを入れてください。
        </p>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">公開範囲を一括設定:</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setAllVisibility('shared')}>全社共有</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setAllVisibility('private')}>個人のみ</Button>
        </div>
      </div>

      <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
        {rows.map((r, idx) => (
          <div
            key={idx}
            className={`rounded-2xl border p-3 transition ${r.include
              ? 'border-brand-200 dark:border-brand-500/30 bg-white dark:bg-ink-800'
              : 'border-slate-200 dark:border-ink-600 bg-slate-50/70 dark:bg-ink-900/40 opacity-60'}`}
          >
            <div className="flex gap-3">
              {/* チェック + プレビュー */}
              <div className="flex flex-col items-center gap-2 shrink-0">
                <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={r.include} onChange={(e) => setRow(idx, 'include', e.target.checked)} className="w-4 h-4 accent-brand-600" />
                  登録
                </label>
                {r.preview ? (
                  <img src={r.preview} alt={`名刺${idx + 1}`} className="w-28 h-auto max-h-28 object-contain rounded-lg border border-slate-200 dark:border-ink-600 bg-slate-100 dark:bg-ink-700" />
                ) : (
                  <div className="w-28 h-20 rounded-lg bg-slate-100 dark:bg-ink-700 flex items-center justify-center">
                    <User className="w-8 h-8 text-slate-300 dark:text-ink-500" />
                  </div>
                )}
              </div>

              {/* 主要フィールド */}
              <div className="flex-1 min-w-0 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Field label="氏名"><input className={inputCls} value={r.full_name} onChange={(e) => setRow(idx, 'full_name', e.target.value)} placeholder="例: 山田 太郎" /></Field>
                  <Field label="会社名"><input className={inputCls} value={r.company} onChange={(e) => setRow(idx, 'company', e.target.value)} placeholder="例: 株式会社◯◯" /></Field>
                  <Field label="部署"><input className={inputCls} value={r.department} onChange={(e) => setRow(idx, 'department', e.target.value)} /></Field>
                  <Field label="役職"><input className={inputCls} value={r.title} onChange={(e) => setRow(idx, 'title', e.target.value)} /></Field>
                  <Field label="電話番号"><input className={inputCls} value={r.phone} onChange={(e) => setRow(idx, 'phone', e.target.value)} /></Field>
                  <Field label="携帯番号"><input className={inputCls} value={r.mobile} onChange={(e) => setRow(idx, 'mobile', e.target.value)} /></Field>
                  <Field label="メール"><input type="email" className={inputCls} value={r.email} onChange={(e) => setRow(idx, 'email', e.target.value)} /></Field>
                  <Field label="カテゴリ">
                    <input className={inputCls} value={r.category} onChange={(e) => setRow(idx, 'category', e.target.value)} list="card-category-list-multi" placeholder="任意" />
                  </Field>
                </div>

                {r.expanded && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    <Field label="FAX"><input className={inputCls} value={r.fax} onChange={(e) => setRow(idx, 'fax', e.target.value)} /></Field>
                    <Field label="郵便番号"><input className={inputCls} value={r.postal_code} onChange={(e) => setRow(idx, 'postal_code', e.target.value)} /></Field>
                    <Field label="ウェブサイト"><input className={inputCls} value={r.website} onChange={(e) => setRow(idx, 'website', e.target.value)} /></Field>
                    <Field label="住所"><input className={inputCls} value={r.address} onChange={(e) => setRow(idx, 'address', e.target.value)} /></Field>
                    <div className="sm:col-span-2">
                      <Field label="保有資格"><input className={inputCls} value={r.qualifications} onChange={(e) => setRow(idx, 'qualifications', e.target.value)} /></Field>
                    </div>
                    <div className="sm:col-span-2">
                      <Field label="メモ"><input className={inputCls} value={r.note} onChange={(e) => setRow(idx, 'note', e.target.value)} placeholder="社内メモ" /></Field>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <button type="button" onClick={() => setRow(idx, 'expanded', !r.expanded)} className="text-xs text-brand-600 dark:text-brand-300 underline">
                    {r.expanded ? '詳細項目を閉じる' : 'その他の項目を編集'}
                  </button>
                  <select className={inputCls + ' max-w-[180px] py-1 text-xs'} value={r.visibility} onChange={(e) => setRow(idx, 'visibility', e.target.value)}>
                    <option value="shared">全社共有</option>
                    <option value="private">個人のみ</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <datalist id="card-category-list-multi">
        {categoryOptions.map((opt) => (<option key={opt} value={opt} />))}
      </datalist>

      <div className="flex justify-end gap-2 mt-6">
        <Button variant="ghost" size="sm" onClick={onClose}>キャンセル</Button>
        <Button variant="primary" onClick={save} disabled={saving || selectedCount === 0}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? '登録中...' : `${selectedCount}件を登録する`}
        </Button>
      </div>
    </ModalShell>
  )
}

// ─────────────────────────────────────────────────────────
// 詳細/編集モーダル
// ─────────────────────────────────────────────────────────
function CardDetailModal({ card, isAdmin, currentUserEmail, onClose, onEdit, onDeleted, onRefresh, showToast, onZoom }) {
  const [deleting, setDeleting] = useState(false)

  const canEdit = isAdmin || card.owner_email === currentUserEmail

  // マイカテゴリ（個人ラベル）— 閲覧できる人なら誰でも設定可
  const [myCat, setMyCat] = useState(card.my_category || '')
  const [savedMyCat, setSavedMyCat] = useState(card.my_category || '')  // 保存済みベースライン
  const [myCatSaving, setMyCatSaving] = useState(false)
  const [myCatOptions, setMyCatOptions] = useState([])
  const myCatDirty = (myCat || '').trim() !== (savedMyCat || '').trim()

  useEffect(() => {
    axios.get(`${apiUrl}/api/cards/my-categories`, authConfig())
      .then((res) => setMyCatOptions(res.data?.categories || []))
      .catch(() => setMyCatOptions([]))
  }, [])

  const saveMyCat = async () => {
    setMyCatSaving(true)
    try {
      await axios.put(`${apiUrl}/api/cards/${card.id}/my-category`, { category: myCat.trim() }, authConfig())
      setSavedMyCat(myCat.trim())
      showToast('success', myCat.trim() ? 'マイカテゴリを保存しました' : 'マイカテゴリを解除しました')
      onRefresh?.()
    } catch {
      showToast('error', 'マイカテゴリの保存に失敗しました')
    } finally {
      setMyCatSaving(false)
    }
  }

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
        {/* 画像（表面 ＋ 裏面があれば裏面も） */}
        <div className="sm:w-48 shrink-0">
          <CardThumb imageUrl={card.image_url} name={card.full_name} onZoom={onZoom} />
          {card.back_image_url && (
            <div className="mt-2">
              <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 mb-1">裏面</p>
              <CardThumb imageUrl={card.back_image_url} name={`${card.full_name || ''} 裏面`} onZoom={onZoom} />
            </div>
          )}
          <div className="mt-2 flex flex-wrap justify-center gap-1">
            <Badge tone={card.visibility === 'shared' ? 'info' : 'neutral'}>
              {card.visibility === 'shared' ? '全社共有' : '個人'}
            </Badge>
            {/* (3) カテゴリバッジ */}
            {card.category && (
              <Badge tone="warning">
                <Tag className="w-3 h-3 inline mr-0.5" />{card.category}
              </Badge>
            )}
            {/* マイカテゴリバッジ（本人だけに見える） */}
            {card.my_category && (
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300">
                <User className="w-3 h-3" />{card.my_category}
              </span>
            )}
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

      {/* マイカテゴリ（自分だけに見える個人ラベル） */}
      <div className="mt-4 rounded-xl border border-violet-200 dark:border-violet-500/30 bg-violet-50/60 dark:bg-violet-500/10 p-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <User className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
          <p className="text-xs font-bold text-violet-700 dark:text-violet-300">マイカテゴリ（自分だけに見えます）</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            className="flex-1 px-3 py-2 rounded-xl border border-violet-200 dark:border-violet-500/40 bg-white dark:bg-ink-700 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400"
            value={myCat}
            onChange={(e) => setMyCat(e.target.value)}
            list="my-category-list"
            placeholder="例: 重要、要フォロー（空欄で解除）"
          />
          <datalist id="my-category-list">
            {myCatOptions.map((opt) => (<option key={opt} value={opt} />))}
          </datalist>
          <Button variant="secondary" size="sm" onClick={saveMyCat} disabled={myCatSaving || !myCatDirty}>
            {myCatSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            保存
          </Button>
        </div>
      </div>

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
// 名刺タイル（一覧の1枚。フラット表示・グループ表示で共用）
// ─────────────────────────────────────────────────────────
function CardTile({ card, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
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
      <div className="mt-auto pt-1 flex flex-wrap gap-1">
        <Badge tone={card.visibility === 'shared' ? 'info' : 'neutral'}>
          {card.visibility === 'shared' ? '全社共有' : '個人'}
        </Badge>
        {card.back_image_url && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-ink-700 text-slate-500 dark:text-slate-400">両面</span>
        )}
        {card.category && (
          <Badge tone="warning">
            <Tag className="w-3 h-3 inline mr-0.5" />{card.category}
          </Badge>
        )}
        {/* マイカテゴリ（本人だけに見える個人ラベル） */}
        {card.my_category && (
          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300">
            <User className="w-3 h-3" />{card.my_category}
          </span>
        )}
      </div>
    </button>
  )
}

// ─────────────────────────────────────────────────────────
// テーブル表示（ソート可能）
// ─────────────────────────────────────────────────────────
function SortHeader({ label, colKey, sortKey, sortDir, onSort, className = '' }) {
  const active = sortKey === colKey
  return (
    <th className={`px-3 py-2 text-left font-semibold select-none ${className}`}>
      <button
        onClick={() => onSort(colKey)}
        className={`inline-flex items-center gap-1 transition ${active ? 'text-brand-600 dark:text-brand-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
      >
        {label}
        {active
          ? (sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)
          : <ChevronsUpDown className="w-3.5 h-3.5 opacity-40" />}
      </button>
    </th>
  )
}

function CardTable({ rows, sortKey, sortDir, onSort, catOf, onRowClick, onZoom }) {
  const headProps = { sortKey, sortDir, onSort }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-ink-700 bg-white dark:bg-ink-800">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-slate-200 dark:border-ink-700 bg-slate-50 dark:bg-ink-900/50">
            <th className="px-3 py-2 w-12"></th>
            <SortHeader label="氏名" colKey="full_name" {...headProps} />
            <SortHeader label="会社" colKey="company" {...headProps} />
            <th className="px-3 py-2 text-left font-semibold text-slate-500 dark:text-slate-400">部署・役職</th>
            <SortHeader label="カテゴリ" colKey="category" {...headProps} />
            <th className="px-3 py-2 text-left font-semibold text-slate-500 dark:text-slate-400">連絡先</th>
            <SortHeader label="登録日" colKey="created" {...headProps} />
          </tr>
        </thead>
        <tbody>
          {rows.map((card) => (
            <tr
              key={card.id}
              onClick={() => onRowClick(card)}
              className="border-b border-slate-100 dark:border-ink-700/60 hover:bg-brand-50 dark:hover:bg-ink-700/50 cursor-pointer transition"
            >
              <td className="px-3 py-2">
                {card.image_url
                  ? <img
                      src={card.image_url}
                      alt=""
                      loading="lazy"
                      onClick={(e) => { e.stopPropagation(); onZoom?.(card.image_url) }}
                      className="w-10 h-7 object-cover rounded border border-slate-200 dark:border-ink-600 cursor-zoom-in hover:opacity-80 transition"
                    />
                  : <div className="w-10 h-7 rounded bg-slate-100 dark:bg-ink-700 flex items-center justify-center"><User className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" /></div>}
              </td>
              <td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">{card.full_name || <span className="text-slate-300 dark:text-slate-600">—</span>}</td>
              <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{card.company || ''}</td>
              <td className="px-3 py-2 text-slate-500 dark:text-slate-400 text-xs">{[card.department, card.title].filter(Boolean).join(' / ')}</td>
              <td className="px-3 py-2">
                {catOf(card)
                  ? <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-brand-100 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300"><Tag className="w-3 h-3" />{catOf(card)}</span>
                  : <span className="text-slate-300 dark:text-slate-600 text-xs">未分類</span>}
              </td>
              <td className="px-3 py-2 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">
                {(card.phone || card.mobile) && <div className="flex items-center gap-1"><Phone className="w-3 h-3" />{card.phone || card.mobile}</div>}
                {card.email && <div className="flex items-center gap-1 truncate max-w-[180px]"><Mail className="w-3 h-3" />{card.email}</div>}
              </td>
              <td className="px-3 py-2 text-slate-400 dark:text-slate-500 text-xs whitespace-nowrap">{fmtDate(card.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// 未分類グループ用のラベル（カテゴリ未設定の名刺をまとめる）
const UNCATEGORIZED = '__uncat__'

// ─────────────────────────────────────────────────────────
// メインページ
// ─────────────────────────────────────────────────────────
export default function BusinessCardsPage({ onBack }) {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState('all') // 'all' | 'mine' | 'shared'
  const [categoryFilter, setCategoryFilter] = useState('all') // 'all' | カテゴリ名 | UNCATEGORIZED
  const [categoryAxis, setCategoryAxis] = useState('shared')  // 'shared'=全社カテゴリ | 'mine'=マイカテゴリ
  const [selectedCard, setSelectedCard] = useState(null)  // 詳細表示中の名刺オブジェクト
  // editing: null=非表示 / { mode: 'scan'|'manual' }=新規 / item=編集
  const [editing, setEditing] = useState(null)
  // multiReview: 1画像に複数名刺を検出したときの一括レビュー { file, cards }
  const [multiReview, setMultiReview] = useState(null)
  const { toast, showToast } = useToast()
  const [isAdmin, setIsAdmin] = useState(false)
  const [currentUserEmail, setCurrentUserEmail] = useState('')
  // 表示モード（カード/テーブル）＋ ソート
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('cardsViewMode') || 'card')
  const [sortKey, setSortKey] = useState('created') // 'created'|'full_name'|'company'|'category'
  const [sortDir, setSortDir] = useState('desc')     // 'asc'|'desc'
  const [lightboxUrl, setLightboxUrl] = useState(null) // 名刺画像の拡大表示
  useEffect(() => { localStorage.setItem('cardsViewMode', viewMode) }, [viewMode])


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

  // 分類軸に応じて名刺のカテゴリ値を取り出す
  // shared = 全社カテゴリ(card.category) / mine = マイカテゴリ(card.my_category)
  const catOf = useCallback(
    (card) => ((categoryAxis === 'mine' ? card.my_category : card.category) || '').trim(),
    [categoryAxis],
  )

  // ソート（カード/テーブル両ビューに適用）
  const sortCards = useCallback((arr) => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...arr].sort((a, b) => {
      if (sortKey === 'created') return (new Date(a.created_at || 0) - new Date(b.created_at || 0)) * dir
      const va = sortKey === 'category' ? catOf(a) : (a[sortKey] || '')
      const vb = sortKey === 'category' ? catOf(b) : (b[sortKey] || '')
      if (!va && vb) return 1            // 空欄は常に末尾
      if (va && !vb) return -1
      if (!va && !vb) return 0
      return va.localeCompare(vb, 'ja') * dir
    })
  }, [sortKey, sortDir, catOf])

  // 列ヘッダークリック: 同じ列なら昇順/降順トグル、別列なら既定方向で切替
  const handleSort = useCallback((key) => {
    setSortKey((prev) => {
      if (prev === key) { setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); return prev }
      setSortDir(key === 'created' ? 'desc' : 'asc')
      return key
    })
  }, [])

  // 現在読み込んでいる名刺から、選択中の軸で存在するカテゴリ一覧（件数付き）を導出
  const { catList, uncatCount } = useMemo(() => {
    const counts = new Map()
    let uncat = 0
    for (const c of cards) {
      const name = catOf(c)
      if (name) counts.set(name, (counts.get(name) || 0) + 1)
      else uncat += 1
    }
    const list = [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
    return { catList: list, uncatCount: uncat }
  }, [cards, catOf])

  // カテゴリ絞り込みを適用した表示対象（ソート済み）
  const visibleCards = useMemo(() => {
    let arr = cards
    if (categoryFilter === UNCATEGORIZED) arr = cards.filter((c) => !catOf(c))
    else if (categoryFilter !== 'all') arr = cards.filter((c) => catOf(c) === categoryFilter)
    return sortCards(arr)
  }, [cards, categoryFilter, catOf, sortCards])

  // 「すべて」表示時はカテゴリごとにグループ分けする（分けない場合は null）
  const groups = useMemo(() => {
    if (categoryFilter !== 'all') return null
    const g = catList.map((c) => ({
      key: c.name,
      label: c.name,
      items: sortCards(cards.filter((card) => catOf(card) === c.name)),
    }))
    if (uncatCount > 0) {
      g.push({
        key: UNCATEGORIZED,
        label: '未分類',
        items: sortCards(cards.filter((card) => !catOf(card))),
      })
    }
    return g
  }, [cards, catList, uncatCount, categoryFilter, catOf, sortCards])

  // 軸を切り替えたら絞り込みを「すべて」に戻す
  useEffect(() => { setCategoryFilter('all') }, [categoryAxis])

  // 選択中のカテゴリが消えたら「すべて」に戻す
  useEffect(() => {
    if (categoryFilter === 'all' || categoryFilter === UNCATEGORIZED) return
    if (!catList.some((c) => c.name === categoryFilter)) setCategoryFilter('all')
  }, [catList, categoryFilter])

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
          {/* (1) 登録ボタンを2つに分割 */}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="primary" size="sm" onClick={() => setEditing({ mode: 'scan' })}>
              <Camera className="w-4 h-4" />撮影・ファイルで登録
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setEditing({ mode: 'manual' })}>
              <Plus className="w-4 h-4" />手入力で登録
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

          {/* ソート選択 */}
          <select
            value={`${sortKey}:${sortDir}`}
            onChange={(e) => { const [k, d] = e.target.value.split(':'); setSortKey(k); setSortDir(d) }}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-ink-600 bg-white dark:bg-ink-700 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
            title="並べ替え"
          >
            <option value="created:desc">登録日（新しい順）</option>
            <option value="created:asc">登録日（古い順）</option>
            <option value="full_name:asc">氏名（あ→ん）</option>
            <option value="full_name:desc">氏名（ん→あ）</option>
            <option value="company:asc">会社（あ→ん）</option>
            <option value="company:desc">会社（ん→あ）</option>
            <option value="category:asc">カテゴリ（あ→ん）</option>
          </select>

          {/* 表示モード切替（カード / テーブル） */}
          <div className="flex rounded-xl border border-slate-200 dark:border-ink-600 overflow-hidden bg-white dark:bg-ink-700">
            {[
              { value: 'card', icon: LayoutGrid, label: 'カード' },
              { value: 'table', icon: Table2, label: 'テーブル' },
            ].map((opt) => {
              const Icon = opt.icon
              return (
                <button
                  key={opt.value}
                  onClick={() => setViewMode(opt.value)}
                  title={`${opt.label}表示`}
                  className={`px-3 py-2 text-sm font-semibold transition flex items-center gap-1
                    ${viewMode === opt.value
                      ? 'bg-brand-600 text-white'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-ink-600'
                    }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{opt.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* 分類軸の切替（全社カテゴリ / マイカテゴリ）＋ カテゴリ絞り込みチップ */}
        {cards.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-6">
            {/* 軸切替 */}
            <div className="flex rounded-xl border border-slate-200 dark:border-ink-600 overflow-hidden bg-white dark:bg-ink-700 mr-1">
              {[
                { value: 'shared', label: '全社カテゴリ' },
                { value: 'mine',   label: 'マイカテゴリ' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setCategoryAxis(opt.value)}
                  className={`px-3 py-1.5 text-xs font-bold transition
                    ${categoryAxis === opt.value
                      ? (opt.value === 'mine' ? 'bg-violet-600 text-white' : 'bg-brand-600 text-white')
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-ink-600'
                    }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setCategoryFilter('all')}
              className={`px-3 py-1.5 rounded-full text-sm font-semibold transition border
                ${categoryFilter === 'all'
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white dark:bg-ink-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-ink-600 hover:bg-slate-50 dark:hover:bg-ink-600'
                }`}
            >
              すべて
            </button>
            {catList.map((c) => (
              <button
                key={c.name}
                onClick={() => setCategoryFilter(c.name)}
                className={`px-3 py-1.5 rounded-full text-sm font-semibold transition border
                  ${categoryFilter === c.name
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white dark:bg-ink-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-ink-600 hover:bg-slate-50 dark:hover:bg-ink-600'
                  }`}
              >
                {c.name}
                <span className={`ml-1.5 ${categoryFilter === c.name ? 'text-white/70' : 'text-slate-400 dark:text-slate-500'}`}>{c.count}</span>
              </button>
            ))}
            {uncatCount > 0 && (
              <button
                onClick={() => setCategoryFilter(UNCATEGORIZED)}
                className={`px-3 py-1.5 rounded-full text-sm font-semibold transition border
                  ${categoryFilter === UNCATEGORIZED
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white dark:bg-ink-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-ink-600 hover:bg-slate-50 dark:hover:bg-ink-600'
                  }`}
              >
                未分類
                <span className={`ml-1.5 ${categoryFilter === UNCATEGORIZED ? 'text-white/70' : 'text-slate-400 dark:text-slate-500'}`}>{uncatCount}</span>
              </button>
            )}
          </div>
        )}

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
        ) : viewMode === 'table' ? (
          /* テーブル表示: 常にフラット（ソート済み visibleCards）。件数を上部に表示 */
          <div>
            <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 mb-2">{visibleCards.length}件</div>
            <CardTable
              rows={visibleCards}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              catOf={catOf}
              onRowClick={setSelectedCard}
              onZoom={setLightboxUrl}
            />
          </div>
        ) : groups ? (
          /* 「すべて」表示: カテゴリごとにセクション分けして表示 */
          <div className="space-y-8">
            {groups.map((g) => (
              <section key={g.key}>
                <div className="flex items-center gap-2 mb-3">
                  {g.key === UNCATEGORIZED
                    ? <span className="text-sm font-bold text-slate-400 dark:text-slate-500">{g.label}</span>
                    : (
                      <span className="inline-flex items-center gap-1 text-sm font-bold text-slate-700 dark:text-slate-200">
                        <Tag className="w-4 h-4 text-brand-500" />{g.label}
                      </span>
                    )}
                  <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">{g.items.length}件</span>
                  <div className="flex-1 border-t border-slate-200 dark:border-ink-700" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {g.items.map((card) => (
                    <CardTile key={card.id} card={card} onClick={() => setSelectedCard(card)} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          /* 特定カテゴリ選択時: フラット表示 */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {visibleCards.map((card) => (
              <CardTile key={card.id} card={card} onClick={() => setSelectedCard(card)} />
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
          onRefresh={loadCards}
          showToast={showToast}
          onZoom={setLightboxUrl}
        />
      )}

      {/* 画像ライトボックス（拡大） */}
      <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />

      {/* 登録/編集フォームモーダル */}
      {editing !== null && (
        <CardFormModal
          item={editing?.id ? editing : null}
          mode={editing?.mode}
          onClose={() => setEditing(null)}
          onSaved={loadCards}
          showToast={showToast}
          onMulti={(file, cards) => { setEditing(null); setMultiReview({ file, cards }) }}
        />
      )}

      {/* 複数名刺レビューモーダル（1画像に複数枚検出時） */}
      {multiReview && (
        <MultiCardReviewModal
          file={multiReview.file}
          cards={multiReview.cards}
          onClose={() => setMultiReview(null)}
          onSaved={loadCards}
          showToast={showToast}
        />
      )}
    </div>
  )
}
