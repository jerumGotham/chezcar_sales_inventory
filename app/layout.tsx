import "./globals.css";
import { ReactNode } from "react";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import Providers from "./provider";
import AppLayoutShell from "@/components/app-layout-shell";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

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
      // Set on the server so the first paint is already dark; applying it from
      // an effect flashed a light screen first.
      className={cn("dark font-sans", geist.variable)}
      style={{ colorScheme: "dark" }}
      suppressHydrationWarning
    >
      <body className="overflow-x-hidden bg-background text-foreground transition-colors">
        <Providers>
          <AppLayoutShell>{children}</AppLayoutShell>
        </Providers>
      </body>
    </html>
  );
}
