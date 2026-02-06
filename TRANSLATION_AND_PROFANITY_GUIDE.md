# Translation & Profanity Filter System Guide

## Overview
This document describes the translation and profanity filtering systems in the Workaround application.

## Profanity Filter

### Location
`src/utils/profanityFilter.ts`

### Features
1. **Comprehensive Word List**: Filters profanity, hate speech, scam/fraud terms, sexual content, violence, and drug-related terms
2. **Leetspeak Detection**: Automatically normalizes common character substitutions (e.g., `3` → `e`, `$` → `s`)
3. **Whitelist System**: Prevents false positives for legitimate words (e.g., "assessment", "classic", "Scunthorpe")
4. **Word Boundary Detection**: Only flags words that are standalone or separated by punctuation (avoids Scunthorpe problem)
5. **Obfuscation Handling**: Detects attempts to bypass the filter with spaces, dots, or dashes

### Usage
```typescript
import { isProfane, validateContent } from '@/utils/profanityFilter';

// Check if text contains profanity
if (isProfane(userInput)) {
  // Block or warn user
}

// Get validation message
const errorMessage = validateContent(userInput);
if (errorMessage) {
  console.error(errorMessage); // "Content blocked: inappropriate language detected"
}
```

### Currently Applied In
- `InitiationPage.tsx` - Job/business input validation
- `SettingsPage.tsx` - Profile and job update validation
- `UnifiedBusinessSearch.tsx` - Search query validation
- `ExplorePage.tsx` - Post and comment validation
- `BusinessSearchDropdown.tsx` - Business search validation
- `LocationSearchInput.tsx` - Location search validation

### Test Suite
`src/utils/__tests__/profanityFilter.test.ts` includes comprehensive tests for:
- Basic profanity detection
- Leetspeak variants
- Obfuscated profanity
- Whitelist functionality
- Word boundary detection
- Empty/invalid input handling

---

## Translation System

### Location
- Hook: `src/hooks/useTranslation.ts`
- Component: `src/components/TranslatedText.tsx`
- Backend: `supabase/functions/translate/index.ts`

### Features

#### 1. Rate Limiting
- **Max 3 concurrent requests** to prevent resource exhaustion
- **200ms stagger** between batches
- Queue system ensures requests are processed smoothly

#### 2. Persistent Caching
- **localStorage** for long-term cache (7 days)
- **Memory cache** for session performance
- Automatic cleanup of expired entries

#### 3. Smart Translation Logic
- Automatically detects user's browser language
- Skips translation for English users (most content is English)
- Debouncing (100ms) to prevent rapid-fire requests
- Only translates once per unique text

#### 4. Supported Languages
29 languages supported:
- European: English, Spanish, French, German, Italian, Portuguese, Dutch, Swedish, Danish, Norwegian, Finnish, Polish, Turkish, Czech, Slovak, Hungarian, Romanian, Bulgarian, Croatian, Serbian, Slovenian, Estonian, Latvian, Lithuanian
- Middle Eastern: Arabic, Hebrew
- Asian: Russian, Japanese, Korean, Chinese, Hindi, Thai, Vietnamese, Indonesian, Malay, Ukrainian

### Usage

#### Using the Hook
```typescript
import { useTranslation } from '@/hooks/useTranslation';

const { translateText, userLanguage, setUserLanguage, getLanguageName } = useTranslation();

// Translate text
const result = await translateText('Hello world', 'en');
console.log(result.translatedText); // Translated text
console.log(result.isTranslated); // true if translation occurred
console.log(result.sourceLanguage); // Detected source language
```

#### Using the Component
```typescript
import { TranslatedText } from '@/components/TranslatedText';

<TranslatedText
  text="User generated content"
  showIndicator={true}  // Show "(translated from ...)" indicator
  sourceLanguage="en"   // Optional: specify source language
  enableTranslation={true} // Can be disabled per component
/>
```

