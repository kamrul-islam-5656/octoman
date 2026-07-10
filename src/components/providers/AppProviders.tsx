"use client";

import { SessionProvider } from "next-auth/react";

import { AccentColorProvider } from "./AccentColorProvider";
import { ThemeProvider } from "./ThemeProvider";

interface AppProvidersProps {
  children: React.ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <AccentColorProvider>{children}</AccentColorProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
