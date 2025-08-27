import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// LibreTranslate API endpoint (using public instance)
const LIBRETRANSLATE_URL = 'https://libretranslate.de/translate'
const DETECT_URL = 'https://libretranslate.de/detect'

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
  try {
    const response = await fetch(DETECT_URL, {
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

    const result = await response.json()
    console.log('Language detection result:', result)
    
    // LibreTranslate returns an array of detected languages with confidence scores
    return result[0]?.language || 'en'
  } catch (error) {
    console.error('Language detection error:', error)
    return 'en' // Default to English if detection fails
  }
}

async function translateText(text: string, sourceLanguage: string, targetLanguage: string): Promise<string> {
  try {
    // Don't translate if source and target are the same
    if (sourceLanguage === targetLanguage) {
      return text
    }

    const response = await fetch(LIBRETRANSLATE_URL, {
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

    const result = await response.json()
    console.log('Translation result:', result)
    
    return result.translatedText || text
  } catch (error) {
    console.error('Translation error:', error)
    return text // Return original text if translation fails
  }
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