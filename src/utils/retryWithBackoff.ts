/**
 * Retry a function with exponential backoff.
 * Useful for handling transient network errors and connection issues.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    shouldRetry?: (error: any) => boolean;
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
        console.log(
          `[retryWithBackoff] Attempt ${attempt + 1}/${maxRetries + 1} failed. Retrying in ${delay}ms...`,
          error
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  console.error('[retryWithBackoff] All retry attempts failed:', lastError);
  throw lastError!;
}

/**
 * Helper to determine if an error is retryable (network/connection related)
 */
export function isRetryableError(error: any): boolean {
  if (!error) return false;

  const errorMessage = error.message?.toLowerCase() || '';
  const errorCode = error.code?.toLowerCase() || '';

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
