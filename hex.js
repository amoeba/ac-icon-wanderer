export function normalizeHexReference(value) {
  if (value == null) {
    return null
  }

  const normalizedValue = String(value).trim()
  if (!normalizedValue) {
    return null
  }

  const hexDigits = normalizedValue.replace(/^0x/i, "")
  if (!/^[0-9a-fA-F]+$/.test(hexDigits)) {
    return null
  }

  return `0x${hexDigits.toUpperCase()}`
}
