'use client';

import { VOTE_DOT_COLORS } from '../tools/types';

interface VoteDotProps {
  id: string;
  x: number;
  y: number;
  color: string;
  voter: string;
  onRemove?: (id: string) => void;
}

export function VoteDot({ id, x, y, color, voter, onRemove }: VoteDotProps) {
  return (
    <div
      className="vote-dot"
      style={{ left: x - 8, top: y - 8, background: color }}
      title={`Vote by ${voter}`}
      onClick={() => onRemove?.(id)}
    >
      <div className="vote-dot__pulse" style={{ borderColor: color }} />
    </div>
  );
}

interface VoteDotPickerProps {
  onColorSelect: (color: string) => void;
  selectedColor: string;
}

export function VoteDotPicker({ onColorSelect, selectedColor }: VoteDotPickerProps) {
  return (
    <div className="vote-picker">
      <span className="vote-picker__label">Vote Color</span>
      <div className="vote-picker__colors">
        {VOTE_DOT_COLORS.map(color => (
          <button
            key={color}
            className={`vote-picker__dot ${color === selectedColor ? 'vote-picker__dot--active' : ''}`}
            style={{ background: color }}
            onClick={() => onColorSelect(color)}
          />
        ))}
      </div>
    </div>
  );
}
