'use client';

import { useState } from 'react';

interface CheckItem {
  id: string;
  text: string;
  checked: boolean;
}

interface ChecklistProps {
  id: string;
  title: string;
  items: CheckItem[];
  x: number;
  y: number;
  onToggle?: (checklistId: string, itemId: string) => void;
  onAddItem?: (checklistId: string, text: string) => void;
  onRemoveItem?: (checklistId: string, itemId: string) => void;
  onRemove?: (id: string) => void;
}

export function Checklist({
  id, title, items, x, y,
  onToggle, onAddItem, onRemoveItem, onRemove,
}: ChecklistProps) {
  const [newItem, setNewItem] = useState('');

  const completedCount = items.filter(i => i.checked).length;
  const progress = items.length > 0 ? (completedCount / items.length) * 100 : 0;

  const handleAdd = () => {
    if (!newItem.trim()) return;
    onAddItem?.(id, newItem.trim());
    setNewItem('');
  };

  return (
    <div className="checklist-widget" style={{ left: x, top: y }}>
      <div className="checklist-widget__header">
        <span className="checklist-widget__icon">☑️</span>
        <h4 className="checklist-widget__title">{title}</h4>
        <span className="checklist-widget__count">
          {completedCount}/{items.length}
        </span>
        <button className="checklist-widget__close" onClick={() => onRemove?.(id)}>×</button>
      </div>

      <div className="checklist-widget__progress-track">
        <div
          className="checklist-widget__progress-bar"
          style={{
            width: `${progress}%`,
            background: progress === 100
              ? '#10B981'
              : `linear-gradient(90deg, #3B82F6, #8B5CF6)`,
          }}
        />
      </div>

      <div className="checklist-widget__items">
        {items.map(item => (
          <div
            key={item.id}
            className={`checklist-widget__item ${item.checked ? 'checklist-widget__item--done' : ''}`}
          >
            <button
              className="checklist-widget__checkbox"
              onClick={() => onToggle?.(id, item.id)}
            >
              {item.checked ? '☑' : '☐'}
            </button>
            <span className="checklist-widget__item-text">{item.text}</span>
            <button
              className="checklist-widget__item-remove"
              onClick={() => onRemoveItem?.(id, item.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="checklist-widget__add">
        <input
          className="checklist-widget__input"
          value={newItem}
          onChange={e => setNewItem(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="Add item..."
        />
        <button className="checklist-widget__add-btn" onClick={handleAdd}>+</button>
      </div>
    </div>
  );
}
