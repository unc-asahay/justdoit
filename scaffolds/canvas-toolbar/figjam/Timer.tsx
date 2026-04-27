'use client';

import { useState, useEffect, useRef } from 'react';

interface TimerProps {
  id: string;
  initialDuration?: number;
  x: number;
  y: number;
  onComplete?: (id: string) => void;
  onRemove?: (id: string) => void;
}

export function Timer({ id, initialDuration = 300, x, y, onComplete, onRemove }: TimerProps) {
  const [duration, setDuration] = useState(initialDuration);
  const [remaining, setRemaining] = useState(initialDuration);
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isRunning && remaining > 0) {
      intervalRef.current = setInterval(() => {
        setRemaining(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!);
            setIsRunning(false);
            setIsComplete(true);
            onComplete?.(id);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning, id, onComplete, remaining]);

  const progress = duration > 0 ? (remaining / duration) * 100 : 0;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference * (1 - progress / 100);

  const toggleTimer = () => {
    if (isComplete) {
      setRemaining(duration);
      setIsComplete(false);
    }
    setIsRunning(!isRunning);
  };

  const presets = [60, 180, 300, 600];

  return (
    <div
      className={`timer-widget ${isComplete ? 'timer-widget--complete' : ''}`}
      style={{ left: x, top: y }}
    >
      <button className="timer-widget__close" onClick={() => onRemove?.(id)}>×</button>

      <svg className="timer-widget__ring" viewBox="0 0 100 100">
        <circle className="timer-widget__track" cx="50" cy="50" r="45" />
        <circle
          className="timer-widget__progress"
          cx="50" cy="50" r="45"
          style={{
            strokeDasharray: circumference,
            strokeDashoffset,
            stroke: isComplete ? '#EF4444' : remaining < 30 ? '#F59E0B' : '#10B981',
          }}
        />
      </svg>

      <div className="timer-widget__display">
        <span className="timer-widget__time">
          {minutes}:{String(seconds).padStart(2, '0')}
        </span>
      </div>

      <div className="timer-widget__controls">
        <button className="timer-widget__btn" onClick={toggleTimer}>
          {isComplete ? '↻' : isRunning ? '⏸' : '▶'}
        </button>
      </div>

      {!isRunning && !isComplete && (
        <div className="timer-widget__presets">
          {presets.map(p => (
            <button
              key={p}
              className={`timer-widget__preset ${duration === p ? 'timer-widget__preset--active' : ''}`}
              onClick={() => { setDuration(p); setRemaining(p); }}
            >
              {p >= 60 ? `${p / 60}m` : `${p}s`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
