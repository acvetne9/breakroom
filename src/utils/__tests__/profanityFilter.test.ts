import { isProfane, validateContent } from '../profanityFilter';

describe('Profanity Filter', () => {
  describe('isProfane', () => {
    test('should detect basic profanity', () => {
      expect(isProfane('This is shit')).toBe(true);
      expect(isProfane('What the fuck')).toBe(true);
      expect(isProfane('You are a bitch')).toBe(true);
    });

    test('should detect leetspeak variants', () => {
      expect(isProfane('This is sh1t')).toBe(true);
      expect(isProfane('What the fuk')).toBe(true);
      expect(isProfane('You are a b1tch')).toBe(true);
    });

    test('should detect obfuscated profanity', () => {
      expect(isProfane('s h i t')).toBe(true);
      expect(isProfane('f.u.c.k')).toBe(true);
      expect(isProfane('b-i-t-c-h')).toBe(true);
    });

    test('should NOT flag whitelisted words', () => {
      expect(isProfane('I took an assessment')).toBe(false);
      expect(isProfane('We went to class')).toBe(false);
      expect(isProfane('The assistant helped me')).toBe(false);
      expect(isProfane('Classic car')).toBe(false);
      expect(isProfane('I live in Scunthorpe')).toBe(false);
    });

    test('should NOT flag clean text', () => {
      expect(isProfane('This is a great place to work')).toBe(false);
      expect(isProfane('The manager is very helpful')).toBe(false);
      expect(isProfane('I love my job here')).toBe(false);
    });

    test('should handle empty or invalid input', () => {
      expect(isProfane('')).toBe(false);
      expect(isProfane('   ')).toBe(false);
      expect(isProfane(null as any)).toBe(false);
      expect(isProfane(undefined as any)).toBe(false);
    });

    test('should handle word boundaries correctly', () => {
      // These should be detected as they are standalone words
      expect(isProfane('damn it')).toBe(true);
      expect(isProfane('ass hole')).toBe(true);

      // Scunthorpe problem - should NOT be flagged (whitelisted)
      expect(isProfane('Scunthorpe')).toBe(false);
      expect(isProfane('assessment')).toBe(false);
    });

    test('should detect scam-related terms', () => {
      expect(isProfane('This is a scam')).toBe(true);
      expect(isProfane('spam message')).toBe(true);
      expect(isProfane('fraud alert')).toBe(true);
    });

    test('should detect hate speech', () => {
      expect(isProfane('nazi propaganda')).toBe(true);
      expect(isProfane('terrorist activity')).toBe(true);
    });
  });

  describe('validateContent', () => {
    test('should return error message for profane content', () => {
      const result = validateContent('This is shit');
      expect(result).toBe('Content blocked: inappropriate language detected');
    });

    test('should return null for clean content', () => {
      const result = validateContent('This is a great place');
      expect(result).toBe(null);
    });
  });
});
