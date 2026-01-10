import { useState, useEffect, useRef } from 'react'
import { useTranslation } from '@/hooks/useTranslation'

interface TranslatedTextProps {
  text: string
  className?: string
  showIndicator?: boolean
  sourceLanguage?: string
  enableTranslation?: boolean // Allow disabling per component
}

export function TranslatedText({
  text,
  className = '',
  showIndicator = true,
  sourceLanguage,
  enableTranslation = true, // Default to enabled now that we have rate limiting
}: TranslatedTextProps) {
  const { translateText, userLanguage, getLanguageName } = useTranslation()
  const [translatedText, setTranslatedText] = useState(text)
  const [isTranslated, setIsTranslated] = useState(false)
  const [detectedLanguage, setDetectedLanguage] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const translationAttempted = useRef(false)

  useEffect(() => {
    // Reset when text changes
    if (translatedText !== text && !translationAttempted.current) {
      setTranslatedText(text)
      setIsTranslated(false)
      translationAttempted.current = false
    }
  }, [text])

  useEffect(() => {
    // Only translate if:
    // 1. Translation is enabled
    // 2. User language is not English (most content is English)
    // 3. We haven't already attempted translation for this text
    if (!enableTranslation || userLanguage === 'en' || translationAttempted.current) {
      return
    }

    const performTranslation = async () => {
      if (!text || text.trim().length === 0) {
        return
      }

      translationAttempted.current = true
      setIsLoading(true)

      try {
        const result = await translateText(text, sourceLanguage)

        setTranslatedText(result.translatedText)
        setIsTranslated(result.isTranslated)
        setDetectedLanguage(result.sourceLanguage)
      } catch (error) {
        console.error('Translation failed:', error)
        setTranslatedText(text)
        setIsTranslated(false)
      } finally {
        setIsLoading(false)
      }
    }

    // Debounce translation to avoid rapid-fire requests
    const timer = setTimeout(performTranslation, 100)
    return () => clearTimeout(timer)
  }, [text, translateText, userLanguage, sourceLanguage, enableTranslation])

  return (
    <div className={className}>
      <span className={isLoading ? 'opacity-50' : ''}>
        {translatedText}
      </span>
      {showIndicator && isTranslated && detectedLanguage && (
        <span className="ml-2 text-xs text-muted-foreground">
          (translated from {getLanguageName(detectedLanguage)})
        </span>
      )}
    </div>
  )
}
