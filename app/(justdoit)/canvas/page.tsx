'use client';

import { Suspense } from 'react';
import { CanvasPageInner } from './CanvasPageInner';

function LoadingState() {
  return (
    <div className="flex items-center justify-center h-full bg-gray-950">
      <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );
}

export default function CanvasPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <CanvasPageInner />
    </Suspense>
  );
}