### Currently Applied In
- `ExplorePage.tsx` - Post text and comment text
- `BusinessDetails.tsx` - Business names and story text

### How It Works

1. **Initial Load**: User's browser language is detected (e.g., `es` for Spanish)
2. **Cache Check**: System checks localStorage and memory for existing translation
3. **Translation Request**: If not cached, queues request to Supabase Edge Function
4. **Rate Limiting**: Request waits in queue if too many concurrent requests
5. **Display**: Shows translated text with optional language indicator
6. **Cache Update**: Saves translation to both memory and localStorage

### Performance Optimizations

1. **Lazy Loading**: Only translates when component is mounted
2. **Debouncing**: 100ms delay prevents rapid requests during text changes
3. **One-time Translation**: Each text is only translated once per session
4. **English Skip**: No translation for English users (saves API calls)
5. **Persistent Cache**: Translations persist across sessions for 7 days

### Configuration

Edit constants in `useTranslation.ts`:
```typescript
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000 // Cache duration (7 days)

class RateLimiter {
  private readonly maxConcurrent = 3 // Max concurrent requests
  private readonly delayBetweenBatches = 200 // ms delay between batches
}
```

---

## Best Practices

### Profanity Filter
1. **Always validate user input** before saving to database
2. **Provide clear feedback** when content is blocked
3. **Update whitelist** if legitimate words are flagged
4. **Add terms** to profanityList as needed for your region/industry

### Translation
1. **Use TranslatedText component** for all user-generated content
2. **Don't translate UI elements** (buttons, labels) - use i18n for that
3. **Set enableTranslation={false}** for code snippets or data that shouldn't be translated
4. **Test with different browser languages** to ensure proper detection

---

## Troubleshooting

### Profanity Filter

**Issue**: Legitimate word is being flagged
- **Solution**: Add to whitelist in `profanityFilter.ts`

**Issue**: Profanity is bypassing filter
- **Solution**: Add variant to profanityList or update normalization logic

### Translation

**Issue**: Too many translation requests
- **Solution**: Rate limiter should handle this automatically. Check if multiple components are translating the same text.

**Issue**: Translation not working
- **Solution**:
  1. Check browser console for errors
  2. Verify Supabase Edge Function is deployed
  3. Check localStorage cache size (clear if needed)

**Issue**: Wrong language detected
- **Solution**: Set `sourceLanguage` prop explicitly on TranslatedText component

---

## Testing

### Run Profanity Filter Tests
```bash
npm test profanityFilter.test.ts
```

### Manual Translation Testing
1. Change browser language: Chrome Settings → Languages
2. Reload application
3. Check that content is translated
4. Verify cache is working (check localStorage → `translation_cache_v1`)

---

## Future Enhancements

### Profanity Filter
- [ ] Machine learning-based detection for context-aware filtering
- [ ] Multi-language profanity detection
- [ ] Configurable severity levels
- [ ] Admin dashboard for managing word lists

### Translation
- [ ] Batch translation API for multiple texts at once
- [ ] Offline translation for common phrases
- [ ] User preference for translation on/off
- [ ] Translation quality feedback mechanism

---

## Technical Details

### Translation Flow
```
User views content → TranslatedText component mounts
                   ↓
              Check cache (localStorage + memory)
                   ↓
          Cache hit? → Yes → Display cached translation
                   ↓ No
          Queue translation request (rate limiter)
                   ↓
          Send to Supabase Edge Function
                   ↓
          Receive translated text
                   ↓
          Update cache (memory + localStorage)
                   ↓
          Display translated text with indicator
```

### Profanity Filter Flow
```
User submits content → isProfane() called
                     ↓
          Normalize text (lowercase, remove special chars, convert leetspeak)
                     ↓
          Check against profanity list
                     ↓
          Match found? → Check whitelist
                     ↓
          In whitelist? → No → Block content
                       → Yes → Allow content
```

---

## Support
For issues or questions, please open a GitHub issue or contact the development team.
