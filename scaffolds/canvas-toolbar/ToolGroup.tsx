'use client';

import type { ReactNode } from 'react';

interface ToolGroupProps {
  label: string;
  accentColor: string;
  children: ReactNode;
}

export function ToolGroup({ label, accentColor, children }: ToolGroupProps) {
  return (
    <div className="tool-group">
      <span
        className="tool-group__label"
        style={{ color: accentColor }}
      >
        {label}
      </span>
      <div className="tool-group__buttons">
        {children}
      </div>
    </div>
  );
}
