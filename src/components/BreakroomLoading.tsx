import React, { useEffect, useState, CSSProperties } from 'react';

interface BreakroomLoadingProps {
  onComplete?: () => void;
}

const BreakroomLoading: React.FC<BreakroomLoadingProps> = ({ onComplete }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      if (onComplete) setTimeout(onComplete, 500);
    }, 3000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  if (!isVisible) return null;

  const styles: { [key: string]: CSSProperties } = {
    container: {
      position: 'fixed',
      inset: 0,
      zIndex: 20000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden'
    },
    background: {
      position: 'absolute',
      inset: 0,
      background: `
        radial-gradient(ellipse at top left, #FFFACD 0%, #F7DC6F 35%, transparent 70%),
        linear-gradient(135deg, #F1C40F 0%, #B7950B 100%)
      `
    },
    animationContainer: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative'
    },
    mugWrapper: {
      position: 'relative',
      display: 'inline-block',
      transform: 'scale(1.7)', // slightly bigger
      transformOrigin: 'bottom center',
      marginBottom: '20px'
    },
    mugBody: {
      width: 'clamp(50px, 8vw, 70px)',
      height: 'clamp(60px, 10vw, 84px)',
      backgroundColor: '#B22222',
      borderRadius: '3px',
      position: 'relative',
      boxShadow: `
        inset -6px 0 0 rgba(0,0,0,0.2),
        inset 0 -6px 0 rgba(0,0,0,0.15),
        0 3px 6px rgba(0,0,0,0.25)
      `
    },
    mugBodyBefore: {
      position: 'absolute',
      top: '6px',
      left: '6px',
      right: '6px',
      height: '3px',
      backgroundColor: 'rgba(0,0,0,0.15)',
      borderRadius: '1.5px'
    },
    mugHandle: {
      position: 'absolute',
      left: '-14px',
      top: '8px',
      width: 'clamp(18px, 4vw, 22px)',
      height: 'clamp(36px, 8vw, 42px)',
      border: '5px solid #B22222',
      borderRight: 'none',
      borderRadius: '12px 0 0 12px',
      background: 'transparent',
      boxShadow: 'inset 2px 0 0 rgba(0,0,0,0.1)'
    },
    textWrapper: {
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: '1.5em',
      fontFamily: "'Courier New', Courier, monospace",
      fontSize: 'clamp(28px, 7vw, 42px)',
      fontWeight: 'bold',
      color: '#B22222'
    },
    textSpan: {
      display: 'inline-block',
      opacity: 0,
      animation: 'fadeInUp 0.8s forwards'
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.background} />

      <div style={styles.animationContainer}>
        <div style={styles.mugWrapper}>
          <div style={styles.mugBody}>
            <div style={styles.mugBodyBefore}></div>
          </div>
          <div style={styles.mugHandle}></div>
        </div>

        <div style={styles.textWrapper}>
          <span style={{ ...styles.textSpan, animationDelay: '1.2s' }}>break</span>
          <span style={{ ...styles.textSpan, animationDelay: '1.3s' }}>room</span>
        </div>
      </div>

      <style>{`
        @keyframes mugSmoothEntrance {
          0% { opacity: 0; transform: translateY(120px) scale(0.3); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes fadeInUp {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default BreakroomLoading;
