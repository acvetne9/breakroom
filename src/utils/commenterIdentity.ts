// Pool of Lucide icon names for commenters
const ICON_POOL = ['Smile', 'Lightbulb', 'Target', 'Star', 'Flame', 'Eye', 'Palette', 'Rocket', 'MessageCircle', 'Sparkles', 'Drama', 'Rainbow', 'Zap', 'Clover', 'Music', 'Heart'];

// Pool of pastel/vibrant colors for backgrounds (will be used at 50% opacity)
const COLOR_POOL = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B88B', '#A8E6CF',
  '#FFB6C1', '#87CEEB', '#DDA0DD', '#F0E68C', '#B0E0E6'
];

// Generate RANDOM icon and color
export const getRandomCommenterIdentity = (isOP: boolean) => {
  if (isOP) {
    return {
      iconName: 'OP',
      color: '#FFD700', // Gold for OP
      isOP: true
    };
  }
  
  // Random selection each time
  const randomIcon = ICON_POOL[Math.floor(Math.random() * ICON_POOL.length)];
  const randomColor = COLOR_POOL[Math.floor(Math.random() * COLOR_POOL.length)];
  
  return {
    iconName: randomIcon,
    color: randomColor,
    isOP: false
  };
};
