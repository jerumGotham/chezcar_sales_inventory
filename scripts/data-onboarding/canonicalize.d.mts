import type { z } from "zod";

export type ProfileValue = string | number | boolean | null;

export type ProfileSource = {
  sheet: string;
  address: string;
  row: number;
  column: number;
};

export type ProfileCellEvidence = {
  source: ProfileSource;
  type: string;
  rawValue: ProfileValue;
  normalizedValue: ProfileValue;
  formula: string | null;
  cachedValue: ProfileValue;
  formattedValue: string | null;
};

export type ProfileEvidence = {
  workbookSha256: string;
  sheet: string;
  sheetIndex: number;
  row: number;
  cells: ProfileCellEvidence[];
  fields: {
    rowType: ProfileCellEvidence | null;
    itemCode: ProfileCellEvidence | null;
    itemName: ProfileCellEvidence | null;
    quantities: Record<string, ProfileCellEvidence>;
    prices: Record<string, ProfileCellEvidence>;
  };
};

export type ReviewFindingCode =
  | "UNRESOLVED_SR_SOURCE"
  | "UNRESOLVED_BL_BEFORE_SOURCE"
  | "DUPLICATE_CODE"
  | "SUSPECTED_DUPLICATE"
  | "INVALID_QUANTITY_NEGATIVE"
  | "INVALID_QUANTITY_BLANK"
  | "INVALID_QUANTITY_NONNUMERIC"
  | "MISSING_PRICE"
  | "NONNUMERIC_PRICE"
  | "CONFLICTING_PRICE"
  | "MISSING_ITEM_NAME"
  | "TEMPORARY_CODE_COLLISION"
  | "PROFILE_BLOCKER";

export type ReviewFinding = {
  id: string;
  code: ReviewFindingCode;
  blocking: true;
  status: "unresolved";
  message: string;
  workbookSha256: string;
  sourceIds: string[];
  evidence: ProfileCellEvidence[];
  details: Record<string, unknown>;
  resolutionKey: string;
};

export type ResolutionRecord = {
  findingId: string;
  workbookSha256: string;
  status: "unresolved" | "resolved";
  reviewer: string | null;
  reviewedAt: string | null;
  decision: string | null;
  reason: string | null;
  canonicalValue: unknown | null;
};

export type CanonicalCandidate = {
  sourceId: string;
  workbookSha256: string;
  itemCode: string;
  itemName: string;
  quantities: Record<string, number>;
  prices: Record<string, number>;
  evidence: ProfileEvidence;
};

export type ClassifiedNonProductRow = {
  kind: "heading" | "spacer";
  evidence: ProfileEvidence;
  candidate: null;
};

export type ClassifiedProductRow = {
  kind: "product";
  evidence: ProfileEvidence;
  candidate: CanonicalCandidate;
};

export type ClassifiedSourceRow =
  | ClassifiedNonProductRow
  | ClassifiedProductRow;

export const profileCellEvidenceSchema: z.ZodType<ProfileCellEvidence>;
export const profileEvidenceSchema: z.ZodType<ProfileEvidence>;
export const reviewFindingSchema: z.ZodType<ReviewFinding>;
export const resolutionRecordSchema: z.ZodType<ResolutionRecord>;
export const canonicalCandidateSchema: z.ZodType<CanonicalCandidate>;
export const CANONICAL_LOCATIONS: readonly [
  { readonly code: "SR"; readonly type: "WAREHOUSE" },
  { readonly code: "QC"; readonly type: "BRANCH" },
  { readonly code: "BL"; readonly type: "BRANCH" },
  { readonly code: "LU"; readonly type: "BRANCH" },
  { readonly code: "VC"; readonly type: "BRANCH" },
  { readonly code: "SP"; readonly type: "BRANCH" },
];

export function classifySourceRow(input: ProfileEvidence): ClassifiedSourceRow;

export function buildReviewFindings(inputs: ProfileEvidence[]): {
  canonicalLocations: typeof CANONICAL_LOCATIONS;
  classifiedRows: ClassifiedSourceRow[];
  findings: ReviewFinding[];
  canonicalCandidates: CanonicalCandidate[];
};
