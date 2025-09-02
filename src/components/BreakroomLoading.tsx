import React, { useEffect, useState } from 'react';

interface BreakroomLoadingProps {
  onComplete?: () => void;
}

const BreakroomLoading: React.FC<BreakroomLoadingProps> = ({ onComplete }) => {
  const [isVisible, setIsVisible] = useState(true);

  // Easy horizontal adjustment - change this value to move the mug left/right
  const mugHorizontalOffset = 75; // pixels from center (positive = right, negative = left)

  useEffect(() => {
    // Auto-hide after animation completes (3 seconds)
    const timer = setTimeout(() => {
      setIsVisible(false);
      if (onComplete) {
        setTimeout(onComplete, 500); // Wait for fade out
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  if (!isVisible) return null;

  const styles = {
    container: {
      position: 'fixed' as const,
      inset: '0',
      zIndex: 20000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden'
    },
    background: {
      position: 'absolute' as const,
      inset: '0',
      background: `
        radial-gradient(ellipse at top left, #FFFACD 0%, #F7DC6F 35%, transparent 70%),
        linear-gradient(135deg, #F1C40F 0%, #B7950B 100%)
      `
    },
    animationContainer: {
      position: 'relative' as const,
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: 'center'
    },

    mugContainer: {
      position: 'relative' as const,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: '20px',
      transform: 'scale(1.5)',
      // Apply horizontal offset here
      left: `${mugHorizontalOffset}px`
    },

    mugVisualWrapper: {
      width: '50px',
      height: '60px',
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
      position: 'relative' as const,
      overflow: 'visible' as const
    },

    coffeeMug: {
      position: 'relative' as const,
      animation: 'mugSmoothEntrance 1.2s ease-out 0s forwards',
      opacity: 0,
      transform: 'translateY(120px) scale(0.3)'
    },

    mugBody: {
      width: '50px',
      height: '60px',
      backgroundColor: '#B22222',
      borderRadius: '3px',
      position: 'relative' as const,
      boxShadow: `
        inset -6px 0 0 rgba(0, 0, 0, 0.2),
        inset 0 -6px 0 rgba(0, 0, 0, 0.15),
        0 3px 6px rgba(0, 0, 0, 0.25)
      `
    },
    mugBodyBefore: {
      position: 'absolute' as const,
      top: '6px',
      left: '6px',
      right: '6px',
      height: '3px',
      backgroundColor: 'rgba(0, 0, 0, 0.15)',
      borderRadius: '1.5px'
    },

    mugHandle: {
      position: 'absolute' as const,
      left: '-12px',
      top: '8px',
      width: '18px',
      height: '35px',
      border: '5px solid #B22222',
      borderRight: 'none',
      borderRadius: '12px 0 0 12px',
      background: 'transparent',
      boxShadow: 'inset 2px 0 0 rgba(0, 0, 0, 0.1)'
    },

    textContainer: {
      position: 'relative' as const,
      fontFamily: "'Courier New', Courier, monospace",
      fontSize: '36px',
      fontWeight: 'bold' as const,
      color: '#B22222',
      whiteSpace: 'nowrap' as const,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      width: '300px',
      height: '50px',
      overflow: 'visible'
    },
    textLeft: {
      position: 'absolute' as const,
      left: '50%',
      transform: 'translateX(-50%)',
      animation: 'slideFromCenter 0.8s ease-out 1.2s forwards',
      opacity: 0,
      zIndex: 1
    },
    textRight: {
      position: 'absolute' as const,
      left: '50%',
      transform: 'translateX(-50%)',
      animation: 'slideFromCenterRight 0.8s ease-out 1.2s forwards',
      opacity: 0,
      zIndex: 1
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.background} />

      <div style={styles.animationContainer}>

        <div style={styles.mugContainer}>
          <div style={styles.coffeeMug}>
            <div style={styles.mugVisualWrapper}>
              <div style={styles.mugBody}>
                <div style={styles.mugBodyBefore}></div>
              </div>
              <div style={styles.mugHandle}></div>
            </div>
          </div>
        </div>

        <div style={styles.textContainer}>
          <span style={styles.textLeft}>break</span>
          <span style={styles.textRight}>room</span>
        </div>
      </div>

      <style>{`
        @keyframes mugSmoothEntrance {
          0% {
            opacity: 0;
            transform: translateY(120px) scale(0.3);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes slideFromCenter {
          0% {
            opacity: 0;
            transform: translateX(-50%);
          }
          30% {
            opacity: 0;
            transform: translateX(-50%);
          }
          100% {
            opacity: 1;
            transform: translateX(-100%) translateX(-4px);
          }
        }

        @keyframes slideFromCenterRight {
          0% {
            opacity: 0;
            transform: translateX(-50%);
          }
          30% {
            opacity: 0;
            transform: translateX(-50%);
          }
          100% {
            opacity: 1;
            transform: translateX(0%) translateX(0px);
          }
        }
      `}</style>
    </div>
  );
};

export default BreakroomLoading;