// CourseForge client version — mirror of server/version.py.
//
// Sync is MANUAL (no codegen yet — a build step is deferred until Sprint 7).
// The server (server/version.py) is the source of truth; the values below are
// hand-mirrored from it and MUST be kept identical. If you change a schema
// constant here, change it there too (and vice versa).
export const VERSION = '1.0.0'

// ── Schema gate (mirrors server/version.py) ──────────────────────────────────
export const SCHEMA_VERSION = '1.0'

// Minimum compatible schema version.
export const MIN_SCHEMA_VERSION = '1.0'

// Supported schema versions for import (display/info only). The actual import
// gate is isSchemaSupported() below, which accepts a RANGE rather than this
// exact list — so an additive MINOR bump on either side (Blueprint export vs
// CourseForge import) doesn't reject every file.
export const SUPPORTED_SCHEMA_VERSIONS = ['1.0']

// '1.0' -> [1, 0]. Tolerant of a patch suffix; bad input -> null.
function parseSchema(v) {
  if (v == null) return null
  const parts = String(v).trim().split('.')
  const major = Number(parts[0])
  const minor = parts.length > 1 ? Number(parts[1]) : 0
  if (!Number.isInteger(major) || !Number.isInteger(minor)) return null
  return [major, minor]
}

// Accept any schema in the CURRENT MAJOR line at or above MIN_SCHEMA_VERSION.
// Mirrors server/version.py is_schema_supported(): same-major and >= min is
// accepted; a different MAJOR, a version below the minimum, or malformed input
// is rejected. A minor bump is additive/backward-compatible (unknown fields are
// ignored), so accepting the whole major-and-up range is safe.
export function isSchemaSupported(version) {
  const got = parseSchema(version)
  const low = parseSchema(MIN_SCHEMA_VERSION)
  const cur = parseSchema(SCHEMA_VERSION)
  if (got == null || low == null || cur == null) return false
  // got[0] === cur[0] && got >= low, where got >= low is a tuple (major,minor)
  // comparison matching Python's `got >= low` in server/version.py.
  const tupleGte = got[0] > low[0] || (got[0] === low[0] && got[1] >= low[1])
  return got[0] === cur[0] && tupleGte
}
