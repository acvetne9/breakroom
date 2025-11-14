/**
 * Generates a consistent browser fingerprint for device recovery
 * This helps restore user profiles when localStorage is cleared
 * Uses availWidth/availHeight for better stability on mobile devices
 */
export function generateBrowserFingerprint(): string {
  const components: string[] = [];
  
  // Screen resolution (using availWidth/availHeight for better stability on mobile)
  components.push(`${window.screen.availWidth}x${window.screen.availHeight}`);
  
  // Color depth
  components.push(`${window.screen.colorDepth}`);
  
  // Timezone
  components.push(Intl.DateTimeFormat().resolvedOptions().timeZone);
  
  // Language
  components.push(navigator.language);
  
  // Platform
  components.push(navigator.platform);
  
  // User agent (shortened to avoid version changes)
  const ua = navigator.userAgent;
  const browserMatch = ua.match(/(Chrome|Firefox|Safari|Edge|Opera)\/[\d.]+/);
  if (browserMatch) {
    components.push(browserMatch[0].split('/')[0]); // Just browser name
  }
  
  // Hardware concurrency (CPU cores)
  if (navigator.hardwareConcurrency) {
    components.push(`${navigator.hardwareConcurrency}`);
  }
  
  // Device memory (if available)
  if ('deviceMemory' in navigator) {
    components.push(`${(navigator as any).deviceMemory}`);
  }
  
  // Create hash from components
  const fingerprint = components.join('|');
  
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return `fp_${Math.abs(hash).toString(36)}`;
}

/**
 * Generates legacy browser fingerprint using old method (width x height)
 * Used for backward compatibility to recover existing profiles
 */
export function generateLegacyBrowserFingerprint(): string {
  const components: string[] = [];
  
  // OLD method: Screen resolution using width x height (less stable on mobile)
  components.push(`${window.screen.width}x${window.screen.height}`);
  
  // Color depth
  components.push(`${window.screen.colorDepth}`);
  
  // Timezone
  components.push(Intl.DateTimeFormat().resolvedOptions().timeZone);
  
  // Language
  components.push(navigator.language);
  
  // Platform
  components.push(navigator.platform);
  
  // User agent (shortened to avoid version changes)
  const ua = navigator.userAgent;
  const browserMatch = ua.match(/(Chrome|Firefox|Safari|Edge|Opera)\/[\d.]+/);
  if (browserMatch) {
    components.push(browserMatch[0].split('/')[0]); // Just browser name
  }
  
  // Hardware concurrency (CPU cores)
  if (navigator.hardwareConcurrency) {
    components.push(`${navigator.hardwareConcurrency}`);
  }
  
  // Device memory (if available)
  if ('deviceMemory' in navigator) {
    components.push(`${(navigator as any).deviceMemory}`);
  }
  
  // Create hash from components
  const fingerprint = components.join('|');
  
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return `fp_${Math.abs(hash).toString(36)}`;
}
