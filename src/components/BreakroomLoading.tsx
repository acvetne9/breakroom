import React, { useEffect, useState } from 'react';

const BreakroomLoading = ({ onComplete }: { onComplete?: () => void }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      if (onComplete) setTimeout(onComplete, 500);
    }, 3000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  if (!isVisible) return null;

  const styles = {
    container: {
      position: 'fixed' as const,
      inset: 0,
      zIndex: 20000,
      display: 'flex' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      overflow: 'hidden' as const,
      padding: '20px'
    },
    background: {
      position: 'absolute' as const,
      inset: 0,
      background: `
        radial-gradient(ellipse at top left, #FFFACD 0%, #F7DC6F 35%, transparent 70%),
        linear-gradient(135deg, #F1C40F 0%, #B7950B 100%)
      `
    },
    animationContainer: {
      position: 'relative' as const,
      display: 'flex' as const,
      flexDirection: 'column' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      width: '100%',
      maxWidth: '400px'
    },
    mugWrapper: {
      position: 'relative' as const,
      display: 'flex' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      width: '120px',
      height: '120px',
      marginBottom: '0px'
    },
    coffeeMug: {
      display: 'inline-block' as const,
      position: 'relative' as const,
      transform: 'scale(1.5)',
      transformOrigin: 'center center',
      animation: 'mugSmoothEntrance 1.2s ease-out forwards',
      opacity: 0,
      left: '6px'
    },
    mugBody: {
      width: '48px',
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
    mugHandle: {
      position: 'absolute' as const,
      left: '-12px',
      top: '8px',
      width: '16px',
      height: '32px',
      border: '4px solid #B22222',
      borderRight: 'none' as const,
      borderRadius: '12px 0 0 12px',
      background: 'transparent',
      boxShadow: 'inset 2px 0 0 rgba(0, 0, 0, 0.1)'
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
    textContainer: {
      display: 'flex' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      width: '100%',
      fontFamily: "'Courier New', Courier, monospace",
      fontSize: 'clamp(32px, 9vw, 42px)',
      fontWeight: 'bold' as const,
      color: '#B22222',
      letterSpacing: '0.05em'
    },
    textSpanLeft: {
      display: 'inline-block' as const,
      opacity: 0,
      animation: 'slideInFromRight 0.8s forwards'
    },
    textSpanRight: {
      display: 'inline-block' as const,
      opacity: 0,
      animation: 'slideInFromLeft 0.8s forwards'
    },
    textGap: {
      width: '1px',
      display: 'inline-block' as const,
      opacity: 0,
      animation: 'fadeIn 0.3s forwards',
      animationDelay: '1.6s'
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.background} />

      <div style={styles.animationContainer}>
        <div style={styles.mugWrapper}>
          <div style={styles.coffeeMug}>
            <div style={styles.mugBody}>
              <div style={styles.mugBodyBefore}></div>
            </div>
            <div style={styles.mugHandle}></div>
          </div>
        </div>

        <div style={styles.textContainer}>
          <span style={{ ...styles.textSpanLeft, animationDelay: '1.2s' }}>break</span>
          <span style={styles.textGap}></span>
          <span style={{ ...styles.textSpanRight, animationDelay: '1.2s' }}>room</span>
        </div>
      </div>

      <style>{`
        @keyframes mugSmoothEntrance {
          0% { opacity: 0; transform: translateY(120px) scale(0.3); }
          100% { opacity: 1; transform: translateY(0) scale(1.5); }
        }

        @keyframes slideInFromLeft {
          0% { opacity: 0; transform: translateX(-60px); }
          100% { opacity: 1; transform: translateX(0); }
        }

        @keyframes slideInFromRight {
          0% { opacity: 0; transform: translateX(60px); }
          100% { opacity: 1; transform: translateX(0); }
        }

        @keyframes fadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }

        @media (max-width: 768px) {
          .animation-container {
            padding: 0 10px;
          }
        }

        @media (max-width: 480px) {
          div[style*="fontFamily"] {
            font-weight: 900 !important;
            text-shadow: 2px 2px 0px rgba(178, 34, 34, 0.6), 0 0 25px rgba(178, 34, 34, 0.5) !important;
          }
          
          div[style*="fontFamily"] span {
            font-weight: 900 !important;
          }
        }
      `}</style>
    </div>
  );
};

export default BreakroomLoading;