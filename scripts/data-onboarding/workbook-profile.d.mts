export type WorkbookProfileValue = string | number | boolean | null;

export type WorkbookProfileSource = {
  sheet: string;
  address: string;
  row: number;
  column: number;
};

export type WorkbookProfileCell = {
  source: WorkbookProfileSource;
  type: string;
  rawValue: WorkbookProfileValue;
  formula: string | null;
  cachedValue: WorkbookProfileValue;
  formattedValue: string | null;
};

export type WorkbookProfileFinding = {
  code:
    | "EXTERNAL_FORMULA_REFERENCE"
    | "FORMULA_CACHE_DISAGREEMENT"
    | "WORKBOOK_MACROS_PRESENT"
    | "WORKBOOK_EXTERNAL_LINKS_PRESENT";
  severity: "blocking";
  source: WorkbookProfileSource | null;
  message: string;
  formula?: string;
  cachedValue?: WorkbookProfileValue;
  referencedSource?: Pick<WorkbookProfileSource, "sheet" | "address">;
  referencedValue?: WorkbookProfileValue;
};

export type WorkbookProfileOptions = {
  sheet: string;
};

export type WorkbookProfile = {
  workbook: {
    path: string;
    byteLength: number;
    sha256: string;
    hasMacros: boolean;
    hasExternalLinks: boolean;
  };
  sheets: Array<{
    name: string;
    visibility: "visible" | "hidden" | "veryHidden";
  }>;
  selectedSheet: {
    name: string;
    visibility: "visible" | "hidden" | "veryHidden";
    range: string;
    dimensions: { rows: number; columns: number };
    cells: WorkbookProfileCell[];
  };
  findings: WorkbookProfileFinding[];
};

export function profileWorkbook(
  inputPath: string,
  options: WorkbookProfileOptions,
): Promise<WorkbookProfile>;

export type ReviewPackage = {
  sourceMapping: {
    schemaVersion: number;
    workbook: WorkbookProfile["workbook"];
    selectedSources: unknown[];
    canonicalLocations: readonly unknown[];
    rows: unknown[];
  };
  report: {
    schemaVersion: number;
    workbook: WorkbookProfile["workbook"];
    selectedSources: unknown[];
    totals: {
      sheets: number;
      rows: number;
      product: number;
      heading: number;
      spacer: number;
      findings: number;
      unresolvedFindings: number;
      canonicalCandidates: 0;
    };
    canonicalLocations: readonly unknown[];
    findings: import("./canonicalize.mjs").ReviewFinding[];
    canonicalCandidates: [];
  };
  resolutions: {
    schemaVersion: number;
    workbookSha256: string;
    resolutions: Record<string, import("./canonicalize.mjs").ResolutionRecord>;
  };
};

export function buildReviewPackage(
  workbookPath: string,
  options?: { sheets?: string[] },
): Promise<ReviewPackage>;

export function runCli(args: string[]): Promise<void>;
