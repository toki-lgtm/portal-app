/**
 * テーマユーティリティ
 * 'dark' | 'light' | 'system' の3値を管理する。
 * localStorage キーは 'theme'。
 * ThemeToggle と SettingsPage の両方から使用。
 */

/** OS のカラースキーム変化を監視するリスナ（systemモード時のみ登録）*/
let _systemListener = null

/**
 * テーマを適用する。documentElement への class 付与と
 * system リスナの登録/解除を担う。
 * @param {'dark'|'light'|'system'} theme
 */
export function applyTheme(theme) {
  const root = document.documentElement

  // 既存の system リスナを必ず外す
  if (_systemListener) {
    window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', _systemListener)
    _systemListener = null
  }

  if (theme === 'system') {
    // OS 設定に追従
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      if (mq.matches) root.classList.add('dark')
      else root.classList.remove('dark')
    }
    apply()
    _systemListener = apply
    mq.addEventListener('change', _systemListener)
  } else if (theme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

/**
 * テーマを保存して即時適用する。
 * @param {'dark'|'light'|'system'} theme
 */
export function saveTheme(theme) {
  localStorage.setItem('theme', theme)
  applyTheme(theme)
}

/**
 * localStorage から現在のテーマを読む。
 * 未設定または 'system' は 'system' として扱う。
 * @returns {'dark'|'light'|'system'}
 */
export function loadTheme() {
  const t = localStorage.getItem('theme')
  if (t === 'dark' || t === 'light') return t
  return 'system'
}
