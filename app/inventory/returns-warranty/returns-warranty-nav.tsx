"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck, Truck, Wrench } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";

const MODULES = [
  { label: "Backjobs", href: "/inventory/returns-warranty", capability: "backjobs:view", icon: Wrench },
  { label: "Customer Warranty", href: "/inventory/returns-warranty/warranties", capability: "customer-warranties:view", icon: ShieldCheck },
  { label: "Supplier Claims", href: "/inventory/returns-warranty/supplier-claims", capability: "supplier-claims:view", icon: Truck },
] as const;

export function ReturnsWarrantyNav({ capabilities }: { capabilities: readonly string[] }) {
  const pathname = usePathname();
  if (pathname.endsWith("/print")) return null;

  const activeModule = MODULES.slice(1).find(({ href }) => pathname === href || pathname.startsWith(`${href}/`)) ?? MODULES[0];
  const visibleModules = MODULES.filter(({ capability }) => capabilities.includes(capability));
  if (!visibleModules.length) return null;

  return (
    <nav aria-label="Returns & Warranty" className="mb-4 flex flex-wrap gap-2 print:hidden">
      {visibleModules.map((module) => {
        const active = module === activeModule;
        return (
          <Link
            key={module.href}
            href={module.href}
            aria-current={active ? (pathname === module.href ? "page" : "location") : undefined}
            className={buttonVariants({
              variant: active ? "default" : "outline",
              className: active ? "font-semibold underline underline-offset-4" : undefined,
            })}
          >
            <module.icon aria-hidden="true" />
            {module.label}
          </Link>
        );
      })}
    </nav>
  );
}
