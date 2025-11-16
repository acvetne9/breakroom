import { PastJobState, CurrentJobState } from "@/types/jobState";
import { PastJobData } from "@/services/pastJobs";
import { CurrentJobData } from "@/services/currentJobs";

/**
 * Generate a temporary ID for new jobs
 */
export const generateTempId = (): string => {
  return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Check if an ID is a temporary ID
 */
export const isTempId = (id: string): boolean => {
  return id.startsWith('temp_');
};

/**
 * Check if an ID is a real database UUID
 */
export const isRealDatabaseId = (id: string): boolean => {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidPattern.test(id);
};

/**
 * Convert database PastJobData to PastJobState
 */
export const dbJobToState = (dbJob: PastJobData & { id: string }): PastJobState => {
  const hasLocation = !!dbJob.location;
  const businessMatchesLocation = dbJob.business_name === dbJob.location || !dbJob.business_name;
  const isManualAddress = hasLocation && businessMatchesLocation;
  
  return {
    // Database fields
    id: dbJob.id,
    role: dbJob.role,
    salary: dbJob.salary,
    location: dbJob.location,
    business_name: dbJob.business_name,
    time_period: dbJob.time_period,
    
    // UI state
    businessInput: dbJob.business_name || dbJob.location || "",
    businessSelected: !!dbJob.location,
    showAddressInput: false, // Always false on load
    address: isManualAddress ? dbJob.location : "",
    addressError: "",
    isManualAddress,
    
    // Sync tracking
    isDirty: false,
    isSaving: false,
    lastSavedAt: new Date(),
    hasError: false,
  };
};

/**
 * Convert database CurrentJobData to CurrentJobState
 */
export const dbCurrentJobToState = (dbJob: CurrentJobData): CurrentJobState => {
  const hasLocation = !!dbJob.location;
  const businessMatchesLocation = dbJob.business_name === dbJob.location || !dbJob.business_name;
  const isManualAddress = hasLocation && businessMatchesLocation;
  
  return {
    // Database fields
    role: dbJob.role,
    salary: dbJob.salary,
    location: dbJob.location,
    business_name: dbJob.business_name,
    time_period: dbJob.time_period,
    
    // UI state
    businessInput: dbJob.business_name || dbJob.location || "",
    businessSelected: !!dbJob.location,
    showAddressInput: false,
    address: isManualAddress ? dbJob.location : "",
    addressError: "",
    isManualAddress,
    
    // Sync tracking
    isDirty: false,
    isSaving: false,
    lastSavedAt: new Date(),
    hasError: false,
  };
};

/**
 * Create a new empty PastJobState with temp ID
 */
export const createEmptyPastJob = (): PastJobState => {
  return {
    id: generateTempId(),
    role: "",
    salary: 0,
    location: "",
    business_name: "",
    time_period: "HR",
    
    businessInput: "",
    businessSelected: false,
    showAddressInput: false,
    address: "",
    addressError: "",
    isManualAddress: false,
    
    isDirty: true, // New job is always dirty
    isSaving: false,
    hasError: false,
  };
};

/**
 * Convert PastJobState to PastJobData for saving
 */
export const stateToPastJobData = (state: PastJobState): PastJobData => {
  return {
    id: isRealDatabaseId(state.id) ? state.id : undefined,
    role: state.role,
    salary: state.salary,
    location: state.location,
    business_name: state.business_name,
    time_period: state.time_period,
  };
};

/**
 * Convert CurrentJobState to CurrentJobData for saving
 */
export const stateToCurrentJobData = (state: CurrentJobState): CurrentJobData => {
  return {
    role: state.role,
    salary: state.salary,
    location: state.location,
    business_name: state.business_name,
    time_period: state.time_period,
  };
};

/**
 * Update a specific field in PastJobState and mark as dirty
 */
export const updatePastJobField = <K extends keyof PastJobState>(
  job: PastJobState,
  field: K,
  value: PastJobState[K]
): PastJobState => {
  return {
    ...job,
    [field]: value,
    isDirty: true,
  };
};

/**
 * Update a specific field in CurrentJobState and mark as dirty
 */
export const updateCurrentJobField = <K extends keyof CurrentJobState>(
  job: CurrentJobState,
  field: K,
  value: CurrentJobState[K]
): CurrentJobState => {
  return {
    ...job,
    [field]: value,
    isDirty: true,
  };
};

/**
 * Mark job as saving
 */
export const markJobSaving = (job: PastJobState | CurrentJobState): typeof job => {
  return {
    ...job,
    isSaving: true,
    hasError: false,
    errorMessage: undefined,
  };
};

/**
 * Mark job as saved successfully
 */
export const markJobSaved = (job: PastJobState | CurrentJobState): typeof job => {
  return {
    ...job,
    isDirty: false,
    isSaving: false,
    lastSavedAt: new Date(),
    hasError: false,
    errorMessage: undefined,
  };
};

/**
 * Mark job as having an error
 */
export const markJobError = (
  job: PastJobState | CurrentJobState,
  error: string
): typeof job => {
  return {
    ...job,
    isSaving: false,
    hasError: true,
    errorMessage: error,
  };
};

/**
 * Replace a job's temp ID with a real UUID
 * Used after saving a new job to the database
 */
export const replaceJobId = (job: PastJobState, newId: string): PastJobState => {
  return {
    ...job,
    id: newId,
  };
};
