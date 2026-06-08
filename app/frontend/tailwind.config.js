/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Noto Sans JP', 'sans-serif'],
      },
      colors: {
        // ブランド（信頼・堅実）ディープブルー
        brand: { 50:'#eff6ff',100:'#dbeafe',200:'#bfdbfe',300:'#93c5fd',400:'#60a5fa',500:'#3b82f6',600:'#2563eb',700:'#1d4ed8',800:'#1e40af',900:'#1e3a5f' },
        // アクセント（CTA・是正・安全）セーフティオレンジ
        accent: { 50:'#fff7ed',100:'#ffedd5',400:'#fb923c',500:'#f97316',600:'#ea580c' },
        // セマンティック（状態色）
        success: { 50:'#f0fdf4',100:'#dcfce7',400:'#4ade80',500:'#22c55e',600:'#16a34a',700:'#15803d' },
        warning: { 50:'#fffbeb',100:'#fef3c7',400:'#fbbf24',500:'#f59e0b',600:'#d97706',700:'#b45309' },
        danger:  { 50:'#fef2f2',100:'#fee2e2',400:'#f87171',500:'#ef4444',600:'#dc2626',700:'#b91c1c' },
        // ダーク用サーフェス（純黒を避けた柔らかいダーク）
        ink: { 950:'#0b1220',900:'#0f172a',800:'#1e293b',700:'#334155',600:'#475569' },
      },
    },
  },
  plugins: [],
}
