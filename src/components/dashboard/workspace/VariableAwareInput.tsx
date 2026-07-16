import { ChangeEvent, KeyboardEvent, useLayoutEffect, useRef, useState } from "react";

import { detectVariableToken, splitVariableSegments } from "./utils";

interface SuggestionState {
  start: number;
  end: number;
  matches: string[];
  activeIndex: number;
}

interface VariableAwareInputProps {
  value: string;
  onChange: (value: string) => void;
  environmentVariableKeys: string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function VariableAwareInput({
  value,
  onChange,
  environmentVariableKeys,
  placeholder,
  className = "",
  disabled = false,
}: VariableAwareInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLSpanElement>(null);
  const [suggestion, setSuggestion] = useState<SuggestionState | null>(null);
  const [suggestionLeft, setSuggestionLeft] = useState(0);

  useLayoutEffect(() => {
    if (!suggestion || !markerRef.current || !wrapperRef.current) {
      return;
    }

    const markerRect = markerRef.current.getBoundingClientRect();
    const wrapperRect = wrapperRef.current.getBoundingClientRect();
    setSuggestionLeft(markerRect.left - wrapperRect.left);
  }, [suggestion, value]);

  function updateSuggestions(nextValue: string, cursor: number) {
    if (environmentVariableKeys.length === 0) {
      setSuggestion(null);
      return;
    }

    const token = detectVariableToken(nextValue, cursor);
    if (!token) {
      setSuggestion(null);
      return;
    }

    const matches = environmentVariableKeys.filter((key) =>
      key.toLowerCase().includes(token.query.toLowerCase()),
    );

    if (matches.length === 0) {
      setSuggestion(null);
      return;
    }

    setSuggestion({ start: token.start, end: token.end, matches, activeIndex: 0 });
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const nextValue = event.target.value;
    onChange(nextValue);
    updateSuggestions(nextValue, event.target.selectionStart ?? nextValue.length);
  }

  function applySuggestion(key: string) {
    if (!suggestion) {
      return;
    }

    const nextValue = `${value.slice(0, suggestion.start)}{{${key}}}${value.slice(suggestion.end)}`;
    onChange(nextValue);
    setSuggestion(null);

    const cursor = suggestion.start + key.length + 4;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(cursor, cursor);
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!suggestion) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSuggestion((previous) =>
        previous ? { ...previous, activeIndex: (previous.activeIndex + 1) % previous.matches.length } : previous,
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSuggestion((previous) =>
        previous
          ? {
              ...previous,
              activeIndex: (previous.activeIndex - 1 + previous.matches.length) % previous.matches.length,
            }
          : previous,
      );
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      applySuggestion(suggestion.matches[suggestion.activeIndex]);
    } else if (event.key === "Escape") {
      setSuggestion(null);
    }
  }

  const segments = splitVariableSegments(value);

  return (
    <div ref={wrapperRef} className="relative">
      <div
        aria-hidden
        className={`${className} pointer-events-none absolute inset-0 overflow-hidden whitespace-pre`}
        style={{ background: "transparent", borderColor: "transparent", boxShadow: "none", color: "var(--text)" }}
      >
        {value.length === 0 && placeholder ? (
          <span style={{ color: "var(--muted)" }}>{placeholder}</span>
        ) : (
          segments.map((segment, index) =>
            segment.isVariable ? (
              <span
                key={index}
                style={{
                  color: environmentVariableKeys.includes(segment.variableName ?? "")
                    ? "var(--env-var)"
                    : "var(--env-var-missing)",
                  fontWeight: 600,
                }}
              >
                {segment.text}
              </span>
            ) : (
              <span key={index}>{segment.text}</span>
            ),
          )
        )}
      </div>

      {suggestion ? (
        <div
          aria-hidden
          className={`${className} pointer-events-none absolute inset-0 overflow-hidden whitespace-pre`}
          style={{ visibility: "hidden" }}
        >
          {value.slice(0, suggestion.start)}
          <span ref={markerRef} />
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        disabled={disabled}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        className={`${className} relative bg-transparent`}
        style={{ color: "transparent", caretColor: "var(--text)" }}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => window.setTimeout(() => setSuggestion(null), 120)}
      />

      {suggestion ? (
        <div
          className="absolute top-full z-20 mt-1 max-h-48 w-56 max-w-xs overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg"
          style={{ left: suggestionLeft }}
        >
          {suggestion.matches.map((key, index) => (
            <button
              type="button"
              key={key}
              className={`block w-full px-3 py-1.5 text-left text-xs font-mono ${
                index === suggestion.activeIndex ? "bg-[var(--surface-hover)]" : ""
              }`}
              onMouseDown={(event) => {
                event.preventDefault();
                applySuggestion(key);
              }}
            >
              <span style={{ color: "var(--env-var)" }}>{"{{"}</span>
              {key}
              <span style={{ color: "var(--env-var)" }}>{"}}"}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
