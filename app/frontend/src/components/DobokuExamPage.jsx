import { useState, useEffect, useCallback, useMemo } from 'react'
import axios from 'axios'
import {
  ArrowLeft, HardHat, Loader2, BookOpen, FileText, PenLine, Library,
  ChevronDown, ChevronRight, Check, X, Sparkles, Plus, Trash2, Save, Flag,
} from 'lucide-react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import Toast from './ui/Toast'
import Markdown from './ui/Markdown'
import { API_URL as apiUrl, authConfig } from '../lib/api'
import { inputCls } from '../lib/ui'
import { useToast } from '../lib/useToast'

// 課題種別・工事概要の項目（DB/AI添削と表記を揃える）
const THEMES = ['品質管理', '安全管理', '工程管理', '施工計画', '環境対策']
const OVERVIEW_FIELDS = ['工事名', '立場', '発注者', '工事場所', '工期', '主な工種', '施工量']

const TABS = [
  { key: 'read', label: '通読', icon: BookOpen },
  { key: 'past', label: '過去問', icon: FileText },
  { key: 'record', label: '経験記述', icon: PenLine },
  { key: 'model', label: '模範例', icon: Library },
]

// 穴埋め問題の空欄記号（イロハ…）を問題文から拾う
function extractBlankMarks(stem) {
  const re = /[（(]\s*([イロハニホヘトチリヌルヲ])\s*[）)]/g
  const seen = []; let m
  while ((m = re.exec(stem || ''))) if (!seen.includes(m[1])) seen.push(m[1])
  return seen
}

