export interface ValidationResult {
  valid: boolean;
  error?: string;
  suggestion?: string;
  warning?: string;
}

export function validateSQL(sql: string): ValidationResult {
  // Check for double quotes around string values in WHERE clauses
  const doubleQuotePattern = /WHERE\s+.*?=\s*"([^"]+)"/gi;
  const matches = sql.match(doubleQuotePattern);
  
  if (matches) {
    return {
      valid: false,
      error: "DuckDB uses single quotes (') for string values, not double quotes (\")",
      suggestion: sql.replace(/"([^"]+)"/g, "'$1'"),
    };
  }

  // Check for common SQL errors
  if (sql.trim().length === 0) {
    return {
      valid: false,
      error: "Query cannot be empty",
    };
  }

  // Check for unmatched parentheses
  const openParens = (sql.match(/\(/g) || []).length;
  const closeParens = (sql.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    return {
      valid: false,
      error: "Unmatched parentheses in query",
    };
  }

  // All checks passed
  return { valid: true };
}

export function formatSQL(sql: string): string {
  // Basic SQL formatting
  return sql
    .replace(/\s+/g, ' ')
    .replace(/,\s*/g, ', ')
    .trim();
}
