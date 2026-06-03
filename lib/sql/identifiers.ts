/**
 * SQL identifier escaping helpers for safe interpolation of
 * catalog/schema/table names into Databricks SQL queries.
 *
 * Databricks Unity Catalog allows hyphens, dots, and other characters in
 * identifiers that are reserved in SQL grammar. Any identifier interpolated
 * into a query string MUST be wrapped in backticks. Use these helpers at
 * every SQL boundary; never interpolate raw identifiers.
 *
 * Validation (string sanity) lives in lib/validation. This module owns the
 * SQL syntax side: turning a validated name into a SQL-safe token.
 */

import { validateIdentifier } from "@/lib/validation";

/**
 * Wrap a single SQL identifier in backticks. Escapes embedded backticks by
 * doubling them, per Databricks/Spark SQL grammar.
 *
 * NOT IDEMPOTENT. Passing an already-quoted value (e.g. "`catalog`") will
 * double-quote it ("``catalog``") and break the SQL. Callers must pass the
 * raw identifier. Use escapeFqn() when working with already-dotted FQN
 * strings that may or may not be pre-quoted.
 *
 * Does NOT validate the identifier — call validateIdentifier first if the
 * value came from an untrusted source. For trusted callsites that build
 * identifiers internally, calling quoteIdentifier directly is fine.
 *
 *   quoteIdentifier("catalogo-sandbox")  // => `catalogo-sandbox`
 *   quoteIdentifier("weird`name")        // => `weird``name`
 */
export function quoteIdentifier(name: string): string {
  return `\`${name.replace(/`/g, "``")}\``;
}

/**
 * Build a fully-qualified, backtick-quoted identifier from parts.
 * Validates each part and joins with dots.
 *
 *   buildFqn("catalogo-sandbox", "default", "users")
 *     // => `catalogo-sandbox`.`default`.`users`
 */
export function buildFqn(catalog: string, schema?: string, table?: string): string {
  const parts: string[] = [quoteIdentifier(validateIdentifier(catalog, "catalog"))];
  if (schema !== undefined) {
    parts.push(quoteIdentifier(validateIdentifier(schema, "schema")));
  }
  if (table !== undefined) {
    parts.push(quoteIdentifier(validateIdentifier(table, "table")));
  }
  return parts.join(".");
}

/**
 * Take an already-dotted FQN string (e.g. "catalog.schema.table") and
 * return it with each segment safely backtick-quoted. Use this where
 * code already holds a plain FQN string from storage, embeddings,
 * or upstream parsing.
 *
 * IDEMPOTENT. Strips any existing backticks before re-quoting, so passing
 * either "catalog.schema.table" or "`catalog`.`schema`.`table`" produces
 * the same correctly-quoted result. Safe to call on values of unknown
 * pre-quoting state. Validates every segment.
 *
 *   escapeFqn("catalogo-sandbox.default.users")
 *     // => `catalogo-sandbox`.`default`.`users`
 *   escapeFqn("`catalogo-sandbox`.default.users")    // idempotent
 *     // => `catalogo-sandbox`.`default`.`users`
 */
export function escapeFqn(fqn: string, label = "FQN"): string {
  const stripped = fqn.replace(/`/g, "");
  const segments = stripped.split(".");
  if (segments.length < 1 || segments.length > 4) {
    throw new Error(`${label} must have 1-4 dot-separated parts, got ${segments.length}: ${fqn}`);
  }
  return segments
    .map((segment) => quoteIdentifier(validateIdentifier(segment, `${label} segment`)))
    .join(".");
}

/**
 * Split a plain FQN string into [catalog, schema, table].
 * Throws if the FQN does not have exactly 3 parts.
 *
 * Strips backticks before splitting so callers can pass either form.
 */
export function splitFqn(fqn: string): [string, string, string] {
  const stripped = fqn.replace(/`/g, "");
  const parts = stripped.split(".");
  if (parts.length !== 3) {
    throw new Error(
      `Invalid FQN: expected 3 parts (catalog.schema.table), got ${parts.length}: ${fqn}`,
    );
  }
  return [parts[0], parts[1], parts[2]];
}
