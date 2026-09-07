/**
 * Retry a function with exponential backoff.
 * Useful for handling transient network errors and connection issues.
 */
export async function retryWithBackoff<T>(
  // PromiseLike so Supabase query builders (thenables) can be passed directly.
  fn: () => PromiseLike<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    shouldRetry = () => true
  } = options;

  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if we should retry this error
      if (!shouldRetry(error)) {
        throw error;
      }

      // Don't wait after the last attempt
      if (attempt < maxRetries) {
        const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}

/**
 * Helper to determine if an error is retryable (network/connection related)
 */
export function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const { message, code } = error as { message?: string; code?: string };
  const errorMessage = message?.toLowerCase() || '';
  const errorCode = code?.toLowerCase() || '';

  // Common retryable error patterns
  const retryablePatterns = [
    'network',
    'timeout',
    'fetch',
    'connection',
    'econnrefused',
    'enotfound',
    'etimedout',
    'socket hang up',
    'aborted',
  ];

  return retryablePatterns.some(
    pattern => errorMessage.includes(pattern) || errorCode.includes(pattern)
  );
}
