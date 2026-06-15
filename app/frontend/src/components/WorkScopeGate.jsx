import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { Monitor, Download, Loader2, ShieldCheck, CheckCircle2, AlertTriangle } from 'lucide-react'
import Button from './ui/Button'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000'

function authConfig() {
  const token = localStorage.getItem('authToken')
  return { headers: { Authorization: `Bearer ${token}` } }
}

// WorkScope が記録する内容（透明性のため明示）
const RECORDED_ITEMS = [
  'アプリの使用時間とウィンドウタイトル',
  'キーボード入力から生成した作業サマリー（個人情報は自動マスク）',
  'Outlook メールの件名・宛先・要約',
]

/**
 * 初回アクセス時の WorkScope 導入ゲート。
 * 未ダウンロードの一般社員に対し、画面全体をふさぐ必須モーダルを表示する。
 * ダウンロードすると required が解除されてモーダルは消える（管理者には出ない）。
 */
export default function WorkScopeGate() {
  const [status, setStatus] = useState(null) // { required, available, downloaded }
  const [downloading, setDownloading] = useState(false)
  const [justDownloaded, setJustDownloaded] = useState(false)
  const [error, setError] = useState('')

  const fetchStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/downloads/workscope/my-status`, authConfig())
      setStatus(res.data)
    } catch {
      // 取得失敗時はブロックしない（業務を止めない）
      setStatus({ required: false })
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const handleDownload = async () => {
    setDownloading(true)
    setError('')
    try {
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
      setJustDownloaded(true)
      setTimeout(fetchStatus, 1500)
    } catch {
      setError('ダウンロードに失敗しました。時間をおいて再度お試しください。')
    } finally {
      setDownloading(false)
    }
  }

  if (!status || !status.required) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="max-w-lg w-full bg-white dark:bg-ink-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-ink-700 overflow-hidden">
        {/* ヘッダー */}
        <div className="bg-brand-600 px-6 py-5 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
            <Monitor className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">WorkScope の導入をお願いします</h2>
            <p className="text-brand-100 text-xs mt-0.5">全社員必須・業務記録ツール</p>
          </div>
        </div>

        <div className="p-6">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            社内ポータルのご利用には、業務記録ツール「WorkScope」の導入が必要です。
            下のボタンからインストーラーをダウンロードし、導入をお願いします。
          </p>

          <div className="mt-4 rounded-xl bg-slate-50 dark:bg-ink-900/40 border border-slate-200 dark:border-ink-700 p-4">
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

          {error && (
            <div className="mt-4 flex items-center gap-2 p-3 rounded-xl bg-danger-50 dark:bg-danger-500/10 border border-danger-200 dark:border-danger-500/30 text-sm text-danger-700 dark:text-danger-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {justDownloaded ? (
            <div className="mt-5">
              <div className="rounded-xl bg-success-50 dark:bg-success-500/10 border border-success-200 dark:border-success-500/30 p-4 text-sm text-success-800 dark:text-success-300">
                <p className="font-semibold mb-1">ダウンロードしました。次の手順で導入してください：</p>
                <ol className="list-decimal list-inside space-y-1 text-success-700 dark:text-success-400">
                  <li>zip を右クリック →「すべて展開」</li>
                  <li>「installer」内の <b>WorkScope_インストール.bat</b> を右クリック →「管理者として実行」</li>
                  <li>画面の規約に同意（氏名・メールは自動入力されます）</li>
                </ol>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-3 text-center">
                ダウンロードが確認できると、この画面は自動的に閉じます。
              </p>
            </div>
          ) : (
            <Button
              onClick={handleDownload}
              disabled={downloading || !status.available}
              className="mt-5 w-full justify-center"
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              インストーラーをダウンロード
            </Button>
          )}

          {!status.available && (
            <p className="text-xs text-warning-600 dark:text-warning-400 mt-3 text-center">
              現在インストーラーが準備中です。管理者にお問い合わせください。
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
