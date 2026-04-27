'use client';

export function CanvasPlaceholder() {
  return (
    <div className="flex items-center justify-center h-full bg-gray-950 border-l border-gray-800">
      <div className="text-center space-y-3">
        <div className="text-4xl">📋</div>
        <h3 className="text-sm font-medium text-gray-400">Canvas</h3>
        <p className="text-xs text-gray-600 max-w-[200px]">
          Grida canvas integration coming in Step 10.
          Agent responses will generate nodes here.
        </p>
      </div>
    </div>
  );
}
