// Feature flag for the new autonomous Brain system.
// While the flag is off, the legacy orchestrator + iframe pipeline continues to run.
// Toggle at runtime: localStorage.setItem('feature_brains', '1') then reload.

export const FEATURE_BRAINS: boolean =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_FEATURE_BRAINS === '1') ||
  (typeof window !== 'undefined' && window.localStorage?.getItem('feature_brains') === '1');
