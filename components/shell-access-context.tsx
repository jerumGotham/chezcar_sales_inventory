"use client";

import { createContext, type ReactNode, useContext } from "react";

import type { ShellAccessDto } from "@/lib/contracts/access";
import type { CapabilityId } from "@/lib/contracts/roles";
import { hasCapability } from "@/lib/permissions";

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

export function useCan(required: CapabilityId): boolean {
  const access = useShellAccess();
  return access.authenticated && hasCapability(access.capabilities, required);
}
