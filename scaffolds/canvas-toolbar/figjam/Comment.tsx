'use client';

import { useState } from 'react';

interface CommentProps {
  id: string;
  text: string;
  author: string;
  timestamp: number;
  x: number;
  y: number;
  resolved?: boolean;
  onResolve?: (id: string) => void;
  onDelete?: (id: string) => void;
  onEdit?: (id: string, text: string) => void;
}

export function Comment({
  id, text, author, timestamp, x, y,
  resolved = false, onResolve, onDelete, onEdit,
}: CommentProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(text);

  const handleSave = () => {
    setIsEditing(false);
    if (editText !== text) onEdit?.(id, editText);
  };

  const timeAgo = formatTimeAgo(timestamp);

  return (
    <div
      className={`comment-widget ${resolved ? 'comment-widget--resolved' : ''}`}
      style={{ left: x, top: y }}
    >
      <div className="comment-widget__pointer" />

      <div className="comment-widget__header">
        <div className="comment-widget__avatar">
          {author.charAt(0).toUpperCase()}
        </div>
        <div className="comment-widget__meta">
          <span className="comment-widget__author">{author}</span>
          <span className="comment-widget__time">{timeAgo}</span>
        </div>
        <div className="comment-widget__actions">
          <button onClick={() => onResolve?.(id)} title={resolved ? 'Reopen' : 'Resolve'}>
            {resolved ? '↩' : '✓'}
          </button>
          <button onClick={() => onDelete?.(id)} title="Delete">×</button>
        </div>
      </div>

      {isEditing ? (
        <textarea
          className="comment-widget__edit"
          value={editText}
          onChange={e => setEditText(e.target.value)}
          onBlur={handleSave}
          onKeyDown={e => { if (e.key === 'Escape') handleSave(); }}
          autoFocus
        />
      ) : (
        <p
          className="comment-widget__text"
          onDoubleClick={() => setIsEditing(true)}
        >
          {text}
        </p>
      )}
    </div>
  );
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
