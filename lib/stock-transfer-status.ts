/**
 * What a transfer status is called in front of a person. Shared by the Stock
 * Transfers screen and its PDF export so the printed sheet says exactly what
 * the branch read before pressing export; a status that reads "Receiving
 * issue" on screen and "Discrepancy Reported" on paper is two vocabularies
 * for one state, and the reader has to work out they are the same thing.
 */
export function transferStatusLabel(status: string) {
  if (status === "FOR_DISPATCH") return "Ready for dispatch";
  if (status === "DISCREPANCY_REPORTED") return "Receiving issue";
  if (status === "UNDER_REVIEW") return "Under investigation";
  if (status === "CANCELLED") return "Cancelled";
  return status.replaceAll("_", " ");
}
