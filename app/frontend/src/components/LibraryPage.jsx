import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import {
  ArrowLeft, BookOpen, Folder, FileText, Loader2, Trash2,
  FolderPlus, Upload, ChevronRight, Image as ImageIcon, Download,
} from 'lucide-react'
import Button from './ui/Button'
import Card from './ui/Card'
import ModalShell from './ui/ModalShell'
import Toast from './ui/Toast'
import { API_URL as apiUrl, authConfig, authConfigMultipart } from '../lib/api'
import { useToast } from '../lib/useToast'

// 資料ライブラリ：共有ドライブ「社内システム/09.資料ライブラリ」を直接ブラウズする。
//   フォルダ=カテゴリ、ファイル=資料。閲覧は全員、管理（作成/アップロード/削除）は admin のみ。
export default function LibraryPage({ onBack }) {
  const { toast, showToast } = useToast()
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  // パンくず（末尾が現在のフォルダ）。ルートは list の初回応答で id を確定する。
  const [path, setPath] = useState([{ id: null, name: '資料ライブラリ' }])
  const [opening, setOpening] = useState(null) // 閲覧URL取得中のファイルID
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  const currentFolderId = path[path.length - 1].id

  const loadList = useCallback(async (folderId) => {
    setLoading(true)
    try {
      const q = folderId ? `?folderId=${encodeURIComponent(folderId)}` : ''
      const res = await axios.get(`${apiUrl}/api/library/list${q}`, authConfig())
      setItems(res.data?.items || [])
      // ルート閲覧時は確定した rootId をパンくず先頭に補完（削除/アップロードの親IDに使う）。
      if (!folderId && res.data?.rootId) {
        setPath((p) => (p.length === 1 ? [{ id: res.data.rootId, name: '資料ライブラリ' }] : p))
      }
    } catch (e) {
      console.error('library list failed:', e)
      showToast('error', e.response?.data?.error || '一覧の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    loadList(null)
    axios
      .get(`${apiUrl}/api/my-permissions`, authConfig())
      .then((res) => setIsAdmin(res.data?.role === 'admin'))
      .catch(() => setIsAdmin(false))
  }, [loadList])

  // フォルダを開く
  const openFolder = (item) => {
    setPath((p) => [...p, { id: item.id, name: item.name }])
    loadList(item.id)
  }

  // パンくずの任意階層へ戻る
  const jumpTo = (index) => {
    const target = path[index]
    setPath((p) => p.slice(0, index + 1))
    loadList(index === 0 ? null : target.id)
  }

  // ファイルをブラウザで閲覧（inline 配信＝dl=0 を新規タブで開く）。
  //   PDF・画像はタブ内で表示。Range 対応済みなので大容量でも先頭から軽く開ける。
  //   Word/Excel 等ブラウザが表示できない形式は、そのまま保存扱いになる。
  const viewFile = async (item) => {
    setOpening(item.id)
    try {
      const res = await axios.get(`${apiUrl}/api/library/file/${item.id}/url?dl=0`, authConfig())
      const url = res.data?.url
      if (!url) throw new Error('URLの取得に失敗しました')
      // iOS Safari は非同期後の window.open(新規タブ) をブロックするため、同一タブ遷移で開く。
      // inline 配信なので PDF/画像はそのタブに表示（戻るでポータルに戻れる）。
      window.location.href = url
    } catch (e) {
      const s = e.response?.status ? `（エラー${e.response.status}）` : ''
      showToast('error', (e.response?.data?.error || '閲覧用URLの取得に失敗しました') + s)
      setOpening(null)
    }
  }

  // ファイルをダウンロード（短命URLを取得し attachment 配信をアンカーで保存）。
  const downloadFile = async (item) => {
    setOpening(item.id)
    try {
      const res = await axios.get(`${apiUrl}/api/library/file/${item.id}/url`, authConfig())
      const url = res.data?.url
      if (!url) throw new Error('URLの取得に失敗しました')
      // iOS Safari は a.download(クロスオリジン) を無視しがち。attachment 配信へ同一タブ遷移すれば
      // Safari のダウンロード機能が受け取る。PC はページ遷移せず保存される。
      window.location.href = url
    } catch (e) {
      showToast('error', e.response?.data?.error || 'ダウンロードに失敗しました')
    } finally {
      setOpening(null)
    }
  }

  // フォルダ作成（管理者）
  const createFolder = async () => {
    const name = newFolderName.trim()
    if (!name) return
    try {
      await axios.post(
        `${apiUrl}/api/library/folders`,
        { name, parentId: currentFolderId },
        authConfig()
      )
      setShowNewFolder(false)
      setNewFolderName('')
      showToast('success', `フォルダ「${name}」を作成しました`)
      loadList(path.length === 1 ? null : currentFolderId)
    } catch (e) {
      showToast('error', e.response?.data?.error || 'フォルダの作成に失敗しました')
    }
  }

  // ファイルアップロード（管理者）
  const onUpload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 同じファイルを連続選択できるようリセット
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (currentFolderId) fd.append('folderId', currentFolderId)
      await axios.post(`${apiUrl}/api/library/upload`, fd, authConfigMultipart())
      showToast('success', `「${file.name}」をアップロードしました`)
      loadList(path.length === 1 ? null : currentFolderId)
    } catch (e2) {
      showToast('error', e2.response?.data?.error || 'アップロードに失敗しました')
    } finally {
      setUploading(false)
    }
  }

  // 削除（管理者）
  const remove = async (item) => {
    const label = item.isFolder ? `フォルダ「${item.name}」と中身` : `「${item.name}」`
    if (!window.confirm(`${label}をゴミ箱に移動します。よろしいですか？`)) return
    try {
      await axios.delete(`${apiUrl}/api/library/${item.id}`, authConfig())
      showToast('success', '削除しました')
      setItems((prev) => prev.filter((i) => i.id !== item.id))
    } catch (e) {
      showToast('error', e.response?.data?.error || '削除に失敗しました')
    }
  }

  const isImage = (m) => (m || '').startsWith('image/')

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-ink-950 transition-colors">
      {/* ヘッダー */}
      <header className="bg-white/80 dark:bg-ink-900/80 backdrop-blur border-b border-slate-200 dark:border-ink-800 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />
            戻る
          </Button>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-brand-500" />
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">資料ライブラリ</h1>
          </div>
          {isAdmin && (
            <div className="ml-auto flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowNewFolder(true)}>
                <FolderPlus className="w-4 h-4" />
                <span className="hidden sm:inline">フォルダ作成</span>
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <span className="hidden sm:inline">アップロード</span>
              </Button>
              <input ref={fileInputRef} type="file" className="hidden" onChange={onUpload} />
            </div>
          )}
        </div>
      </header>

      {toast && <Toast toast={toast} />}

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* パンくず */}
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
            このフォルダには資料がありません。
            {isAdmin && <div className="text-xs mt-2">右上の「アップロード」から追加できます。</div>}
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((item) => (
              <Card
                key={item.id}
                className="p-4 flex items-center gap-3 group hover:shadow-md transition cursor-pointer"
                onClick={() => (item.isFolder ? openFolder(item) : viewFile(item))}
              >
                <div className="shrink-0">
                  {item.isFolder ? (
                    <Folder className="w-8 h-8 text-accent-500" />
                  ) : isImage(item.mimeType) ? (
                    <ImageIcon className="w-8 h-8 text-brand-400" />
                  ) : (
                    <FileText className="w-8 h-8 text-brand-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate" title={item.name}>
                    {item.name}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {item.isFolder ? 'フォルダ' : opening === item.id ? '準備中…' : 'タップして閲覧'}
                  </p>
                </div>
                {!item.isFolder && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      downloadFile(item)
                    }}
                    className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-500/15 transition"
                    title="ダウンロード（保存）"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                )}
                {isAdmin && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      remove(item)
                    }}
                    className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-500/15 opacity-0 group-hover:opacity-100 transition"
                    title="削除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* フォルダ作成モーダル */}
      {showNewFolder && (
        <ModalShell title="フォルダを作成" onClose={() => setShowNewFolder(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                フォルダ名
              </label>
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createFolder()}
                placeholder="例）建築士会 会報 / 安全資料 など"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-ink-600 bg-white dark:bg-ink-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <p className="text-xs text-slate-400 mt-1.5">
                現在の場所（{path[path.length - 1].name}）の中に作成します。
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowNewFolder(false)}>
                キャンセル
              </Button>
              <Button variant="primary" size="sm" onClick={createFolder} disabled={!newFolderName.trim()}>
                作成
              </Button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
