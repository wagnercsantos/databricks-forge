import { describe, it, expect } from "vitest";
import { quoteIdentifier, buildFqn, escapeFqn, splitFqn } from "@/lib/sql/identifiers";

describe("quoteIdentifier", () => {
  it("wraps a plain identifier in backticks", () => {
    expect(quoteIdentifier("orders")).toBe("`orders`");
  });

  it("handles hyphenated identifiers (the bug we are fixing)", () => {
    expect(quoteIdentifier("catalogo-sandbox")).toBe("`catalogo-sandbox`");
  });

  it("doubles embedded backticks per SQL grammar", () => {
    expect(quoteIdentifier("weird`name")).toBe("`weird``name`");
  });

  it("is NOT idempotent (documented behavior)", () => {
    // Passing an already-quoted value re-quotes it. Callers must not do this.
    expect(quoteIdentifier("`orders`")).toBe("```orders```");
  });
});

describe("buildFqn", () => {
  it("builds a one-part FQN (catalog only)", () => {
    expect(buildFqn("main")).toBe("`main`");
  });

  it("builds a two-part FQN (catalog.schema)", () => {
    expect(buildFqn("main", "default")).toBe("`main`.`default`");
  });

  it("builds a three-part FQN (catalog.schema.table)", () => {
    expect(buildFqn("main", "default", "orders")).toBe("`main`.`default`.`orders`");
  });

  it("escapes each segment of a hyphenated FQN (regression)", () => {
    expect(buildFqn("catalogo-sandbox", "my-schema", "user-events")).toBe(
      "`catalogo-sandbox`.`my-schema`.`user-events`",
    );
  });

  it("rejects identifiers with SQL injection characters", () => {
    expect(() => buildFqn("main; DROP TABLE x; --")).toThrow();
  });

  it("rejects empty identifiers", () => {
    expect(() => buildFqn("")).toThrow();
  });
});

describe("escapeFqn", () => {
  it("escapes a plain dotted FQN", () => {
    expect(escapeFqn("main.default.orders")).toBe("`main`.`default`.`orders`");
  });

  it("escapes a hyphenated FQN (the bug we are fixing)", () => {
    expect(escapeFqn("catalogo-sandbox.default.orders")).toBe(
      "`catalogo-sandbox`.`default`.`orders`",
    );
  });

  it("is idempotent — already-quoted FQN produces the same result", () => {
    const once = escapeFqn("main.default.orders");
    const twice = escapeFqn(once);
    expect(twice).toBe(once);
    expect(twice).toBe("`main`.`default`.`orders`");
  });

  it("is idempotent across mixed forms", () => {
    expect(escapeFqn("`main`.default.`orders`")).toBe("`main`.`default`.`orders`");
  });

  it("handles 2-part FQNs (schema.table)", () => {
    expect(escapeFqn("default.orders")).toBe("`default`.`orders`");
  });

  it("handles 1-part identifiers", () => {
    expect(escapeFqn("orders")).toBe("`orders`");
  });

  it("rejects FQNs with too many parts", () => {
    expect(() => escapeFqn("a.b.c.d.e")).toThrow();
  });

  it("rejects FQNs containing injection chars in any segment", () => {
    expect(() => escapeFqn("main.default.orders; DROP TABLE x")).toThrow();
  });
});

describe("splitFqn", () => {
  it("splits a plain 3-part FQN", () => {
    expect(splitFqn("main.default.orders")).toEqual(["main", "default", "orders"]);
  });

  it("splits a backtick-quoted FQN by stripping backticks first", () => {
    expect(splitFqn("`main`.`default`.`orders`")).toEqual(["main", "default", "orders"]);
  });

  it("preserves hyphens in segments", () => {
    expect(splitFqn("catalogo-sandbox.default.orders")).toEqual([
      "catalogo-sandbox",
      "default",
      "orders",
    ]);
  });

  it("throws when not exactly 3 parts", () => {
    expect(() => splitFqn("a.b")).toThrow();
    expect(() => splitFqn("a.b.c.d")).toThrow();
  });
});
