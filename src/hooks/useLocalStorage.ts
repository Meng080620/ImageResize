import { useState, useEffect, useRef } from 'react';

export function useLocalStorage<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as T) : initial;
    } catch {
      return initial;
    }
  });

  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return; }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage full or private mode — silently ignore
    }
  }, [key, value]);

  return [value, setValue];
}
