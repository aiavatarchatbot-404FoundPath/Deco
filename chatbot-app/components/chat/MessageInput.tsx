// components/chat/MessageInput.tsx
'use client';

import React, { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';
import { Send, Smile } from 'lucide-react';

interface MessageInputProps {
  /** Controlled value from parent */
  value: string;
  /** Controlled setter from parent */
  onChange: (value: string) => void;
  /** Send handler (called with trimmed content) */
  onSendMessage: (content: string) => void;

  /** Anonymous mode state + toggle (from parent) */
  isAnonymous: boolean;
  onToggleAnonymous: (anonymous: boolean) => void;

  /** Disable input + send */
  disabled?: boolean;

  /** Optional UX niceties */
  placeholder?: string;          // default provided below
  maxLength?: number;            // shows live counter if set (e.g., 1000)
  hotkeysHint?: boolean;         // show hint row (default true)
}

export default function MessageInput({
  value,
  onChange,
  onSendMessage,
  isAnonymous,
  onToggleAnonymous,
  disabled = false,
  placeholder = 'Type when you’re ready. Enter to send • Shift+Enter for newline • Esc to clear',
  maxLength,
  hotkeysHint = true,
}: MessageInputProps) {
  // === Internal state for Undo/Edit affordances ===
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);
  const editTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Simple throttle to avoid accidental double-send on fast key repeats
  const lastSendAtRef = useRef<number>(0);

  // Auto-resize Textarea (no extra libs)
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'; // cap at ~5-6 lines
  }, [value]);

  /** Clears timers on unmount */
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      if (editTimerRef.current) clearTimeout(editTimerRef.current);
    };
  }, []);

  /** Send with accessibility + safety defaults */
  const send = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;

    const now = Date.now();
    if (now - lastSendAtRef.current < 250) return; // throttle
    lastSendAtRef.current = now;

    onSendMessage(trimmed);
    onChange(''); // clear immediately

    // Setup Undo (3s) and Edit (30s) windows
    setLastSent(trimmed);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setLastSent(null), 3000);

    setCanEdit(true);
    if (editTimerRef.current) clearTimeout(editTimerRef.current);
    editTimerRef.current = setTimeout(() => setCanEdit(false), 30000);
  };

  /** Keyboard behavior:
   *  - Enter = send (unless Shift or composing with IME)
   *  - Shift+Enter = newline
   *  - Cmd/Ctrl+Enter = send
   *  - Esc = clear
   */
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Avoid intercepting while using an IME (e.g., Chinese, Japanese)
    // Ignore Enter while user is composing text (IME for Chinese, Japanese, etc.)
    if ((e.nativeEvent as any).isComposing) {
      return;
    }

    if ((e.key === 'Enter' && (e.metaKey || e.ctrlKey)) && !disabled) {
      e.preventDefault();
      send();
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey && !disabled) {
      e.preventDefault();
      send();
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      onChange('');
      return;
    }
  };

  const remaining = useMemo(() => {
    if (typeof maxLength !== 'number') return undefined;
    return maxLength - value.length;
  }, [value, maxLength]);

  const onTextChange = (t: string) => {
    if (typeof maxLength === 'number') {
      // Enforce max length in UI (still pass full control to parent)
      if (t.length > maxLength) t = t.slice(0, maxLength);
    }
    onChange(t);
  };

  return (
    <div className="border-t border-gray-200 bg-white px-6 py-4">
      {/* === Anonymous Mode Toggle (agency + choice) === */}
      <div className="flex items-center justify-end mb-3">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>Anonymous mode:</span>
          <Switch
            checked={isAnonymous}
            onCheckedChange={onToggleAnonymous}
            className="data-[state=checked]:bg-green-500"
            aria-label="Toggle Anonymous mode"
          />
        </div>
      </div>

      {/* === Input Row === */}
      <div className="flex items-end gap-3">
        {/* Emoji trigger (non-blocking placeholder; wire your picker later) */}
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 p-2 h-auto"
          disabled={disabled}
          aria-label="Insert emoji"
          type="button"
        >
          <Smile className="h-5 w-5 text-gray-500" />
        </Button>

        {/* Textarea (controlled) */}
        <div className="flex-1">
          <Textarea
            ref={taRef}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onTextChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            className="min-h-[44px] max-h-52 resize-none border-gray-300 focus:border-blue-500 focus:ring-blue-500"
            aria-label="Message composer"
          />
          {/* Character counter (optional) */}
          {typeof remaining === 'number' && (
            <div
              className={`mt-1 text-[11px] ${
                remaining < 0 ? 'text-red-600' : remaining < 50 ? 'text-amber-600' : 'text-gray-500'
              }`}
              aria-live="polite"
            >
              {remaining} characters left
            </div>
          )}
        </div>

        {/* Send button */}
        <Button
          onClick={send}
          disabled={!value.trim() || disabled}
          className="mb-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-full"
          aria-label="Send message"
          type="button"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>

      {/* === Helper / Hints row === */}
      {hotkeysHint && (
        <div className="mt-2 text-xs text-gray-500 text-center">
          Private by default. Enter to send • Shift+Enter for newline • Cmd/Ctrl+Enter to send • Esc to clear.
        </div>
      )}

      {/* === Undo / Edit affordances (trauma-informed agency) === */}
      {lastSent && (
        <div className="mt-2 flex items-center justify-center gap-2 text-xs">
          <Button
            size="sm"
            variant="secondary"
            type="button"
            className="h-7 px-2 py-0 text-xs"
            onClick={() => {
              // Undo = just forget the lastSent "commit". Parent already got the message;
              // This is a visual affordance — if you need to retract on backend,
              // call a prop here to delete the last message server-side.
              setLastSent(null);
            }}
          >
            Undo
          </Button>
          {canEdit && (
            <Button
              size="sm"
              variant="ghost"
              type="button"
              className="h-7 px-2 py-0 text-xs"
              onClick={() => {
                onChange(lastSent);
                setLastSent(null);
              }}
            >
              Edit last
            </Button>
          )}
          {!canEdit && <span className="text-gray-500">Edit window ended</span>}
        </div>
      )}
    </div>
  );
}
