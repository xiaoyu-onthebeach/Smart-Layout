import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * A callback whose identity never changes, but which always calls the latest `fn` passed in — so
 * a parent can hand a memoized child an inline handler without that new function on every render
 * defeating the child's memo (and without the child ever calling a stale version of it).
 */
export function useLatestCallback<Args extends unknown[], R>(fn: (...args: Args) => R): (...args: Args) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: Args) => ref.current(...args), []);
}
