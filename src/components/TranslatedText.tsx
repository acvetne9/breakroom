import { useState, useEffect } from 'react'
import { useTranslation } from '@/hooks/useTranslation'
import { Skeleton } from '@/components/ui/skeleton'

interface TranslatedTextProps {
  text: string
  className?: string
  showIndicator?: boolean
}

export function TranslatedText({ text, className = '', showIndicator = true }: TranslatedTextProps) {
  const { translateText, getLanguageName } = useTranslation()
  const [translationResult, setTranslationResult] = useState<{
    translatedText: string
    sourceLanguage: string
    isTranslated: boolean
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadTranslation = async () => {
      setIsLoading(true)
      const result = await translateText(text)
      setTranslationResult(result)
      setIsLoading(false)
    }

    if (text && text.trim()) {
      loadTranslation()
    } else {
      setIsLoading(false)
    }
  }, [text, translateText])

  if (isLoading) {
    return <Skeleton className={`h-4 w-full ${className}`} />
  }

  if (!translationResult) {
    return <span className={className}>{text}</span>
  }

  return (
    <div className={className}>
      <span>{translationResult.translatedText}</span>
      {showIndicator && translationResult.isTranslated && (
        <div className="text-xs text-muted-foreground/60 mt-1">
          Translated from {getLanguageName(translationResult.sourceLanguage)}
        </div>
      )}
    </div>
  )
}