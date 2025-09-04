import { useState, useEffect } from 'react'
import { useTranslation } from '@/hooks/useTranslation'

interface TranslatedTextProps {
  text: string
  className?: string
  showIndicator?: boolean
}

export function TranslatedText({
  text,
  className = '',
  showIndicator = true,
}: TranslatedTextProps) {
  const { translateText, getLanguageName } = useTranslation()
  const [translationResult, setTranslationResult] = useState<{
    translatedText: string
    sourceLanguage: string
    isTranslated: boolean
  } | null>(null)

  useEffect(() => {
    let isMounted = true

    const loadTranslation = async () => {
      if (!text || !text.trim()) {
        return
      }

      try {
        const result = await translateText(text)
        if (isMounted) {
          setTranslationResult(result)
        }
      } catch (error) {
        console.error('Translation component error:', error)
        if (isMounted) {
          setTranslationResult({
            translatedText: text,
            sourceLanguage: 'unknown',
            isTranslated: false,
          })
        }
      }
    }

    loadTranslation()
    return () => {
      isMounted = false
    }
  }, [text])

  const showTranslation =
    translationResult &&
    translationResult.isTranslated &&
    translationResult.translatedText !== text

  return (
    <div className={className}>
      <span>{showTranslation ? translationResult?.translatedText : text}</span>
      {showIndicator && showTranslation && (
        <div className="text-xs text-muted-foreground/60 mt-1">
          Translated from {getLanguageName(translationResult!.sourceLanguage)}
        </div>
      )}
    </div>
  )
}
