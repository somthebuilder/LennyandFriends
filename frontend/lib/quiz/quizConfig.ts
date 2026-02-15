import type { QuizPath } from '@/lib/types/rag'

/* ── Types ── */

export interface QuizOption {
  label: string
  tags: Record<string, number>
}

export interface QuizQuestion {
  id: string
  text: string
  subtext?: string
  options: QuizOption[]
}

export interface QuizModeOption {
  path: QuizPath
  label: string
  icon: string
  description: string
}

/* ── Mode Selection ── */

export const QUIZ_MODES: QuizModeOption[] = [
  { path: 'book', label: 'Find me a book', icon: '\uD83D\uDCDA', description: 'Based on how you think' },
  { path: 'show', label: 'Find me a show', icon: '\uD83D\uDCFA', description: 'Based on your energy' },
  { path: 'mentor', label: 'Find my mentor', icon: '\uD83E\uDDE0', description: 'Based on your pattern' },
  { path: 'surprise', label: 'Surprise me', icon: '\uD83C\uDFB2', description: 'Let Bean decide' },
]

/* ── Tag Universe ── */

export const ALL_TAGS = [
  'execution', 'strategy', 'introspection', 'storytelling', 'systems',
  'ambition', 'discipline', 'creative', 'startup', 'big_tech',
  'operator', 'philosophical', 'practical', 'cerebral', 'modern',
  'classic', 'intense', 'balanced', 'data_driven', 'intuition',
  'dark', 'light', 'escapism', 'realism', 'character_driven',
  'plot_driven', 'emotional', 'intellectual',
] as const

/* ── Question Trees ── */

const BOOK_QUESTIONS: QuizQuestion[] = [
  {
    id: 'b1',
    text: 'Stretches your thinking or sharpens your execution?',
    subtext: 'No overthinking. Instinct.',
    options: [
      { label: 'Stretch my thinking', tags: { strategy: 2, philosophical: 1, cerebral: 1 } },
      { label: 'Sharpen execution', tags: { execution: 2, practical: 1, discipline: 1 } },
    ],
  },
  {
    id: 'b2',
    text: 'What are you optimizing right now?',
    options: [
      { label: 'Career', tags: { ambition: 2, operator: 1 } },
      { label: 'Mindset', tags: { introspection: 2, philosophical: 1 } },
      { label: 'How I build', tags: { execution: 2, systems: 1 } },
    ],
  },
  {
    id: 'b3',
    text: 'Modern operator voice or timeless wisdom?',
    options: [
      { label: 'Modern operator', tags: { modern: 2, startup: 1, operator: 1 } },
      { label: 'Timeless wisdom', tags: { classic: 2, philosophical: 1 } },
    ],
  },
  {
    id: 'b4',
    text: 'Dense and re-readable, or fast and actionable?',
    options: [
      { label: 'Dense, re-readable', tags: { cerebral: 2, systems: 1 } },
      { label: 'Fast, actionable', tags: { practical: 2, execution: 1 } },
    ],
  },
  {
    id: 'b5',
    text: 'High intensity or something balanced?',
    options: [
      { label: 'High intensity', tags: { intense: 2, ambition: 1 } },
      { label: 'Balanced pace', tags: { balanced: 2, introspection: 1 } },
    ],
  },
]

const SHOW_QUESTIONS: QuizQuestion[] = [
  {
    id: 's1',
    text: 'What energy level are you in?',
    subtext: 'Quick gut check.',
    options: [
      { label: 'Wired and intense', tags: { intense: 2, dark: 1 } },
      { label: 'Chill but sharp', tags: { balanced: 2, intellectual: 1 } },
      { label: 'Just decompress me', tags: { light: 2, escapism: 1 } },
    ],
  },
  {
    id: 's2',
    text: 'Real world or escape from it?',
    options: [
      { label: 'Show me reality', tags: { realism: 2, intellectual: 1 } },
      { label: 'Take me somewhere else', tags: { escapism: 2, creative: 1 } },
    ],
  },
  {
    id: 's3',
    text: 'Great characters or a killer plot?',
    options: [
      { label: 'Complex characters', tags: { character_driven: 2, emotional: 1 } },
      { label: 'Tight plot', tags: { plot_driven: 2, execution: 1 } },
    ],
  },
  {
    id: 's4',
    text: 'Quick binge or long commitment?',
    options: [
      { label: 'Done in a weekend', tags: { practical: 2, intense: 1 } },
      { label: 'Multi-season journey', tags: { storytelling: 2, character_driven: 1 } },
    ],
  },
  {
    id: 's5',
    text: 'Smart dialogue or emotional gut-punches?',
    options: [
      { label: 'Razor-sharp dialogue', tags: { intellectual: 2, cerebral: 1 } },
      { label: 'Hit me in the feels', tags: { emotional: 2, storytelling: 1 } },
    ],
  },
]

const MENTOR_QUESTIONS: QuizQuestion[] = [
  {
    id: 'm1',
    text: 'Where are you in your journey?',
    subtext: 'Be honest.',
    options: [
      { label: 'Early — still figuring it out', tags: { startup: 2, creative: 1 } },
      { label: 'Mid — leveling up', tags: { operator: 2, execution: 1 } },
      { label: 'Senior — refining my edge', tags: { strategy: 2, systems: 1 } },
    ],
  },
  {
    id: 'm2',
    text: 'Aggressive conviction or measured patience?',
    options: [
      { label: 'Aggressive, bold moves', tags: { ambition: 2, intense: 1 } },
      { label: 'Measured, patient compounding', tags: { discipline: 2, balanced: 1 } },
    ],
  },
  {
    id: 'm3',
    text: 'Big company operator or startup builder?',
    options: [
      { label: 'Big company', tags: { big_tech: 2, systems: 1 } },
      { label: 'Startup', tags: { startup: 2, creative: 1 } },
      { label: 'Both — I switch', tags: { operator: 1, startup: 1, ambition: 1 } },
    ],
  },
  {
    id: 'm4',
    text: 'Data-driven or intuition-led?',
    options: [
      { label: 'Show me the data', tags: { data_driven: 2, systems: 1 } },
      { label: 'Trust the gut', tags: { intuition: 2, creative: 1 } },
    ],
  },
  {
    id: 'm5',
    text: 'Systems thinker or storyteller?',
    options: [
      { label: 'Systems thinker', tags: { systems: 2, cerebral: 1 } },
      { label: 'Storyteller', tags: { storytelling: 2, emotional: 1 } },
    ],
  },
  {
    id: 'm6',
    text: 'Someone to emulate or someone to study quietly?',
    options: [
      { label: 'Emulate — I want their playbook', tags: { execution: 2, operator: 1 } },
      { label: 'Study — absorb their thinking', tags: { philosophical: 2, introspection: 1 } },
    ],
  },
]

/* ── Exported Config ── */

export const QUIZ_QUESTIONS: Record<Exclude<QuizPath, 'surprise'>, QuizQuestion[]> = {
  book: BOOK_QUESTIONS,
  show: SHOW_QUESTIONS,
  mentor: MENTOR_QUESTIONS,
}

/** Pick a random path for "Surprise me" */
export function getRandomPath(): Exclude<QuizPath, 'surprise'> {
  const paths: Exclude<QuizPath, 'surprise'>[] = ['book', 'show', 'mentor']
  return paths[Math.floor(Math.random() * paths.length)]
}
