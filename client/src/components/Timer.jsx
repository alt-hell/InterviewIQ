import React from 'react'
import { buildStyles, CircularProgressbar } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';

function Timer({ timeLeft, totalTime }) {
    const percentage = (timeLeft / totalTime) * 100;
    const isUrgent = timeLeft <= 10 && timeLeft > 0;
    const isExpired = timeLeft === 0;

    return (
      <div className={`w-20 h-20 transition-transform duration-300 ${isUrgent ? 'scale-110' : ''}`}>
        <CircularProgressbar
          value={percentage}
          text={`${timeLeft}s`}
          styles={buildStyles({
            textSize: "28px",
            pathColor: isExpired ? "#6b7280" : isUrgent ? "#ef4444" : "#10b981",
            textColor: isExpired ? "#6b7280" : isUrgent ? "#ef4444" : "#ef4444",
            trailColor: "#e5e7eb",
            pathTransitionDuration: 0.5,
          })}
        />
        {isUrgent && (
          <p className="text-center text-xs text-red-500 font-semibold mt-1 animate-pulse">
            Hurry up!
          </p>
        )}
      </div>
    )
}

export default Timer
