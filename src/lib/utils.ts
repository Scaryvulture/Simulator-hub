import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function parseCSV(value: string): string[] {
  if (!value) return []
  const result: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < value.length; i++) {
    const char = value[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === "," && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ""))
      current = ""
    } else {
      current += char
    }
  }

  if (current.trim()) {
    result.push(current.trim().replace(/^"|"$/g, ""))
  }

  return result.filter((s) => s.length > 0)
}

/**
 * Parses list-like user/admin input that may come as:
 * - CSV: "a, b, c"
 * - bullets/new lines:
 *   "- a"
 *   "- b"
 * - semicolon separated: "a; b; c"
 */
export function parseListInput(value: string): string[] {
  if (!value) return []

  return parseCSV(value)
    .flatMap((chunk) => chunk.split(/[\r\n;]+/))
    .map((item) => item.trim())
    .map((item) => item.replace(/^"(.*)"$/, "$1"))
    .map((item) => item.replace(/^\s*(?:[-*•]\s+|\d+[\)\].:-]\s*)/, ""))
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}
