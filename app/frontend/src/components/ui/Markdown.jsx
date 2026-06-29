import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'

// 教材本文（Markdown）を、アプリのデザイン（青系・ダークモード）に合わせて整形表示する。
// - remark-gfm: 表・取り消し線などGitHub風記法に対応
// - rehype-raw: 表セル内の <br> 改行などの生HTMLを描画（本文は自社教材＝信頼できるソースのみ）
//
// 見出し・太字・箇条書き・表をそれぞれ読みやすいスタイルにマッピングする。
// 素の Markdown 記号（#, **, |, :--- 等）が画面にそのまま出ないようにするのが目的。
const components = {
  h1: ({ node, ...p }) => (
    <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-5 mb-2 first:mt-0 pb-1.5 border-b border-slate-200 dark:border-ink-700" {...p} />
  ),
  h2: ({ node, ...p }) => (
    <h2 className="text-base font-bold text-brand-700 dark:text-brand-300 mt-5 mb-2 first:mt-0" {...p} />
  ),
  h3: ({ node, ...p }) => (
    <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mt-4 mb-1.5 first:mt-0" {...p} />
  ),
  h4: ({ node, ...p }) => (
    <h4 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mt-3 mb-1 first:mt-0" {...p} />
  ),
  p: ({ node, ...p }) => (
    <p className="text-[15px] leading-7 text-slate-700 dark:text-slate-200 my-2.5" {...p} />
  ),
  strong: ({ node, ...p }) => (
    <strong className="font-bold text-slate-900 dark:text-white" {...p} />
  ),
  ul: ({ node, ...p }) => (
    <ul className="list-disc pl-5 my-2.5 space-y-1 text-[15px] leading-7 text-slate-700 dark:text-slate-200 marker:text-brand-400" {...p} />
  ),
  ol: ({ node, ...p }) => (
    <ol className="list-decimal pl-5 my-2.5 space-y-1 text-[15px] leading-7 text-slate-700 dark:text-slate-200 marker:text-brand-400" {...p} />
  ),
  li: ({ node, ...p }) => <li className="pl-1" {...p} />,
  blockquote: ({ node, ...p }) => (
    <blockquote className="border-l-4 border-brand-300 dark:border-brand-500/40 bg-brand-50/60 dark:bg-brand-500/10 rounded-r-lg px-3 py-2 my-3 text-sm text-slate-700 dark:text-slate-200" {...p} />
  ),
  hr: () => <hr className="my-4 border-slate-200 dark:border-ink-700" />,
  // 図版: 本文中の正しい位置に表示。alt を図の短いキャプションとして下に添える。
  // <p> の中に来ても妥当なように <span>(display:block) で組む（<figure>だと入れ子崩れ）。
  img: ({ node, src, alt, ...p }) => {
    const cap = (alt || '').replace(/^図[:：]?\s*/, '').trim() // alt 先頭の「図:」を除く
    return (
      <span className="block my-4">
        <img src={src} alt={alt || '図'} loading="lazy"
          className="w-full max-h-[30rem] object-contain rounded-lg border border-slate-200 dark:border-ink-700 bg-white"
          {...p} />
        {cap && <span className="block text-xs text-slate-500 dark:text-slate-400 mt-1.5 text-center">{cap}</span>}
      </span>
    )
  },
  a: ({ node, ...p }) => (
    <a className="text-brand-600 dark:text-brand-300 underline underline-offset-2" target="_blank" rel="noreferrer" {...p} />
  ),
  code: ({ node, inline, ...p }) =>
    inline ? (
      <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-ink-800 text-[13px] font-mono text-slate-800 dark:text-slate-100" {...p} />
    ) : (
      <code className="block p-3 rounded-lg bg-slate-100 dark:bg-ink-800 text-[13px] font-mono text-slate-800 dark:text-slate-100 overflow-x-auto my-3" {...p} />
    ),
  // 表は教材の要。横スクロール可能なラッパで囲み、罫線・ヘッダ網掛けで読みやすく。
  table: ({ node, ...p }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-ink-700">
      <table className="w-full text-sm border-collapse" {...p} />
    </div>
  ),
  thead: ({ node, ...p }) => <thead className="bg-slate-100 dark:bg-ink-800" {...p} />,
  th: ({ node, ...p }) => (
    <th className="border border-slate-200 dark:border-ink-700 px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-100 align-top" {...p} />
  ),
  td: ({ node, ...p }) => (
    <td className="border border-slate-200 dark:border-ink-700 px-3 py-2 text-slate-700 dark:text-slate-200 align-top leading-6" {...p} />
  ),
}

export default function Markdown({ children, className = '' }) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={components}>
        {children || ''}
      </ReactMarkdown>
    </div>
  )
}