export default function DobokuExamPage({ subject, subjects = [], subjectId, onSelectSubject, onBack }) {
  const { toast, showToast } = useToast()
  const [tab, setTab] = useState('read')

  return (
    <div className="max-w-3xl mx-auto p-4">
      {/* ヘッダー */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-ink-800 text-slate-600 dark:text-slate-300">
          <ArrowLeft size={20} />
        </button>
        <HardHat className="text-brand-600" size={22} />
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">{subject?.name || '第二次検定'}</h1>
      </div>

      {/* 他の資格へ切替（資格学習内に複数あるとき） */}
      {subjects.length > 1 && (
        <select className={`${inputCls} mb-4`} value={subjectId} onChange={(e) => onSelectSubject(e.target.value)}>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}

      {/* タブ */}
      <div className="flex gap-1 mb-4 bg-slate-100 dark:bg-ink-800 rounded-xl p-1">
        {TABS.map((t) => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition ${
                active ? 'bg-white dark:bg-ink-600 text-brand-700 dark:text-brand-300 shadow-sm'
                       : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}>
              <Icon size={15} /> {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'read' && <ReadTab showToast={showToast} />}
      {tab === 'past' && <PastTab showToast={showToast} />}
      {tab === 'record' && <RecordTab showToast={showToast} />}
      {tab === 'model' && <ModelTab showToast={showToast} />}

      {toast && <Toast toast={toast} />}
    </div>
  )
}

// ── 通読タブ ─────────────────────────────────────────────────
function ReadTab({ showToast }) {
  const [loading, setLoading] = useState(true)
  const [parts, setParts] = useState([])
  const [openPart, setOpenPart] = useState(null)
  const [openSec, setOpenSec] = useState(null)

  useEffect(() => {
    ;(async () => {
      try {
        const { data } = await axios.get(`${apiUrl}/api/doboku/sections`, authConfig())
        setParts(data.parts || [])
        if (data.parts && data.parts.length) setOpenPart(data.parts[0].part_no)
      } catch (e) { showToast('error', '本文の取得に失敗しました') }
      finally { setLoading(false) }
    })()
  }, [showToast])

  if (loading) return <Loading />
  if (!parts.length) return <Empty text="本文データがまだ投入されていません。" />

  return (
    <div className="space-y-2">
      {parts.map((p) => (
        <Card key={p.part_no} className="overflow-hidden">
          <button onClick={() => setOpenPart(openPart === p.part_no ? null : p.part_no)}
            className="w-full flex items-center justify-between px-4 py-3 font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-ink-700/50">
            <span>第{p.part_no}編 {p.part_name}</span>
            {openPart === p.part_no ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </button>
          {openPart === p.part_no && (
            <div className="border-t border-slate-100 dark:border-ink-700">
              {p.sections.map((s) => (
                <div key={s.id} className="border-b border-slate-50 dark:border-ink-800 last:border-0">
                  <button onClick={() => setOpenSec(openSec === s.id ? null : s.id)}
                    className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-ink-700/40 flex items-center justify-between">
                    <span>{s.chapter_no ? `${s.chapter_no}. ` : ''}{s.chapter_title || '本文'}</span>
                    {openSec === s.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  {openSec === s.id && (
                    <div className="px-4 pb-4">
                      <Markdown className="bg-slate-50 dark:bg-ink-900/40 rounded-lg px-4 py-3" >
                        {s.body_md}
                      </Markdown>
                      {s.figures?.map((f) => (
                        <figure key={f.id} className="mt-3">
                          <img src={f.image_url} alt={f.caption || '図'} loading="lazy"
                            className="w-full max-h-96 object-contain rounded-lg border border-slate-200 dark:border-ink-700 bg-white" />
                          {f.caption && <figcaption className="text-xs text-slate-400 mt-1">{f.caption}</figcaption>}
                        </figure>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      ))}
    </div>
  )
}

// ── 過去問タブ ───────────────────────────────────────────────
// 過去問タブ: 分野を選んでから1問ずつ解く
function PastTab({ showToast }) {
  const [loading, setLoading] = useState(true)
  const [all, setAll] = useState([])
  const [facets, setFacets] = useState({ parts: [], years: [] })
  const [selParts, setSelParts] = useState(() => new Set())
  const [year, setYear] = useState('')
  const [stage, setStage] = useState('select') // 'select' | 'quiz'
  const [idx, setIdx] = useState(0)
  const [session, setSession] = useState([]) // 演習中に固定する問題リスト（途中でフラグを外しても並びは変えない）

  // 過去問は全件まとめて取得し、分野/年度の絞り込みはフロントで行う
  useEffect(() => {
    ;(async () => {
      try {
        const { data } = await axios.get(`${apiUrl}/api/doboku/past-questions`, authConfig())
        setAll(data.questions || [])
        setFacets(data.facets || { parts: [], years: [] })
      } catch (e) { showToast('error', '過去問の取得に失敗しました') }
      finally { setLoading(false) }
    })()
  }, [showToast])

  // 選んだ分野・年度に該当する問題（開始前のプレビュー件数）
  const rangeList = useMemo(() => all.filter((q) =>
    (selParts.size === 0 || selParts.has(q.part_no)) &&
    (!year || q.year_label === year)
  ), [all, selParts, year])

  // 「要復習」フラグが付いている問題
  const reviewList = useMemo(() => all.filter((q) => q.progress?.needs_review), [all])

  // 分野ごとの問題数
  const countByPart = useMemo(() => {
    const m = {}
    for (const q of all) m[q.part_no] = (m[q.part_no] || 0) + 1
    return m
  }, [all])

  const allSelected = facets.parts.length > 0 && selParts.size === facets.parts.length
  const toggle = (pn) => setSelParts((prev) => {
    const n = new Set(prev); n.has(pn) ? n.delete(pn) : n.add(pn); return n
  })
  const toggleAll = () => setSelParts(allSelected ? new Set() : new Set(facets.parts.map((p) => p.part_no)))

  // 要復習フラグの変更を all（選択画面の件数）と session（演習中の表示）の両方へ反映
  const applyReviewFlag = useCallback((qId, val) => {
    const upd = (q) => q.id === qId ? { ...q, progress: { ...(q.progress || {}), needs_review: val } } : q
    setAll((prev) => prev.map(upd))
    setSession((prev) => prev.map(upd))
  }, [])

  const start = (list) => {
    if (!list.length) { showToast('error', '該当する過去問がありません'); return }
    // 毎回ランダム順で出題（Fisher–Yatesで元配列を壊さずシャッフル）
    const shuffled = [...list]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    setSession(shuffled); setIdx(0); setStage('quiz')
  }

  if (loading) return <Loading />

  // ── 1問ずつ演習 ──
  if (stage === 'quiz') {
    const q = session[idx]
    if (!q) { setStage('select'); return null }
    const pct = Math.round(((idx + 1) / session.length) * 100)
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <button onClick={() => setStage('select')}
            className="text-sm text-brand-600 font-semibold flex items-center gap-1">
            <ArrowLeft size={15} /> 分野選択へ
          </button>
          <span className="text-sm text-slate-500 dark:text-slate-400">{idx + 1} / {session.length} 問</span>
        </div>
        <div className="h-1.5 bg-slate-100 dark:bg-ink-800 rounded-full overflow-hidden">
          <div className="h-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
        </div>

        <QuizQuestion key={q.id} q={q} showToast={showToast} onToggleReview={applyReviewFlag} />

        <div className="flex justify-between pt-1">
          <Button variant="secondary" disabled={idx === 0} onClick={() => setIdx((i) => i - 1)}>
            <ArrowLeft size={16} /> 前へ
          </Button>
          {idx + 1 < session.length
            ? <Button onClick={() => setIdx((i) => i + 1)}>次へ <ChevronRight size={16} /></Button>
            : <Button onClick={() => setStage('select')}>分野選択に戻る</Button>}
        </div>
      </div>
    )
  }

  // ── 分野選択画面 ──
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-700 dark:text-slate-200">分野を選ぶ（複数可）</h3>
        {facets.parts.length > 0 && (
          <button onClick={toggleAll} className="text-sm text-brand-600 font-semibold hover:underline">
            {allSelected ? '全解除' : '全選択'}
          </button>
        )}
      </div>

      {!facets.parts.length ? <Empty text="過去問データがまだ投入されていません。" /> : (
        <Card className="divide-y divide-slate-100 dark:divide-ink-700 overflow-hidden">
          {facets.parts.map((p) => (
            <label key={p.part_no} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-ink-700/50">
              <input type="checkbox" checked={selParts.has(p.part_no)} onChange={() => toggle(p.part_no)}
                className="w-4 h-4 accent-brand-600" />
              <span className="flex-1 text-slate-800 dark:text-slate-100">第{p.part_no}編 {p.part_name}</span>
              <span className="text-xs text-slate-400">{countByPart[p.part_no] || 0}問</span>
            </label>
          ))}
        </Card>
      )}

      <div>
        <label className="text-xs font-semibold text-slate-500">年度で絞る（任意）</label>
        <select className={inputCls} value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">全年度</option>
          {facets.years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <Button disabled={!rangeList.length} onClick={() => start(rangeList)}>
        この範囲で始める（{rangeList.length}問）
      </Button>

      {reviewList.length > 0 && (
        <Button variant="secondary" onClick={() => start(reviewList)}>
          <Flag size={16} /> 要復習だけで始める（{reviewList.length}問）
        </Button>
      )}

      <p className="text-xs text-slate-400 flex items-center gap-1">
        <FileText size={12} /> 選んだ分野の過去問を1問ずつ表示します。分野を選ばない場合は全分野が対象です。
      </p>
      <p className="text-xs text-slate-400 flex items-center gap-1">
        <Flag size={12} /> 各問題の「要復習」を押すと印が付き、上の「要復習だけで始める」で集中的に解き直せます。
      </p>
    </div>
  )
}

// 1問分の表示・採点（問題が変わると key により再マウントされ、前問の入力はリセットされる）
function QuizQuestion({ q, showToast, onToggleReview }) {
  const [blanks, setBlanks] = useState({})
  const [typed, setTyped] = useState('')
  const [result, setResult] = useState(null)
  const [ai, setAi] = useState(null)
  const [busy, setBusy] = useState(false)
  const [reviewFlag, setReviewFlag] = useState(!!q.progress?.needs_review)
  const [flagBusy, setFlagBusy] = useState(false)
  const marks = q.q_type === 'blank' ? extractBlankMarks(q.stem) : []

  const toggleReview = async () => {
    const next = !reviewFlag
    setFlagBusy(true)
    try {
      await axios.post(`${apiUrl}/api/doboku/past-questions/${q.id}/review-flag`, { needs_review: next }, authConfig())
      setReviewFlag(next)
      onToggleReview?.(q.id, next)
    } catch (e) { showToast('error', '要復習の更新に失敗しました') }
    finally { setFlagBusy(false) }
  }

  const grade = async () => {
    setBusy(true)
    try {
      const body = q.q_type === 'blank' ? { blanks } : {}
      const { data } = await axios.post(`${apiUrl}/api/doboku/past-questions/${q.id}/grade`, body, authConfig())
      setResult(data)
    } catch (e) { showToast('error', '採点に失敗しました') }
    finally { setBusy(false) }
  }

  const aiGrade = async () => {
    if (!typed.trim()) { showToast('error', '解答を入力してください'); return }
    setBusy(true)
    try {
      const { data } = await axios.post(`${apiUrl}/api/doboku/past-questions/${q.id}/ai-grade`, { typed }, authConfig())
      setAi(data)
    } catch (e) { showToast('error', e.response?.data?.error || 'AI採点に失敗しました') }
    finally { setBusy(false) }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Badge tone="neutral">第{q.part_no}編 No.{q.q_no}</Badge>
        {q.year_label && <Badge tone="info">{q.year_label}</Badge>}
        <Badge tone={q.q_type === 'blank' ? 'warning' : 'neutral'}>{q.q_type === 'blank' ? '穴埋め' : '記述'}</Badge>
        {/* 穴埋め=正誤の記録 / 記述=AI判定の点数の記録 を一目で示す */}
        {q.progress?.last_correct === true && <Badge tone="success">正</Badge>}
        {q.progress?.last_correct === false && <Badge tone="danger">誤</Badge>}
        {q.q_type === 'free' && q.progress?.ai_score != null && (
          <Badge tone="info"><Sparkles size={11} /> AI {q.progress.ai_score}点</Badge>
        )}
        <button onClick={toggleReview} disabled={flagBusy}
          className={`ml-auto flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg border transition disabled:opacity-50 ${
            reviewFlag
              ? 'bg-warning-100 text-warning-700 border-warning-400 dark:bg-warning-500/15 dark:text-warning-400 dark:border-warning-500/40'
              : 'text-slate-400 border-slate-200 dark:border-ink-700 hover:text-warning-600 hover:border-warning-300'}`}>
          {flagBusy ? <Loader2 className="animate-spin" size={13} /> : <Flag size={13} className={reviewFlag ? 'fill-warning-500' : ''} />}
          {reviewFlag ? '要復習' : '要復習にする'}
        </button>
      </div>

      {q.image_url && <img src={q.image_url} alt="図" loading="lazy" className="w-full max-h-72 object-contain rounded-lg border mb-3 bg-white" />}
      <p className="text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap mb-3">{q.stem}</p>

      {/* 穴埋め: 記号ごとの入力 */}
      {q.q_type === 'blank' && (
        <div className="space-y-2 mb-3">
          {marks.map((mk) => (
            <div key={mk} className="flex items-center gap-2">
              <span className="w-8 text-center font-semibold text-slate-500">（{mk}）</span>
              <input className={inputCls} value={blanks[mk] || ''} disabled={!!result}
                onChange={(e) => setBlanks({ ...blanks, [mk]: e.target.value })} />
            </div>
          ))}
        </div>
      )}

      {/* 自由記述: テキストエリア */}
      {q.q_type === 'free' && (
        <textarea className={`${inputCls} min-h-[100px]`} placeholder="解答を記述" value={typed}
          disabled={!!result && !!ai} onChange={(e) => setTyped(e.target.value)} />
      )}

      <div className="flex gap-2 mt-3">
        {!result && <Button onClick={grade} disabled={busy}>{busy ? <Loader2 className="animate-spin" size={16} /> : '採点・解答を見る'}</Button>}
        {q.q_type === 'free' && <Button variant="secondary" onClick={aiGrade} disabled={busy}><Sparkles size={16} /> AIで採点</Button>}
      </div>

      {/* 採点結果 */}
      {result && (
        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-ink-700 space-y-2">
          {result.q_type === 'blank' && (
            <div className="space-y-1">
              {result.blank_results?.map((b) => (
                <div key={b.mark} className="flex items-center gap-2 text-sm">
                  {b.correct ? <Check className="text-success-600" size={16} /> : <X className="text-danger-600" size={16} />}
                  <span className="font-semibold">（{b.mark}）</span>
                  <span className={b.correct ? 'text-success-700' : 'text-danger-700'}>あなた: {b.your || '（空欄）'}</span>
                  {!b.correct && <span className="text-slate-600">正解: {b.answer}</span>}
                </div>
              ))}
            </div>
          )}
          {result.answer_text && (
            <div className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap bg-slate-50 dark:bg-ink-900/40 rounded-lg p-3">
              <span className="font-semibold">模範解答: </span>{result.answer_text}
            </div>
          )}
          {result.explanation && (
            <div className="text-sm text-brand-700 dark:text-brand-300 whitespace-pre-wrap bg-brand-50 dark:bg-brand-500/10 rounded-lg p-3">
              {result.explanation}
            </div>
          )}
        </div>
      )}

      {/* AI採点結果 */}
      {ai && <AiResult ai={ai} />}
    </Card>
  )
}

// ── 経験記述タブ ─────────────────────────────────────────────
function RecordTab({ showToast }) {
  const [loading, setLoading] = useState(true)
  const [records, setRecords] = useState([])
  const [editing, setEditing] = useState(null) // record object or 'new'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await axios.get(`${apiUrl}/api/doboku/records`, authConfig())
      setRecords(data || [])
    } catch (e) { showToast('error', '記述の取得に失敗しました') }
    finally { setLoading(false) }
  }, [showToast])

  useEffect(() => { load() }, [load])

  if (editing) return <RecordEditor record={editing === 'new' ? null : editing} onClose={() => { setEditing(null); load() }} showToast={showToast} />

  return (
    <div className="space-y-3">
      <Button onClick={() => setEditing('new')}><Plus size={16} /> 新しい経験記述を作る</Button>
      {loading ? <Loading /> : !records.length ? <Empty text="まだ経験記述がありません。「新しい経験記述を作る」から始めましょう。" />
        : records.map((r) => (
          <Card key={r.id} className="p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-ink-700/40" onClick={() => setEditing(r)}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-800 dark:text-slate-100">{r.title || r.overview?.工事名 || '（無題）'}</span>
                {r.theme && <Badge tone="info">{r.theme}</Badge>}
                <Badge tone={r.status === 'done' ? 'success' : 'neutral'}>{r.status === 'done' ? '仕上げ済' : '作成中'}</Badge>
              </div>
              {r.latest_review?.score != null && <Badge tone="warning">AI {r.latest_review.score}点</Badge>}
            </div>
          </Card>
        ))}
    </div>
  )
}

function RecordEditor({ record, onClose, showToast }) {
  const [form, setForm] = useState(() => ({
    title: record?.title || '',
    overview: record?.overview || {},
    theme: record?.theme || THEMES[0],
    answer1: record?.answer1 || '',
    answer2: record?.answer2 || '',
    status: record?.status || 'draft',
    is_shared: record?.is_shared ?? true,
  }))
  const [id, setId] = useState(record?.id || null)
  const [saving, setSaving] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [review, setReview] = useState(null)

  const setOv = (k, v) => setForm((f) => ({ ...f, overview: { ...f.overview, [k]: v } }))

  const save = async () => {
    setSaving(true)
    try {
      if (id) {
        await axios.put(`${apiUrl}/api/doboku/records/${id}`, form, authConfig())
      } else {
        const { data } = await axios.post(`${apiUrl}/api/doboku/records`, form, authConfig())
        setId(data.id)
      }
      showToast('success', '保存しました')
      return true
    } catch (e) { showToast('error', '保存に失敗しました'); return false }
    finally { setSaving(false) }
  }

  const runReview = async () => {
    const ok = await save() // 添削前に必ず保存
    if (!ok) return
    setReviewing(true)
    try {
      const recId = id || (await axios.post(`${apiUrl}/api/doboku/records`, form, authConfig())).data.id
      const { data } = await axios.post(`${apiUrl}/api/doboku/records/${recId}/review`, {}, authConfig())
      setReview(data)
    } catch (e) { showToast('error', e.response?.data?.error || 'AI添削に失敗しました') }
    finally { setReviewing(false) }
  }

  const remove = async () => {
    if (!id) { onClose(); return }
    if (!window.confirm('この経験記述を削除します。よろしいですか？')) return
    try {
      await axios.delete(`${apiUrl}/api/doboku/records/${id}`, authConfig())
      showToast('success', '削除しました'); onClose()
    } catch (e) { showToast('error', '削除に失敗しました') }
  }

  return (
    <div className="space-y-4">
      <button onClick={onClose} className="text-sm text-brand-600 font-semibold flex items-center gap-1"><ArrowLeft size={15} /> 一覧へ</button>

      <Card className="p-4 space-y-3">
        <div>
          <label className="text-xs font-semibold text-slate-500">ラベル（自分用の名前）</label>
          <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="例: A工事 品質管理" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">課題種別</label>
          <select className={inputCls} value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })}>
            {THEMES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="pt-2">
          <p className="text-xs font-semibold text-slate-500 mb-2">〔工事概要〕</p>
          <div className="space-y-2">
            {OVERVIEW_FIELDS.map((k) => (
              <div key={k} className="flex items-center gap-2">
                <span className="w-20 text-xs text-slate-500 shrink-0">{k}</span>
                <input className={inputCls} value={form.overview[k] || ''} onChange={(e) => setOv(k, e.target.value)} />
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div>
          <label className="text-xs font-semibold text-slate-500">設問1：現場状況・技術的課題・検討した項目</label>
          <textarea className={`${inputCls} min-h-[140px]`} value={form.answer1} onChange={(e) => setForm({ ...form, answer1: e.target.value })} />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">設問2：対応処置とその評価</label>
          <textarea className={`${inputCls} min-h-[140px]`} value={form.answer2} onChange={(e) => setForm({ ...form, answer2: e.target.value })} />
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="done" className="w-4 h-4 accent-brand-600"
            checked={form.status === 'done'} onChange={(e) => setForm({ ...form, status: e.target.checked ? 'done' : 'draft' })} />
          <label htmlFor="done" className="text-sm text-slate-600 dark:text-slate-300">仕上げ済みにする</label>
        </div>
        <div className="flex items-start gap-2">
          <input type="checkbox" id="share" className="w-4 h-4 mt-0.5 accent-brand-600"
            checked={form.is_shared} onChange={(e) => setForm({ ...form, is_shared: e.target.checked })} />
          <label htmlFor="share" className="text-sm text-slate-600 dark:text-slate-300">
            社内に共有する
            <span className="block text-xs text-slate-400">仕上げ済みにすると、他の受験者が「社内事例」として匿名（投稿者名・点数なし）で閲覧できます。共有したくない工事はこのチェックを外してください。</span>
          </label>
        </div>
      </Card>

      <div className="flex gap-2 flex-wrap">
        <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="animate-spin" size={16} /> : <><Save size={16} /> 保存</>}</Button>
        <Button variant="secondary" onClick={runReview} disabled={reviewing}>
          {reviewing ? <><Loader2 className="animate-spin" size={16} /> 添削中…</> : <><Sparkles size={16} /> AI添削を受ける</>}
        </Button>
        <Button variant="danger" onClick={remove}><Trash2 size={16} /> 削除</Button>
      </div>

      {review && <ReviewResult review={review} />}
    </div>
  )
}

// ── 模範例タブ ───────────────────────────────────────────────
function ModelTab({ showToast }) {
  const [loading, setLoading] = useState(true)
  const [records, setRecords] = useState([])
  const [shared, setShared] = useState([])
  const [facets, setFacets] = useState({ trades: [], themes: [] })
  const [trade, setTrade] = useState('')
  const [theme, setTheme] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (trade) params.set('trade', trade)
      if (theme) params.set('theme', theme)
      const [mr, sr] = await Promise.all([
        axios.get(`${apiUrl}/api/doboku/model-records?${params}`, authConfig()),
        axios.get(`${apiUrl}/api/doboku/shared-records`, authConfig()),
      ])
      setRecords(mr.data.records || [])
      setFacets(mr.data.facets || { trades: [], themes: [] })
      setShared(sr.data || [])
    } catch (e) { showToast('error', '模範例の取得に失敗しました') }
    finally { setLoading(false) }
  }, [trade, theme, showToast])

  useEffect(() => { load() }, [load])

  // 社内事例は工事種別の概念がないため、課題種別の絞り込みのみ適用
  const sharedFiltered = theme ? shared.filter((r) => r.theme === theme) : shared

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <select className={inputCls} value={trade} onChange={(e) => setTrade(e.target.value)}>
          <option value="">全工事種別</option>
          {facets.trades.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className={inputCls} value={theme} onChange={(e) => setTheme(e.target.value)}>
          <option value="">全課題種別</option>
          {facets.themes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {loading ? <Loading /> : (
        <>
          <p className="text-xs font-semibold text-slate-400">教材の記述例</p>
          {!records.length ? <Empty text="模範例データがまだ投入されていません。" />
            : records.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <Badge tone="neutral">{r.trade}</Badge>
                  <Badge tone="info">{r.theme}</Badge>
                </div>
                {r.overview && Object.keys(r.overview).length > 0 && (
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-2 space-y-0.5">
                    {OVERVIEW_FIELDS.filter((k) => r.overview[k]).map((k) => (
                      <div key={k}><span className="font-semibold">{k}:</span> {r.overview[k]}</div>
                    ))}
                  </div>
                )}
                {r.answer1 && <Section label="設問1" body={r.answer1} />}
                {r.answer2 && <Section label="設問2" body={r.answer2} />}
              </Card>
            ))}

          {sharedFiltered.length > 0 && (
            <>
              <p className="text-xs font-semibold text-slate-400 pt-2">社内事例（匿名）</p>
              {sharedFiltered.map((r) => (
                <Card key={`s${r.id}`} className="p-4 border-l-4 border-brand-300 dark:border-brand-500/40">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge tone="info">{r.theme}</Badge>
                    <Badge tone="neutral">社内事例</Badge>
                  </div>
                  {r.overview && Object.keys(r.overview).length > 0 && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-2 space-y-0.5">
                      {OVERVIEW_FIELDS.filter((k) => r.overview[k]).map((k) => (
                        <div key={k}><span className="font-semibold">{k}:</span> {r.overview[k]}</div>
                      ))}
                    </div>
                  )}
                  {r.answer1 && <Section label="設問1" body={r.answer1} />}
                  {r.answer2 && <Section label="設問2" body={r.answer2} />}
                </Card>
              ))}
            </>
          )}
        </>
      )}
    </div>
  )
}

// ── 共通の小物 ───────────────────────────────────────────────
function Section({ label, body }) {
  return (
    <div className="mt-2">
      <p className="text-xs font-semibold text-brand-600 mb-1">{label}</p>
      <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap bg-slate-50 dark:bg-ink-900/40 rounded-lg p-3">{body}</p>
    </div>
  )
}

function AiResult({ ai }) {
  return (
    <div className="mt-4 pt-3 border-t border-slate-200 dark:border-ink-700 space-y-2">
      <div className="flex items-center gap-2">
        <Sparkles className="text-accent-500" size={16} />
        <span className="font-semibold text-slate-800 dark:text-slate-100">AI採点{ai.score != null ? `: ${ai.score}点` : ''}</span>
      </div>
      {ai.summary && <p className="text-sm text-slate-700 dark:text-slate-200">{ai.summary}</p>}
      {ai.good_points?.length > 0 && <PointList title="良い点" tone="text-success-700" items={ai.good_points} />}
      {ai.improvements?.length > 0 && <PointList title="改善点" tone="text-danger-700" items={ai.improvements} />}
    </div>
  )
}

function ReviewResult({ review }) {
  return (
    <Card className="p-4 space-y-3 border-2 border-accent-200 dark:border-accent-500/30">
      <div className="flex items-center gap-2">
        <Sparkles className="text-accent-500" size={18} />
        <span className="font-bold text-slate-800 dark:text-slate-100">AI添削結果{review.score != null ? `: ${review.score}点` : ''}</span>
      </div>
      {review.summary && <p className="text-sm text-slate-700 dark:text-slate-200">{review.summary}</p>}
      {review.good_points?.length > 0 && <PointList title="良い点" tone="text-success-700" items={review.good_points} />}
      {review.improvements?.length > 0 && <PointList title="改善点" tone="text-danger-700" items={review.improvements} />}
      {review.revised_example && (
        <div>
          <p className="text-xs font-semibold text-brand-600 mb-1">添削後の記述例</p>
          <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap bg-brand-50 dark:bg-brand-500/10 rounded-lg p-3">{review.revised_example}</p>
        </div>
      )}
    </Card>
  )
}

function PointList({ title, tone, items }) {
  return (
    <div>
      <p className={`text-xs font-semibold ${tone} mb-1`}>{title}</p>
      <ul className="list-disc list-inside text-sm text-slate-700 dark:text-slate-200 space-y-0.5">
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  )
}

function Loading() {
  return <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="animate-spin mr-2" /> 読み込み中…</div>
}
function Empty({ text }) {
  return <Card className="p-8 text-center text-slate-500 text-sm">{text}</Card>
}
