import React, { useState, useEffect, useRef } from 'react';
import { BusinessAddressField, RoleField, SalaryTimePeriodRow } from './JobEntryForm';
import { isProfane } from '@/utils/profanityFilter';
import { useDevice } from "@/contexts/DeviceContext";
import { saveCurrentJob, type CurrentJobData } from "@/services/currentJobs";
import { isValidAddress } from "@/utils/addressValidation";
import { formatSalaryDisplay, sanitizeSalaryInput } from "@/utils/salaryFormat";

interface InitiationPageProps {
  onComplete: (data: {
    salary: string;
    role: string;
    location: string;
    fullLocation?: string;
    businessName?: string;
    timePeriod: string;
  }) => void;
}

const InitiationPage: React.FC<InitiationPageProps> = ({ onComplete }) => {
  const { deviceId } = useDevice();

  const [salary, setSalary] = useState(0);
  const [salaryDisplay, setSalaryDisplay] = useState('');
  const [role, setRole] = useState('');
  const [location, setLocation] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [timePeriod, setTimePeriod] = useState('HR');
  const [businessSelected, setBusinessSelected] = useState(false);
  const [showAddressInput, setShowAddressInput] = useState(false);
  const [manualAddress, setManualAddress] = useState('');
  const [addressError, setAddressError] = useState('');
  const [isManualAddress, setIsManualAddress] = useState(false);
  const [businessInput, setBusinessInput] = useState('');
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);

  // Use refs to avoid stale closure issues
  const businessSelectedRef = useRef(false);
  const hasSavedRef = useRef(false);
  const selectedBusinessNameRef = useRef<string>('');
  const salaryRef = useRef(0);
  const roleRef = useRef('');
  const isManualAddressRef = useRef(false);
  const manualAddressRef = useRef('');

  const handleSalaryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = sanitizeSalaryInput(e.target.value);
    const displayValue = value ? `$${value}` : '';
    const numericValue = parseFloat(value) || 0;

    setSalary(numericValue);
    setSalaryDisplay(displayValue);
    salaryRef.current = numericValue;
  };

  // Check if complete and save - uses refs for current values
  const checkAndSave = () => {
    const hasValidBusiness = businessSelectedRef.current || (isManualAddressRef.current && manualAddressRef.current && isValidAddress(manualAddressRef.current));
    const isComplete = salaryRef.current > 0 && roleRef.current.trim() && hasValidBusiness;

    if (!isComplete || !deviceId || hasSavedRef.current) {
      return;
    }

    // Mark as saved immediately to prevent duplicate saves
    hasSavedRef.current = true;

    // Format salary for display
    const formattedSalary = salaryRef.current > 0 ? formatSalaryDisplay(salaryRef.current) : salaryDisplay;

    // Optimistically close the card immediately
    onComplete({
      salary: formattedSalary,
      role: roleRef.current,
      location,
      fullLocation: location,
      businessName: businessName || location,
      timePeriod,
    });

    // Save to database in background (don't wait)
    const jobData: CurrentJobData = {
      role: roleRef.current,
      salary: salaryRef.current,
      location,
      business_name: businessName || location,
      time_period: timePeriod,
      business_id: selectedBusinessId,
    };

    saveCurrentJob(deviceId, jobData)
      .then(() => console.log("✅ Job saved to database"))
      .catch((error) => console.error("❌ Failed to save job:", error));
  };

  const handleSalaryBlur = () => {
    if (salary > 0) {
      setSalaryDisplay(formatSalaryDisplay(salary));
    }
    // Check completion after salary blur
    checkAndSave();
  };

  const handleRoleChange = (value: string) => {
    if (!isProfane(value)) {
      setRole(value);
      roleRef.current = value;
    }
  };

  const handleBusinessInputChange = (value: string) => {
    // If this value matches what we just selected, don't reset the selection
    // This prevents the UnifiedBusinessSearch useEffect from resetting state
    if (value === selectedBusinessNameRef.current && businessSelectedRef.current) {
      setBusinessInput(value);
      return;
    }

    setBusinessInput(value);
    setBusinessSelected(false);
    businessSelectedRef.current = false;
    selectedBusinessNameRef.current = '';
    isManualAddressRef.current = false;
    manualAddressRef.current = '';
    setShowAddressInput(false);
    setAddressError('');
    setSelectedBusinessId(null);
    setLocation('');
  };

  const handleBusinessBlur = () => {
    // Use ref to get current value (avoids stale closure)
    if (businessInput.trim() && !businessSelectedRef.current) {
      setShowAddressInput(true);
    }
  };

  const handleBusinessSelect = (business: any) => {
    const locationValue = business.name || business.location || '';
    setBusinessSelected(true);
    businessSelectedRef.current = true;
    selectedBusinessNameRef.current = locationValue; // Track selected name to prevent reset
    setShowAddressInput(false);
    setIsManualAddress(false);
    setLocation(locationValue);
    setBusinessName(business.name || '');
    setBusinessInput(locationValue);
    setSelectedBusinessId(business.id || null);
  };

  const handleAddressChange = (value: string) => {
    setManualAddress(value);
    if (addressError) setAddressError('');
  };

  const handleAddressBlur = () => {
    const address = manualAddress.trim();
    if (!address) {
      setAddressError('Please enter a business address');
      return;
    }
    if (isProfane(address)) {
      setAddressError('Invalid address content');
      return;
    }
    if (!isValidAddress(address)) {
      setAddressError('Please enter a valid street address (e.g., "123 Main St")');
      return;
    }

    setLocation(address);
    setBusinessName(businessInput || address);
    setBusinessSelected(false);
    businessSelectedRef.current = false;
    setIsManualAddress(true);
    isManualAddressRef.current = true;
    manualAddressRef.current = address;
    setAddressError('');
  };

  const handleTimePeriodChange = (value: string) => {
    setTimePeriod(value);
  };

  return (
    <div className="w-full h-full flex items-center justify-center bg-transparent overflow-hidden p-4">
      <div className="app-card p-8 animate-fade-in w-full max-w-md mx-auto">
        <div className="flex flex-col h-full items-center">
          {/* Header - stays at top */}
          <div className="text-center space-y-2 mb-6 w-full">
            <h1 className="text-3xl font-semibold text-gray-800 tracking-tight">Welcome to workaround! 👋</h1>
            <p className="text-base text-gray-600">Let's get started by sharing a few details</p>
          </div>

          {/* Content - vertically centered */}
          <div className="flex-1 flex items-center justify-center w-full">
            <div className="w-80 space-y-5">
              {/* Make a difference message - ABOVE inputs */}
              <div className="text-center mb-3">
                <p className="text-gray-700 text-base font-medium">
                  <span>Make A Difference! ❤️</span>
                </p>
              </div>

              {/* Business Location */}
              <div className="w-full">
                <BusinessAddressField
                  businessValue={businessInput}
                  onBusinessChange={handleBusinessInputChange}
                  onBusinessSelect={handleBusinessSelect}
                  onBusinessBlur={handleBusinessBlur}
                  businessPlaceholder="Where do you work?..."
                  businessClassName="w-full px-4 py-4 bg-white text-gray-800 border-2 border-gray-300 text-base transition-all duration-200 focus:border-yellow-400 focus:ring-4 focus:ring-yellow-100 focus:outline-none"
                  showAddressInput={showAddressInput && !businessSelected}
                  addressValue={manualAddress}
                  onAddressChange={handleAddressChange}
                  onAddressBlur={handleAddressBlur}
                  addressError={addressError}
                  addressPlaceholder="Street address (e.g., 123 Main St)"
                  addressInputClassName="w-full px-4 py-4 bg-white text-gray-800 border-2 text-base transition-all duration-200 focus:outline-none border-gray-300 focus:border-yellow-400 focus:ring-4 focus:ring-yellow-100"
                  addressErrorClassName="w-full px-4 py-4 bg-white text-gray-800 border-2 text-base transition-all duration-200 focus:outline-none border-red-400 focus:border-red-400 focus:ring-4 focus:ring-red-100"
                  addressIntroText="Business not found. Please enter the full business address to continue:"
                  addressHelperText="Must include street number, street name and borough"
                  fallbackWrapperClassName="mt-3 space-y-2"
                  introTextClassName="text-gray-600 text-sm"
                  helperTextClassName="text-gray-500 text-sm px-1"
                  errorTextClassName="text-red-500 text-sm px-1"
                />
              </div>

              {/* Job Role */}
              <div className="w-full">
                <RoleField
                  value={role}
                  onChange={handleRoleChange}
                  placeholder="Share your job!..."
                  className="w-full px-4 py-4 bg-white text-gray-800 border-2 border-gray-300 text-base transition-all duration-200 focus:border-yellow-400 focus:ring-4 focus:ring-yellow-100 focus:outline-none"
                />
              </div>

              {/* Salary + Time Period */}
              <div className="w-full">
                <SalaryTimePeriodRow
                  salaryValue={salaryDisplay}
                  onSalaryChange={handleSalaryChange}
                  onSalaryBlur={handleSalaryBlur}
                  salaryPlaceholder="$14.00"
                  salaryClassName="flex-1 px-4 py-4 bg-white text-gray-800 border-2 border-gray-300 text-base transition-all duration-200 focus:border-yellow-400 focus:ring-4 focus:ring-yellow-100 focus:outline-none"
                  timePeriodValue={timePeriod}
                  onTimePeriodChange={handleTimePeriodChange}
                  timePeriodClassName="px-5 h-[58px] bg-white text-gray-800 border-2 border-gray-300 text-base font-medium transition-all duration-200 focus:border-yellow-400 focus:ring-4 focus:ring-yellow-100 focus:outline-none cursor-pointer"
                  rowClassName="flex items-center gap-3"
                />
              </div>

              {/* Boss reassurance message - BELOW inputs */}
              <div className="text-center mt-4">
                <p className="text-gray-600 text-base">
                  <span>Don't worry, your boss won't find out 😉</span>
                </p>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default InitiationPage;
