import { describe, expect, it } from 'vitest'
import { ANALYSIS_VERSION, createAnalysisTableSql } from '../src/analysis-schema'


describe('analysis storage schema', () => {
  it('declares one versioned result per track and deletes it with the track', () => {
    const sql = createAnalysisTableSql()

    expect(ANALYSIS_VERSION).toBe(1)
    expect(sql).toContain('track_id TEXT PRIMARY KEY')
    expect(sql).toContain('source_mtime_ms INTEGER NOT NULL')
    expect(sql).toContain('analyzer_version INTEGER NOT NULL')
    expect(sql).toContain('result_json TEXT NOT NULL')
    expect(sql).toContain('AFTER DELETE ON tracks')
    expect(sql).toContain('DELETE FROM track_analysis WHERE track_id = OLD.id')
  })
})
