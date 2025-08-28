import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// LibreTranslate API endpoints with fallbacks
const LIBRETRANSLATE_INSTANCES = [
  'https://libretranslate.com',
  'https://translate.terraprint.co',
  'https://libretranslate.de'
]

let currentInstanceIndex = 0

interface TranslationRequest {
  text: string
  targetLanguage: string
}

interface TranslationResponse {
  translatedText: string
  sourceLanguage: string
  targetLanguage: string
}

async function detectLanguage(text: string): Promise<string> {
  // Try multiple instances
  for (let i = 0; i < LIBRETRANSLATE_INSTANCES.length; i++) {
    const instanceUrl = LIBRETRANSLATE_INSTANCES[(currentInstanceIndex + i) % LIBRETRANSLATE_INSTANCES.length]
    try {
      const response = await fetch(`${instanceUrl}/detect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: text
        })
      })

      if (!response.ok) {
        throw new Error(`Detection failed: ${response.status}`)
      }

      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Invalid response format - expected JSON')
      }

      const result = await response.json()
      console.log('Language detection result:', result)
      
      // LibreTranslate returns an array of detected languages with confidence scores
      return result[0]?.language || 'en'
    } catch (error) {
      console.error(`Language detection error with ${instanceUrl}:`, error)
      continue
    }
  }
  
  console.error('All translation services failed for language detection')
  return 'en' // Default to English if all services fail
}

async function translateText(text: string, sourceLanguage: string, targetLanguage: string): Promise<string> {
  // Don't translate if source and target are the same
  if (sourceLanguage === targetLanguage) {
    return text
  }

  // Try multiple instances
  for (let i = 0; i < LIBRETRANSLATE_INSTANCES.length; i++) {
    const instanceUrl = LIBRETRANSLATE_INSTANCES[(currentInstanceIndex + i) % LIBRETRANSLATE_INSTANCES.length]
    try {
      const response = await fetch(`${instanceUrl}/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: text,
          source: sourceLanguage,
          target: targetLanguage,
          format: 'text'
        })
      })

      if (!response.ok) {
        throw new Error(`Translation failed: ${response.status}`)
      }

      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Invalid response format - expected JSON')
      }

      const result = await response.json()
      console.log('Translation result:', result)
      
      // Update current instance to the working one
      currentInstanceIndex = (currentInstanceIndex + i) % LIBRETRANSLATE_INSTANCES.length
      
      return result.translatedText || text
    } catch (error) {
      console.error(`Translation error with ${instanceUrl}:`, error)
      continue
    }
  }
  
  console.error('All translation services failed')
  return text // Return original text if all services fail
}

function getLanguageName(code: string): string {
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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { text, targetLanguage }: TranslationRequest = await req.json()

    console.log('Translation request:', { text: text.substring(0, 100), targetLanguage })

    if (!text || !targetLanguage) {
      return new Response(
        JSON.stringify({ error: 'Missing text or targetLanguage' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Detect source language
    const sourceLanguage = await detectLanguage(text)
    
    // Translate text
    const translatedText = await translateText(text, sourceLanguage, targetLanguage)

    const response: TranslationResponse = {
      translatedText,
      sourceLanguage,
      targetLanguage
    }

    console.log('Translation response:', response)

    return new Response(
      JSON.stringify(response),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Translation function error:', error)
    
    return new Response(
      JSON.stringify({ error: 'Translation failed' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})