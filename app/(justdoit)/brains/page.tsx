'use client';

import { BrainsPanel } from '@/scaffolds/brains-panel/BrainsPanel';
import { BrainDebugPanel } from '@/scaffolds/brains-debug/BrainDebugPanel';

export default function BrainsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <BrainsPanel />
      </div>
      <BrainDebugPanel />

      <style jsx global>{`
        @keyframes brain-pulse {
          0% { box-shadow: 0 0 0 0 currentColor; }
          70% { box-shadow: 0 0 0 6px rgba(0,0,0,0); }
          100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
        }
      `}</style>
    </div>
  );
}
