import { db, type ImportedRangeRow } from './db';

export type StoredImportedRange = {
  id: string;
  identityId: string;
  start: Date;
  end: Date;
};

export type DateRange = [Date, Date];

export async function addImportedRange(
  identityId: string,
  start: Date,
  end: Date,
): Promise<StoredImportedRange> {
  const id = crypto.randomUUID();
  const row: ImportedRangeRow = {
    id,
    identityId,
    start: start.toISOString(),
    end: end.toISOString(),
  };
  await db().importedRanges.put(row);
  return { id, identityId, start, end };
}

export async function listImportedRanges(identityId: string): Promise<StoredImportedRange[]> {
  const rows = await db().importedRanges.where('identityId').equals(identityId).toArray();
  return rows.map((row) => ({
    id: row.id,
    identityId: row.identityId,
    start: new Date(row.start),
    end: new Date(row.end),
  }));
}

export async function clearImportedRanges(identityId: string): Promise<void> {
  const rows = await db().importedRanges.where('identityId').equals(identityId).toArray();
  await db().importedRanges.bulkDelete(rows.map((r) => r.id));
}

/**
 * Pure helper. Given a sorted (or unsorted) set of stored ranges and a
 * requested [start, end] range, return the uncovered sub-ranges (gaps) we
 * still need to fetch. If the request is fully covered, returns
 * `{ covered: true, gaps: [] }`. Touching intervals (a.end === b.start)
 * are treated as continuous.
 */
export function computeBackfillGaps(
  existing: ReadonlyArray<DateRange>,
  requestStart: Date,
  requestEnd: Date,
): { covered: boolean; gaps: DateRange[] } {
  if (requestEnd.getTime() <= requestStart.getTime()) {
    return { covered: true, gaps: [] };
  }

  const merged = mergeRanges(existing);
  const gaps: DateRange[] = [];
  let cursor = requestStart;

  for (const [s, e] of merged) {
    if (e.getTime() <= cursor.getTime()) continue;
    if (s.getTime() >= requestEnd.getTime()) break;
    if (s.getTime() > cursor.getTime()) {
      gaps.push([cursor, s]);
    }
    if (e.getTime() > cursor.getTime()) {
      cursor = e;
    }
    if (cursor.getTime() >= requestEnd.getTime()) break;
  }

  if (cursor.getTime() < requestEnd.getTime()) {
    gaps.push([cursor, requestEnd]);
  }

  return { covered: gaps.length === 0, gaps };
}

export function mergeRanges(ranges: ReadonlyArray<DateRange>): DateRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a[0].getTime() - b[0].getTime());
  const out: DateRange[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i += 1) {
    const last = out[out.length - 1];
    const next = sorted[i];
    if (next[0].getTime() <= last[1].getTime()) {
      if (next[1].getTime() > last[1].getTime()) {
        out[out.length - 1] = [last[0], next[1]];
      }
    } else {
      out.push(next);
    }
  }
  return out;
}
