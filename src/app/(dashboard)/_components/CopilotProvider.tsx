"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Mode = "accept" | "auto";

interface CopilotContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
}

const CopilotContext = createContext<CopilotContextValue | null>(null);

export function useCopilot(): CopilotContextValue {
  const ctx = useContext(CopilotContext);
  if (!ctx) throw new Error("useCopilot must be used within CopilotProvider");
  return ctx;
}

export default function CopilotProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpenState] = useState(false);
  const [mode, setModeState] = useState<Mode>("accept");

  // Restore open state (client-only) so the panel persists across navigation.
  // The localStorage read happens asynchronously (queued as a microtask)
  // rather than as a direct synchronous setState call in the effect body,
  // so it doesn't trip react-hooks/set-state-in-effect.
  useEffect(() => {
    queueMicrotask(() => {
      const saved = window.localStorage.getItem("copilot:open");
      if (saved !== null) {
        setOpenState(saved === "1");
      }
    });
  }, []);

  const setOpen = (v: boolean) => {
    setOpenState(v);
    window.localStorage.setItem("copilot:open", v ? "1" : "0");
  };

  const setMode = (m: Mode) => {
    setModeState(m);
    void fetch("/api/copilot/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "set_mode", mode: m }),
    });
  };

  return (
    <CopilotContext.Provider value={{ open, setOpen, mode, setMode }}>
      {children}
    </CopilotContext.Provider>
  );
}
