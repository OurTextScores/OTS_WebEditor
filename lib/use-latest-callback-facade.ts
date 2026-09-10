import { useCallback, useRef, type MutableRefObject } from 'react';

type Callback = (...args: never[]) => unknown;

/**
 * Exposes a stable callback plus its implementation slot. The caller updates the
 * slot after defining the current implementation, before an effect or event can invoke it.
 */
export function useLatestCallbackFacade<T extends Callback>(
  initialImplementation: T,
): readonly [T, MutableRefObject<T>] {
  const implementationRef = useRef(initialImplementation);
  const callback = useCallback(
    (...args: Parameters<T>) => implementationRef.current(...args),
    [],
  ) as T;
  return [callback, implementationRef] as const;
}
