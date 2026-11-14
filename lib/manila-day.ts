/**
 * Every branch works in one timezone, so a calendar day typed into a filter
 * means that day in Manila rather than in whatever zone the server runs in.
 * The cut has to be made in one place: the reports and the stock transfer
 * list both date rows by it, and two copies that drift by an hour put the
 * same transfer in different periods depending on which screen asked.
 */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1_000;

/**
 * The instant a Manila calendar day begins, or -- with `end` -- the instant
 * the next one does. A range is therefore read as `gte` the start and `lt`
 * the end, which keeps the last day of the range whole; comparing `lte`
 * against midnight would drop everything that happened during it.
 */
export function manilaDayBoundary(value: string, end = false) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + (end ? 1 : 0)) - MANILA_OFFSET_MS);
}

/**
 * A Prisma date filter for an optional Manila day range, or `undefined` when
 * neither end was given -- which is how an untouched filter asks for
 * everything instead of for nothing.
 */
export function manilaDayRange(from?: string, to?: string) {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: manilaDayBoundary(from) } : {}),
    ...(to ? { lt: manilaDayBoundary(to, true) } : {}),
  };
}
