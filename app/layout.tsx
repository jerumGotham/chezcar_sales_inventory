import "./globals.css";
import { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

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
        <div className="min-h-screen lg:flex">
          <AppSidebar />
          <main className="min-h-screen min-w-0 flex-1 bg-white p-5 pt-20 dark:bg-background lg:p-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
