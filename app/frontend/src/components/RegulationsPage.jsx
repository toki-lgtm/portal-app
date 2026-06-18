import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import {
  ArrowLeft, Search, BookOpen, Bookmark, BookmarkCheck, ChevronRight,
  ChevronDown, X, Loader2, FileText, Star, AlertCircle, Edit3, Save,
  RotateCcw, List, ExternalLink, Info, Clock, Layers,
} from 'lucide-react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import Toast from './ui/Toast'
import ModalShell from './ui/ModalShell'
import { API_URL as apiUrl, authConfig } from '../lib/api'
import { inputCls } from '../lib/ui'

// 日付フォーマット（YYYY/M/D）
function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return d
  return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()}`
}

// ──────────────────────────────────────────────
// 入力スタイル共通（inputClsはlib/ui.jsからimport済み）
// ──────────────────────────────────────────────

// ──────────────────────────────────────────────
// キーワードハイライト（スニペット中のキーワードを強調）
// ──────────────────────────────────────────────
function Highlight({ text, keyword }) {
  if (!keyword || !text) return <span>{text}</span>
  const parts = text.split(new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
  return (
    <span>
      {parts.map((part, i) =>
        part.toLowerCase() === keyword.toLowerCase() ? (
          <mark key={i} className="bg-warning-100 dark:bg-warning-500/30 text-warning-800 dark:text-warning-200 rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  )
}

// ──────────────────────────────────────────────
// 法令種別バッジ
// ──────────────────────────────────────────────
function LawTypeBadge({ lawType, label }) {
  const toneMap = {
    Act: 'info',
    CabinetOrder: 'warning',
    MinisterialOrdinance: 'neutral',
    Rule: 'neutral',
  }
  return <Badge tone={toneMap[lawType] || 'neutral'}>{label || lawType}</Badge>
}

// ──────────────────────────────────────────────
// ブックマークモーダル（メモ・色設定）
// ──────────────────────────────────────────────
function BookmarkModal({ lawId, articleId, articleTitle, initialMemo, initialColor, onClose, onSaved, showToast }) {
  const [memo, setMemo] = useState(initialMemo || '')
  const [color, setColor] = useState(initialColor || 'blue')
  const [saving, setSaving] = useState(false)

  const COLORS = [
    { key: 'blue', label: '青', cls: 'bg-brand-400' },
    { key: 'orange', label: '橙', cls: 'bg-accent-500' },
    { key: 'green', label: '緑', cls: 'bg-success-500' },
    { key: 'yellow', label: '黄', cls: 'bg-warning-400' },
    { key: 'red', label: '赤', cls: 'bg-danger-500' },
  ]

  const save = async () => {
    setSaving(true)
    try {
      await axios.post(
        `${apiUrl}/api/regulations/bookmarks`,
        { law_id: lawId, article_id: articleId || null, memo: memo.trim(), color },
        authConfig()
      )
      showToast('success', 'ブックマークを保存しました')
      onSaved()
      onClose()
    } catch (err) {
      showToast('error', err.response?.data?.error || 'ブックマークの保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title="ブックマークを追加" onClose={onClose}>
      <div className="space-y-4">
        {articleTitle && (
          <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-ink-900/40 rounded-xl px-3 py-2">
            {articleTitle}
          </p>
        )}
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">メモ（任意）</label>
          <textarea
            className={inputCls + ' min-h-[80px] resize-y'}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="気づきや参照理由などを記録..."
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">色</label>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setColor(c.key)}
                className={`w-7 h-7 rounded-full ${c.cls} border-2 transition
                  ${color === c.key ? 'border-slate-900 dark:border-white scale-110' : 'border-transparent'}`}
                title={c.label}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-6">
        <Button variant="ghost" size="sm" onClick={onClose}>キャンセル</Button>
        <Button variant="primary" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? '保存中...' : '保存する'}
        </Button>
      </div>
    </ModalShell>
  )
}

// ──────────────────────────────────────────────
// 改正履歴モーダル
// ──────────────────────────────────────────────
function RevisionsModal({ lawId, lawTitle, onClose }) {
  const [revisions, setRevisions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get(`${apiUrl}/api/regulations/laws/${lawId}/revisions`, authConfig())
      .then((res) => setRevisions(res.data || []))
      .catch(() => setRevisions([]))
      .finally(() => setLoading(false))
  }, [lawId])

  return (
    <ModalShell title={`改正履歴 — ${lawTitle}`} onClose={onClose} maxWidthOverride="max-w-2xl">
      {loading ? (
        <div className="py-10 text-center text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin inline" />
        </div>
      ) : revisions.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">改正履歴がありません</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-ink-700">
          {revisions.map((r, i) => (
            <li key={i} className="py-3 flex items-start gap-3">
              <Clock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{r.amendment_law_title || '—'}</p>
                <p className="text-xs text-slate-400 mt-0.5">施行日: {fmtDate(r.enforcement_date)}</p>
                {r.revision_status && (
                  <p className="text-xs text-slate-400">{r.revision_status}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </ModalShell>
  )
}

// ──────────────────────────────────────────────
// 目次ツリーノード（再帰）
// ──────────────────────────────────────────────
function TocNode({ node, depth, activeId, onSelect }) {
  const [open, setOpen] = useState(depth < 2)
  const hasChildren = node.children && node.children.length > 0
  const isActive = activeId === node.id

  return (
    <li>
      <button
        type="button"
        onClick={() => {
          if (hasChildren) setOpen((v) => !v)
          if (node.id) onSelect(node.id)
        }}
        className={`w-full flex items-center gap-1.5 py-1 px-2 rounded-lg text-left text-sm transition
          ${isActive
            ? 'bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300 font-semibold'
            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-ink-700/50'
          }`}
        style={{ paddingLeft: `${0.5 + depth * 0.875}rem` }}
      >
        {hasChildren ? (
          open
            ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-slate-400" />
            : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-400" />
        ) : (
          <span className="w-3.5 h-3.5 shrink-0" />
        )}
        <span className="truncate leading-snug">{node.label}</span>
      </button>
      {hasChildren && open && (
        <ul className="ml-1">
          {node.children.map((child, i) => (
            <TocNode key={child.id ?? i} node={child} depth={depth + 1} activeId={activeId} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  )
}

// ──────────────────────────────────────────────
// 条文カード（ビューア内の1条）
// ──────────────────────────────────────────────
function ArticleCard({ article, keyword, bookmarkedIds, onBookmark, showToast }) {
  const [expanded, setExpanded] = useState(true)
  const isBookmarked = bookmarkedIds.has(String(article.id))

  // 条文テキストを項・号で字下げ整形する
  const renderContent = (content) => {
    if (!content) return null
    const lines = content.split('\n')
    return lines.map((line, i) => {
      // 号（一、二…）→ 2段字下げ
      const isGo = /^[一二三四五六七八九十百]+、/.test(line.trim())
      // 項番号（２　→）→ 1段字下げ
      const isKou = /^[０-９0-9]+[\s　]/.test(line.trim())
      return (
        <p
          key={i}
          className={`leading-loose text-slate-800 dark:text-slate-200
            ${isGo ? 'ml-8' : isKou ? 'ml-4' : ''}
            ${i > 0 ? 'mt-1' : ''}`}
        >
          <Highlight text={line} keyword={keyword} />
        </p>
      )
    })
  }

  return (
    <div
      id={`article-${article.id}`}
      className="group border-b border-slate-100 dark:border-ink-700 py-5"
    >
      {/* 条見出し */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1.5 text-left"
          >
            <span className="text-xs font-bold text-brand-600 dark:text-brand-400 shrink-0">
              {article.article_num ? `第${article.article_num}条` : article.division || ''}
            </span>
            {article.article_caption && (
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                （{article.article_caption}）
              </span>
            )}
            {expanded
              ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              : <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            }
          </button>
        </div>
        {/* ブックマークボタン */}
        <button
          type="button"
          onClick={() => onBookmark(article)}
          className={`opacity-0 group-hover:opacity-100 p-1.5 rounded-lg transition
            ${isBookmarked
              ? 'text-warning-500 bg-warning-50 dark:bg-warning-500/10 opacity-100'
              : 'text-slate-400 hover:text-warning-500 hover:bg-warning-50 dark:hover:bg-warning-500/10'
            }`}
          title={isBookmarked ? 'ブックマーク済み' : 'ブックマークを追加'}
        >
          {isBookmarked ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
        </button>
      </div>

      {/* 条文本文 */}
      {expanded && (
        <div className="text-sm leading-loose max-w-2xl">
          {renderContent(article.content)}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────
// 法令ビューア（左：目次サイドバー / 中央：条文本文）
// ──────────────────────────────────────────────
function LawViewer({ lawId, onClose, showToast, bookmarkedIds, onBookmarkAdded, meta, jumpTarget, onSelectLaw }) {
  const [law, setLaw] = useState(null)
  const [articles, setArticles] = useState([])
  const [toc, setToc] = useState([])
  const [loading, setLoading] = useState(true)
  const [articleSearch, setArticleSearch] = useState('')
  const [activeArticleId, setActiveArticleId] = useState(null)
  const [showRevisions, setShowRevisions] = useState(false)
  const [bookmarkTarget, setBookmarkTarget] = useState(null) // ブックマークモーダル対象の条文
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const contentRef = useRef(null)
  const observerRef = useRef(null)

  // 法令詳細・条文・目次を一括取得
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [detailRes, articlesRes] = await Promise.all([
        axios.get(`${apiUrl}/api/regulations/laws/${lawId}`, authConfig()),
        axios.get(`${apiUrl}/api/regulations/laws/${lawId}/articles`, authConfig()),
      ])
      setLaw(detailRes.data.law)
      setToc(detailRes.data.toc || [])
      setArticles(articlesRes.data || [])
    } catch (err) {
      if (err.response?.status === 403) {
        showToast('error', 'この法令を閲覧する権限がありません')
      } else {
        showToast('error', '法令の取得に失敗しました')
      }
    } finally {
      setLoading(false)
    }
  }, [lawId, showToast])

  useEffect(() => { load() }, [load])

  // IntersectionObserver で現在表示中の条文を目次でハイライト
  useEffect(() => {
    if (!articles.length) return
    if (observerRef.current) observerRef.current.disconnect()
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.id?.replace('article-', '')
            if (id) setActiveArticleId(id)
            break
          }
        }
      },
      { rootMargin: '-10% 0px -80% 0px', threshold: 0 }
    )
    const els = document.querySelectorAll('[id^="article-"]')
    els.forEach((el) => obs.observe(el))
    observerRef.current = obs
    return () => obs.disconnect()
  }, [articles])

  // 目次クリックで条文へスクロール
  const scrollToArticle = (id) => {
    const el = document.getElementById(`article-${id}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setActiveArticleId(String(id))
    }
  }

  // 全文検索・ブックマークからのジャンプ：条文ロード後に該当条へスクロール
  useEffect(() => {
    if (!jumpTarget || !articles.length) return
    if (String(jumpTarget.lawId) !== String(lawId)) return
    if (!jumpTarget.articleId) return
    const t = setTimeout(() => scrollToArticle(jumpTarget.articleId), 120)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articles, jumpTarget, lawId])

  // 法令内インクリメンタル検索でフィルタ
  const filteredArticles = articleSearch.trim()
    ? articles.filter(
        (a) =>
          (a.content && a.content.includes(articleSearch)) ||
          (a.article_caption && a.article_caption.includes(articleSearch)) ||
          (a.article_num && String(a.article_num).includes(articleSearch))
      )
    : articles

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    )
  }

  if (!law) return null

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ビューアヘッダー */}
      <div className="bg-white dark:bg-ink-800 border-b border-slate-200 dark:border-ink-700 px-4 py-3 shrink-0">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-ink-700 shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">{law.title}</h2>
              {law.is_core && <Badge tone="info">重要法令</Badge>}
              {law.law_type_label && <LawTypeBadge lawType={law.law_type} label={law.law_type_label} />}
            </div>
            <div className="flex items-center gap-3 mt-1 pl-10 flex-wrap">
              <span className="text-xs text-slate-400">{law.law_num}</span>
              {law.enforcement_date && (
                <span className="text-xs text-slate-400">施行: {fmtDate(law.enforcement_date)}</span>
              )}
              <button
                type="button"
                onClick={() => setShowRevisions(true)}
                className="text-xs text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />改正履歴
              </button>
              {/* 出典表示 */}
              {meta?.attribution && (
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Info className="w-3 h-3" />出典: {meta.attribution}
                </span>
              )}
            </div>
          </div>
          {/* サイドバー開閉 */}
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-ink-700 shrink-0"
            title="目次の表示/非表示"
          >
            <List className="w-4 h-4" />
          </button>
        </div>

        {/* 子法令（施行令・規則）リンク */}
        {law.children && law.children.length > 0 && (
          <div className="pl-10 flex flex-wrap items-center gap-2 mt-1">
            <span className="text-xs text-slate-400 shrink-0">関連法令:</span>
            {law.children.map((c) => (
              <button
                key={c.id}
                type="button"
                className="text-xs text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-0.5"
                onClick={() => onSelectLaw && onSelectLaw(c.id)}
              >
                <ExternalLink className="w-3 h-3" />{c.title}
              </button>
            ))}
          </div>
        )}

        {/* 法令内検索バー */}
        <div className="pl-10 mt-2 relative max-w-lg">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={articleSearch}
            onChange={(e) => setArticleSearch(e.target.value)}
            placeholder="条文内を検索..."
            className="w-full pl-9 pr-8 py-1.5 rounded-xl border border-slate-200 dark:border-ink-600 bg-slate-50 dark:bg-ink-700 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          {articleSearch && (
            <button
              type="button"
              onClick={() => setArticleSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {articleSearch && (
          <p className="pl-10 text-xs text-slate-400 mt-1">
            {filteredArticles.length} 件の条文が一致
          </p>
        )}
      </div>

      {/* ビューア本体（サイドバー + 条文） */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* 目次サイドバー */}
        {sidebarOpen && toc.length > 0 && (
          <aside className="w-56 shrink-0 border-r border-slate-200 dark:border-ink-700 overflow-y-auto bg-slate-50/60 dark:bg-ink-900/40">
            <div className="px-2 py-3">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide px-2 mb-2">目次</p>
              <ul className="space-y-0.5">
                {toc.map((node, i) => (
                  <TocNode
                    key={node.id ?? i}
                    node={node}
                    depth={0}
                    activeId={activeArticleId}
                    onSelect={scrollToArticle}
                  />
                ))}
              </ul>
            </div>
          </aside>
        )}

        {/* 条文本文エリア */}
        <div ref={contentRef} className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-4">
            {filteredArticles.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <AlertCircle className="w-8 h-8 mx-auto mb-3 opacity-40" />
                <p className="text-sm">一致する条文がありません</p>
              </div>
            ) : (
              filteredArticles.map((article) => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  keyword={articleSearch}
                  bookmarkedIds={bookmarkedIds}
                  onBookmark={(art) => setBookmarkTarget(art)}
                  showToast={showToast}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* 改正履歴モーダル */}
      {showRevisions && (
        <RevisionsModal
          lawId={lawId}
          lawTitle={law.title}
          onClose={() => setShowRevisions(false)}
        />
      )}

      {/* ブックマーク追加モーダル */}
      {bookmarkTarget && (
        <BookmarkModal
          lawId={lawId}
          articleId={bookmarkTarget.id}
          articleTitle={
            bookmarkTarget.article_num
              ? `第${bookmarkTarget.article_num}条${bookmarkTarget.article_caption ? `（${bookmarkTarget.article_caption}）` : ''}`
              : bookmarkTarget.division
          }
          onClose={() => setBookmarkTarget(null)}
          onSaved={onBookmarkAdded}
          showToast={showToast}
        />
      )}
    </div>
  )
}

