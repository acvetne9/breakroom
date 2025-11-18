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
  // TEMPORARY: Translation disabled to fix browser resource exhaustion
  // The translation system was making hundreds of simultaneous requests
  // causing ERR_INSUFFICIENT_RESOURCES and blocking all other requests
  
  return (
    <div className={className}>
      <span>{text}</span>
    </div>
  )
}
