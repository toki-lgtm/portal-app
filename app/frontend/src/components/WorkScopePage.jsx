import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  ArrowLeft, Download, Loader2, Monitor, ShieldCheck, Upload,
  CheckCircle2, AlertTriangle, Users, RefreshCw,
} from 'lucide-react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import { EULA_VERSION } from '../lib/workscopeEula'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000'

function authConfig() {
  const token = localStorage.getItem('authToken')
  return { headers: { Authorization: `Bearer ${token}` } }
}

function fmtDateTime(d) {
  if (!d) return ''
  const dt = new Date(d)
  return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
}

function fmtSize(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// WorkScope が記録する内容（透明性のため明示する）
const RECORDED_ITEMS = [
  'アプリの使用時間とウィンドウタイトル',
  'キーボード入力から生成した作業サマリー（個人情報は自動マスク）',
  'Outlook メールの件名・宛先・要約',
  'Claude Code の作業ログ',
]

// 導入手順
const INSTALL_STEPS = [
  'ダウンロードした zip ファイルを右クリックし「すべて展開」で解凍します。',
  '展開したフォルダ内の「installer」を開きます。',
  '「WorkScope_インストール.bat」を右クリック →「管理者として実行」します。',
  '利用規約に同意し、氏名（フルネーム）と Google Drive フォルダを入力してインストールします。',
  '完了画面が表示されれば導入完了。以降はバックグラウンドで自動記録されます。',
]

export default function WorkScopePage({ onBack }) {
  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [agreed, setAgreed] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')

  // 管理者用
  const [isAdmin, setIsAdmin] = useState(false)
  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [consents, setConsents] = useState(null)
  const [file, setFile] = useState(null)
  const [version, setVersion] = useState('')
  const [notes, setNotes] = useState('')
  const [uploading, setUploading] = useState(false)

  const fetchInfo = useCallback(async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/downloads/workscope/info`, authConfig())
      setInfo(res.data)
    } catch (e) {
      setError(e.response?.data?.error || '情報の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const res = await axios.get(`${apiUrl}/api/admin/workscope/downloads`, authConfig())
      setStats(res.data)
    } catch {
      setStats(null)
    } finally {
      setStatsLoading(false)
    }
  }, [])

  const fetchConsents = useCallback(async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/admin/workscope/consents`, authConfig())
      setConsents(res.data)
    } catch {
      setConsents(null)
    }
  }, [])

  useEffect(() => {
    fetchInfo()
    // 管理者判定（失敗時は非管理者扱い）
    axios.get(`${apiUrl}/api/my-permissions`, authConfig())
      .then((r) => {
        if (r.data?.role === 'admin') {
          setIsAdmin(true)
          fetchStats()
          fetchConsents()
        }
      })
      .catch(() => {})
  }, [fetchInfo, fetchStats, fetchConsents])

  const handleDownload = async () => {
    setDownloading(true)
    setError('')
    try {
      // 同意を中央記録（失敗してもダウンロードは妨げない）
      try {
        await axios.post(`${apiUrl}/api/downloads/workscope/consent`, { eula_version: EULA_VERSION }, authConfig())
      } catch (_) { /* 記録失敗は致命としない */ }

      // 本人の氏名/メールを埋め込んだ zip がバイナリで返る
      const res = await axios.get(`${apiUrl}/api/downloads/workscope/file`, {
        ...authConfig(),
        responseType: 'blob',
      })
      const blobUrl = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = 'WorkScope_setup.zip'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(blobUrl)
      // 自分の前回DL日時を更新
      setTimeout(fetchInfo, 1500)
    } catch (e) {
      setError('ダウンロードに失敗しました')
    } finally {
      setDownloading(false)
    }
  }

  const handleUpload = async () => {
    if (!file || !version.trim()) {
      setError('zip ファイルとバージョンを指定してください')
      return
    }
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('version', version.trim())
      if (notes.trim()) fd.append('notes', notes.trim())
      await axios.post(`${apiUrl}/api/admin/workscope/release`, fd, {
        headers: { ...authConfig().headers, 'Content-Type': 'multipart/form-data' },
      })
      setFile(null)
      setVersion('')
      setNotes('')
      await fetchInfo()
    } catch (e) {
      setError(e.response?.data?.error || 'アップロードに失敗しました')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-ink-950 transition-colors">
      {/* ヘッダー */}
      <header className="bg-white/80 dark:bg-ink-900/80 backdrop-blur border-b border-slate-200 dark:border-ink-800 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-ink-800 transition"
            aria-label="戻る"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Monitor className="w-5 h-5 text-brand-500" />
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">WorkScope 導入</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-danger-50 dark:bg-danger-500/10 border border-danger-200 dark:border-danger-500/30 text-sm text-danger-700 dark:text-danger-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* 概要・透明性 */}
        <Card className="p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-brand-50 dark:bg-brand-500/15 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
              <Monitor className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white">WorkScope（業務記録ツール）</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                日々の業務をバックグラウンドで自動記録し、共有ドライブに保存します。
                業務の振り返りや改善に活用します。
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-ink-800/50 border border-slate-200 dark:border-ink-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="w-4 h-4 text-brand-500" />
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">記録される主な内容</span>
            </div>
            <ul className="space-y-1.5">
              {RECORDED_ITEMS.map((t) => (
                <li key={t} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-success-500 mt-0.5 shrink-0" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </Card>

        {/* ダウンロード */}
        <Card className="p-6">
          <h2 className="font-bold text-slate-900 dark:text-white mb-4">インストーラーのダウンロード</h2>

          {loading ? (
            <p className="text-sm text-slate-400 py-6 text-center">読み込み中...</p>
          ) : !info?.available ? (
            <div className="flex items-center gap-2 p-4 rounded-xl bg-warning-50 dark:bg-warning-500/10 border border-warning-200 dark:border-warning-500/30 text-sm text-warning-700 dark:text-warning-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              インストーラーはまだ登録されていません。管理者の準備をお待ちください。
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-4 text-sm text-slate-500 dark:text-slate-400">
                <Badge tone="info">v{info.version}</Badge>
                {info.file_size != null && <span>{fmtSize(info.file_size)}</span>}
                {info.uploaded_at && <span>・更新 {fmtDateTime(info.uploaded_at)}</span>}
              </div>
              {info.notes && (
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 whitespace-pre-wrap">{info.notes}</p>
              )}
              {info.my_last_download_at && (
                <p className="text-xs text-success-600 dark:text-success-400 mb-4">
                  前回ダウンロード: {fmtDateTime(info.my_last_download_at)}
                </p>
              )}

              <label className="flex items-start gap-2 mb-4 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-brand-600"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">
                  インストール時に表示される利用規約・プライバシーポリシーに同意の上、ダウンロードします。
                </span>
              </label>

              <Button onClick={handleDownload} disabled={!agreed || downloading}>
                {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                インストーラーをダウンロード
              </Button>
            </>
          )}
        </Card>

        {/* 導入手順 */}
        <Card className="p-6">
          <h2 className="font-bold text-slate-900 dark:text-white mb-4">導入手順</h2>
          <ol className="space-y-3">
            {INSTALL_STEPS.map((step, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300">
                <span className="w-6 h-6 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-4">
            ※ Python や ActivityWatch が未導入の場合、インストーラーが自動で導入します（初回は数分かかります）。
          </p>
        </Card>

        {/* 管理者セクション */}
        {isAdmin && (
          <Card className="p-6 border-brand-200 dark:border-brand-500/30">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-brand-500" />
              <h2 className="font-bold text-slate-900 dark:text-white">管理者メニュー</h2>
            </div>

            {/* インストーラー更新 */}
            <div className="rounded-xl bg-slate-50 dark:bg-ink-800/50 border border-slate-200 dark:border-ink-700 p-4 mb-5">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">
                インストーラーの登録 / 更新
              </h3>
              <div className="space-y-3">
                <input
                  type="file"
                  accept=".zip"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-slate-600 dark:text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-brand-600 file:text-white file:text-sm file:font-semibold hover:file:bg-brand-700"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    placeholder="バージョン（例: 1.0.0）"
                    className="px-3 py-2 rounded-lg border border-slate-300 dark:border-ink-600 bg-white dark:bg-ink-700 text-sm text-slate-800 dark:text-slate-100"
                  />
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="変更点・備考（任意）"
                    className="px-3 py-2 rounded-lg border border-slate-300 dark:border-ink-600 bg-white dark:bg-ink-700 text-sm text-slate-800 dark:text-slate-100"
                  />
                </div>
                <Button onClick={handleUpload} disabled={uploading || !file || !version.trim()}>
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  アップロードして現行版にする
                </Button>
              </div>
            </div>

            {/* 導入状況 */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">導入状況</h3>
              <button
                onClick={fetchStats}
                className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> 更新
              </button>
            </div>

            {statsLoading ? (
              <p className="text-sm text-slate-400 py-4 text-center">読み込み中...</p>
            ) : !stats ? (
              <p className="text-sm text-slate-400 py-4 text-center">集計を取得できませんでした</p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="rounded-xl bg-white dark:bg-ink-800 border border-slate-200 dark:border-ink-700 p-3 text-center">
                    <p className="text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">{stats.unique_users}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">導入済み（人）</p>
                  </div>
                  <div className="rounded-xl bg-white dark:bg-ink-800 border border-slate-200 dark:border-ink-700 p-3 text-center">
                    <p className="text-2xl font-extrabold text-warning-600 dark:text-warning-400 tabular-nums">{stats.not_downloaded_count}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">未導入（人）</p>
                  </div>
                  <div className="rounded-xl bg-white dark:bg-ink-800 border border-slate-200 dark:border-ink-700 p-3 text-center">
                    <p className="text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">{stats.total_downloads}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">DL累計（回）</p>
                  </div>
                </div>

                {stats.downloaded?.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">導入済み</p>
                    <ul className="divide-y divide-slate-100 dark:divide-ink-700">
                      {stats.downloaded.map((u) => (
                        <li key={u.email} className="flex items-center justify-between py-2 text-sm">
                          <span className="text-slate-800 dark:text-slate-200">{u.name || u.email}</span>
                          <span className="text-xs text-slate-400">{fmtDateTime(u.last_at)}・v{u.version}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {stats.not_downloaded?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">未導入</p>
                    <div className="flex flex-wrap gap-1.5">
                      {stats.not_downloaded.map((u) => (
                        <span key={u.email} className="px-2 py-1 rounded-lg bg-warning-50 dark:bg-warning-500/10 text-warning-700 dark:text-warning-400 text-xs">
                          {u.name || u.email}{u.department ? `（${u.department}）` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* 利用規約の同意状況 */}
            <div className="mt-6 pt-5 border-t border-slate-200 dark:border-ink-700">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">利用規約の同意状況</h3>
              {!consents ? (
                <p className="text-sm text-slate-400">—</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="rounded-xl bg-white dark:bg-ink-800 border border-slate-200 dark:border-ink-700 p-3 text-center">
                      <p className="text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">{consents.total}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">同意済み（人）</p>
                    </div>
                    <div className="rounded-xl bg-white dark:bg-ink-800 border border-slate-200 dark:border-ink-700 p-3 text-center">
                      <p className="text-2xl font-extrabold text-warning-600 dark:text-warning-400 tabular-nums">{consents.not_consented?.length || 0}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">未同意（人）</p>
                    </div>
                  </div>
                  {consents.consented?.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">同意済み</p>
                      <ul className="divide-y divide-slate-100 dark:divide-ink-700">
                        {consents.consented.map((u) => (
                          <li key={u.email} className="flex items-center justify-between py-2 text-sm">
                            <span className="text-slate-800 dark:text-slate-200">{u.name || u.email}</span>
                            <span className="text-xs text-slate-400">{fmtDateTime(u.agreed_at)}・版{u.eula_version || '—'}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {consents.not_consented?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">未同意</p>
                      <div className="flex flex-wrap gap-1.5">
                        {consents.not_consented.map((u) => (
                          <span key={u.email} className="px-2 py-1 rounded-lg bg-warning-50 dark:bg-warning-500/10 text-warning-700 dark:text-warning-400 text-xs">
                            {u.name || u.email}{u.department ? `（${u.department}）` : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>
        )}
      </main>
    </div>
  )
}