// ──────────────────────────────────────────────
// タブ「法令一覧」
// ──────────────────────────────────────────────
function LawListTab({ meta, onSelectLaw, showToast }) {
  const [laws, setLaws] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [lawType, setLawType] = useState('')
  const [coreOnly, setCoreOnly] = useState(false)
  const [parentOnly, setParentOnly] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('q', search.trim())
      if (category) params.set('category', category)
      if (lawType) params.set('type', lawType)
      if (coreOnly) params.set('core', '1')
      if (parentOnly) params.set('parentOnly', '1')
      const res = await axios.get(`${apiUrl}/api/regulations/laws?${params}`, authConfig())
      setLaws(res.data || [])
    } catch (err) {
      if (err.response?.status === 403) {
        showToast('error', 'アクセス権がありません')
      } else {
        showToast('error', '法令一覧の取得に失敗しました')
      }
    } finally {
      setLoading(false)
    }
  }, [search, category, lawType, coreOnly, parentOnly, showToast])

  // 検索入力はデバウンス
  useEffect(() => {
    const t = setTimeout(() => { load() }, 300)
    return () => clearTimeout(t)
  }, [load])

  // 親法令と子法令を紐付けて体系を構築
  const parentLaws = laws.filter((l) => !l.parent_law_id)
  const childrenMap = {}
  laws.filter((l) => l.parent_law_id).forEach((l) => {
    if (!childrenMap[l.parent_law_id]) childrenMap[l.parent_law_id] = []
    childrenMap[l.parent_law_id].push(l)
  })

  // カテゴリのラベルを id から引く
  const categoryLabel = (cd) => {
    if (!meta?.categories) return cd
    const found = meta.categories.find((c) => c.code === cd)
    return found ? found.label : cd
  }

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      {/* フィルターバー */}
      <div className="flex flex-wrap items-center gap-3">
        {/* インクリメンタル検索 */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="法令名で検索..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-ink-600 bg-white dark:bg-ink-700 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>
        {/* カテゴリ絞り込み */}
        {meta?.categories && (
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={inputCls + ' w-auto'}
          >
            <option value="">すべての分野</option>
            {meta.categories.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
        )}
        {/* 法令種別 */}
        {meta?.typeLabels && (
          <select
            value={lawType}
            onChange={(e) => setLawType(e.target.value)}
            className={inputCls + ' w-auto'}
          >
            <option value="">すべての種別</option>
            {Object.entries(meta.typeLabels).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        )}
        {/* トグルフィルター */}
        <label className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={coreOnly}
            onChange={(e) => setCoreOnly(e.target.checked)}
            className="w-4 h-4 rounded accent-brand-600"
          />
          重要法令のみ
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={parentOnly}
            onChange={(e) => setParentOnly(e.target.checked)}
            className="w-4 h-4 rounded accent-brand-600"
          />
          本法のみ
        </label>
      </div>

      {/* 法令カード一覧 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="py-16 text-center text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin inline" />
            <p className="text-sm mt-3">読み込み中...</p>
          </div>
        ) : parentLaws.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <FileText className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm">該当する法令がありません</p>
          </div>
        ) : (
          <div className="space-y-3">
            {parentLaws.map((law) => {
              const children = childrenMap[law.id] || []
              return (
                <Card key={law.id} className="overflow-hidden">
                  {/* 本法カード */}
                  <button
                    type="button"
                    onClick={() => onSelectLaw(law.id)}
                    className="w-full text-left px-5 py-4 hover:bg-slate-50 dark:hover:bg-ink-700/30 transition"
                  >
                    <div className="flex items-start gap-3">
                      <BookOpen className="w-5 h-5 text-brand-500 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 dark:text-white">{law.title}</span>
                          {law.is_core && <Badge tone="info">重要</Badge>}
                          {law.law_type_label && (
                            <LawTypeBadge lawType={law.law_type} label={law.law_type_label} />
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="text-xs text-slate-400">{law.law_num}</span>
                          {law.enforcement_date && (
                            <span className="text-xs text-slate-400">施行: {fmtDate(law.enforcement_date)}</span>
                          )}
                          {law.category_labels && law.category_labels.length > 0 && (
                            <span className="text-xs text-slate-400">{law.category_labels.join(' / ')}</span>
                          )}
                          {law.article_count > 0 && (
                            <span className="text-xs text-slate-400">{law.article_count}条</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
                    </div>
                  </button>

                  {/* 施行令・施行規則（子法令）をぶら下げ表示 */}
                  {children.length > 0 && (
                    <div className="border-t border-slate-100 dark:border-ink-700">
                      {children.map((child) => (
                        <button
                          key={child.id}
                          type="button"
                          onClick={() => onSelectLaw(child.id)}
                          className="w-full text-left px-5 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-ink-700/30 transition border-b border-slate-50 dark:border-ink-700/50 last:border-b-0"
                        >
                          <div className="w-5 flex justify-center shrink-0">
                            <Layers className="w-3.5 h-3.5 text-slate-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm text-slate-700 dark:text-slate-300">{child.title}</span>
                              {child.law_type_label && (
                                <LawTypeBadge lawType={child.law_type} label={child.law_type_label} />
                              )}
                            </div>
                            {child.enforcement_date && (
                              <span className="text-xs text-slate-400">施行: {fmtDate(child.enforcement_date)}</span>
                            )}
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* 出典フッター */}
      {meta?.attribution && (
        <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1 shrink-0">
          <Info className="w-3 h-3" />出典: {meta.attribution}
        </p>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────
// タブ「全文検索」
// ──────────────────────────────────────────────
function FullTextSearchTab({ onJumpToArticle, showToast, meta }) {
  const [query, setQuery] = useState('')
  const [lawIdFilter, setLawIdFilter] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [laws, setLaws] = useState([]) // 法令絞り込み用

  // 法令一覧をシンプル取得（絞り込みプルダウン用）
  useEffect(() => {
    axios.get(`${apiUrl}/api/regulations/laws`, authConfig())
      .then((res) => setLaws(res.data || []))
      .catch(() => {})
  }, [])

  const search = async (e) => {
    e?.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setSearched(true)
    try {
      const params = new URLSearchParams({ q: query.trim() })
      if (lawIdFilter) params.set('lawId', lawIdFilter)
      const res = await axios.get(`${apiUrl}/api/regulations/search?${params}`, authConfig())
      setResults(res.data || [])
    } catch (err) {
      if (err.response?.status === 403) {
        showToast('error', 'アクセス権がありません')
      } else {
        showToast('error', '検索に失敗しました')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      {/* 検索フォーム */}
      <form onSubmit={search} className="flex flex-col gap-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="条文内のキーワードを入力..."
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-ink-600 bg-white dark:bg-ink-700 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          <Button variant="primary" type="submit" disabled={loading || !query.trim()}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            検索
          </Button>
        </div>
        {/* 法令内絞り込み */}
        <select
          value={lawIdFilter}
          onChange={(e) => setLawIdFilter(e.target.value)}
          className={inputCls + ' w-auto'}
        >
          <option value="">全法令を検索</option>
          {laws.map((l) => (
            <option key={l.id} value={l.law_id || l.id}>{l.title}</option>
          ))}
        </select>
      </form>

      {/* 検索結果 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="py-16 text-center text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin inline" />
            <p className="text-sm mt-3">検索中...</p>
          </div>
        ) : !searched ? (
          <div className="py-16 text-center text-slate-400">
            <Search className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm">キーワードを入力して条文を検索できます</p>
          </div>
        ) : results.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <AlertCircle className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm">「{query}」に一致する条文が見つかりませんでした</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-400 mb-3">{results.length}件の条文が見つかりました</p>
            {results.map((r) => (
              <button
                key={r.article_id}
                type="button"
                onClick={() => onJumpToArticle(r.law_id, r.article_id)}
                className="w-full text-left"
              >
                <Card className="p-4 hover:border-brand-300 dark:hover:border-brand-500/50 hover:shadow-sm transition">
                  <div className="flex items-start gap-3">
                    <FileText className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs font-bold text-brand-600 dark:text-brand-400">
                          {r.law_title}
                        </span>
                        <span className="text-xs text-slate-400">
                          {r.article_num ? `第${r.article_num}条` : r.division}
                          {r.article_caption ? `（${r.article_caption}）` : ''}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                        <Highlight text={r.snippet} keyword={query} />
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  </div>
                </Card>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 出典フッター */}
      {meta?.attribution && (
        <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1 shrink-0">
          <Info className="w-3 h-3" />出典: {meta.attribution}
        </p>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────
// タブ「ブックマーク」
// ──────────────────────────────────────────────
function BookmarksTab({ onJumpToArticle, showToast, refreshKey, meta }) {
  const [bookmarks, setBookmarks] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editMemo, setEditMemo] = useState('')

  const COLOR_CLS = {
    blue: 'border-l-brand-400',
    orange: 'border-l-accent-500',
    green: 'border-l-success-500',
    yellow: 'border-l-warning-400',
    red: 'border-l-danger-500',
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get(`${apiUrl}/api/regulations/bookmarks`, authConfig())
      setBookmarks(res.data || [])
    } catch {
      showToast('error', 'ブックマークの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { load() }, [load, refreshKey])

  const saveMemo = async (bm) => {
    try {
      await axios.put(`${apiUrl}/api/regulations/bookmarks/${bm.id}`, { memo: editMemo }, authConfig())
      showToast('success', 'メモを更新しました')
      setEditingId(null)
      load()
    } catch {
      showToast('error', 'メモの更新に失敗しました')
    }
  }

  const deleteBookmark = async (id) => {
    if (!confirm('このブックマークを削除しますか？')) return
    try {
      await axios.delete(`${apiUrl}/api/regulations/bookmarks/${id}`, authConfig())
      showToast('success', 'ブックマークを削除しました')
      load()
    } catch {
      showToast('error', 'ブックマークの削除に失敗しました')
    }
  }

  if (loading) {
    return (
      <div className="py-16 text-center text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin inline" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      <div className="flex-1 overflow-y-auto">
        {bookmarks.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <Bookmark className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm">ブックマークはまだありません</p>
            <p className="text-xs mt-1">条文ビューアの ★ ボタンで追加できます</p>
          </div>
        ) : (
          <div className="space-y-3">
            {bookmarks.map((bm) => (
              <Card
                key={bm.id}
                className={`p-4 border-l-4 ${COLOR_CLS[bm.color] || 'border-l-brand-400'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* 法令名 */}
                    <button
                      type="button"
                      onClick={() => onJumpToArticle(bm.law_id, bm.article_id)}
                      className="text-sm font-bold text-brand-600 dark:text-brand-400 hover:underline text-left"
                    >
                      {bm.law_title || bm.law_id}
                    </button>
                    {/* 条 */}
                    {bm.article_title && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{bm.article_title}</p>
                    )}
                    {/* メモ表示・編集 */}
                    {editingId === bm.id ? (
                      <div className="mt-2">
                        <textarea
                          className={inputCls + ' min-h-[60px] resize-y'}
                          value={editMemo}
                          onChange={(e) => setEditMemo(e.target.value)}
                        />
                        <div className="flex gap-2 mt-1">
                          <Button variant="primary" size="sm" onClick={() => saveMemo(bm)}>
                            <Save className="w-3.5 h-3.5" />保存
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>キャンセル</Button>
                        </div>
                      </div>
                    ) : (
                      bm.memo && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 whitespace-pre-wrap">
                          {bm.memo}
                        </p>
                      )
                    )}
                    <p className="text-xs text-slate-400 mt-1">{fmtDate(bm.created_at)}</p>
                  </div>
                  {/* アクションボタン */}
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => { setEditingId(bm.id); setEditMemo(bm.memo || '') }}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-ink-700"
                      title="メモを編集"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteBookmark(bm.id)}
                      className="p-1.5 rounded-lg text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-500/10"
                      title="削除"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      {meta?.attribution && (
        <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1 shrink-0">
          <Info className="w-3 h-3" />出典: {meta.attribution}
        </p>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────
// メインページ
// ──────────────────────────────────────────────
export default function RegulationsPage({ onBack }) {
  const [tab, setTab] = useState('laws') // 'laws' | 'search' | 'bookmarks'
  const [viewerLawId, setViewerLawId] = useState(null) // 法令ビューア対象
  const [meta, setMeta] = useState(null)
  const [toast, setToast] = useState(null)
  const [bookmarkRefreshKey, setBookmarkRefreshKey] = useState(0)
  // 全文検索結果から条文へのジャンプ先（lawId, articleId）
  const [jumpTarget, setJumpTarget] = useState(null)

  const showToast = useCallback((type, msg) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3500)
  }, [])

  // メタ情報（分野・カテゴリ・出典）を起動時に取得
  useEffect(() => {
    axios.get(`${apiUrl}/api/regulations/meta`, authConfig())
      .then((res) => setMeta(res.data))
      .catch(() => {})
  }, [])

  // ブックマーク済み条文 ID セット（ArticleCard に渡す）
  const [bookmarkedIds, setBookmarkedIds] = useState(new Set())
  useEffect(() => {
    axios.get(`${apiUrl}/api/regulations/bookmarks`, authConfig())
      .then((res) => {
        const ids = new Set((res.data || []).map((b) => String(b.article_id)).filter(Boolean))
        setBookmarkedIds(ids)
      })
      .catch(() => {})
  }, [bookmarkRefreshKey])

  // ブックマーク追加後にリフレッシュ
  const handleBookmarkAdded = () => {
    setBookmarkRefreshKey((k) => k + 1)
  }

  // 全文検索結果・ブックマークから条文へジャンプ
  const handleJumpToArticle = (lawId, articleId) => {
    setJumpTarget({ lawId, articleId })
    setViewerLawId(lawId)
  }

  const TABS = [
    { key: 'laws', label: '法令一覧', icon: BookOpen },
    { key: 'search', label: '全文検索', icon: Search },
    { key: 'bookmarks', label: 'ブックマーク', icon: Bookmark },
  ]

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-ink-950 transition-colors flex flex-col">
      {/* ──── ヘッダー ──── */}
      <header className="bg-white/80 dark:bg-ink-900/80 backdrop-blur border-b border-slate-200 dark:border-ink-800 sticky top-0 z-10 shrink-0">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />戻る
          </Button>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-brand-500" />
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">法令集</h1>
          </div>

          {/* 法令ビューアを開いていない時のみタブを表示 */}
          {!viewerLawId && (
            <div className="ml-2 flex gap-1">
              {TABS.map((t) => {
                const Icon = t.icon
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold transition
                      ${tab === t.key
                        ? 'bg-brand-600 text-white'
                        : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-ink-800'
                      }`}
                  >
                    <Icon className="w-4 h-4" />
                    {t.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </header>

      {toast && <Toast toast={toast} />}

      {/* ──── メイン ──── */}
      {viewerLawId ? (
        // 法令ビューア（フルハイト）
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <LawViewer
            lawId={viewerLawId}
            jumpTarget={jumpTarget}
            onSelectLaw={(id) => { setViewerLawId(id); setJumpTarget(null) }}
            onClose={() => { setViewerLawId(null); setJumpTarget(null) }}
            showToast={showToast}
            bookmarkedIds={bookmarkedIds}
            onBookmarkAdded={handleBookmarkAdded}
            meta={meta}
          />
        </div>
      ) : (
        // タブコンテンツ
        <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8 flex flex-col min-h-0">
          {tab === 'laws' && (
            <LawListTab
              meta={meta}
              onSelectLaw={(id) => setViewerLawId(id)}
              showToast={showToast}
            />
          )}
          {tab === 'search' && (
            <FullTextSearchTab
              onJumpToArticle={handleJumpToArticle}
              showToast={showToast}
              meta={meta}
            />
          )}
          {tab === 'bookmarks' && (
            <BookmarksTab
              onJumpToArticle={handleJumpToArticle}
              showToast={showToast}
              refreshKey={bookmarkRefreshKey}
              meta={meta}
            />
          )}
        </main>
      )}
    </div>
  )
}
