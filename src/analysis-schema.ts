/**
 * Storage contract for background musical analysis.
 *
 * Analysis is intentionally separate from the streamed track row: a beat grid
 * and chord map can be thousands of values, and carrying every result through
 * library hydration would recreate the album-art memory problem in a new hat.
 */
export const ANALYSIS_VERSION = 1

export function createAnalysisTableSql (): string {
  return `CREATE TABLE IF NOT EXISTS track_analysis (
  track_id TEXT PRIMARY KEY,
  source_mtime_ms INTEGER NOT NULL,
  analyzer_version INTEGER NOT NULL,
  result_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS delete_track_analysis
AFTER DELETE ON tracks
BEGIN
  DELETE FROM track_analysis WHERE track_id = OLD.id;
END;`
}
