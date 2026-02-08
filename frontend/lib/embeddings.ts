/**
 * OpenAI Embeddings Utility
 * Generates embeddings using OpenAI API for vector search
 */
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const EMBEDDING_MODEL = 'text-embedding-3-small' // 1536 dimensions
const EMBEDDING_DIMENSION = 1536

/**
 * Generate embedding for a single text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set')
  }

  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
    })

    return response.data[0].embedding
  } catch (error: any) {
    console.error('Error generating embedding:', error)
    throw new Error(`Failed to generate embedding: ${error.message}`)
  }
}

/**
 * Generate embeddings for multiple texts (batch)
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set')
  }

  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts,
    })

    return response.data.map(item => item.embedding)
  } catch (error: any) {
    console.error('Error generating embeddings:', error)
    throw new Error(`Failed to generate embeddings: ${error.message}`)
  }
}

export { EMBEDDING_MODEL, EMBEDDING_DIMENSION }

