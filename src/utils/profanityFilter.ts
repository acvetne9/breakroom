
// Comprehensive profanity filter utility with block-only approach
const profanityList = [
  // Common profanity - keeping this list clean for demo purposes
  'badword1', 'badword2', 'offensive1', 'offensive2',
  // Add more words as needed - this would typically be a comprehensive list
  'spam', 'scam', 'fake', 'fraud'
];

// Leetspeak and common character substitutions
const leetSpeakMap: { [key: string]: string } = {
  '4': 'a', '3': 'e', '1': 'i', '0': 'o', '5': 's', '7': 't', '@': 'a',
  '$': 's', '!': 'i', '+': 't', '8': 'b', '6': 'g', '9': 'g'
};

// Whitelist for words that might be falsely flagged
const whitelist = [
  'assessment', 'basement', 'class', 'assistant', 'grass', 'glass'
];

/**
 * Escapes special regex characters to prevent syntax errors
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalizes text by removing special characters, spaces, and converting leetspeak
 */
function normalizeText(text: string): string {
  let normalized = text.toLowerCase();
  
  // Convert leetspeak - escape special characters before creating RegExp
  for (const [leet, normal] of Object.entries(leetSpeakMap)) {
    const escapedLeet = escapeRegExp(leet);
    normalized = normalized.replace(new RegExp(escapedLeet, 'g'), normal);
  }
  
  // Remove spaces, punctuation, and special characters that might be used to bypass filter
  normalized = normalized.replace(/[^a-z0-9]/g, '');
  
  return normalized;
}

/**
 * Checks if text contains profanity
 * Returns true if profanity is detected, false otherwise
 */
export function isProfane(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }
  
  const normalizedText = normalizeText(text);
  
  // Check each profanity word
  for (const profaneWord of profanityList) {
    const normalizedProfaneWord = normalizeText(profaneWord);
    
    // Check if the profane word appears in the text
    if (normalizedText.includes(normalizedProfaneWord)) {
      // Check if it's in the whitelist
      const isWhitelisted = whitelist.some(whitelistedWord => 
        normalizeText(whitelistedWord).includes(normalizedProfaneWord)
      );
      
      if (!isWhitelisted) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Validates content and returns error message if profane
 */
export function validateContent(text: string): string | null {
  if (isProfane(text)) {
    return "Content blocked: inappropriate language detected";
  }
  return null;
}
