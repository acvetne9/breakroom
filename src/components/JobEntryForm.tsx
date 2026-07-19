import React from "react";
import JobSearchDropdown from "./JobSearchDropdown";
import UnifiedBusinessSearch from "./UnifiedBusinessSearch";

/**
 * Shared, fully-controlled presentational pieces for the "job entry" UI that is
 * used by InitiationPage and SettingsPage (current job + each past job).
 *
 * These components own NO state and perform NO validation/persistence. All
 * values and callbacks are provided by the parent, which keeps its own
 * (very different) save/state strategy intact:
 *   - InitiationPage: refs + one-shot checkAndSave/onComplete (no auto-save)
 *   - SettingsPage current job: debounced auto-save on a single object
 *   - SettingsPage past jobs: array with per-item handlers threading a jobId
 *
 * Styling is driven entirely by className props so each caller can preserve its
 * exact look (Initiation is yellow-themed; Settings uses app-input classes).
 */

// ==================== Business search + manual-address fallback ====================

interface BusinessAddressFieldProps {
  // Business search input
  businessValue: string;
  onBusinessChange: (value: string) => void;
  onBusinessSelect: (business: any) => void;
  onBusinessBlur?: () => void;
  businessPlaceholder: string;
  businessClassName: string;

  // Manual-address fallback
  showAddressInput: boolean;
  addressValue: string;
  onAddressChange: (value: string) => void;
  onAddressBlur: () => void;
  addressError: string;
  addressPlaceholder: string;
  /** className for the address <input> when there is no error. */
  addressInputClassName: string;
  /** className applied to the address <input> instead when addressError is set. */
  addressErrorClassName: string;

  // Copy / helper text (differs per caller)
  addressIntroText: string;
  addressHelperText: string;

  // Layout / copy styling (differs per caller)
  fallbackWrapperClassName: string;
  introTextClassName: string;
  helperTextClassName: string;
  errorTextClassName: string;
}

/**
 * The business-search input plus its manual-address fallback block. The parent
 * decides when the fallback is shown (`showAddressInput`) and owns all values.
 */
export const BusinessAddressField: React.FC<BusinessAddressFieldProps> = ({
  businessValue,
  onBusinessChange,
  onBusinessSelect,
  onBusinessBlur,
  businessPlaceholder,
  businessClassName,
  showAddressInput,
  addressValue,
  onAddressChange,
  onAddressBlur,
  addressError,
  addressPlaceholder,
  addressInputClassName,
  addressErrorClassName,
  addressIntroText,
  addressHelperText,
  fallbackWrapperClassName,
  introTextClassName,
  helperTextClassName,
  errorTextClassName,
}) => {
  return (
    <div>
      <UnifiedBusinessSearch
        value={businessValue}
        onChange={onBusinessChange}
        onBusinessSelect={onBusinessSelect}
        onBlur={onBusinessBlur}
        placeholder={businessPlaceholder}
        className={businessClassName}
        variant="dropdown"
      />

      {showAddressInput && (
        <div className={fallbackWrapperClassName}>
          <p className={introTextClassName}>{addressIntroText}</p>
          <input
            type="text"
            placeholder={addressPlaceholder}
            className={addressError ? addressErrorClassName : addressInputClassName}
            value={addressValue}
            onChange={(e) => onAddressChange(e.target.value)}
            onBlur={onAddressBlur}
          />
          {addressError && <p className={errorTextClassName}>{addressError}</p>}
          <p className={helperTextClassName}>{addressHelperText}</p>
        </div>
      )}
    </div>
  );
};

// ==================== Salary + time-period row ====================

interface SalaryTimePeriodRowProps {
  salaryValue: string;
  onSalaryChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSalaryBlur: () => void;
  salaryPlaceholder: string;
  salaryClassName: string;

  timePeriodValue: string;
  onTimePeriodChange: (value: string) => void;
  timePeriodClassName?: string;
  timePeriodStyle?: React.CSSProperties;

  rowClassName: string;
  /** Optional trailing element (e.g. the past-job remove button, or a spacer). */
  trailing?: React.ReactNode;
}

/**
 * The salary text input + time-period <select> row. Salary is a display string
 * controlled by the parent; sanitization/parsing/formatting live in the parent
 * (via @/utils/salaryFormat) so each caller keeps its own save timing.
 */
export const SalaryTimePeriodRow: React.FC<SalaryTimePeriodRowProps> = ({
  salaryValue,
  onSalaryChange,
  onSalaryBlur,
  salaryPlaceholder,
  salaryClassName,
  timePeriodValue,
  onTimePeriodChange,
  timePeriodClassName,
  timePeriodStyle,
  rowClassName,
  trailing,
}) => {
  return (
    <div className={rowClassName}>
      <input
        type="text"
        inputMode="decimal"
        value={salaryValue}
        onChange={onSalaryChange}
        onBlur={onSalaryBlur}
        placeholder={salaryPlaceholder}
        className={salaryClassName}
      />
      <select
        value={timePeriodValue}
        onChange={(e) => onTimePeriodChange(e.target.value)}
        className={timePeriodClassName}
        style={timePeriodStyle}
      >
        <option value="HR">HR</option>
        <option value="MO">MO</option>
        <option value="YR">YR</option>
      </select>
      {trailing}
    </div>
  );
};

// ==================== Job role picker (thin passthrough) ====================

interface RoleFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className: string;
}

/** Thin, styling-driven wrapper around JobSearchDropdown for symmetry. */
export const RoleField: React.FC<RoleFieldProps> = ({ value, onChange, placeholder, className }) => (
  <JobSearchDropdown value={value} onChange={onChange} placeholder={placeholder} className={className} />
);
