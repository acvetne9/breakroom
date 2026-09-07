/**
 * Job editor state and its pure transitions. Shared by the current-job and
 * past-job editors on the settings page so both behave identically.
 */

import { isProfane } from "@/utils/profanityFilter";
import { isValidAddress } from "@/utils/addressValidation";
import { formatSalaryDisplay, sanitizeSalaryInput } from "@/utils/salaryFormat";
import type { EnhancedBusiness } from "@/types/search";

export const CURRENT_JOB_ID = "current";
export const TEMP_ID_PREFIX = "temp_";

export interface JobRecord {
  role: string;
  salary: number;
  location: string;
  business_name: string;
  time_period: string;
}

export interface JobFormState extends JobRecord {
  /** `CURRENT_JOB_ID`, a past-job row id, or a `temp_` id not yet saved. */
  id: string;

  // Business/address UI
  businessInput: string;
  businessSelected: boolean;
  showAddressInput: boolean;
  addressInput: string;
  addressError: string;
  isManualAddress: boolean;
  /** What the user is typing in the salary box, e.g. "$14.5". */
  salaryDisplay: string;

  // Sync state
  isDirty: boolean;
  isSaving: boolean;
  hasError: boolean;
  errorMessage?: string;
  lastSavedAt?: Date;
}

export const isTempId = (id: string) => id.startsWith(TEMP_ID_PREFIX);
export const newTempId = () => `${TEMP_ID_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export function emptyJobForm(id: string): JobFormState {
  return {
    id,
    role: "",
    salary: 0,
    location: "",
    business_name: "",
    time_period: "HR",
    businessInput: "",
    businessSelected: false,
    showAddressInput: false,
    addressInput: "",
    addressError: "",
    isManualAddress: false,
    salaryDisplay: "",
    isDirty: false,
    isSaving: false,
    hasError: false,
  };
}

/** Build editor state from a saved row. */
export function jobFormFromRecord(
  id: string,
  record: Partial<Record<keyof JobRecord, string | number | null | undefined>>,
): JobFormState {
  const salary = Number(record.salary) || 0;
  const location = String(record.location ?? "");
  const businessName = String(record.business_name ?? "");
  const isManualAddress = businessName !== "" && businessName === location;
  return {
    ...emptyJobForm(id),
    role: String(record.role ?? ""),
    salary,
    location,
    business_name: businessName,
    time_period: String(record.time_period || "HR"),
    businessInput: businessName,
    businessSelected: true,
    addressInput: isManualAddress ? location : "",
    isManualAddress,
    salaryDisplay: salary > 0 ? `$${salary.toFixed(2)}` : "",
    lastSavedAt: new Date(),
  };
}

export function toJobRecord(job: JobFormState): JobRecord {
  return {
    role: job.role,
    salary: job.salary,
    location: job.location,
    business_name: job.business_name,
    time_period: job.time_period,
  };
}

/** Complete enough to persist. */
export function isJobFormComplete(job: JobFormState | null | undefined): boolean {
  if (!job) return false;
  const hasBusiness = job.businessSelected || (job.isManualAddress && !!job.addressInput && isValidAddress(job.addressInput));
  return job.salary > 0 && !!job.role.trim() && !!job.location.trim() && !!job.time_period && hasBusiness;
}

// ------------------------------------------------------------------ transitions
// Each returns the next state (or the same object when nothing should change).

export function applySalaryInput(job: JobFormState, raw: string): JobFormState {
  const value = sanitizeSalaryInput(raw);
  return { ...job, salary: parseFloat(value) || 0, salaryDisplay: value ? `$${value}` : "", isDirty: true };
}

export function applySalaryBlur(job: JobFormState): JobFormState {
  if (job.salary <= 0) return job;
  return { ...job, salaryDisplay: formatSalaryDisplay(job.salary) };
}

export function applyRole(job: JobFormState, value: string): JobFormState {
  if (isProfane(value)) return job;
  return { ...job, role: value, isDirty: true };
}

export function applyBusinessInput(job: JobFormState, value: string): JobFormState {
  // Typing invalidates any prior selection and offers the manual-address fallback.
  return { ...job, businessInput: value, businessSelected: false, showAddressInput: true, addressError: "", isDirty: true };
}

export function applyBusinessSelect(job: JobFormState, business: Pick<EnhancedBusiness, "name">): JobFormState {
  const name = business.name ?? "";
  return {
    ...job,
    businessInput: name,
    businessSelected: true,
    showAddressInput: false,
    addressInput: "",
    addressError: "",
    isManualAddress: false,
    location: name,
    business_name: name,
    isDirty: true,
  };
}

export function applyAddressInput(job: JobFormState, value: string): JobFormState {
  return { ...job, addressInput: value };
}

/** Validate the manual address and, if valid, commit it as the job's location. */
export function applyAddressBlur(job: JobFormState): JobFormState {
  const address = job.addressInput.trim();
  if (!address) return { ...job, addressError: "Please enter a business address" };
  if (isProfane(address)) return { ...job, addressError: "Invalid address content" };
  if (!isValidAddress(address)) {
    return { ...job, addressError: 'Please enter a valid street address (e.g., "123 Main St, City, State")' };
  }
  return {
    ...job,
    location: address,
    business_name: job.businessInput || address,
    isManualAddress: true,
    addressError: "",
    showAddressInput: true,
    businessSelected: false,
    isDirty: true,
  };
}

export function applyTimePeriod(job: JobFormState, value: string): JobFormState {
  return { ...job, time_period: value, isDirty: true };
}
