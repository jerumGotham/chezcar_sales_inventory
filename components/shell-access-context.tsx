"use client";

import { createContext, type ReactNode, useContext } from "react";

import type { ShellAccessDto } from "@/lib/contracts/access";

const ShellAccessContext = createContext<ShellAccessDto | null>(null);

export function ShellAccessProvider({
  access,
  children,
}: {
  access: ShellAccessDto;
  children: ReactNode;
}) {
  return (
    <ShellAccessContext.Provider value={access}>
      {children}
    </ShellAccessContext.Provider>
  );
}

export function useShellAccess(): ShellAccessDto {
  const access = useContext(ShellAccessContext);

  if (!access) {
    throw new Error("useShellAccess must be used within ShellAccessProvider");
  }

  return access;
}
