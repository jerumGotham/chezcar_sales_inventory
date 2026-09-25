import "./globals.css";
import { ReactNode } from "react";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import Providers from "./provider";
import AppLayoutShell from "@/components/app-layout-shell";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

/*
 * Runs before the first paint, so a reader who chose light never sees the dark
 * page flash first. It only ever removes the class the server already set;
 * anything it cannot read leaves the default dark in place. The key matches
 * THEME_KEY in components/app-header.tsx, which owns the toggle.
 */
const THEME_SCRIPT = `try{if(localStorage.getItem("chezcar-theme")==="light"){document.documentElement.classList.remove("dark");document.documentElement.style.colorScheme="light"}}catch(e){}`;

export const metadata = {
  title: "Predator Sales & Monitoring System",
  description:
    "Sales and inventory system UI starter built with Next.js, Tailwind, and Prisma structure.",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      // Dark is the default, set on the server so the first paint is already
      // dark; applying it from an effect flashed a light screen first. A
      // reader who picked light is switched by the script below, before the
      // browser paints anything.
      className={cn("dark font-sans", geist.variable)}
      style={{ colorScheme: "dark" }}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="overflow-x-hidden bg-background text-foreground transition-colors">
        <Providers>
          <AppLayoutShell>{children}</AppLayoutShell>
        </Providers>
      </body>
    </html>
  );
}
