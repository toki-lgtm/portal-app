import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  ArrowLeft, Archive, Folder, FileText, Loader2, ChevronRight,
  HardHat, Users, Search, X, Calendar, Building2, Tag, FileSearch, ExternalLink, Download,
} from 'lucide-react'
import Button from './ui/Button'
import Card from './ui/Card'
import Toast from './ui/Toast'
import { API_URL as apiUrl, authConfig } from '../lib/api'
import { useToast } from '../lib/useToast'

// 過去工事アーカイブ：Drive をブラウズ（正本）＋ AI索引の横断検索（書類単位）。
//   索引エージェントが各PDFを「書類（セグメント）」に分解し本文全文＋ページ範囲を抽出。
//   利用者は普段この本文データを読み、原本PDFは該当ページだけを参照する。
export default function ArchivePage({ onBack }) {
  const { toast, showToast } = useToast()
  const [isAdmin, setIsAdmin] = useState(false)
  const [scope, setScope] = useState('kouji') // 'kouji' | 'jinji'
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  const [path, setPath] = useState([{ id: null, name: '過去工事' }])
  const [opening, setOpening] = useState(null)

  // --- 検索 ---
  const [q, setQ] = useState('')
  const [submittedQ, setSubmittedQ] = useState('')
  const [koujiFilter, setKoujiFilter] = useState('')
  const [docTypeFilter, setDocTypeFilter] = useState('')
  const [facets, setFacets] = useState(null)
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)

  // --- 書類詳細（本文データを読む） ---
  const [detail, setDetail] = useState(null)        // 全文セグメント
  const [detailLoading, setDetailLoading] = useState(false)

  const scopeLabel = scope === 'jinji' ? '人事資料' : '過去工事'
  const searchMode = Boolean(submittedQ || koujiFilter || docTypeFilter)

  const loadList = useCallback(async (sc, folderId) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ scope: sc })
      if (folderId) params.set('folderId', folderId)
      const res = await axios.get(`${apiUrl}/api/archive/list?${params.toString()}`, authConfig())
      setItems(res.data?.items || [])
      if (!folderId && res.data?.rootId) {
        const rootName = sc === 'jinji' ? '人事資料' : '過去工事'
        setPath((p) => (p.length === 1 ? [{ id: res.data.rootId, name: rootName }] : p))
      }
    } catch (e) {
      showToast('error', e.response?.data?.error || '一覧の取得に失敗しました')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [showToast])

  const loadFacets = useCallback(async (sc) => {
    try {
      const res = await axios.get(`${apiUrl}/api/archive/facets?scope=${sc}`, authConfig())
      setFacets(res.data || null)
    } catch { setFacets(null) }
  }, [])

  const runSearch = useCallback(async (sc, text, kouji, docType) => {
    setSearching(true)
    try {
      const params = new URLSearchParams({ scope: sc })
      if (text) params.set('q', text)
      if (kouji) params.set('kouji', kouji)
      if (docType) params.set('doc_type', docType)
      const res = await axios.get(`${apiUrl}/api/archive/search?${params.toString()}`, authConfig())
      setResults(res.data?.items || [])
    } catch (e) {
      showToast('error', e.response?.data?.error || '検索に失敗しました')
      setResults([])
    } finally {
      setSearching(false)
    }
  }, [showToast])

  useEffect(() => {
    axios.get(`${apiUrl}/api/my-permissions`, authConfig())
      .then((res) => setIsAdmin(res.data?.role === 'admin'))
      .catch(() => setIsAdmin(false))
  }, [])

  useEffect(() => {
    loadList(scope, null)
    loadFacets(scope)
  }, [scope, loadList, loadFacets])

  useEffect(() => {
    if (submittedQ || koujiFilter || docTypeFilter) runSearch(scope, submittedQ, koujiFilter, docTypeFilter)
  }, [scope, submittedQ, koujiFilter, docTypeFilter, runSearch])

  const switchScope = (sc) => {
    if (sc === scope) return
    setPath([{ id: null, name: sc === 'jinji' ? '人事資料' : '過去工事' }])
    clearSearch()
    setScope(sc)
  }

  // 工事フォルダを開いたら、原本ファイル一覧ではなく「その工事の書類データ（本文）」を既定表示する。
  // ＝普段はデータを読み、原本PDFは各書類から必要時だけ参照する。
  const openFolder = (item) => {
    setQ(''); setSubmittedQ(''); setDocTypeFilter('')
    setKoujiFilter(item.id)
  }
  const jumpTo = (index) => {
    const target = path[index]
    setPath((p) => p.slice(0, index + 1))
    loadList(scope, index === 0 ? null : target.id)
  }

  const submitSearch = () => setSubmittedQ(q.trim())
  const clearSearch = () => { setQ(''); setSubmittedQ(''); setKoujiFilter(''); setDocTypeFilter(''); setResults([]) }

  // 書類の本文全文を開く（データを読む）。
  const openDetail = async (segId) => {
    setDetailLoading(true)
    setDetail({ id: segId })
    try {
      const res = await axios.get(`${apiUrl}/api/archive/segment/${segId}?scope=${scope}`, authConfig())
      setDetail(res.data?.item || null)
    } catch (e) {
      showToast('error', e.response?.data?.error || '本文を取得できませんでした')
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  // 原本PDFをダウンロード（フォルダのファイル or 書類の元PDF）。
  const downloadFile = async (fileId, name) => {
    setOpening(fileId)
    try {
      const res = await axios.get(`${apiUrl}/api/archive/file/${fileId}/url?scope=${scope}`, authConfig())
      const url = res.data?.url
      if (!url) throw new Error('URLの取得に失敗しました')
      const a = document.createElement('a')
      a.href = url; a.download = name || ''; a.rel = 'noopener'
      document.body.appendChild(a); a.click(); a.remove()
    } catch (e) {
      showToast('error', e.response?.data?.error || 'ファイルを開けませんでした')
    } finally { setOpening(null) }
  }

  // 原本の該当ページをブラウザで開く（inline表示＋#pageでページ移動）。
  const viewFileAtPage = async (fileId, page) => {
    try {
      const res = await axios.get(`${apiUrl}/api/archive/file/${fileId}/url?scope=${scope}&dl=0`, authConfig())
      let url = res.data?.url
      if (!url) throw new Error('URLの取得に失敗しました')
      if (page) url += `#page=${page}`
      window.open(url, '_blank', 'noopener')
    } catch (e) {
      showToast('error', e.response?.data?.error || '原本を開けませんでした')
    }
  }

  const fmtTypes = (s) => String(s || '').split('/').map((x) => x.trim()).filter(Boolean)

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-ink-950 transition-colors">
      <header className="bg-white/80 dark:bg-ink-900/80 backdrop-blur border-b border-slate-200 dark:border-ink-800 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />戻る
          </Button>
          <div className="flex items-center gap-2">
            <Archive className="w-5 h-5 text-brand-500" />
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">過去工事アーカイブ</h1>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-6 pb-3 flex items-center gap-2">
          <button onClick={() => switchScope('kouji')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${scope === 'kouji' ? 'bg-brand-500 text-white' : 'bg-slate-200 dark:bg-ink-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-ink-600'}`}>
            <HardHat className="w-4 h-4" />過去工事
          </button>
          {isAdmin && (
            <button onClick={() => switchScope('jinji')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${scope === 'jinji' ? 'bg-accent-500 text-white' : 'bg-slate-200 dark:bg-ink-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-ink-600'}`}>
              <Users className="w-4 h-4" />人事資料
              <span className="text-[10px] px-1 py-0.5 rounded bg-black/15">管理者限定</span>
            </button>
          )}
        </div>
        {/* 検索バー＋絞り込み */}
        <div className="max-w-5xl mx-auto px-6 pb-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitSearch()}
              placeholder="本文まで横断検索（例: 契約 監理技術者 前払金 検査）"
              className="w-full pl-9 pr-9 py-2 rounded-lg border border-slate-300 dark:border-ink-700 bg-white dark:bg-ink-800 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-400" />
            {(q || searchMode) && (
              <button onClick={clearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            )}
          </div>
          <select value={koujiFilter} onChange={(e) => setKoujiFilter(e.target.value)}
            className="py-2 px-2 rounded-lg border border-slate-300 dark:border-ink-700 bg-white dark:bg-ink-800 text-sm text-slate-700 dark:text-slate-200 max-w-[180px]">
            <option value="">工事：すべて</option>
            {facets?.kouji?.map((k) => <option key={k.id} value={k.id}>{k.name}（{k.count}）</option>)}
          </select>
          <select value={docTypeFilter} onChange={(e) => setDocTypeFilter(e.target.value)}
            className="py-2 px-2 rounded-lg border border-slate-300 dark:border-ink-700 bg-white dark:bg-ink-800 text-sm text-slate-700 dark:text-slate-200 max-w-[160px]">
            <option value="">種別：すべて</option>
            {facets?.docTypes?.slice(0, 30).map((t) => <option key={t.name} value={t.name}>{t.name}（{t.count}）</option>)}
          </select>
          <Button size="sm" onClick={submitSearch}>検索</Button>
        </div>
      </header>

      {toast && <Toast toast={toast} />}

      <main className="max-w-5xl mx-auto px-6 py-8">
        {searchMode ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {koujiFilter && !submittedQ && (
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    {facets?.kouji?.find((k) => k.id === koujiFilter)?.name || '工事'} の書類
                  </span>
                )}
                <span className="text-slate-500 dark:text-slate-400">{searching ? '…' : `${results.length}件`}</span>
                {facets?.total != null && <span className="ml-2 text-xs text-slate-400">（索引済 全{facets.total}書類）</span>}
              </p>
              <button onClick={clearSearch} className="text-sm text-brand-600 dark:text-brand-400 hover:underline">工事一覧へ戻る</button>
            </div>
            {searching ? (
              <div className="text-center py-20"><Loader2 className="w-8 h-8 animate-spin mx-auto text-brand-500" /></div>
            ) : results.length === 0 ? (
              <Card className="p-10 text-center text-slate-500 dark:text-slate-400">該当する書類が見つかりませんでした。</Card>
            ) : (
              <div className="space-y-3">
                {results.map((r) => (
                  <Card key={r.id} className="p-4 hover:shadow-md transition cursor-pointer" onClick={() => openDetail(r.id)}>
                    <div className="flex items-start gap-3">
                      <FileText className="w-6 h-6 text-brand-400 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
                          {fmtTypes(r.doc_type).map((t, i) => (
                            <span key={i} className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300"><Tag className="w-3 h-3" />{t}</span>
                          ))}
                          {r.doc_date && <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400"><Calendar className="w-3 h-3" />{r.doc_date}</span>}
                        </div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{r.title || '(無題)'}</p>
                        {r.snippet && <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">{r.snippet}</p>}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-xs text-slate-400 dark:text-slate-500">
                          <span className="inline-flex items-center gap-1"><HardHat className="w-3 h-3" />{r.kouji_name}</span>
                          {r.client_name && <span className="inline-flex items-center gap-1"><Building2 className="w-3 h-3" />{r.client_name}</span>}
                          <span>原本 p{r.page_start}{r.page_end && r.page_end !== r.page_start ? `-${r.page_end}` : ''}</span>
                          <span className="ml-auto inline-flex items-center gap-1 text-brand-600 dark:text-brand-400"><FileSearch className="w-3 h-3" />本文を読む</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <nav className="flex items-center flex-wrap gap-1 text-sm mb-4">
              {path.map((seg, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="w-4 h-4 text-slate-400" />}
                  <button onClick={() => jumpTo(i)}
                    className={`px-1.5 py-0.5 rounded hover:bg-slate-200 dark:hover:bg-ink-700 ${i === path.length - 1 ? 'font-semibold text-slate-900 dark:text-white' : 'text-brand-600 dark:text-brand-400'}`}>
                    {seg.name}
                  </button>
                </span>
              ))}
            </nav>
            {loading ? (
              <div className="text-center py-20"><Loader2 className="w-8 h-8 animate-spin mx-auto text-brand-500" /><p className="text-slate-500 dark:text-slate-400 mt-3">読み込み中...</p></div>
            ) : items.length === 0 ? (
              <Card className="p-10 text-center text-slate-500 dark:text-slate-400"><Folder className="w-10 h-10 mx-auto mb-3 opacity-40" />この{scopeLabel}フォルダには資料がありません。</Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map((item) => (
                  <Card key={item.id} className="p-4 flex items-center gap-3 group hover:shadow-md transition cursor-pointer"
                    onClick={() => (item.isFolder ? openFolder(item) : downloadFile(item.id, item.name))}>
                    <div className="shrink-0">{item.isFolder ? <Folder className="w-8 h-8 text-accent-500" /> : <FileText className="w-8 h-8 text-brand-400" />}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate" title={item.name}>{item.name}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{item.isFolder ? 'タップで書類を見る（本文データ）' : opening === item.id ? '準備中…' : 'タップして開く'}</p>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* 書類本文（データを読む）モーダル。×のみで閉じる。 */}
      {detail && (
        <div className="fixed inset-0 z-30 bg-black/50 flex items-start sm:items-center justify-center p-0 sm:p-6">
          <div className="bg-white dark:bg-ink-900 w-full sm:max-w-3xl sm:rounded-xl shadow-xl max-h-screen sm:max-h-[90vh] flex flex-col">
            <div className="flex items-start gap-3 p-4 border-b border-slate-200 dark:border-ink-800">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  {fmtTypes(detail.doc_type).map((t, i) => (
                    <span key={i} className="text-[11px] px-1.5 py-0.5 rounded bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300">{t}</span>
                  ))}
                  {detail.doc_date && <span className="text-[11px] text-slate-500 dark:text-slate-400">{detail.doc_date}</span>}
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">{detail.title || '書類'}</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {detail.kouji_name}{detail.client_name ? ` ・ ${detail.client_name}` : ''}
                  {detail.page_start ? ` ・ 原本 p${detail.page_start}${detail.page_end && detail.page_end !== detail.page_start ? `-${detail.page_end}` : ''}` : ''}
                </p>
              </div>
              <button onClick={() => setDetail(null)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-ink-800 text-slate-500"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              {detailLoading ? (
                <div className="text-center py-16"><Loader2 className="w-7 h-7 animate-spin mx-auto text-brand-500" /></div>
              ) : (
                <pre className="whitespace-pre-wrap break-words font-sans text-sm text-slate-800 dark:text-slate-100 leading-relaxed">{detail.body_text || '(本文なし)'}</pre>
              )}
            </div>

            {!detailLoading && detail.drive_file_id && (
              <div className="p-3 border-t border-slate-200 dark:border-ink-800 flex flex-wrap gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => downloadFile(detail.drive_file_id, detail.file_name)}>
                  <Download className="w-4 h-4" />原本をダウンロード
                </Button>
                <Button size="sm" onClick={() => viewFileAtPage(detail.drive_file_id, detail.page_start)}>
                  <ExternalLink className="w-4 h-4" />原本の該当ページを見る
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
