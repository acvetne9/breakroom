import type { Business } from "./business";

/** A search result as the dropdown and job forms consume it: a Business plus flat coordinates. */
export type EnhancedBusiness = Business & {
  lat: number;
  lng: number;
  /** Raw column alias some callers still read. */
  business_type?: string;
  formatted_address?: string;
  vicinity?: string;
  matchReasons?: string[];
};
