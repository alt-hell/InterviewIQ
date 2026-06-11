import React from 'react'
import { buildStyles, CircularProgressbar } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';

function Timer({ timeLeft, totalTime }) {
    const percentage = (timeLeft / totalTime) * 100;
    const isExpired  = timeLeft === 0;
    const isUrgent   = timeLeft <= 15 && timeLeft > 0;   // red + pulse
    const isWarning  = timeLeft <= 30 && timeLeft > 15;  // amber

    const pathColor = isExpired ? '#6b7280'
                    : isUrgent  ? '#ef4444'
                    : isWarning ? '#f59e0b'
                    : '#10b981';

    const textColor = isExpired ? '#6b7280'
                    : isUrgent  ? '#ef4444'
                    : isWarning ? '#d97706'
                    : '#374151';

    return (
      <div className={`w-20 h-20 transition-transform duration-300 ${isUrgent ? 'scale-110' : ''}`}>
        <CircularProgressbar
          value={percentage}
          text={`${timeLeft}s`}
          styles={buildStyles({
            textSize: '24px',
            pathColor,
            textColor,
            trailColor: '#e5e7eb',
            pathTransitionDuration: 0.6,
          })}
        />
        {isUrgent && (
          <p className="text-center text-xs text-red-500 font-bold mt-1 animate-pulse">
            Hurry up!
          </p>
        )}
        {isWarning && (
          <p className="text-center text-xs text-amber-500 font-medium mt-1">
            Wrapping up…
          </p>
        )}
      </div>
    );
}

export default Timer;
