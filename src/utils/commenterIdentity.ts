// Pool of cross-platform safe emojis for commenters (Unicode 6.0-9.0)
const EMOJI_POOL = ['😊', '🤔', '💡', '🎯', '🌟', '🔥', '💪', '👀', '🎨', '🚀', '💬', '✨', '🎭', '🌈', '⚡', '🍀', '🎵', '❤️'];

// Pool of pastel/vibrant colors for backgrounds (will be used at 50% opacity)
const COLOR_POOL = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B88B', '#A8E6CF',
  '#FFB6C1', '#87CEEB', '#DDA0DD', '#F0E68C', '#B0E0E6'
];

// Generate deterministic emoji and color based on comment ID, ensuring no duplicates within the same thread
export const getCommenterIdentity = (commentId: string, isOP: boolean, usedCombinations: Set<string>) => {
  if (isOP) {
    return {
      label: 'OP',
      color: '#FFD700', // Gold for OP
      isOP: true
    };
  }
  
  // Generate hash from comment ID for deterministic starting point
  const hash = commentId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  
  // Try combinations starting from hash position until we find an unused one
  let attempts = 0;
  const maxCombinations = EMOJI_POOL.length * COLOR_POOL.length; // 18 * 15 = 270 combinations
  
  while (attempts < maxCombinations) {
    const emojiIndex = (hash + attempts) % EMOJI_POOL.length;
    const colorIndex = ((hash * 7) + attempts) % COLOR_POOL.length;
    const emoji = EMOJI_POOL[emojiIndex];
    const color = COLOR_POOL[colorIndex];
    const combination = `${emoji}-${color}`;
    
    if (!usedCombinations.has(combination)) {
      usedCombinations.add(combination);
      return {
        label: emoji,
        color: color,
        isOP: false
      };
    }
    attempts++;
  }
  
  // Fallback (only if all 270 combinations are exhausted in one thread)
  const fallbackEmoji = EMOJI_POOL[hash % EMOJI_POOL.length];
  const fallbackColor = COLOR_POOL[(hash * 7) % COLOR_POOL.length];
  return {
    label: fallbackEmoji,
    color: fallbackColor,
    isOP: false
  };
};
