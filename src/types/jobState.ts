// Unified state interfaces for job management
// These consolidate all job-related data, UI state, and sync tracking

export interface PastJobState {
  // Database fields
  id: string; // Can be temp ID (temp_xxx) or real UUID
  role: string;
  salary: number;
  location: string;
  business_name?: string;
  time_period: string;
  
  // UI state
  businessInput: string;
  businessSelected: boolean;
  showAddressInput: boolean;
  address: string;
  addressError: string;
  isManualAddress: boolean;
  
  // Sync tracking
  isDirty: boolean; // Has local changes not saved
  isSaving: boolean; // Currently saving to DB
  lastSavedAt?: Date; // Last successful save
  hasError: boolean; // Error during save
  errorMessage?: string;
}

export interface CurrentJobState {
  // Database fields
  role: string;
  salary: number;
  location: string;
  business_name?: string;
  time_period: string;
  
  // UI state
  businessInput: string;
  businessSelected: boolean;
  showAddressInput: boolean;
  address: string;
  addressError: string;
  isManualAddress: boolean;
  
  // Sync tracking
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt?: Date;
  hasError: boolean;
  errorMessage?: string;
}
