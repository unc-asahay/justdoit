'use client';

import { useState, useEffect } from 'react';
import { REACTION_EMOJIS } from '../tools/types';

interface ReactionProps {
  id: string;
  emoji: string;
  x: number;
  y: number;
  reactor: string;
  autoFade?: boolean;
  onFaded?: (id: string) => void;
}

export function Reaction({ id, emoji, x, y, reactor, autoFade = true, onFaded }: ReactionProps) {
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    if (!autoFade) return;
    const fadeTimer = setTimeout(() => {
      setOpacity(0);
      setTimeout(() => onFaded?.(id), 500);
    }, 5000);
    return () => clearTimeout(fadeTimer);
  }, [autoFade, id, onFaded]);

  return (
    <div
      className="reaction"
      style={{ left: x - 16, top: y - 16, opacity }}
      title={`${emoji} by ${reactor}`}
    >
      <span className="reaction__emoji">{emoji}</span>
    </div>
  );
}

interface ReactionPickerProps {
  onSelect: (emoji: string) => void;
}

export function ReactionPicker({ onSelect }: ReactionPickerProps) {
  return (
    <div className="reaction-picker">
      {REACTION_EMOJIS.map(emoji => (
        <button
          key={emoji}
          className="reaction-picker__btn"
          onClick={() => onSelect(emoji)}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
