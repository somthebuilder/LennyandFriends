/**
 * Lenny Moderator - TypeScript implementation
 * Handles clarification mode for ambiguous queries
 */
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const DEFAULT_MODEL = 'gpt-4o-mini'

export interface ActiveTheme {
  theme_id: string
  score: number
}

/**
 * Generate clarification questions for ambiguous queries
 */
export async function generateClarificationQuestions(
  userQuery: string,
  activeThemes: ActiveTheme[],
  ambiguityReason: string,
  userContext?: string
): Promise<string[]> {
  const themeLabels = activeThemes.map(t => t.theme_id).join(', ')

  const contextPart = userContext
    ? `\n\nUser context: ${userContext}`
    : ''

  const prompt = `You are Lenny Rachitsky, host of Lenny's Podcast.

A user asked: "${userQuery}"

The query is ambiguous because: ${ambiguityReason}

The system matched these themes: ${themeLabels}${contextPart}

Generate 2-3 sharp, specific clarifying questions that will help narrow down what the user really wants to know. Make them concise and actionable.

Format as a JSON array of strings, e.g. ["Question 1?", "Question 2?", "Question 3?"]`

  try {
    const response = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.7,
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0].message.content
    if (!content) {
      return ['Could you clarify what you\'d like to know?']
    }

    try {
      const parsed = JSON.parse(content)
      // Handle both {questions: [...]} and [...] formats
      const questions = parsed.questions || parsed
      if (Array.isArray(questions) && questions.length > 0) {
        return questions.slice(0, 3)
      }
    } catch (e) {
      // If JSON parsing fails, try to extract questions from text
      const lines = content.split('\n').filter(line => line.trim().length > 0)
      return lines.slice(0, 3)
    }

    return ['Could you clarify what you\'d like to know?']
  } catch (error: any) {
    console.error('Error generating clarification questions:', error)
    return [
      'Could you provide more context about what you\'re looking for?',
      'What specific aspect would you like to explore?',
    ]
  }
}

