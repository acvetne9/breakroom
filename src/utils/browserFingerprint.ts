/**
 * Generates a consistent browser fingerprint for device recovery
 * This helps restore user profiles when localStorage is cleared
 */
export function generateBrowserFingerprint(): string {
  const components: string[] = [];
  
  // Screen resolution
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
