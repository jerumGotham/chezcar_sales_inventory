import "./globals.css";
import { ReactNode } from "react";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import Providers from "./provider";
import AppLayoutShell from "@/components/app-layout-shell";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata = {
  title: "Chezcar UI Starter",
  description:
    "Sales and inventory system UI starter built with Next.js, Tailwind, and Prisma structure.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={cn("font-sans", geist.variable)}
      suppressHydrationWarning
    >
      <body className="overflow-x-hidden bg-white text-foreground transition-colors dark:bg-background">
        <Providers>
          <AppLayoutShell>{children}</AppLayoutShell>
        </Providers>
      </body>
    </html>
  );
}
