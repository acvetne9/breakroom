import React, { useState, useEffect, useRef, useCallback } from 'react';
import JobSearchDropdown from './JobSearchDropdown';
import UnifiedBusinessSearch from './UnifiedBusinessSearch';
import { isProfane } from '@/utils/profanityFilter';
import { JOB_OPTIONS } from './JobSearchDropdown';
import { useDevice } from "@/contexts/DeviceContext";
import { saveCurrentJob, type CurrentJobData } from "@/services/currentJobs";

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

const isValidAddress = (address: string): boolean => {
  const trimmedAddress = address.trim();
  if (trimmedAddress.length < 10) return false;
  const hasNumber = /\d/.test(trimmedAddress);
  const hasStreetType = /\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|ct|court|pl|place|way|pkwy|parkway)\b/i.test(trimmedAddress);
  const hasComma = trimmedAddress.includes(',');
  return hasNumber && hasStreetType && hasComma;
};

const InitiationPage: React.FC<InitiationPageProps> = ({ onComplete }) => {
  const { deviceId } = useDevice();
  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  const AUTO_SAVE_DELAY = 1000;

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

  const isJobComplete = useCallback(() => {
    return !!(
      salary > 0 &&
      role.trim() &&
      location.trim() &&
      (businessSelected || (isManualAddress && manualAddress && isValidAddress(manualAddress)))
    );
  }, [salary, role, location, businessSelected, isManualAddress, manualAddress]);

  const saveJobToDatabase = useCallback(async () => {
    if (!deviceId) {
      console.log("❌ No deviceId available for saving");
      return;
    }

    if (!isJobComplete()) {
      console.log("Job incomplete, skipping save");
      return;
    }

    try {
      const jobData: CurrentJobData = {
        role: role,
        salary: salary,
        location: location,
        business_name: businessName || location,
        time_period: timePeriod,
      };

      console.log("💾 Saving current job to database:", jobData);
      await saveCurrentJob(deviceId, jobData);
      console.log("✅ Job saved successfully");

      // Call onComplete to close initiation page
      onComplete({
        salary: salaryDisplay,
        role: role,
        location: location,
        fullLocation: location,
        businessName: businessName,
        timePeriod: timePeriod,
      });
    } catch (error: any) {
      console.error("❌ Failed to save current job:", error);
    }
  }, [deviceId, isJobComplete, salary, role, location, businessName, timePeriod, salaryDisplay, onComplete]);

  const scheduleAutoSave = useCallback(() => {
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Only schedule save if job is complete
    if (isJobComplete()) {
      saveTimeoutRef.current = setTimeout(() => {
        saveJobToDatabase();
      }, AUTO_SAVE_DELAY);
    }
  }, [isJobComplete, saveJobToDatabase]);

  const handleSalaryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/[^0-9.]/g, '');
    if (value.includes('.')) {
      const parts = value.split('.');
      if (parts.length > 2) value = parts[0] + '.' + parts.slice(1).join('');
      if (parts[1]?.length > 2) value = parts[0] + '.' + parts[1].substring(0, 2);
    }
    const displayValue = value ? `$${value}` : '';
    const numericValue = parseFloat(value) || 0;
    
    setSalary(numericValue);
    setSalaryDisplay(displayValue);
  };

  const handleSalaryBlur = () => {
    if (salary > 0) {
      const formattedValue = salary.toFixed(2);
      setSalaryDisplay(`$${formattedValue}`);
    }
    scheduleAutoSave();
  };

  const handleRoleChange = (value: string) => {
    if (!isProfane(value)) {
      setRole(value);
    }
  };

  const handleRoleBlur = () => {
    scheduleAutoSave();
  };

  const handleBusinessInputChange = (value: string) => {
    setBusinessInput(value);
    setBusinessSelected(false);
    setShowAddressInput(true);
    setAddressError('');
  };

  const handleBusinessSelect = (business: any) => {
    setBusinessSelected(true);
    setShowAddressInput(false);
    setIsManualAddress(false);
    setLocation(business.name || business.location);
    setBusinessName(business.name || '');
    setBusinessInput(business.name || business.location);
    scheduleAutoSave();
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
      setAddressError('Please enter a valid street address (e.g., "123 Main St, City, State")'); 
      return; 
    }
    
    setLocation(address);
    setBusinessName(businessInput || address);
    setBusinessSelected(false); // Don't mark as selected for manual address
    setIsManualAddress(true);
    setAddressError('');
    scheduleAutoSave();
  };
  
  const handleTimePeriodChange = (value: string) => {
    setTimePeriod(value);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="w-full h-full flex items-center justify-center bg-transparent overflow-hidden p-4">
      <div className="app-card p-8 animate-fade-in w-full max-w-md mx-auto">
        <div className="flex flex-col h-full items-center">
          {/* Header - stays at top */}
          <div className="text-center space-y-2 mb-6 w-full">
            <h1 className="text-3xl font-semibold text-gray-800 tracking-tight">Welcome to breakroom! 👋</h1>
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
                <UnifiedBusinessSearch
                  value={businessInput}
                  onChange={handleBusinessInputChange}
                  onBusinessSelect={handleBusinessSelect}
                  placeholder="Where do you work?..."
                  className="w-full px-4 py-4 bg-white text-gray-800 border-2 border-gray-300 text-base transition-all duration-200 focus:border-yellow-400 focus:ring-4 focus:ring-yellow-100 focus:outline-none"
                  variant="dropdown"
                />
                {showAddressInput && !businessSelected && (
                  <div className="mt-3 space-y-2">
                    <p className="text-gray-600 text-sm">Business not found. Please enter the full business address to continue:</p>
                    <input
                      type="text"
                      placeholder="Full address (e.g., 123 Main St, City, State)"
                      className={`w-full px-4 py-4 bg-white text-gray-800 border-2 text-base transition-all duration-200 focus:outline-none ${addressError ? "border-red-400 focus:border-red-400 focus:ring-4 focus:ring-red-100" : "border-gray-300 focus:border-yellow-400 focus:ring-4 focus:ring-yellow-100"}`}
                      value={manualAddress}
                      onChange={(e) => handleAddressChange(e.target.value)}
                      onBlur={handleAddressBlur}
                    />
                    {addressError && <p className="text-red-500 text-sm px-1">{addressError}</p>}
                    <p className="text-gray-500 text-sm px-1">
                      Must include street number, street name, city, and state
                    </p>
                  </div>
                )}
              </div>

              {/* Job Role */}
              <div className="w-full">
                <JobSearchDropdown
                  value={role}
                  onChange={handleRoleChange}
                  onBlur={handleRoleBlur}
                  placeholder="Share your job!..."
                  className="w-full px-4 py-4 bg-white text-gray-800 border-2 border-gray-300 text-base transition-all duration-200 focus:border-yellow-400 focus:ring-4 focus:ring-yellow-100 focus:outline-none"
                />
              </div>

              {/* Salary + Time Period */}
              <div className="w-full">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={salaryDisplay}
                    onChange={handleSalaryChange}
                    onBlur={handleSalaryBlur}
                    placeholder="$14.00"
                    className="flex-1 px-4 py-4 bg-white text-gray-800 border-2 border-gray-300 text-base transition-all duration-200 focus:border-yellow-400 focus:ring-4 focus:ring-yellow-100 focus:outline-none"
                  />
                  <select
                    value={timePeriod}
                    onChange={e => handleTimePeriodChange(e.target.value)}
                    className="px-5 py-4 bg-white text-gray-800 border-2 border-gray-300 text-base font-medium transition-all duration-200 focus:border-yellow-400 focus:ring-4 focus:ring-yellow-100 focus:outline-none cursor-pointer"
                  >
                    <option value="HR">HR</option>
                    <option value="MO">MO</option>
                    <option value="YR">YR</option>
                  </select>
                </div>
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
