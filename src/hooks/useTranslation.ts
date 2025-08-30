import { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'

interface TranslationCache {
  [key: string]: {
    translatedText: string
    sourceLanguage: string
    targetLanguage: string
  }
}

interface TranslationResult {
  translatedText: string
  sourceLanguage: string
  targetLanguage: string
  isTranslated: boolean
}

export function useTranslation() {
  const [userLanguage, setUserLanguage] = useState<string>('en')
  const [translationCache, setTranslationCache] = useState<TranslationCache>({})

  useEffect(() => {
    // Get user's browser language
    const browserLanguage = navigator.language.split('-')[0].toLowerCase()
    setUserLanguage(browserLanguage)
  }, [])

  const translateText = async (text: string, originalLanguage?: string): Promise<TranslationResult> => {
    // Create cache key
    const cacheKey = `${text}-${userLanguage}`
    
    // Check cache first
    if (translationCache[cacheKey]) {
      return {
        ...translationCache[cacheKey],
        isTranslated: translationCache[cacheKey].sourceLanguage !== userLanguage
      }
    }

    try {
      const { data, error } = await supabase.functions.invoke('translate', {
        body: {
          text,
          targetLanguage: userLanguage
        }
      })

      if (error) {
        console.error('Translation error:', error)
        return {
          translatedText: text,
          sourceLanguage: originalLanguage || 'unknown',
          targetLanguage: userLanguage,
          isTranslated: false
        }
      }

      const result = {
        translatedText: data.translatedText,
        sourceLanguage: data.sourceLanguage,
        targetLanguage: data.targetLanguage,
        isTranslated: data.sourceLanguage !== userLanguage
      }

      // Cache the result
      setTranslationCache(prev => ({
        ...prev,
        [cacheKey]: {
          translatedText: result.translatedText,
          sourceLanguage: result.sourceLanguage,
          targetLanguage: result.targetLanguage
        }
      }))

      return result
    } catch (error) {
      console.error('Translation service error:', error)
      return {
        translatedText: text,
        sourceLanguage: originalLanguage || 'unknown',
        targetLanguage: userLanguage,
        isTranslated: false
      }
    }
  }

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

  return {
    userLanguage,
    setUserLanguage,
    translateText,
    getLanguageName
  }
}