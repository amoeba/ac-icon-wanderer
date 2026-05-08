export const ICON_HISTORY_STORAGE_KEY = "ac-icon-wanderer:icon-history:v1"
export const MAX_ICON_HISTORY_ITEMS = 24

export function historyEntryKey(entry) {
  return `${entry.modelId}:${entry.iconId}`
}

function isHistoryEntry(entry) {
  return (
    entry != null &&
    typeof entry.iconId === "string" &&
    entry.iconId.length > 0 &&
    typeof entry.modelId === "string" &&
    entry.modelId.length > 0
  )
}

export function sanitizeHistoryEntries(entries) {
  if (!Array.isArray(entries)) {
    return []
  }

  const sanitized = []
  const seen = new Set()

  for (const entry of entries) {
    if (!isHistoryEntry(entry)) {
      continue
    }

    const normalizedEntry = {
      iconId: entry.iconId,
      modelId: entry.modelId,
    }
    const key = historyEntryKey(normalizedEntry)
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    sanitized.push(normalizedEntry)

    if (sanitized.length >= MAX_ICON_HISTORY_ITEMS) {
      break
    }
  }

  return sanitized
}

export function filterHistoryEntries(entries, validModelIds) {
  const allowedModelIds = validModelIds instanceof Set
    ? validModelIds
    : new Set(validModelIds ?? [])

  return sanitizeHistoryEntries(entries).filter((entry) =>
    allowedModelIds.has(entry.modelId),
  )
}

export function recordHistoryEntry(entries, entry) {
  const sanitizedEntries = sanitizeHistoryEntries(entries)
  const [sanitizedEntry] = sanitizeHistoryEntries([entry])

  if (!sanitizedEntry) {
    return sanitizedEntries
  }

  return sanitizeHistoryEntries([sanitizedEntry, ...sanitizedEntries])
}

export function removeHistoryEntry(entries, entry) {
  const [sanitizedEntry] = sanitizeHistoryEntries([entry])
  if (!sanitizedEntry) {
    return sanitizeHistoryEntries(entries)
  }

  const entryKey = historyEntryKey(sanitizedEntry)
  return sanitizeHistoryEntries(entries).filter(
    (candidate) => historyEntryKey(candidate) !== entryKey,
  )
}
