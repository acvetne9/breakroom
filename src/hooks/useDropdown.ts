/**
 * useDropdown - shared dropdown mechanics
 *
 * Encapsulates the open/close plumbing that dropdown-style inputs all duplicate:
 * - open state plus open/close/toggle helpers
 * - refs for the trigger/input and the dropdown container
 * - an outside-click handler (mousedown + touchstart) that closes when the
 *   pointer lands outside BOTH the trigger and the dropdown container
 * - Escape-to-close
 * - a blur-timeout close (delay closing on input blur), with automatic cleanup
 *
 * It intentionally owns ONLY the generic mechanics. Result sourcing (network
 * search, static filtering, caching, neighborhood matching, scroll-guards,
 * "was closed intentionally" tracking, etc.) stays in the consuming component.
 * The optional callbacks/guards below let each component keep its exact
 * side-effects and timing without the hook needing to know about them.
 */

import { useState, useRef, useCallback, useEffect } from "react";

export interface UseDropdownOptions {
  /**
   * Optional guard consulted before an outside-click closes the dropdown.
   * Return `true` to abort the close (e.g. while scrolling inside the list).
   */
  shouldIgnoreOutsideClick?: () => boolean;
  /**
   * Called right before the dropdown is closed by an outside click. Lets the
   * consumer record intent (e.g. `wasClosedIntentionally`) or fire callbacks.
   */
  onOutsideClose?: () => void;
  /** Called right before the dropdown is closed by Escape. */
  onEscapeClose?: () => void;
  /**
   * Called after the blur-timeout fires and the dropdown has been closed.
   * Runs inside the delayed timeout so timing matches a manual setTimeout.
   */
  onBlurClose?: () => void;
  /** Delay (ms) before a blur closes the dropdown. Defaults to 150. */
  blurCloseDelay?: number;
}

export interface UseDropdown {
  /** Whether the dropdown is currently open. */
  isOpen: boolean;
  /** Directly set the open state (escape hatch for existing conditional logic). */
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  open: () => void;
  close: () => void;
  toggle: () => void;
  /** Attach to the input/trigger element. */
  triggerRef: React.RefObject<HTMLInputElement>;
  /** Attach to the dropdown container element. */
  dropdownRef: React.RefObject<HTMLDivElement>;
  /** onKeyDown handler that closes the dropdown on Escape. Compose as needed. */
  handleKeyDown: (event: React.KeyboardEvent) => void;
  /** Schedule a delayed close (call from the input's onBlur). */
  scheduleBlurClose: () => void;
  /** Cancel a pending blur close (call from onFocus / on select). */
  cancelBlurClose: () => void;
}

export function useDropdown(options: UseDropdownOptions = {}): UseDropdown {
  const { shouldIgnoreOutsideClick, onOutsideClose, onEscapeClose, onBlurClose, blurCloseDelay = 150 } = options;

  const [isOpen, setIsOpen] = useState(false);

  const triggerRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Keep the open state and option callbacks reachable from the (mount-only)
  // outside-click listener without re-subscribing on every render/state change.
  const isOpenRef = useRef(isOpen);
  const optionsRef = useRef(options);
  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);
  useEffect(() => {
    optionsRef.current = options;
  });

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  // Outside click / tap closes the dropdown (mousedown + touchstart).
  useEffect(() => {
    const handleOutside = (event: MouseEvent | TouchEvent) => {
      // Nothing to close.
      if (!isOpenRef.current) return;

      const ignore = optionsRef.current.shouldIgnoreOutsideClick;
      if (ignore && ignore()) return;

      const target = event.target as Node;
      const trigger = triggerRef.current;
      const dropdown = dropdownRef.current;

      // Ignore clicks landing on the trigger or inside the dropdown.
      if ((trigger && trigger.contains(target)) || (dropdown && dropdown.contains(target))) {
        return;
      }

      optionsRef.current.onOutsideClose?.();
      setIsOpen(false);
    };

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, []);

  // Cleanup any pending blur timeout on unmount.
  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        onEscapeClose?.();
        setIsOpen(false);
      }
    },
    [onEscapeClose],
  );

  const cancelBlurClose = useCallback(() => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
  }, []);

  const scheduleBlurClose = useCallback(() => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
    }
    blurTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
      onBlurClose?.();
    }, blurCloseDelay);
  }, [onBlurClose, blurCloseDelay]);

  return {
    isOpen,
    setIsOpen,
    open,
    close,
    toggle,
    triggerRef,
    dropdownRef,
    handleKeyDown,
    scheduleBlurClose,
    cancelBlurClose,
  };
}

export default useDropdown;
