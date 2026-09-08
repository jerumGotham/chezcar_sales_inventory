"use client";

import { createContext, useContext, type ReactNode } from "react";

const PageShellNavigationContext = createContext<ReactNode>(null);

export function PageShellNavigationProvider({ navigation, children }: {
  navigation: ReactNode;
  children: ReactNode;
}) {
  return <PageShellNavigationContext.Provider value={navigation}>{children}</PageShellNavigationContext.Provider>;
}

export function PageShellNavigation() {
  return useContext(PageShellNavigationContext);
}
