// ─────────────────────────────────────────────────────────
// PDF → 画像変換（ブラウザ内・pdfjs-dist）
// 両面スキャンの2ページPDFを「1ページ目=表 / 2ページ目=裏」の画像に分解するために使う。
// サーバーは常に画像を受け取る設計なので、PDFの描画はここ（クライアント）で完結させる。
// ─────────────────────────────────────────────────────────
// pdfjs（約1MB）はメインバンドルを膨らませないよう、実際にPDFを扱う時だけ動的読み込みする。
let _pdfjsPromise = null
async function loadPdfjs() {
  if (!_pdfjsPromise) {
    _pdfjsPromise = (async () => {
      const pdfjsLib = await import('pdfjs-dist')
      // Vite に worker をバンドルさせる（別ホスト取得なし＝CSP/オフラインでも動く）
      const PdfWorker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?worker')).default
      pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker()
      return pdfjsLib
    })()
  }
  return _pdfjsPromise
}

// ファイルがPDFかどうか（MIME か拡張子で判定）
export function isPdfFile(file) {
  if (!file) return false
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')
}

// PDF File を各ページ JPEG の File 配列に変換する。
//   maxPages: 変換する最大ページ数（名刺の表裏なので既定2）
//   scale:    描画倍率（大きいほど高精細・重い）
// 返り値: File[]（image/jpeg）。ページごとに1枚。
export async function pdfToImageFiles(file, { maxPages = 2, scale = 2, baseName = 'card' } = {}) {
  const pdfjsLib = await loadPdfjs()
  const buf = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise
  const n = Math.min(pdf.numPages, maxPages)
  const files = []
  for (let i = 1; i <= n; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(viewport.width))
    canvas.height = Math.max(1, Math.round(viewport.height))
    const ctx = canvas.getContext('2d')
    // PDFは透明背景のことがあるので白で塗ってから描画する
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport }).promise
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    files.push(new File([blob], `${baseName}-${i}.jpg`, { type: 'image/jpeg' }))
  }
  return files
}
