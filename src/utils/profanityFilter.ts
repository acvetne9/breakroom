
// Comprehensive profanity filter utility with block-only approach
const profanityList = [
  // Profanity (common variants)
  'fuck', 'fuk', 'fck', 'shit', 'shit', 'damn', 'bitch', 'bastard', 'ass',
  'asshole', 'cunt', 'dick', 'cock', 'pussy', 'whore', 'slut', 'piss',
  'nigger', 'nigga', 'fag', 'faggot', 'retard', 'retarded',

  // Scam/fraud related
  'spam', 'scam', 'fake', 'fraud', 'phishing', 'ponzi', 'mlm',

  // Hate speech
  'nazi', 'hitler', 'kkk', 'terrorist', 'jihad',

  // Sexual content
  'porn', 'xxx', 'sex', 'nude', 'naked', 'nsfw',

  // Violence
  'kill', 'murder', 'rape', 'bomb', 'shoot', 'gun',

  // Drug related (context dependent, but flagging for review)
  'meth', 'cocaine', 'heroin', 'crack', 'dealer',

  // Common leetspeak variants (will be caught by normalization)
  'fuk', 'sh1t', 'b1tch', 'a55', 'a55hole'
];

// Leetspeak and common character substitutions
const leetSpeakMap: { [key: string]: string } = {
  '4': 'a', '3': 'e', '1': 'i', '0': 'o', '5': 's', '7': 't', '@': 'a',
  '$': 's', '!': 'i', '+': 't', '8': 'b', '6': 'g', '9': 'g'
};

// Whitelist for words that might be falsely flagged
const whitelist = [
  'assessment', 'basement', 'class', 'assistant', 'grass', 'glass',
  'classic', 'classes', 'classified', 'passable', 'passageway',
  'assassin', 'massage', 'passage', 'compass', 'trespass',
  'cassette', 'cassock', 'dickens', 'dickinson', 'cockatoo',
  'peacock', 'shuttle', 'button', 'county', 'country',
  'scunthorpe', 'penistone', 'essex', 'sussex', 'middlesex'
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
 * Checks if text contains profanity with word boundary detection
 * Returns true if profanity is detected, false otherwise
 */
export function isProfane(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const normalizedText = normalizeText(text);
  const originalLower = text.toLowerCase();

  // First check whitelist against original text
  const isTextWhitelisted = whitelist.some(whitelistedWord =>
    originalLower.includes(whitelistedWord.toLowerCase())
  );

  if (isTextWhitelisted) {
    return false; // Early exit if whole phrase is whitelisted
  }

  // Check each profanity word
  for (const profaneWord of profanityList) {
    const normalizedProfaneWord = normalizeText(profaneWord);

    // Check if the profane word appears in the text
    if (normalizedText.includes(normalizedProfaneWord)) {
      // Word boundary check: ensure it's not part of a larger word
      // Create pattern to match as standalone word or with common separators
      const wordIndex = normalizedText.indexOf(normalizedProfaneWord);
      const beforeChar = wordIndex > 0 ? normalizedText[wordIndex - 1] : ' ';
      const afterChar = wordIndex + normalizedProfaneWord.length < normalizedText.length
        ? normalizedText[wordIndex + normalizedProfaneWord.length]
        : ' ';

      // Check if it's a standalone word (surrounded by spaces or at edges)
      const isStandaloneOrRepeated =
        wordIndex === 0 || // starts text
        wordIndex + normalizedProfaneWord.length === normalizedText.length || // ends text
        !/[a-z0-9]/.test(beforeChar) || // preceded by separator
        !/[a-z0-9]/.test(afterChar); // followed by separator

      if (isStandaloneOrRepeated) {
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
