import { useState, useEffect } from 'react'
import axios from 'axios'
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google'

const appColors = {
  1: { bg: 'from-blue-500 to-blue-600', light: 'bg-blue-50' },
  2: { bg: 'from-purple-500 to-purple-600', light: 'bg-purple-50' },
  3: { bg: 'from-pink-500 to-pink-600', light: 'bg-pink-50' },
  4: { bg: 'from-green-500 to-green-600', light: 'bg-green-50' },
  5: { bg: 'from-yellow-500 to-yellow-600', light: 'bg-yellow-50' },
  6: { bg: 'from-indigo-500 to-indigo-600', light: 'bg-indigo-50' },
}

function LoginPage({ onLoginSuccess }) {
  const [isLoading, setIsLoading] = useState(false)

  const login = useGoogleLogin({
    onSuccess: async (credentialResponse) => {
      setIsLoading(true)
      try {
        const response = await axios.post(
          `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/auth/google`,
          { token: credentialResponse.access_token }
        )
        const { token, ...user } = response.data
        // サーバー発行のJWTを保存（以降のAPIはこれをBearerで送る）
        localStorage.setItem('authToken', token)
        localStorage.setItem('user', JSON.stringify(user))
        onLoginSuccess(user)
      } catch (error) {
        console.error('Login failed:', error)
        const msg = error.response?.data?.error || 'ログインに失敗しました'
        alert(msg)
      } finally {
        setIsLoading(false)
      }
    },
    onError: () => {
      alert('ログインに失敗しました')
    },
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="mb-6">
            <h1 className="text-4xl font-bold text-slate-900 mb-2">社内ポータル</h1>
            <p className="text-slate-500">中原建設</p>
          </div>

          <p className="text-slate-600 mb-8">
            Google アカウントでログインしてください
          </p>

          <button
            onClick={() => login()}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {isLoading ? 'ログイン中...' : 'Google でログイン'}
          </button>

          <p className="text-xs text-slate-500 mt-6">
            Google Workspace アカウントでログインしてください
          </p>
        </div>
      </div>
    </div>
  )
}

function DashboardPage({ user, onLogout, apps, loading, hoveredApp, setHoveredApp }) {
  const getAppColor = (appId) => appColors[appId] || appColors[1]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* ヘッダー */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="flex items-baseline justify-between">
            <div>
              <h1 className="text-4xl font-bold text-slate-900">
                社内ポータル
              </h1>
              <p className="text-slate-500 mt-2 text-lg">中原建設</p>
            </div>
            <div className="text-right">
              <p className="text-slate-600 text-sm mb-2">
                {new Date().toLocaleDateString('ja-JP', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
              <div className="flex items-center gap-3">
                <span className="text-slate-600">{user?.email}</span>
                <button
                  onClick={onLogout}
                  className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium transition"
                >
                  ログアウト
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-7xl mx-auto px-6 py-16">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
            <p className="text-slate-600 mt-4">読み込み中...</p>
          </div>
        ) : (
          <>
            {/* アプリセクション */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">
                利用可能なアプリ
              </h2>
              <p className="text-slate-600">
                必要なツールにアクセスできます
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {apps.map((app) => {
                const colors = getAppColor(app.id)
                const isComingSoon = app.status === 'coming_soon'

                return (
                  <div
                    key={app.id}
                    onMouseEnter={() => setHoveredApp(app.id)}
                    onMouseLeave={() => setHoveredApp(null)}
                    className={`group relative overflow-hidden rounded-2xl transition-all duration-300 ${
                      isComingSoon
                        ? 'opacity-70 cursor-not-allowed'
                        : 'cursor-pointer hover:shadow-2xl'
                    }`}
                  >
                    {/* グラデーション背景 */}
                    <div
                      className={`absolute inset-0 bg-gradient-to-br ${colors.bg} ${
                        hoveredApp === app.id && !isComingSoon
                          ? 'opacity-100'
                          : 'opacity-0'
                      } transition-opacity duration-300`}
                    />

                    {/* カード本体 */}
                    <div
                      className={`relative bg-white p-8 transition-all duration-300 ${
                        hoveredApp === app.id && !isComingSoon
                          ? 'translate-y-0'
                          : ''
                      }`}
                    >
                      {/* アイコン背景 */}
                      <div
                        className={`${colors.light} w-16 h-16 rounded-xl flex items-center justify-center mb-4 text-3xl group-hover:scale-110 transition-transform duration-300`}
                      >
                        {app.icon}
                      </div>

                      {/* テキスト */}
                      <h3 className="text-xl font-bold text-slate-900 mb-2">
                        {app.name}
                      </h3>
                      <p className="text-slate-600 text-sm mb-6">
                        {app.description || 'アプリケーションにアクセス'}
                      </p>

                      {/* ボタン */}
                      {isComingSoon ? (
                        <div className="inline-flex items-center px-4 py-2 bg-slate-200 text-slate-600 rounded-lg text-sm font-medium cursor-not-allowed">
                          <span className="mr-2">⏱️</span>
                          近日公開
                        </div>
                      ) : (
                        <a
                          href={app.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex items-center px-6 py-3 bg-gradient-to-r ${colors.bg} text-white rounded-lg text-sm font-semibold hover:shadow-lg transition-all duration-300 group-hover:translate-x-1`}
                        >
                          アクセス
                          <span className="ml-2">→</span>
                        </a>
                      )}

                      {/* ホバー時のオーバーレイテキスト */}
                      {!isComingSoon && (
                        <div
                          className={`absolute inset-0 bg-gradient-to-br ${colors.bg} rounded-2xl p-8 flex flex-col justify-between transition-opacity duration-300 ${
                            hoveredApp === app.id
                              ? 'opacity-100'
                              : 'opacity-0 pointer-events-none'
                          }`}
                        >
                          <div>
                            <div className="text-5xl mb-4">{app.icon}</div>
                            <h3 className="text-2xl font-bold text-white mb-2">
                              {app.name}
                            </h3>
                            <p className="text-white text-opacity-90">
                              {app.description ||
                                '本アプリケーションをクリックしてアクセス'}
                            </p>
                          </div>
                          <a
                            href={app.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center px-6 py-3 bg-white bg-opacity-20 hover:bg-opacity-30 text-white rounded-lg text-sm font-semibold backdrop-blur-sm transition-all duration-300"
                          >
                            今すぐアクセス
                            <span className="ml-2">→</span>
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </main>

      {/* フッター */}
      <footer className="bg-white border-t border-slate-200 mt-20">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="grid grid-cols-3 gap-8 mb-8">
            <div>
              <h4 className="font-semibold text-slate-900 mb-3">中原建設</h4>
              <p className="text-slate-600 text-sm">
                社内ポータルで業務を効率化
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 mb-3">クイックリンク</h4>
              <ul className="text-sm text-slate-600 space-y-1">
                <li>
                  <a href="#" className="hover:text-slate-900 transition">
                    ヘルプ
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-slate-900 transition">
                    サポート
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 mb-3">サポート</h4>
              <p className="text-slate-600 text-sm">
                問題が発生した場合はお知らせください
              </p>
            </div>
          </div>
          <div className="border-t border-slate-200 pt-8 text-center text-slate-600 text-sm">
            <p>&copy; 2026 中原建設. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

function AppContent() {
  const [user, setUser] = useState(null)
  const [apps, setApps] = useState([])
  const [loading, setLoading] = useState(true)
  const [hoveredApp, setHoveredApp] = useState(null)

  useEffect(() => {
    const savedUser = localStorage.getItem('user')
    if (savedUser) {
      setUser(JSON.parse(savedUser))
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }

    const fetchApps = async () => {
      try {
        const token = localStorage.getItem('authToken')
        const response = await axios.get(
          `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/apps`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        setApps(response.data)
      } catch (error) {
        console.error('Failed to fetch apps:', error)
        // トークン切れ・無効ならログアウトして再ログインを促す
        if (error.response?.status === 401 || error.response?.status === 403) {
          handleLogout()
        }
      } finally {
        setLoading(false)
      }
    }
    fetchApps()
  }, [user])

  const handleLogout = () => {
    localStorage.removeItem('authToken')
    localStorage.removeItem('user')
    setUser(null)
    setApps([])
  }

  if (!user) {
    return <LoginPage onLoginSuccess={setUser} />
  }

  return (
    <DashboardPage
      user={user}
      onLogout={handleLogout}
      apps={apps}
      loading={loading}
      hoveredApp={hoveredApp}
      setHoveredApp={setHoveredApp}
    />
  )
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      <AppContent />
    </GoogleOAuthProvider>
  )
}
