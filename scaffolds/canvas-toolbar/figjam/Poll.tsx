'use client';

import { useState, useMemo } from 'react';

interface PollOption {
  id: string;
  text: string;
  votes: number;
}

interface PollProps {
  id: string;
  title: string;
  options: PollOption[];
  x: number;
  y: number;
  onVote?: (pollId: string, optionId: string) => void;
  onAddOption?: (pollId: string, text: string) => void;
  onRemove?: (id: string) => void;
}

export function Poll({ id, title, options, x, y, onVote, onAddOption, onRemove }: PollProps) {
  const [newOption, setNewOption] = useState('');
  const [votedOptionId, setVotedOptionId] = useState<string | null>(null);

  const totalVotes = useMemo(
    () => options.reduce((sum, o) => sum + o.votes, 0),
    [options],
  );

  const handleVote = (optionId: string) => {
    if (votedOptionId) return;
    setVotedOptionId(optionId);
    onVote?.(id, optionId);
  };

  const handleAddOption = () => {
    if (!newOption.trim()) return;
    onAddOption?.(id, newOption.trim());
    setNewOption('');
  };

  return (
    <div className="poll-widget" style={{ left: x, top: y }}>
      <div className="poll-widget__header">
        <span className="poll-widget__icon">📊</span>
        <h4 className="poll-widget__title">{title}</h4>
        <button className="poll-widget__close" onClick={() => onRemove?.(id)}>×</button>
      </div>

      <div className="poll-widget__options">
        {options.map(option => {
          const pct = totalVotes > 0 ? Math.round((option.votes / totalVotes) * 100) : 0;
          const isVoted = votedOptionId === option.id;
          return (
            <button
              key={option.id}
              className={`poll-widget__option ${isVoted ? 'poll-widget__option--voted' : ''} ${votedOptionId ? 'poll-widget__option--locked' : ''}`}
              onClick={() => handleVote(option.id)}
              disabled={!!votedOptionId}
            >
              <div
                className="poll-widget__bar"
                style={{ width: `${pct}%` }}
              />
              <span className="poll-widget__option-text">{option.text}</span>
              <span className="poll-widget__option-pct">{pct}%</span>
              <span className="poll-widget__option-count">{option.votes}</span>
            </button>
          );
        })}
      </div>

      <div className="poll-widget__add">
        <input
          className="poll-widget__input"
          value={newOption}
          onChange={e => setNewOption(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAddOption()}
          placeholder="Add option..."
        />
        <button className="poll-widget__add-btn" onClick={handleAddOption}>+</button>
      </div>

      <div className="poll-widget__footer">
        {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
