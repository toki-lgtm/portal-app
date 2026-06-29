import { useState, useEffect, useMemo, useCallback } from 'react'
import axios from 'axios'
import {
  ArrowLeft, GraduationCap, Check, X, ChevronRight, Loader2,
  RefreshCw, Trophy, AlertTriangle, BookOpen, Target, Sparkles,
} from 'lucide-react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import Toast from './ui/Toast'
import { API_URL as apiUrl, authConfig } from '../lib/api'
import { inputCls } from '../lib/ui'
import { useToast } from '../lib/useToast'

// 配列シャッフル（非破壊）
function shuffled(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const MODE_LABEL = {
  continue: '演習（続きから）',
  wrong: '間違いだけ',
  weak: '弱点（間違いやすい順）',
}

export default function ExamPage({ onBack }) {
  const { toast, showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [subjects, setSubjects] = useState([])
  const [subjectId, setSubjectId] = useState(null)
  const [chapters, setChapters] = useState([])
  const [overall, setOverall] = useState(null)
  const [selected, setSelected] = useState(() => new Set())

  // 'home' | 'quiz' | 'summary'
  const [stage, setStage] = useState('home')
  const [session, setSession] = useState(null) // { mode, questions }
  const [idx, setIdx] = useState(0)
  const [answered, setAnswered] = useState(null) // 現在の問題の採点結果
  const [typed, setTyped] = useState('')
  const [results, setResults] = useState([]) // [{correct}]
  const [submitting, setSubmitting] = useState(false)

  // 科目一覧 → 最初の科目を選択
  useEffect(() => {
    ;(async () => {
      try {
        const { data } = await axios.get(`${apiUrl}/api/exam/subjects`, authConfig())
        setSubjects(data || [])
        if (data && data.length) setSubjectId(data[0].id)
        else setLoading(false)
      } catch (e) {
        showToast('error', '科目の取得に失敗しました')
        setLoading(false)
      }
    })()
  }, [showToast])

  // 選択科目の章一覧
  const loadChapters = useCallback(async (sid) => {
    if (!sid) return
    setLoading(true)
    try {
      const { data } = await axios.get(`${apiUrl}/api/exam/subjects/${sid}/chapters`, authConfig())
      setChapters(data.chapters || [])
      setOverall(data.overall || null)
    } catch (e) {
      showToast('error', '章の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { if (subjectId) loadChapters(subjectId) }, [subjectId, loadChapters])

  const subject = subjects.find((s) => s.id === subjectId)
  const allSelected = chapters.length > 0 && selected.size === chapters.length

  const toggleChapter = (id) => {
    setSelected((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(chapters.map((c) => c.id)))
  }

  // 演習開始
  const startSession = async (mode) => {
    if (selected.size === 0) { showToast('error', '章を1つ以上選んでください'); return }
    setSubmitting(true)
    try {
      const { data } = await axios.post(`${apiUrl}/api/exam/session`, {
        subject_id: subjectId, chapter_ids: [...selected], mode,
      }, authConfig())
      if (!data.questions || data.questions.length === 0) {
        if (mode === 'continue') showToast('info', 'この範囲は一周完了です。「間違いだけ」「弱点」で復習できます')
        else if (mode === 'wrong') showToast('info', '間違えた問題はありません')
        else showToast('info', 'まだ弱点データがありません（何問か解くと出ます）')
        return
      }
      setSession(data)
      setIdx(0); setAnswered(null); setTyped(''); setResults([])
      setStage('quiz')
    } catch (e) {
      showToast('error', e.response?.data?.error || '開始に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  const current = session?.questions?.[idx]
  // 選択肢のシャッフル（問題ごとに固定）
  const shuffledChoices = useMemo(() => {
    if (!current || current.q_type !== 'choice') return []
    return shuffled((current.choices || []).map((text, i) => ({ origNo: i + 1, text })))
  }, [current])

  // 回答送信
  const submitAnswer = async (chosenNo) => {
    if (!current || answered) return
    setSubmitting(true)
    try {
      const body = current.q_type === 'written'
        ? { question_id: current.id, typed }
        : { question_id: current.id, chosen_no: chosenNo }
      const { data } = await axios.post(`${apiUrl}/api/exam/answer`, body, authConfig())
      setAnswered({ ...data, chosenNo })
      setResults((r) => [...r, { correct: data.is_correct }])
    } catch (e) {
      showToast('error', '採点に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  const next = () => {
    if (idx + 1 >= session.questions.length) {
      setStage('summary')
      loadChapters(subjectId) // 進捗バッジを更新
    } else {
      setIdx(idx + 1); setAnswered(null); setTyped('')
    }
  }

  const backToHome = () => {
    setStage('home'); setSession(null); setAnswered(null); setTyped(''); setResults([])
    loadChapters(subjectId)
  }

  // ── ヘッダー ───────────────────────────────────────────────
  const Header = ({ title, onBackClick }) => (
    <div className="flex items-center gap-3 mb-5">
      <button onClick={onBackClick} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-ink-800 text-slate-600 dark:text-slate-300">
        <ArrowLeft size={20} />
      </button>
      <GraduationCap className="text-brand-600" size={22} />
      <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">{title}</h1>
    </div>
  )

  if (loading && stage === 'home') {
    return (
      <div className="max-w-3xl mx-auto p-4">
        <Header title="資格学習" onBackClick={onBack} />
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="animate-spin mr-2" /> 読み込み中…
        </div>
      </div>
    )
  }

  // ── 演習画面 ───────────────────────────────────────────────
  if (stage === 'quiz' && current) {
    const correctNo = answered?.answer_no
    return (
      <div className="max-w-3xl mx-auto p-4">
        <Header title={MODE_LABEL[session.mode] || '演習'} onBackClick={backToHome} />
        {/* 進捗 */}
        <div className="flex items-center justify-between mb-3 text-sm text-slate-500 dark:text-slate-400">
          <span>{idx + 1} / {session.questions.length} 問</span>
          <span>正解 {results.filter((r) => r.correct).length} / {results.length}</span>
        </div>
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Badge tone="neutral">第{current.chapter_no ?? ''}問 No.{current.q_no}</Badge>
            {current.is_hard && <Badge tone="warning">難</Badge>}
            {current.q_type === 'written' && <Badge tone="info">記述</Badge>}
          </div>

          {current.image_url && (
            <img src={current.image_url} alt="図版"
              className="w-full max-h-80 object-contain rounded-lg border border-slate-200 dark:border-ink-700 mb-4 bg-white" />
          )}

          <p className="text-slate-800 dark:text-slate-100 font-medium whitespace-pre-wrap mb-4">{current.stem}</p>

          {/* 4択 */}
          {current.q_type === 'choice' && (
            <div className="space-y-2">
              {shuffledChoices.map((c) => {
                let cls = 'border-slate-200 dark:border-ink-600 hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-ink-700'
                if (answered) {
                  if (c.origNo === correctNo) cls = 'border-success-500 bg-success-50 dark:bg-success-500/15'
                  else if (c.origNo === answered.chosenNo) cls = 'border-danger-500 bg-danger-50 dark:bg-danger-500/15'
                  else cls = 'border-slate-200 dark:border-ink-700 opacity-60'
                }
                return (
                  <button key={c.origNo} disabled={!!answered || submitting}
                    onClick={() => submitAnswer(c.origNo)}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition flex items-center justify-between ${cls}`}>
                    <span className="text-slate-800 dark:text-slate-100">{c.text}</span>
                    {answered && c.origNo === correctNo && <Check className="text-success-600" size={18} />}
                    {answered && c.origNo === answered.chosenNo && c.origNo !== correctNo && <X className="text-danger-600" size={18} />}
                  </button>
                )
              })}
            </div>
          )}

          {/* 記述 */}
          {current.q_type === 'written' && (
            <div className="space-y-3">
              <input
                className={inputCls} placeholder="答えを入力（カタカナ等）"
                value={typed} disabled={!!answered}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !answered && typed.trim()) submitAnswer() }}
              />
              {!answered && (
                <Button onClick={() => submitAnswer()} disabled={!typed.trim() || submitting}>
                  {submitting ? <Loader2 className="animate-spin" size={16} /> : '答える'}
                </Button>
              )}
            </div>
          )}

          {/* 採点結果＋解説 */}
          {answered && (
            <div className="mt-5 pt-4 border-t border-slate-200 dark:border-ink-700">
              <div className={`flex items-center gap-2 font-bold mb-2 ${answered.is_correct ? 'text-success-600' : 'text-danger-600'}`}>
                {answered.is_correct ? <><Check size={20} /> 正解</> : <><X size={20} /> 不正解</>}
              </div>
              {(!answered.is_correct || current.q_type === 'written') && (
                <p className="text-sm text-slate-700 dark:text-slate-200 mb-2">
                  正解: <span className="font-semibold">{answered.answer_text}</span>
                </p>
              )}
              {answered.explanation && (
                <div className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap bg-slate-50 dark:bg-ink-900/40 rounded-lg p-3">
                  {answered.explanation}
                </div>
              )}
              {answered.explanation_note && (
                <div className="mt-2 text-sm text-brand-700 dark:text-brand-300 whitespace-pre-wrap bg-brand-50 dark:bg-brand-500/10 rounded-lg p-3">
                  <span className="font-semibold">補足: </span>{answered.explanation_note}
                </div>
              )}
              <div className="mt-4 flex justify-end">
                <Button onClick={next}>
                  {idx + 1 >= session.questions.length ? '結果を見る' : '次へ'} <ChevronRight size={16} />
                </Button>
              </div>
            </div>
          )}
        </Card>
        {toast && <Toast toast={toast} />}
      </div>
    )
  }

  // ── 結果サマリ ─────────────────────────────────────────────
  if (stage === 'summary') {
    const n = results.length
    const c = results.filter((r) => r.correct).length
    const rate = n ? Math.round((c / n) * 100) : 0
    return (
      <div className="max-w-3xl mx-auto p-4">
        <Header title="結果" onBackClick={backToHome} />
        <Card className="p-8 text-center">
          <Trophy className="mx-auto text-accent-500 mb-3" size={40} />
          <p className="text-3xl font-bold text-slate-800 dark:text-slate-100">{c} / {n} 正解</p>
          <p className="text-lg text-slate-500 dark:text-slate-400 mt-1">正答率 {rate}%</p>
          <div className="mt-6 flex justify-center gap-3">
            <Button onClick={backToHome}><RefreshCw size={16} /> 章選択に戻る</Button>
          </div>
        </Card>
        {toast && <Toast toast={toast} />}
      </div>
    )
  }

  // ── ホーム（科目情報＋章選択＋モード） ────────────────────────
  return (
    <div className="max-w-3xl mx-auto p-4">
      <Header title="資格学習" onBackClick={onBack} />

      {subjects.length === 0 && (
        <Card className="p-8 text-center text-slate-500">
          利用できる資格がありません。管理者にアクセス権の付与を依頼してください。
        </Card>
      )}

      {subject && (
        <>
          {/* 科目＋全体成績 */}
          <Card className="p-5 mb-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h2 className="font-bold text-slate-800 dark:text-slate-100">{subject.name}</h2>
                <p className="text-xs text-slate-400 mt-0.5">{subject.source}</p>
              </div>
              {overall && (
                <div className="text-right">
                  <div className="text-2xl font-bold text-brand-600">
                    {overall.correct_rate ?? '—'}{overall.correct_rate != null && '%'}
                  </div>
                  <div className="text-xs text-slate-400">
                    全体正答率（{overall.correct}/{overall.answered} 回答 / 全{overall.total}問）
                  </div>
                </div>
              )}
            </div>
            {subjects.length > 1 && (
              <select className={`${inputCls} mt-3`} value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setSelected(new Set()) }}>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </Card>

          {/* 章選択 */}
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-slate-700 dark:text-slate-200">章を選ぶ（複数可）</h3>
            <button onClick={toggleAll} className="text-sm text-brand-600 font-semibold hover:underline">
              {allSelected ? '全解除' : '全選択'}
            </button>
          </div>
          <Card className="divide-y divide-slate-100 dark:divide-ink-700 mb-4 overflow-hidden">
            {chapters.map((c) => (
              <label key={c.id} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-ink-700/50">
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleChapter(c.id)}
                  className="w-4 h-4 accent-brand-600" />
                <span className="w-6 text-sm text-slate-400">{c.chapter_no}</span>
                <span className="flex-1 text-slate-800 dark:text-slate-100">{c.title}</span>
                <span className="text-xs text-slate-400">{c.total}問</span>
                {c.correct_rate != null
                  ? <Badge tone={c.correct_rate >= 70 ? 'success' : c.correct_rate >= 40 ? 'warning' : 'danger'}>{c.correct_rate}%</Badge>
                  : <Badge tone="neutral">未</Badge>}
                {c.unanswered > 0 && <span className="text-xs text-slate-400 w-14 text-right">残{c.unanswered}</span>}
              </label>
            ))}
          </Card>

          {/* モード */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Button variant="primary" disabled={submitting || selected.size === 0} onClick={() => startSession('continue')}>
              <BookOpen size={16} /> 演習（続きから）
            </Button>
            <Button variant="secondary" disabled={submitting || selected.size === 0} onClick={() => startSession('wrong')}>
              <Target size={16} /> 間違いだけ
            </Button>
            <Button variant="secondary" disabled={submitting || selected.size === 0} onClick={() => startSession('weak')}>
              <Sparkles size={16} /> 弱点
            </Button>
          </div>
          <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
            <AlertTriangle size={12} /> 選択肢は毎回シャッフル。回答すると即採点＆解説が出ます。
          </p>
        </>
      )}
      {toast && <Toast toast={toast} />}
    </div>
  )
}
