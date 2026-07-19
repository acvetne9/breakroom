// Shared salary parsing and formatting helpers

/**
 * Parse a raw salary input string into a number.
 * Strips everything except digits and the decimal point.
 * Returns 0 for empty/invalid input.
 */
export const parseSalaryInput = (input: string): number => {
  const n = parseFloat(String(input).replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : n;
};

/**
 * Format a numeric salary for display as a dollar amount with two decimals.
 */
export const formatSalaryDisplay = (n: number): string => `$${n.toFixed(2)}`;

/**
 * Sanitize a salary input string while the user is typing.
 * Keeps only digits and a single decimal point, and clamps the
 * fractional part to at most two digits.
 */
export const sanitizeSalaryInput = (input: string): string => {
  let value = input.replace(/[^0-9.]/g, '');
  if (value.includes('.')) {
    const parts = value.split('.');
    if (parts.length > 2) value = parts[0] + '.' + parts.slice(1).join('');
    if (parts[1]?.length > 2) value = parts[0] + '.' + parts[1].substring(0, 2);
  }
  return value;
};
