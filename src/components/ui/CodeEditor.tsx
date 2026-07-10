"use client";

import { useRef, useEffect, type ReactElement } from "react";
import { EditorView, keymap, placeholder as phExtension } from "@codemirror/view";
import { EditorState, type Extension } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { bracketMatching, foldGutter, syntaxHighlighting, defaultHighlightStyle, HighlightStyle } from "@codemirror/language";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { autocompletion, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { linter, lintGutter } from "@codemirror/lint";
import { tags } from "@lezer/highlight";

const codeHighlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, color: "var(--code-key)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--code-string)" },
  { tag: [tags.number, tags.integer, tags.float], color: "var(--code-number)" },
  { tag: [tags.bool, tags.null, tags.atom], color: "var(--code-boolean)" },
  { tag: tags.keyword, color: "var(--code-boolean)" },
  {
    tag: [tags.punctuation, tags.separator, tags.brace, tags.squareBracket, tags.paren],
    color: "var(--muted)",
  },
  { tag: tags.comment, color: "var(--muted)", fontStyle: "italic" },
]);

export type CodeLanguage = "json" | "xml" | "html" | "javascript" | "css" | "text" | "graphql";

const langExtensions: Record<string, () => Extension> = {
  json: () => json(),
  xml: () => xml(),
  javascript: () => javascript(),
  html: () => html(),
  css: () => css(),
  graphql: () => javascript(), // graphql uses JS-like syntax highlighting
  text: () => [],
};

interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: CodeLanguage;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  minHeight?: string;
}

export function CodeEditor({
  value,
  onChange,
  language = "json",
  readOnly = false,
  placeholder = "",
  className = "",
  style,
  minHeight = "120px",
}: CodeEditorProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Create editor once
  useEffect(() => {
    if (!containerRef.current) return;

    const langExt = langExtensions[language]?.() ?? [];

    const extensions: Extension[] = [
      keymap.of([...defaultKeymap, ...historyKeymap, ...closeBracketsKeymap, ...searchKeymap]),
      history(),
      bracketMatching(),
      closeBrackets(),
      foldGutter(),
      autocompletion(),
      highlightSelectionMatches(),
      syntaxHighlighting(codeHighlightStyle),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      lintGutter(),
      ...(language === "json" ? [linter(jsonParseLinter())] : []),
      langExt,
      EditorView.lineWrapping,
      EditorView.theme({
        "&": { minHeight, backgroundColor: "var(--bg-elevated)", color: "var(--text)" },
        ".cm-content": { fontFamily: "var(--font-mono)", padding: "8px 0", caretColor: "var(--text)" },
        ".cm-line": { padding: "0 8px" },
        ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--text)" },
        ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
          backgroundColor: "var(--ring) !important",
        },
        ".cm-gutters": { backgroundColor: "var(--bg-elevated)", color: "var(--muted)", border: "none" },
        ".cm-tooltip": {
          backgroundColor: "var(--surface)",
          color: "var(--text)",
          border: "1px solid var(--border)",
          borderRadius: "0.5rem",
        },
        ".cm-tooltip-lint": { padding: "0" },
        ".cm-diagnostic": {
          padding: "0.4rem 0.6rem",
          fontSize: "0.75rem",
          fontFamily: "var(--font-mono)",
        },
        ".cm-diagnostic-error": { borderLeft: "3px solid #f93e3e" },
        ".cm-lintRange-error": {
          backgroundImage:
            "linear-gradient(to right, #f93e3e 70%, transparent 30%)",
          backgroundPosition: "bottom",
          backgroundSize: "4px 2px",
          backgroundRepeat: "repeat-x",
        },
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && onChangeRef.current) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
    ];

    if (placeholder) {
      extensions.push(phExtension(placeholder));
    }

    if (readOnly) {
      extensions.push(EditorState.readOnly.of(true));
    }

    const state = EditorState.create({
      doc: value,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, readOnly]);

  // Sync external value changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return <div ref={containerRef} className={`cm-editor-wrapper ${className}`} style={style} />;
}
