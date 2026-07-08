// ISO記録を「これまでの書式」(原本docxレイアウト)で印刷/PDF出力するユーティリティ。
// 依存なし・フロント完結。新規ウィンドウに自己完結HTMLを書き出し、ブラウザ印刷でPDF保存する。

const WD = ['日', '月', '火', '水', '木', '金', '土']

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
// 改行を <br> に（HTMLエスケープ後）
const nl2br = (s) => esc(s).replace(/\r?\n/g, '<br>')

// 'YYYY-MM-DD' → {y,m,d,wd}
function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''))
  if (!m) return null
  const y = +m[1], mo = +m[2], d = +m[3]
  const wd = WD[new Date(y, mo - 1, d).getDay()]
  return { y, m: mo, d, wd }
}

// 共通のドキュメント枠（A4・明朝）。bodyHtml を流し込み、開いたら自動で印刷ダイアログ。
function openDoc(title, bodyHtml) {
  const w = window.open('', '_blank')
  if (!w) { alert('ポップアップがブロックされました。ポップアップを許可してから再度お試しください。'); return }
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Yu Mincho','游明朝','MS Mincho','Hiragino Mincho ProN',serif; color:#000; font-size:11pt; line-height:1.7; margin:0; }
  .doc-title { text-align:center; font-size:16pt; font-weight:700; letter-spacing:.3em; margin:0 0 14px; }
  .meta { margin:2px 0; }
  .sec { margin:12px 0 2px; font-weight:700; }
  .sub { margin:2px 0 2px 1em; font-weight:700; }
  .body { margin:0 0 2px 2em; }
  .body2 { margin:0 0 2px 1em; }
  table { border-collapse:collapse; width:100%; margin:4px 0 16px; }
  td, th { border:1px solid #000; padding:4px 6px; vertical-align:top; font-size:10.5pt; }
  .ghead { background:#e8e8e8; font-weight:700; font-size:11.5pt; }
  .gdesc td { font-weight:400; }
  .abkey { width:2em; text-align:center; white-space:nowrap; background:#f5f5f5; }
  .abname { width:8em; white-space:nowrap; background:#f5f5f5; font-weight:700; }
  .mhead td { background:#f0f0f0; font-weight:700; text-align:center; }
  .mmonth { width:5em; text-align:center; white-space:nowrap; }
  .mres { width:55%; }
  .goal { page-break-inside:avoid; margin-bottom:8px; }
  .goal + .goal { margin-top:18px; }
  .co { font-size:10pt; margin-bottom:6px; }
  @media print { .noprint { display:none; } }
</style></head>
<body onload="window.focus();window.print();">
${bodyHtml}
</body></html>`
  w.document.open()
  w.document.write(html)
  w.document.close()
}

// ── 安全衛生委員会 議事録 ─────────────────────────────
export function printCommitteeDoc(row) {
  const dt = parseDate(row.meeting_date)
  const m = dt ? dt.m : null
  const nextM = m ? (m % 12) + 1 : null
  const dateStr = dt ? `${dt.y}年${dt.m}月${dt.d}日（${dt.wd}）` : esc(row.meeting_date || '')
  const acc = Number(row.accident_count || 0)

  const sec = (title) => `<p class="sec">${esc(title)}</p>`
  const parts = []
  parts.push(`<h1 class="doc-title">安全衛生委員会議事録</h1>`)
  parts.push(`<p class="meta">日時: ${dateStr}</p>`)
  parts.push(`<p class="meta">場所: ${row.location ? '[' + esc(row.location) + ']' : '—'}</p>`)
  parts.push(`<p class="meta">出席者: ${esc(row.attendees || '—')}</p>`)
  parts.push(`<p class="meta">議題: ${m ? m + '月度' : ''} 安全衛生に関する報告および当月の注意事項</p>`)

  parts.push(sec('1. 各目標の進捗報告'))
  parts.push(`<p class="sub">労働災害発生状況:</p>`)
  parts.push(`<p class="body">発生件数: ${m ? m + '月' : ''}の労働災害発生件数は ${acc}件 でした。</p>`)

  parts.push(sec('2. KY（危険予知）活動について'))
  parts.push(`<p class="body2">${nl2br(row.ky_report || '—')}</p>`)

  parts.push(sec('3. 安全点検簿について'))
  parts.push(`<p class="body2">${nl2br(row.patrol_result || '—')}</p>`)

  parts.push(sec(`4. 来月${nextM ? '（' + nextM + '月）' : ''}の労働安全上の注意事項`))
  parts.push(`<p class="body2">${nl2br(row.notes || '—')}</p>`)

  if (row.discussion) {
    parts.push(sec('5. その他'))
    parts.push(`<p class="body2">${nl2br(row.discussion)}</p>`)
  }
  if (row.summary) {
    parts.push(sec(`総評${row.summary_by ? '（' + esc(row.summary_by) + '）' : ''}`))
    parts.push(`<p class="body2">${nl2br(row.summary)}</p>`)
  }

  openDoc(`安全衛生委員会議事録_${esc(row.meeting_date || '')}`, parts.join('\n'))
}

// ── 目標達成計画書 ───────────────────────────────────
const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩']
const stripParen = (s) => String(s || '').replace(/[（(].*$/, '').trim()

// fiscalYear: 対象年度文字列 / goals: その年度の目標配列 / progressByGoal: {goalId: rows[]}
export function printGoalPlan(fiscalYear, goals, progressByGoal) {
  const list = (goals || [])
    .filter((g) => String(g.fiscal_year) === String(fiscalYear))
    .slice()
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))

  const countByCat = {}
  const blocks = list.map((g) => {
    countByCat[g.category] = (countByCat[g.category] || 0) + 1
    const no = CIRCLED[countByCat[g.category] - 1] || `(${countByCat[g.category]})`
    const rows = (progressByGoal[g.id] || []).slice().sort((a, b) => (a.ym || '').localeCompare(b.ym || ''))
    const owner = stripParen(g.owner) || '責任者'
    const evaluator = (rows.find((r) => r.evaluator)?.evaluator) || '評価者'

    const abf = [
      ['a', '実施事項', g.action_items],
      ['b', '必要な資源', g.resources],
      ['c', '責任者', g.owner],
      ['d', '達成期限', g.deadline],
      ['e', '評価方法', g.eval_method],
      ['f', '事業プロセス', g.ms_clause],
    ].map(([k, name, val]) =>
      `<tr><td class="abkey">${k}</td><td class="abname">${esc(name)}</td><td>${nl2br(val || '—')}</td></tr>`
    ).join('')

    const monthRows = rows.length
      ? rows.map((r) => {
          const mm = /-(\d{2})/.exec(r.ym || '')
          const label = mm ? `${+mm[1]}月` : esc(r.ym || '')
          return `<tr><td class="mmonth">${label}</td><td class="mres">${nl2br(r.result || '')}</td><td>${nl2br(r.evaluation || '')}</td></tr>`
        }).join('')
      : `<tr><td class="mmonth">—</td><td class="mres">月次の記録なし</td><td></td></tr>`

    const desc = g.baseline ? `${esc(g.title)}（${esc(g.baseline)}）` : esc(g.title)

    return `<div class="goal">
      <table><tr class="ghead"><td>${esc(fiscalYear)}年　${esc(g.category)}目標${no}</td></tr>
      <tr class="gdesc"><td>${desc}</td></tr></table>
      <table>${abf}</table>
      <table>
        <tr class="mhead"><td class="mmonth">実施月</td><td class="mres">結果（${esc(owner)}）</td><td>評価（${esc(evaluator)}）</td></tr>
        ${monthRows}
      </table>
    </div>`
  }).join('\n')

  const body = `<p class="co">㈱中原建設　品質・労働安全衛生／目標達成計画書</p>
    <h1 class="doc-title">${esc(fiscalYear)}年　目標達成計画書</h1>
    ${blocks || '<p>対象年度の目標がありません。</p>'}`

  openDoc(`目標達成計画書_${esc(fiscalYear)}年`, body)
}
