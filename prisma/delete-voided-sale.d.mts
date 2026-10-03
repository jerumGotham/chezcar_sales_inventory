/**
 * Types for the delete script, so the integration test can call it under
 * `allowJs: false`. The script itself stays plain JavaScript, like the other
 * operational scripts in this directory.
 */
import type { PrismaClient } from "@prisma/client";

export declare function assertTarget(
  databaseUrl: string | undefined,
  expectedHost: string | null,
  allow: string | undefined,
): { host: string; database: string };

export type DeleteVoidedSaleResult = {
  found: boolean;
  receiptNumber?: string;
  sale?: {
    id: string;
    reference: string;
    receiptNumber: string;
    status: string;
    branch: string;
    totalAmount: number;
    postedAt: string;
    lines: number;
  };
  applied?: boolean;
  deleted?: boolean;
  wouldDelete?: boolean;
  /** Set when nothing was deleted, saying in words what stands in the way. */
  refused?: string;
  replacedBy?: string[];
  note?: string;
  orphanedEvidenceFile?: string;
  removed?: Record<string, number>;
};

export declare function deleteVoidedSale(
  prisma: PrismaClient,
  receiptNumber: string,
  options?: { apply?: boolean },
): Promise<DeleteVoidedSaleResult>;
