import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'

interface TranslationCache {
  [key: string]: {
    translatedText: string
    sourceLanguage: string
    targetLanguage: string
    timestamp: number
  }
}

interface TranslationResult {
  translatedText: string
  sourceLanguage: string
  targetLanguage: string
  isTranslated: boolean
}

// Global persistent cache in localStorage
const CACHE_KEY = 'translation_cache_v1'
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000 // 7 days

const loadCache = (): TranslationCache => {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (cached) {
      const parsed = JSON.parse(cached) as TranslationCache
      // Clean old entries
      const now = Date.now()
      const cleaned: TranslationCache = {}
      let cleanedCount = 0
      for (const [key, value] of Object.entries(parsed)) {
        if (now - value.timestamp < CACHE_MAX_AGE) {
          cleaned[key] = value
        } else {
          cleanedCount++
        }
      }
      if (cleanedCount > 0) {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cleaned))
      }
      return cleaned
    }
  } catch (error) {
    console.warn('Failed to load translation cache:', error)
  }
  return {}
}

// Single module-level cache, parsed from localStorage ONCE at module load.
// Shared across every hook instance / TranslatedText component so no component
// re-parses or holds its own copy.
const translationCache: TranslationCache = loadCache()

// Debounced/batched flush to localStorage so we don't stringify the whole
// (growing) cache synchronously on every completed translation.
const FLUSH_DELAY = 1000 // ms
let flushTimer: ReturnType<typeof setTimeout> | null = null

const flushCache = () => {
  flushTimer = null
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(translationCache))
  } catch (error) {
    console.warn('Failed to save translation cache:', error)
  }
}

const scheduleFlush = () => {
  if (flushTimer !== null) return
  flushTimer = setTimeout(flushCache, FLUSH_DELAY)
}

// Rate limiting: max 5 requests per second
class RateLimiter {
  private queue: Array<() => void> = []
  private activeRequests = 0
  private readonly maxConcurrent = 3
  private readonly delayBetweenBatches = 200 // ms

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn()
          resolve(result)
        } catch (error) {
          reject(error)
        }
      })
      this.processQueue()
    })
  }

  private async processQueue() {
    if (this.activeRequests >= this.maxConcurrent || this.queue.length === 0) {
      return
    }

    const task = this.queue.shift()
    if (!task) return

    this.activeRequests++
    await task()
    this.activeRequests--

    setTimeout(() => this.processQueue(), this.delayBetweenBatches / this.maxConcurrent)
  }
}

const rateLimiter = new RateLimiter()

/**
 * Detects user's preferred language from browser/device settings
 * Checks multiple sources in order of preference
 */
const detectUserLanguage = (): string => {
  try {
    // 1. Check localStorage for user preference (highest priority)
    const savedLanguage = localStorage.getItem('user_language_preference')
    if (savedLanguage) {
      return savedLanguage
    }

    // 2. Check navigator.languages (array of preferred languages)
    if (navigator.languages && navigator.languages.length > 0) {
      // Get first language and extract code (e.g., "en-US" -> "en")
      return navigator.languages[0].split('-')[0].toLowerCase()
    }

    // 3. Check navigator.language (single language)
    if (navigator.language) {
      return navigator.language.split('-')[0].toLowerCase()
    }

    // 4. Fallback to English
    return 'en'
  } catch (error) {
    console.warn('Error detecting user language:', error)
    return 'en'
  }
}

export function useTranslation() {
  const [userLanguage, setUserLanguage] = useState<string>(() => detectUserLanguage())

  useEffect(() => {
    // Re-detect language on mount (in case browser settings changed)
    const detectedLanguage = detectUserLanguage()
    if (detectedLanguage !== userLanguage) {
      setUserLanguage(detectedLanguage)
    }
  }, [])

  const translateText = useCallback(async (text: string, originalLanguage?: string): Promise<TranslationResult> => {
    // Validate input
    if (!text || text.trim().length === 0) {
      return {
        translatedText: text,
        sourceLanguage: originalLanguage || 'en',
        targetLanguage: userLanguage,
        isTranslated: false
      }
    }

    // If target language is English, skip translation (most content is in English)
    if (userLanguage === 'en') {
      return {
        translatedText: text,
        sourceLanguage: 'en',
        targetLanguage: 'en',
        isTranslated: false
      }
    }

    // Create cache key
    const cacheKey = `${text.substring(0, 100)}-${userLanguage}` // Limit key length

    // Check shared module cache first
    const cached = translationCache[cacheKey]
    if (cached) {
      return {
        translatedText: cached.translatedText,
        sourceLanguage: cached.sourceLanguage,
        targetLanguage: cached.targetLanguage,
        isTranslated: cached.sourceLanguage !== userLanguage
      }
    }

    try {
      // Use rate limiter to prevent overwhelming the server
      const result = await rateLimiter.execute(async () => {
        const { data, error } = await supabase.functions.invoke('translate', {
          body: {
            text,
            targetLanguage: userLanguage
          }
        })

        if (error) {
          throw error
        }

        return data
      })

      const translationResult = {
        translatedText: result.translatedText,
        sourceLanguage: result.sourceLanguage,
        targetLanguage: result.targetLanguage,
        isTranslated: result.sourceLanguage !== userLanguage
      }

      // Write into the shared module cache and schedule a debounced flush
      // instead of stringifying the whole cache synchronously here.
      translationCache[cacheKey] = {
        translatedText: translationResult.translatedText,
        sourceLanguage: translationResult.sourceLanguage,
        targetLanguage: translationResult.targetLanguage,
        timestamp: Date.now()
      }
      scheduleFlush()

      return translationResult
    } catch (error) {
      console.error('Translation service error:', error)
      return {
        translatedText: text,
        sourceLanguage: originalLanguage || 'unknown',
        targetLanguage: userLanguage,
        isTranslated: false
      }
    }
  }, [userLanguage])

  const getLanguageName = (code: string): string => {
    const languages: { [key: string]: string } = {
      'en': 'English',
      'es': 'Spanish',
      'fr': 'French',
      'de': 'German',
      'it': 'Italian',
      'pt': 'Portuguese',
      'ru': 'Russian',
      'ja': 'Japanese',
      'ko': 'Korean',
      'zh': 'Chinese',
      'ar': 'Arabic',
      'hi': 'Hindi',
      'nl': 'Dutch',
      'sv': 'Swedish',
      'da': 'Danish',
      'no': 'Norwegian',
      'fi': 'Finnish',
      'pl': 'Polish',
      'tr': 'Turkish',
      'he': 'Hebrew',
      'th': 'Thai',
      'vi': 'Vietnamese',
      'id': 'Indonesian',
      'ms': 'Malay',
      'uk': 'Ukrainian',
      'cs': 'Czech',
      'sk': 'Slovak',
      'hu': 'Hungarian',
      'ro': 'Romanian',
      'bg': 'Bulgarian',
      'hr': 'Croatian',
      'sr': 'Serbian',
      'sl': 'Slovenian',
      'et': 'Estonian',
      'lv': 'Latvian',
      'lt': 'Lithuanian'
    }
    return languages[code] || code.toUpperCase()
  }

  // Enhanced setUserLanguage that persists to localStorage
  const setUserLanguagePreference = useCallback((languageCode: string) => {
    setUserLanguage(languageCode)
    localStorage.setItem('user_language_preference', languageCode)
  }, [])

  return {
    userLanguage,
    setUserLanguage: setUserLanguagePreference,
    translateText,
    getLanguageName
  }
}