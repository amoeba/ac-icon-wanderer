import { describe, expect, it } from "vitest"

import { normalizeHexReference } from "./hex.js"

describe("normalizeHexReference", () => {
  it("adds a 0x prefix to bare hex values", () => {
    expect(normalizeHexReference("0600177A")).toBe("0x0600177A")
  })

  it("normalizes existing prefixes and casing", () => {
    expect(normalizeHexReference("0x0600177a")).toBe("0x0600177A")
    expect(normalizeHexReference("0Xabc123")).toBe("0xABC123")
  })

  it("trims surrounding whitespace", () => {
    expect(normalizeHexReference("  0600177A  ")).toBe("0x0600177A")
  })

  it("rejects empty or non-hex values", () => {
    expect(normalizeHexReference("")).toBeNull()
    expect(normalizeHexReference("   ")).toBeNull()
    expect(normalizeHexReference("icon-0600177A")).toBeNull()
    expect(normalizeHexReference("0x0600177G")).toBeNull()
    expect(normalizeHexReference(null)).toBeNull()
    expect(normalizeHexReference(undefined)).toBeNull()
  })
})
