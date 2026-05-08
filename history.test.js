import { describe, expect, it } from "vitest"

import {
  filterHistoryEntries,
  MAX_ICON_HISTORY_ITEMS,
  recordHistoryEntry,
  removeHistoryEntry,
  sanitizeHistoryEntries,
} from "./history.js"

describe("sanitizeHistoryEntries", () => {
  it("keeps only valid unique entries", () => {
    expect(
      sanitizeHistoryEntries([
        { iconId: "0x1", modelId: "siglip2" },
        { iconId: "0x1", modelId: "siglip2" },
        { iconId: "0x2", modelId: "clip" },
        { iconId: "", modelId: "clip" },
        null,
      ]),
    ).toEqual([
      { iconId: "0x1", modelId: "siglip2" },
      { iconId: "0x2", modelId: "clip" },
    ])
  })

  it("caps the saved history length", () => {
    const entries = Array.from({ length: MAX_ICON_HISTORY_ITEMS + 4 }, (_, index) => ({
      iconId: `0x${index}`,
      modelId: "siglip2",
    }))

    expect(sanitizeHistoryEntries(entries)).toHaveLength(MAX_ICON_HISTORY_ITEMS)
  })
})

describe("filterHistoryEntries", () => {
  it("removes entries for models that no longer exist", () => {
    expect(
      filterHistoryEntries(
        [
          { iconId: "0x1", modelId: "siglip2" },
          { iconId: "0x2", modelId: "clip" },
        ],
        new Set(["clip"]),
      ),
    ).toEqual([{ iconId: "0x2", modelId: "clip" }])
  })
})

describe("recordHistoryEntry", () => {
  it("moves the selected icon to the front without duplicates", () => {
    expect(
      recordHistoryEntry(
        [
          { iconId: "0x2", modelId: "clip" },
          { iconId: "0x1", modelId: "siglip2" },
        ],
        { iconId: "0x1", modelId: "siglip2" },
      ),
    ).toEqual([
      { iconId: "0x1", modelId: "siglip2" },
      { iconId: "0x2", modelId: "clip" },
    ])
  })
})

describe("removeHistoryEntry", () => {
  it("removes a specific entry while leaving others in place", () => {
    expect(
      removeHistoryEntry(
        [
          { iconId: "0x3", modelId: "clip" },
          { iconId: "0x2", modelId: "clip" },
          { iconId: "0x1", modelId: "siglip2" },
        ],
        { iconId: "0x2", modelId: "clip" },
      ),
    ).toEqual([
      { iconId: "0x3", modelId: "clip" },
      { iconId: "0x1", modelId: "siglip2" },
    ])
  })
})
