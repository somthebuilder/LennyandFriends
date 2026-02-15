'use client'

import { useState, useCallback } from 'react'
import type { QuizPath, QuizResult, QuizResponse } from '@/lib/types/rag'
import {
  QUIZ_MODES,
  QUIZ_QUESTIONS,
  getRandomPath,
  type QuizOption,
} from '@/lib/quiz/quizConfig'
import { accumulateScores, getTopTags, generateArchetypeLabel } from '@/lib/quiz/scoringEngine'
import BeanAnimation from '@/components/BeanAnimation'

/* ── Types ── */

type QuizState = 'mode_select' | 'questioning' | 'loading' | 'result' | 'exhausted'

interface LightningQuizProps {
  podcastSlug: string
  onExit: () => void
  onSubmitQuiz: (
    path: QuizPath,
    tags: Record<string, number>,
    topTags: string[]
  ) => Promise<QuizResponse>
  quizCredits: number | null
  quizCreditsTotal: number | null
}

/* ── Component ── */

export default function LightningQuiz({
  podcastSlug,
  onExit,
  onSubmitQuiz,
  quizCredits,
  quizCreditsTotal,
}: LightningQuizProps) {
  const [state, setState] = useState<QuizState>('mode_select')
  const [selectedPath, setSelectedPath] = useState<Exclude<QuizPath, 'surprise'> | null>(null)
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<QuizOption[]>([])
  const [result, setResult] = useState<QuizResult | null>(null)
  const [resultPath, setResultPath] = useState<QuizPath | null>(null)
  const [error, setError] = useState<string | null>(null)

  const questions = selectedPath ? QUIZ_QUESTIONS[selectedPath] : []

  /* ── Select a quiz path ── */
  const handlePathSelect = useCallback((path: QuizPath) => {
    const resolved = path === 'surprise' ? getRandomPath() : path
    setSelectedPath(resolved)
    setCurrentQ(0)
    setAnswers([])
    setError(null)
    setResultPath(path === 'surprise' ? path : resolved)
    setState('questioning')
  }, [])

  /* ── Answer a question ── */
  const handleAnswer = useCallback(async (option: QuizOption) => {
    const newAnswers = [...answers, option]
    setAnswers(newAnswers)

    if (currentQ + 1 < questions.length) {
      setCurrentQ(currentQ + 1)
    } else {
      // Quiz complete — send to backend
      setState('loading')
      const scores = accumulateScores(newAnswers)
      const topTags = getTopTags(scores, 5)

      try {
        const response = await onSubmitQuiz(
          selectedPath!,
          scores,
          topTags
        )
        setResult(response.quiz_result)
        setState('result')
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Something went wrong'
        if (msg.toLowerCase().includes('quiz')) {
          setState('exhausted')
        } else {
          setError(msg)
          setState('mode_select')
        }
      }
    }
  }, [answers, currentQ, questions.length, onSubmitQuiz, selectedPath])

  /* ── Restart quiz ── */
  const handleRestart = useCallback(() => {
    setSelectedPath(null)
    setCurrentQ(0)
    setAnswers([])
    setResult(null)
    setResultPath(null)
    setError(null)
    setState('mode_select')
  }, [])

  /* ── Render: Mode Selection ── */
  if (state === 'mode_select') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] px-4 py-8 animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">&#9889;</span>
          <h2 className="font-serif text-xl font-semibold text-charcoal-900">Lightning Quiz</h2>
        </div>
        <p className="text-sm text-charcoal-500 mb-8 text-center max-w-xs">
          What are we optimizing for today?
        </p>

        {error && (
          <div className="mb-4 px-4 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 max-w-sm text-center">
            {error}
          </div>
        )}

        {/* Mode chips */}
        <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
          {QUIZ_MODES.map((mode) => (
            <button
              key={mode.path}
              onClick={() => handlePathSelect(mode.path)}
              className="flex flex-col items-center gap-1.5 px-4 py-4 rounded-xl bg-cream-50 border border-charcoal-200/50 hover:border-accent-300 hover:bg-accent-50/50 transition-all text-center group"
            >
              <span className="text-2xl group-hover:scale-110 transition-transform">{mode.icon}</span>
              <span className="text-sm font-medium text-charcoal-800">{mode.label}</span>
              <span className="text-[11px] text-charcoal-400">{mode.description}</span>
            </button>
          ))}
        </div>

        {/* Credits + back */}
        <div className="mt-8 flex flex-col items-center gap-2">
          {quizCredits !== null && quizCreditsTotal !== null && (
            <p className="text-[11px] text-charcoal-400">
              {quizCredits} / {quizCreditsTotal} quizzes remaining today
            </p>
          )}
          <button
            onClick={onExit}
            className="text-xs text-charcoal-400 hover:text-charcoal-600 transition-colors"
          >
            Back to chat
          </button>
        </div>
      </div>
    )
  }

  /* ── Render: Questioning ── */
  if (state === 'questioning' && questions.length > 0) {
    const question = questions[currentQ]
    const progress = ((currentQ) / questions.length) * 100

    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] px-4 py-8 animate-fade-in" key={question.id}>
        {/* Progress header */}
        <div className="w-full max-w-sm mb-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">&#9889;</span>
              <span className="text-xs font-medium text-charcoal-500">Lightning Quiz</span>
            </div>
            <span className="text-xs text-charcoal-400 font-medium">
              {currentQ + 1} / {questions.length}
            </span>
          </div>
          {/* Progress bar */}
          <div className="h-1 bg-charcoal-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Question */}
        <h3 className="font-serif text-lg text-charcoal-900 text-center max-w-sm mb-2 leading-snug">
          {question.text}
        </h3>
        {question.subtext && (
          <p className="text-xs text-charcoal-400 italic mb-6">{question.subtext}</p>
        )}
        {!question.subtext && <div className="mb-6" />}

        {/* Answer chips */}
        <div className="flex flex-wrap justify-center gap-3 w-full max-w-sm">
          {question.options.map((option, idx) => (
            <button
              key={idx}
              onClick={() => handleAnswer(option)}
              className="px-5 py-2.5 rounded-full bg-cream-100 border border-charcoal-200/50 hover:bg-accent-50 hover:border-accent-300 text-sm font-medium text-charcoal-700 transition-all active:scale-95"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  /* ── Render: Loading ── */
  if (state === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] px-4 py-8 animate-fade-in">
        <BeanAnimation size={64} loop autoplay />
        <p className="mt-4 text-sm text-charcoal-500 font-serif italic animate-pulse">
          Bean is curating your picks...
        </p>
      </div>
    )
  }

  /* ── Render: Exhausted ── */
  if (state === 'exhausted') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] px-4 py-8 animate-fade-in">
        <span className="text-4xl mb-4">&#9889;</span>
        <h3 className="font-serif text-lg text-charcoal-900 mb-2">All quizzed out!</h3>
        <p className="text-sm text-charcoal-500 text-center max-w-xs mb-6">
          You&apos;ve used all 5 quizzes for today. Come back tomorrow for a fresh batch!
        </p>
        <button
          onClick={onExit}
          className="btn-secondary text-sm"
        >
          Back to chat
        </button>
      </div>
    )
  }

  /* ── Render: Result ── */
  if (state === 'result' && result) {
    const pathLabel = resultPath === 'book' ? 'Book' : resultPath === 'show' ? 'Show' : resultPath === 'mentor' ? 'Mentor' : 'Pick'

    return (
      <div className="flex flex-col items-center px-4 py-6 animate-fade-in overflow-y-auto max-h-[600px] scrollbar-subtle">
        {/* Archetype header */}
        <div className="text-center mb-6">
          <span className="text-2xl mb-2 block">&#9889;</span>
          <p className="text-xs font-medium text-charcoal-400 uppercase tracking-wider mb-1">Your Archetype</p>
          <h2 className="font-serif text-xl font-semibold text-charcoal-900">{result.archetype}</h2>
        </div>

        {/* Picks */}
        <div className="w-full max-w-md space-y-4">
          {/* Top Pick */}
          <div className="bg-white rounded-xl border border-charcoal-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-accent-600 uppercase tracking-wider">Top {pathLabel}</span>
            </div>
            <h4 className="font-serif font-semibold text-charcoal-900 text-base">
              {result.top_pick.title}
              {result.top_pick.author && (
                <span className="font-normal text-charcoal-500 text-sm"> by {result.top_pick.author}</span>
              )}
            </h4>
            <p className="text-sm text-charcoal-600 mt-1.5 leading-relaxed">{result.top_pick.why}</p>
            {result.top_pick.what_it_changes && (
              <p className="text-xs text-charcoal-400 mt-2 italic">
                What it changes: {result.top_pick.what_it_changes}
              </p>
            )}
            {result.top_pick.guest_attribution && (
              <p className="text-[11px] text-charcoal-400 mt-2">
                Recommended by {result.top_pick.guest_attribution}
              </p>
            )}
          </div>

          {/* Alternative */}
          <div className="bg-cream-50 rounded-xl border border-charcoal-200/50 p-5">
            <span className="text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Alternative</span>
            <h4 className="font-serif font-semibold text-charcoal-900 text-sm mt-1.5">
              {result.alternative.title}
              {result.alternative.author && (
                <span className="font-normal text-charcoal-500"> by {result.alternative.author}</span>
              )}
            </h4>
            <p className="text-sm text-charcoal-600 mt-1 leading-relaxed">{result.alternative.why}</p>
            {result.alternative.guest_attribution && (
              <p className="text-[11px] text-charcoal-400 mt-1.5">
                Recommended by {result.alternative.guest_attribution}
              </p>
            )}
          </div>

          {/* Stretch Pick */}
          <div className="bg-cream-50 rounded-xl border border-dashed border-charcoal-200 p-5">
            <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Stretch Pick</span>
            <h4 className="font-serif font-semibold text-charcoal-900 text-sm mt-1.5">
              {result.stretch_pick.title}
              {result.stretch_pick.author && (
                <span className="font-normal text-charcoal-500"> by {result.stretch_pick.author}</span>
              )}
            </h4>
            <p className="text-sm text-charcoal-600 mt-1 leading-relaxed">{result.stretch_pick.why}</p>
            {result.stretch_pick.guest_attribution && (
              <p className="text-[11px] text-charcoal-400 mt-1.5">
                Recommended by {result.stretch_pick.guest_attribution}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-col items-center gap-2">
          {quizCredits !== null && quizCredits > 0 && (
            <button
              onClick={handleRestart}
              className="text-sm font-medium text-accent-600 hover:text-accent-700 transition-colors"
            >
              Try another direction?
            </button>
          )}
          <button
            onClick={onExit}
            className="text-xs text-charcoal-400 hover:text-charcoal-600 transition-colors"
          >
            Back to chat
          </button>
          {quizCredits !== null && quizCreditsTotal !== null && (
            <p className="text-[11px] text-charcoal-400 mt-1">
              {quizCredits} / {quizCreditsTotal} quizzes remaining today
            </p>
          )}
        </div>
      </div>
    )
  }

  // Fallback
  return null
}
