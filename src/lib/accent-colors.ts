export interface AccentColorShade {
  primary: string;
  primaryStrong: string;
}

export interface AccentColorPreset {
  id: string;
  label: string;
  light: AccentColorShade;
  dark: AccentColorShade;
}

export const ACCENT_COLOR_PRESETS: AccentColorPreset[] = [
  {
    id: "teal",
    label: "Teal",
    light: { primary: "#0d9488", primaryStrong: "#0f766e" },
    dark: { primary: "#2dd4bf", primaryStrong: "#14b8a6" },
  },
  {
    id: "blue",
    label: "Blue",
    light: { primary: "#2563eb", primaryStrong: "#1d4ed8" },
    dark: { primary: "#60a5fa", primaryStrong: "#3b82f6" },
  },
  {
    id: "indigo",
    label: "Indigo",
    light: { primary: "#4f46e5", primaryStrong: "#4338ca" },
    dark: { primary: "#818cf8", primaryStrong: "#6366f1" },
  },
  {
    id: "purple",
    label: "Purple",
    light: { primary: "#7c3aed", primaryStrong: "#6d28d9" },
    dark: { primary: "#a78bfa", primaryStrong: "#8b5cf6" },
  },
  {
    id: "pink",
    label: "Pink",
    light: { primary: "#db2777", primaryStrong: "#be185d" },
    dark: { primary: "#f472b6", primaryStrong: "#ec4899" },
  },
  {
    id: "green",
    label: "Green",
    light: { primary: "#16a34a", primaryStrong: "#15803d" },
    dark: { primary: "#4ade80", primaryStrong: "#22c55e" },
  },
  {
    id: "red",
    label: "Red",
    light: { primary: "#dc2626", primaryStrong: "#b91c1c" },
    dark: { primary: "#f87171", primaryStrong: "#ef4444" },
  },
  {
    id: "slate",
    label: "Slate",
    light: { primary: "#475569", primaryStrong: "#334155" },
    dark: { primary: "#94a3b8", primaryStrong: "#64748b" },
  },
];

export type AccentColorId = (typeof ACCENT_COLOR_PRESETS)[number]["id"];

export const DEFAULT_ACCENT_COLOR: AccentColorId = "teal";

export function getAccentColorPreset(id: string): AccentColorPreset {
  return ACCENT_COLOR_PRESETS.find((preset) => preset.id === id) ?? ACCENT_COLOR_PRESETS[0];
}
