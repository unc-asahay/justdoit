'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useSettings } from '@/lib/ai/settings-store';

interface ModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
  compact?: boolean;
}

const COMMON_MODELS = [
  'claude-3-5-sonnet-20241022',
  'gpt-4o',
  'gpt-4o-mini',
  'gemini-2.0-flash',
  'deepseek-chat',
];

export function ModelSelector({ value, onChange, compact = false }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const { settings } = useSettings();

  const displayValue = value || settings.defaultModel;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    setSearch('');
  };

  const filteredModels = COMMON_MODELS.filter(m => m.includes(search.toLowerCase()));
  if (search && !COMMON_MODELS.includes(search)) {
    filteredModels.unshift(search); // Allow custom model typing
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`
          flex items-center gap-2 rounded-lg border transition-all text-xs
          ${open
            ? 'bg-gray-800 border-blue-500 ring-1 ring-blue-500'
            : 'bg-gray-900 border-gray-700 hover:border-gray-600'
          }
          ${compact ? 'px-2 py-1' : 'px-3 py-1.5'}
        `}
      >
        <span className="text-sm">⚙️</span>
        <span className="text-gray-300 max-w-[120px] truncate">
          {displayValue}
        </span>
        <span className={`text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {open && (
        <div
          className={`
            absolute z-50 bg-gray-900 border border-gray-600 rounded-xl shadow-2xl
            overflow-hidden p-2
            ${compact ? 'w-64' : 'w-72'}
          `}
          style={{ top: 'calc(100% + 6px)', left: 0 }}
        >
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Type any model ID..."
            className="w-full bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500 mb-2"
          />

          <div className="max-h-60 overflow-y-auto">
            {filteredModels.map(model => (
              <button
                key={model}
                onClick={() => handleSelect(model)}
                className={`
                  w-full text-left px-3 py-2 text-sm rounded-md transition-colors
                  ${model === displayValue ? 'bg-blue-900/40 text-blue-300' : 'text-gray-300 hover:bg-gray-800'}
                `}
              >
                {model}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
