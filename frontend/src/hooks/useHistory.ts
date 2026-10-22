/**
 * useHistory.ts: A generic undo/redo history stack with debounced pushes.
 * Used by the overlay editor to allow undoing drag/resize operations without
 * creating a history entry for every pixel moved.
 */
import { useEffect, useState, useRef } from "react";

/**
 * useHistory provides a bounded undo/redo stack for any serializable value.
 * Pushes are debounced by debounceMs to coalesce rapid changes (e.g. dragging)
 * into a single history entry. The stack is capped at 50 entries.
 *
 * @param initial - The initial state value.
 * @param debounceMs - How long to wait before committing a pushed state (default 400 ms).
 */
export function useHistory<T>(initial: T, debounceMs = 400) {
  const [stack, setStack] = useState<T[]>([initial]);
  const [index, setIndex] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // A pending debounced push must not commit after unmount: it would set
  // state on a dead component, and in tests it fires after the DOM is gone.
  useEffect(() => () => clearTimeout(timer.current), []);

  const push = (state: T) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setStack((prev) => {
        const newStack = [...prev.slice(0, index + 1), state].slice(-50);
        setIndex(newStack.length - 1);
        return newStack;
      });
    }, debounceMs);
  };

  const undo = () => {
    if (index > 0) setIndex((i) => i - 1);
  };
  const redo = () => {
    if (index < stack.length - 1) setIndex((i) => i + 1);
  };

  return {
    current: stack[index],
    push,
    undo,
    redo,
    canUndo: index > 0,
    canRedo: index < stack.length - 1,
  };
}
