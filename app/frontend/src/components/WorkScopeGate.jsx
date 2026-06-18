import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { Monitor, Download, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import Button from './ui/Button'
import { EULA_TEXT, EULA_VERSION } from '../lib/workscopeEula'
import { API_URL as apiUrl, authConfig } from '../lib/api'

// 導入手順（ダウンロード前から案内する）
const INSTALL_STEPS = [
  'ダウンロードした zip を右クリック →「すべて展開」で解凍',
  '「installer」フォルダ内の WorkScope_インストール.bat を右クリック →「管理者として実行」',
  '画面の指示に従って導入（氏名・メールは自動入力されます）',
]

/**
 * 初回アクセス時の WorkScope 導入ゲート。
 * 未ダウンロードの一般社員に対し、画面全体をふさぐ必須モーダルを表示する。
 * 利用規約に同意（チェック）しないとダウンロードできず、同意は中央に記録される。
 * ダウンロードすると required が解除されてモーダルは消える（管理者には出ない）。
 */
export default function WorkScopeGate() {
  const [status, setStatus] = useState(null) // { required, available, downloaded }
  const [agreed, setAgreed] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [justDownloaded, setJustDownloaded] = useState(false)
  const [error, setError] = useState('')

  const fetchStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/downloads/workscope/my-status`, authConfig())
      setStatus(res.data)
    } catch {
      setStatus({ required: false }) // 取得失敗時はブロックしない（業務を止めない）
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const handleDownload = async () => {
    setDownloading(true)
    setError('')
    try {
      // 同意を中央記録（失敗してもダウンロードは妨げない）
      try {
        await axios.post(`${apiUrl}/api/downloads/workscope/consent`, { eula_version: EULA_VERSION }, authConfig())
      } catch (_) { /* 記録失敗は致命としない */ }

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
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center px-4 py-6">
      <div className="max-w-lg w-full bg-white dark:bg-ink-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-ink-700 overflow-hidden flex flex-col max-h-[92vh]">
        {/* ヘッダー */}
        <div className="bg-brand-600 px-6 py-5 flex items-center gap-3 shrink-0">
          <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
            <Monitor className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">WorkScope の導入をお願いします</h2>
            <p className="text-brand-100 text-xs mt-0.5">全社員必須・業務記録ツール</p>
          </div>
        </div>

        <div className="p-6 overflow-y-auto">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            社内ポータルのご利用には、業務記録ツール「WorkScope」の導入が必要です。
            下記の利用規約をお読みのうえ、同意してインストーラーをダウンロードしてください。
          </p>

          {/* 利用規約（全文・スクロール） */}
          <div className="mt-4 h-56 overflow-y-auto rounded-xl bg-slate-50 dark:bg-ink-900/40 border border-slate-200 dark:border-ink-700 p-4">
            <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-600 dark:text-slate-300">{EULA_TEXT}</pre>
          </div>

          {/* 導入手順 */}
          <div className="mt-4">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">導入手順</p>
            <ol className="space-y-2">
              {INSTALL_STEPS.map((s, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-slate-600 dark:text-slate-300">
                  <span className="w-5 h-5 rounded-full bg-brand-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
              ※ Python や ActivityWatch が未導入の場合は自動で導入されます（初回は数分）。
            </p>
          </div>

          {/* 同意チェック */}
          <label className="flex items-start gap-2 mt-4 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-brand-600"
            />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              上記の利用規約・プライバシーポリシーを読み、同意します。
            </span>
          </label>

          {error && (
            <div className="mt-4 flex items-center gap-2 p-3 rounded-xl bg-danger-50 dark:bg-danger-500/10 border border-danger-200 dark:border-danger-500/30 text-sm text-danger-700 dark:text-danger-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {justDownloaded ? (
            <div className="mt-5">
              <div className="rounded-xl bg-success-50 dark:bg-success-500/10 border border-success-200 dark:border-success-500/30 p-4 text-sm text-success-800 dark:text-success-300">
                <p className="font-semibold">ダウンロードしました。上の「導入手順」に沿って導入してください。</p>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-3 text-center">
                ダウンロードが確認できると、この画面は自動的に閉じます。
              </p>
            </div>
          ) : (
            <Button
              onClick={handleDownload}
              disabled={downloading || !agreed || !status.available}
              className="mt-5 w-full justify-center"
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              同意してダウンロード
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
