'use client';

import { useState, useRef, useEffect } from 'react';
import { STICKY_COLORS } from '../tools/types';
import type { StickyColor } from '../tools/types';

interface StickyNoteProps {
  id: string;
  text: string;
  color: StickyColor;
  author: string;
  x: number;
  y: number;
  onTextChange?: (id: string, text: string) => void;
  onColorChange?: (id: string, color: StickyColor) => void;
  onDelete?: (id: string) => void;
}

export function StickyNote({
  id, text, color, author, x, y,
  onTextChange, onColorChange, onDelete,
}: StickyNoteProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(text);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const colors = STICKY_COLORS[color];

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  const handleBlur = () => {
    setIsEditing(false);
    if (editText !== text) {
      onTextChange?.(id, editText);
    }
  };

  return (
    <div
      className="sticky-note"
      style={{
        left: x, top: y,
        background: colors.fill,
        borderColor: colors.border,
        color: colors.text,
      }}
      onDoubleClick={() => setIsEditing(true)}
    >
      {/* Color picker dots */}
      <div className="sticky-note__color-bar">
        <button
          className="sticky-note__color-toggle"
          onClick={() => setShowColorPicker(!showColorPicker)}
        >
          ●
        </button>
        {showColorPicker && (
          <div className="sticky-note__colors">
            {(Object.keys(STICKY_COLORS) as StickyColor[]).map(c => (
              <button
                key={c}
                className={`sticky-note__color-dot ${c === color ? 'sticky-note__color-dot--active' : ''}`}
                style={{ background: STICKY_COLORS[c].border }}
                onClick={() => { onColorChange?.(id, c); setShowColorPicker(false); }}
              />
            ))}
          </div>
        )}
        <button className="sticky-note__delete" onClick={() => onDelete?.(id)}>×</button>
      </div>

      {/* Content */}
      {isEditing ? (
        <textarea
          ref={textareaRef}
          className="sticky-note__textarea"
          value={editText}
          onChange={e => setEditText(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={e => { if (e.key === 'Escape') handleBlur(); }}
          style={{ color: colors.text }}
        />
      ) : (
        <p className="sticky-note__text">
          {text || 'Double-click to edit...'}
        </p>
      )}

      {/* Author */}
      <span className="sticky-note__author">{author}</span>

      {/* Resize handle */}
      <div className="sticky-note__resize-handle" />
    </div>
  );
}
