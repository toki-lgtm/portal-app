import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  ArrowLeft, Archive, Folder, FileText, Loader2, ChevronRight,
  HardHat, Users,
} from 'lucide-react'
import Button from './ui/Button'
import Card from './ui/Card'
import Toast from './ui/Toast'
import { API_URL as apiUrl, authConfig } from '../lib/api'
import { useToast } from '../lib/useToast'

// 過去工事アーカイブ：共有ドライブを直接ブラウズする（Drive が正本＝元データそのもの）。
//   scope=kouji（過去工事・全員閲覧） / scope=jinji（人事資料・管理者限定）。
//   閲覧専用。ファイルをタップすると短命URLで元PDFを保存/表示できる。
export default function ArchivePage({ onBack }) {
  const { toast, showToast } = useToast()
  const [isAdmin, setIsAdmin] = useState(false)
  const [scope, setScope] = useState('kouji') // 'kouji' | 'jinji'
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  const [path, setPath] = useState([{ id: null, name: '過去工事' }])
  const [opening, setOpening] = useState(null)

  const scopeLabel = scope === 'jinji' ? '人事資料' : '過去工事'
  const currentFolderId = path[path.length - 1].id

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
      console.error('archive list failed:', e)
      showToast('error', e.response?.data?.error || '一覧の取得に失敗しました')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    axios
      .get(`${apiUrl}/api/my-permissions`, authConfig())
      .then((res) => setIsAdmin(res.data?.role === 'admin'))
      .catch(() => setIsAdmin(false))
  }, [])

  useEffect(() => {
    loadList(scope, null)
  }, [scope, loadList])

  // スコープ切替（工事 / 人事）。パンくずをルートに戻す。
  const switchScope = (sc) => {
    if (sc === scope) return
    setPath([{ id: null, name: sc === 'jinji' ? '人事資料' : '過去工事' }])
    setScope(sc)
  }

  const openFolder = (item) => {
    setPath((p) => [...p, { id: item.id, name: item.name }])
    loadList(scope, item.id)
  }

  const jumpTo = (index) => {
    const target = path[index]
    setPath((p) => p.slice(0, index + 1))
    loadList(scope, index === 0 ? null : target.id)
  }

  // ファイルを開く（短命URLを取得して保存/表示）。
  const openFile = async (item) => {
    setOpening(item.id)
    try {
      const res = await axios.get(
        `${apiUrl}/api/archive/file/${item.id}/url?scope=${scope}`,
        authConfig()
      )
      const url = res.data?.url
      if (!url) throw new Error('URLの取得に失敗しました')
      const a = document.createElement('a')
      a.href = url
      a.download = item.name || ''
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (e) {
      showToast('error', e.response?.data?.error || 'ファイルを開けませんでした')
    } finally {
      setOpening(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-ink-950 transition-colors">
      <header className="bg-white/80 dark:bg-ink-900/80 backdrop-blur border-b border-slate-200 dark:border-ink-800 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />
            戻る
          </Button>
          <div className="flex items-center gap-2">
            <Archive className="w-5 h-5 text-brand-500" />
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">過去工事アーカイブ</h1>
          </div>
        </div>
        {/* スコープ切替（人事タブは管理者のみ） */}
        <div className="max-w-5xl mx-auto px-6 pb-3 flex items-center gap-2">
          <button
            onClick={() => switchScope('kouji')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              scope === 'kouji'
                ? 'bg-brand-500 text-white'
                : 'bg-slate-200 dark:bg-ink-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-ink-600'
            }`}
          >
            <HardHat className="w-4 h-4" />
            過去工事
          </button>
          {isAdmin && (
            <button
              onClick={() => switchScope('jinji')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                scope === 'jinji'
                  ? 'bg-accent-500 text-white'
                  : 'bg-slate-200 dark:bg-ink-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-ink-600'
              }`}
            >
              <Users className="w-4 h-4" />
              人事資料
              <span className="text-[10px] px-1 py-0.5 rounded bg-black/15">管理者限定</span>
            </button>
          )}
        </div>
      </header>

      {toast && <Toast toast={toast} />}

      <main className="max-w-5xl mx-auto px-6 py-8">
        <nav className="flex items-center flex-wrap gap-1 text-sm mb-4">
          {path.map((seg, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="w-4 h-4 text-slate-400" />}
              <button
                onClick={() => jumpTo(i)}
                className={`px-1.5 py-0.5 rounded hover:bg-slate-200 dark:hover:bg-ink-700 ${
                  i === path.length - 1
                    ? 'font-semibold text-slate-900 dark:text-white'
                    : 'text-brand-600 dark:text-brand-400'
                }`}
              >
                {seg.name}
              </button>
            </span>
          ))}
        </nav>

        {loading ? (
          <div className="text-center py-20">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-brand-500" />
            <p className="text-slate-500 dark:text-slate-400 mt-3">読み込み中...</p>
          </div>
        ) : items.length === 0 ? (
          <Card className="p-10 text-center text-slate-500 dark:text-slate-400">
            <Folder className="w-10 h-10 mx-auto mb-3 opacity-40" />
            この{scopeLabel}フォルダには資料がありません。
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((item) => (
              <Card
                key={item.id}
                className="p-4 flex items-center gap-3 group hover:shadow-md transition cursor-pointer"
                onClick={() => (item.isFolder ? openFolder(item) : openFile(item))}
              >
                <div className="shrink-0">
                  {item.isFolder ? (
                    <Folder className="w-8 h-8 text-accent-500" />
                  ) : (
                    <FileText className="w-8 h-8 text-brand-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate" title={item.name}>
                    {item.name}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {item.isFolder ? 'フォルダ' : opening === item.id ? '準備中…' : 'タップして開く'}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
