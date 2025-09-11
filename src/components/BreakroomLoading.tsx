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
      overflow: 'hidden',
      padding: '20px' // Ensure content doesn't touch edges on mobile
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
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      maxWidth: '400px' // Prevent too wide on desktop
    },
    // FIX 1: Create proper space for the mug INCLUDING the handle
    mugWrapper: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '120px', // Fixed width to accommodate mug + handle + scaling
      height: '120px', // Fixed height for consistent centering
      marginBottom: '0px' // Remove space - text will be directly under
    },
    coffeeMug: {
      display: 'inline-block',
      position: 'relative',
      transform: 'scale(1.5)',
      transformOrigin: 'center center',
      animation: 'mugSmoothEntrance 1.2s ease-out forwards',
      opacity: 0,
      // FIX 2: Offset the mug slightly right to account for left-extending handle
      left: '6px' // Half the handle width to visually center the whole mug
    },
    mugBody: {
      width: '48px', // Fixed size for consistency
      height: '60px',
      backgroundColor: '#B22222',
      borderRadius: '3px',
      position: 'relative',
      boxShadow: `
        inset -6px 0 0 rgba(0, 0, 0, 0.2),
        inset 0 -6px 0 rgba(0, 0, 0, 0.15),
        0 3px 6px rgba(0, 0, 0, 0.25)
      `
    },
    mugHandle: {
      position: 'absolute',
      left: '-12px',
      top: '8px',
      width: '16px',
      height: '32px',
      border: '4px solid #B22222',
      borderRight: 'none',
      borderRadius: '12px 0 0 12px',
      background: 'transparent',
      boxShadow: 'inset 2px 0 0 rgba(0, 0, 0, 0.1)'
    },
    mugBodyBefore: {
      position: 'absolute',
      top: '6px',
      left: '6px',
      right: '6px',
      height: '3px',
      backgroundColor: 'rgba(0, 0, 0, 0.15)',
      borderRadius: '1.5px'
    },
    // FIX 3: Perfect text centering using single container
    textContainer: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      fontFamily: "'Courier New', Courier, monospace",
      fontSize: 'clamp(28px, 8vw, 36px)', // Responsive font size
      fontWeight: 'bold',
      color: '#B22222',
      letterSpacing: '0.05em' // Slight letter spacing for better appearance
    },
    textSpan: {
      display: 'inline-block',
      opacity: 0,
      animation: 'fadeInUp 0.8s forwards'
    },
    // FIX 4: Use exact spacing for perfect 1px separation
    textGap: {
      width: '1px', // Exact 1px spacing
      display: 'inline-block',
      opacity: 0,
      animation: 'fadeInUp 0.8s forwards',
      animationDelay: '1.25s'
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
          <span style={{ ...styles.textSpan, animationDelay: '1.2s' }}>break</span>
          <span style={styles.textGap}></span>
          <span style={{ ...styles.textSpan, animationDelay: '1.3s' }}>room</span>
        </div>
      </div>

      <style>{`
        @keyframes mugSmoothEntrance {
          0% { opacity: 0; transform: translateY(120px) scale(0.3); }
          100% { opacity: 1; transform: translateY(0) scale(1.5); }
        }

        @keyframes fadeInUp {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }

        /* Ensure perfect centering on all devices */
        @media (max-width: 480px) {
          .animation-container {
            padding: 0 10px;
          }
        }
      `}</style>
    </div>
  );
};

export default BreakroomLoading;