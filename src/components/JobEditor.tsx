import React from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { BusinessAddressField, RoleField, SalaryTimePeriodRow } from "./JobEntryForm";
import {
  applyAddressBlur,
  applyAddressInput,
  applyBusinessInput,
  applyBusinessSelect,
  applyRole,
  applySalaryBlur,
  applySalaryInput,
  applyTimePeriod,
  type JobFormState,
} from "@/utils/jobForm";

interface JobEditorProps {
  job: JobFormState;
  /** Receives a state transition to apply to this job. */
  onChange: (update: (job: JobFormState) => JobFormState) => void;
  businessPlaceholder: string;
  salaryPlaceholder: string;
  /** Rendered after the salary row (e.g. a remove button). */
  trailing?: React.ReactNode;
  /** Where the saving/error indicator goes. */
  indicatorPlacement?: "inline" | "gutter";
}

const TIME_PERIOD_STYLE: React.CSSProperties = {
  border: "2px solid hsl(var(--app-gray-light))",
  borderRadius: "0.5rem",
  height: "48px",
  fontSize: "16px",
};

/** Sync indicator shown next to a job while it saves or after a failure. */
export const JobSyncIndicator: React.FC<{ job: JobFormState; size?: "sm" | "md" }> = ({ job, size = "md" }) => {
  const cls = size === "sm" ? "w-3 h-3" : "w-4 h-4";
  if (job.isSaving) return <Loader2 className={`${cls} animate-spin text-app-gray-medium`} />;
  if (job.hasError)
    return (
      <div title={job.errorMessage}>
        <AlertCircle className={`${cls} text-red-500`} />
      </div>
    );
  return null;
};

/** The three fields for one job. All state lives in the parent via `onChange`. */
const JobEditor: React.FC<JobEditorProps> = ({ job, onChange, businessPlaceholder, salaryPlaceholder, trailing }) => {
  const showAddress = job.showAddressInput && !job.businessSelected;

  return (
    <div className="space-y-4">
      <BusinessAddressField
        businessValue={job.businessInput}
        onBusinessChange={(value) => onChange((j) => applyBusinessInput(j, value))}
        onBusinessSelect={(business) => onChange((j) => applyBusinessSelect(j, business))}
        businessPlaceholder={businessPlaceholder}
        businessClassName={`app-input w-full ${showAddress ? "border-red-500" : ""}`}
        showAddressInput={showAddress}
        addressValue={job.addressInput}
        onAddressChange={(value) => onChange((j) => applyAddressInput(j, value))}
        onAddressBlur={() => onChange(applyAddressBlur)}
        addressError={job.addressError}
        addressPlaceholder="Enter business address (e.g., 123 Main St, City, State)..."
        addressInputClassName="app-input w-full"
        addressErrorClassName="app-input w-full border-red-500 border-2"
        addressIntroText="Can't find your business? Enter the address below:"
        addressHelperText="Please include street number, street name, and street type (e.g., St, Ave, Rd)"
        fallbackWrapperClassName="mt-2 space-y-2"
        introTextClassName="text-app-gray-medium text-xs"
        helperTextClassName="text-gray-500 text-xs px-1"
        errorTextClassName="text-red-500 text-sm px-1"
      />

      <RoleField
        value={job.role}
        onChange={(value) => onChange((j) => applyRole(j, value))}
        placeholder="Search or select a job role..."
        className="app-input w-full"
      />

      <SalaryTimePeriodRow
        salaryValue={job.salaryDisplay}
        onSalaryChange={(e) => onChange((j) => applySalaryInput(j, e.target.value))}
        onSalaryBlur={() => onChange(applySalaryBlur)}
        salaryPlaceholder={salaryPlaceholder}
        salaryClassName="app-input flex-1"
        timePeriodValue={job.time_period}
        onTimePeriodChange={(value) => onChange((j) => applyTimePeriod(j, value))}
        timePeriodClassName="px-4 py-3 bg-white text-sm"
        timePeriodStyle={TIME_PERIOD_STYLE}
        rowClassName="flex items-center space-x-3"
        trailing={trailing ?? <div className="w-6"></div>}
      />
    </div>
  );
};

export default JobEditor;
