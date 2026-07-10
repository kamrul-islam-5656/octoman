"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { AccentColorId, DEFAULT_ACCENT_COLOR, getAccentColorPreset } from "@/lib/accent-colors";

const ACCENT_STORAGE_KEY = "octoman-accent-color";
const STYLE_TAG_ID = "octoman-accent-color-style";

interface AccentColorContextValue {
  accentColor: AccentColorId;
  setAccentColor: (accentColor: AccentColorId) => void;
}

const AccentColorContext = createContext<AccentColorContextValue | undefined>(undefined);

function applyAccentColor(accentColor: AccentColorId): void {
  const preset = getAccentColorPreset(accentColor);

  let styleTag = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null;
  if (!styleTag) {
    styleTag = document.createElement("style");
    styleTag.id = STYLE_TAG_ID;
    document.head.appendChild(styleTag);
  }

  styleTag.textContent = `
    :root {
      --primary: ${preset.light.primary};
      --primary-strong: ${preset.light.primaryStrong};
      --ring: ${preset.light.primary}66;
    }
    html.dark {
      --primary: ${preset.dark.primary};
      --primary-strong: ${preset.dark.primaryStrong};
      --ring: ${preset.dark.primary}80;
    }
  `;
}

export function AccentColorProvider({ children }: { children: ReactNode }) {
  const [accentColor, setAccentColorState] = useState<AccentColorId>(DEFAULT_ACCENT_COLOR);
  const [isResolved, setIsResolved] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedAccentColor = localStorage.getItem(ACCENT_STORAGE_KEY);
    const resolvedAccentColor = getAccentColorPreset(storedAccentColor ?? DEFAULT_ACCENT_COLOR).id;

    applyAccentColor(resolvedAccentColor);
    setAccentColorState(resolvedAccentColor);
    setIsResolved(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !isResolved) {
      return;
    }

    localStorage.setItem(ACCENT_STORAGE_KEY, accentColor);
    applyAccentColor(accentColor);
  }, [accentColor, isResolved]);

  const setAccentColor = useCallback((nextAccentColor: AccentColorId) => {
    setAccentColorState(nextAccentColor);
  }, []);

  const value = useMemo(
    () => ({
      accentColor,
      setAccentColor,
    }),
    [accentColor, setAccentColor],
  );

  return <AccentColorContext.Provider value={value}>{children}</AccentColorContext.Provider>;
}

export function useAccentColor(): AccentColorContextValue {
  const context = useContext(AccentColorContext);
  if (!context) {
    throw new Error("useAccentColor must be used within an AccentColorProvider.");
  }

  return context;
}
