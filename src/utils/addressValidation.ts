// Shared address validation helper (relaxed rule)

/**
 * Validate a street address using a relaxed rule:
 * trimmed length >= 6, contains a digit, and matches a common street type.
 * City/State are not required — a street address alone is valid.
 */
export const isValidAddress = (address: string): boolean => {
  const trimmedAddress = address.trim();
  if (trimmedAddress.length < 6) return false;
  const hasNumber = /\d/.test(trimmedAddress);
  const hasStreetType = /\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|ct|court|pl|place|way|pkwy|parkway)\b/i.test(trimmedAddress);
  // City/State are no longer required — a street address alone is valid.
  return hasNumber && hasStreetType;
};
