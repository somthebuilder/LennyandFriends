/**
 * Gemini Client - For LLM responses (chat, panel questions)
 * Uses Gemini API for cost-effective text generation
 */
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''
)

const DEFAULT_MODEL = 'gemini-2.0-flash-exp'

/**
 * Generate text using Gemini
 */
export async function generateText(
  prompt: string,
  options: {
    model?: string
    maxTokens?: number
    temperature?: number
    safetySettings?: any[]
  } = {}
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY is not set')
  }

  try {
    const model = genAI.getGenerativeModel({
      model: options.model || DEFAULT_MODEL,
      generationConfig: {
        maxOutputTokens: options.maxTokens || 500,
        temperature: options.temperature ?? 0.7,
      },
      safetySettings: options.safetySettings || [
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE',
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE',
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE',
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE',
        },
      ],
    })

    const result = await model.generateContent(prompt)
    const response = result.response
    return response.text()
  } catch (error: any) {
    console.error('Error generating text with Gemini:', error)
    throw new Error(`Failed to generate text: ${error.message}`)
  }
}

/**
 * Check if content is safe using Gemini's safety filters
 */
export async function checkContentSafety(text: string): Promise<{
  isSafe: boolean
  blockedCategories: string[]
}> {
  try {
    const model = genAI.getGenerativeModel({
      model: DEFAULT_MODEL,
    })

    // Try to generate with the text - if blocked, it's unsafe
    const result = await model.generateContent(text)
    const response = result.response

    // Check if response was blocked
    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0]
      if (candidate.finishReason === 'SAFETY') {
        const blockedCategories = candidate.safetyRatings
          ?.filter((r: any) => r.probability === 'HIGH' || r.probability === 'MEDIUM')
          .map((r: any) => r.category) || []
        return { isSafe: false, blockedCategories }
      }
    }

    return { isSafe: true, blockedCategories: [] }
  } catch (error: any) {
    // If safety check fails, err on the side of caution
    console.error('Error checking content safety:', error)
    return { isSafe: false, blockedCategories: ['UNKNOWN'] }
  }
}

