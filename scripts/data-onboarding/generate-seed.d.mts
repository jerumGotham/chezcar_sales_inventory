import type { ProfileEvidence, ReviewFinding, ResolutionRecord } from "./canonicalize.mjs";

export type WorkbookDescriptor = {
  path: string;
  byteLength: number;
  sha256: string;
  hasMacros: boolean;
  hasExternalLinks: boolean;
};

export type ReviewReportArtifact = {
  schemaVersion: number;
  workbook: WorkbookDescriptor;
  selectedSources: unknown[];
  totals: Record<string, number>;
  canonicalLocations: Array<{ code: string; type: string }>;
  findings: ReviewFinding[];
  canonicalCandidates: unknown[];
};

export type ResolutionArtifact = {
  schemaVersion: number;
  workbookSha256: string;
  resolutions: Record<string, ResolutionRecord>;
};

export type SourceMappingRow = {
  sourceId: string;
  sheet: string;
  row: number;
  kind: "product" | "heading" | "spacer";
  proposedItemCode: string | null;
  candidate: unknown | null;
  evidence: ProfileEvidence;
};

export type SourceMappingArtifact = {
  schemaVersion: number;
  workbook: WorkbookDescriptor;
  selectedSources: unknown[];
  canonicalLocations: Array<{ code: string; type: string }>;
  rows: SourceMappingRow[];
  generation?: CanonicalSourceMapping["generation"];
  canonicalRecords?: CanonicalSourceMapping["canonicalRecords"];
};

export type CanonicalLocation = {
  code: string;
  name: string;
  type: "WAREHOUSE" | "BRANCH";
  sourceIds: string[];
};

export type CanonicalProduct = {
  itemCode: string;
  name: string;
  salePrice: string | null;
  status: "ACTIVE" | "INACTIVE";
  sellable: boolean;
  sourceIds: string[];
};

export type CanonicalOpeningBalance = {
  itemCode: string;
  locationCode: string;
  onHand: number;
  sourceIds: string[];
};

export type CanonicalFixture = {
  schemaVersion: number;
  generatedFrom: {
    workbookHash: string;
    resolutionHash: string;
    sourceMappingHash: string;
  };
  locations: readonly CanonicalLocation[];
  products: CanonicalProduct[];
  openingBalances: CanonicalOpeningBalance[];
  fixtureHash: string;
};

export type CanonicalSourceMapping = SourceMappingArtifact & {
  generation: CanonicalFixture["generatedFrom"] & {
    fixtureHash: string;
    mappingHash: string;
  };
  canonicalRecords: {
    locations: Array<{ code: string; sourceIds: string[] }>;
    products: Array<{ itemCode: string; sourceIds: string[] }>;
    openingBalances: Array<{
      itemCode: string;
      locationCode: string;
      sourceIds: string[];
    }>;
  };
};

export type GenerateCanonicalFixtureInput = {
  profile: ReviewReportArtifact;
  resolutions: ResolutionArtifact;
  sourceMapping: SourceMappingArtifact;
};

export type GeneratedCanonicalFixture = {
  fixture: CanonicalFixture;
  mapping: CanonicalSourceMapping;
  fixtureText: string;
  mappingText: string;
};

export type GeneratorPaths = {
  profilePath: string;
  resolutionsPath: string;
  fixtureOutPath: string;
  mappingOutPath: string;
  check?: boolean;
};

export function generateCanonicalFixture(
  input: GenerateCanonicalFixtureInput,
): GeneratedCanonicalFixture;

export function runCanonicalFixtureGenerator(
  options: GeneratorPaths,
): Promise<GeneratedCanonicalFixture>;
