import React, { useState, useEffect } from 'react';
import JobSearchDropdown from './JobSearchDropdown';
import UnifiedBusinessSearch from './UnifiedBusinessSearch';
import { isProfane } from '@/utils/profanityFilter';
import { JOB_OPTIONS } from './JobSearchDropdown';

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
  const [salary, setSalary] = useState('');
  const [role, setRole] = useState('');
  const [location, setLocation] = useState('');
  const [fullLocation, setFullLocation] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [timePeriod, setTimePeriod] = useState('HR');
  const [isComplete, setIsComplete] = useState(false);
  const [businessSelected, setBusinessSelected] = useState(false);
  const [showAddressInput, setShowAddressInput] = useState(false);
  const [manualAddress, setManualAddress] = useState('');
  const [addressError, setAddressError] = useState('');
  const [isManualAddress, setIsManualAddress] = useState(false);

  const handleSalaryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/[^0-9.]/g, '');
    if (value.includes('.')) {
      const parts = value.split('.');
      if (parts.length > 2) value = parts[0] + '.' + parts.slice(1).join('');
      if (parts[1]?.length > 2) value = parts[0] + '.' + parts[1].substring(0, 2);
    }
    setSalary(value ? `$${value}` : '');
  };

  const handleSalaryBlur = () => {
    if (salary) {
      const numericValue = parseFloat(salary.replace(/[^0-9.]/g, ''));
      if (numericValue > 0) {
        setSalary(`$${numericValue.toFixed(2)}`);
      }
    }
  };

  const checkForCompletion = () => {
    const allFilled = salary.trim() && role.trim() && location.trim();
    const isValidRole = JOB_OPTIONS.includes(role.trim()) || role.trim() === 'Other';
    const businessValid = businessSelected && (!showAddressInput || isValidAddress(manualAddress));
    const complete = allFilled && isValidRole && businessValid;
    setIsComplete(complete);
    if (complete) {
      const finalLocation = isManualAddress ? manualAddress : (fullLocation || location);
      onComplete({ salary, role, location: finalLocation, fullLocation: finalLocation, businessName: businessName || '', timePeriod });
    }
  };

  useEffect(() => { checkForCompletion(); }, [salary, role, location, fullLocation, timePeriod, businessSelected, manualAddress]);

  const handleBusinessSelect = (business: any) => {
    setBusinessSelected(true);
    setShowAddressInput(false);
    setIsManualAddress(false);
    setLocation(business.name || business.location);
    setFullLocation(business.fullLocation || business.name || business.location);
    setBusinessName(business.name || '');
  };

  const handleAddressBlur = () => {
    const address = manualAddress.trim();
    if (!address) { setAddressError('Please enter a business address'); return; }
    if (isProfane(address)) { setAddressError('Invalid address content'); return; }
    if (!isValidAddress(address)) { setAddressError('Please enter a valid street address (e.g., "123 Main St, City, State")'); return; }
    setFullLocation(address);
    setLocation(address);
    setBusinessName('');
    setBusinessSelected(true);
    setIsManualAddress(true);
    setAddressError('');
  };

  return (
    <div className="w-full h-full flex items-center justify-center bg-transparent overflow-hidden p-4">
      <div className="app-card p-6 animate-fade-in w-full max-w-md">
        <div className="space-y-4">
          {/* Header */}
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-medium text-app-black">Welcome to breakroom! 👋</h1>
            <p className="text-sm text-app-gray-dark">Let's get started by sharing a few details</p>
          </div>

          {/* Business Location */}
          <div>
            <UnifiedBusinessSearch 
              value={location} 
              onChange={(value) => { 
                setLocation(value); 
                setBusinessSelected(false); 
                setShowAddressInput(false); 
              }} 
              onBusinessSelect={handleBusinessSelect} 
              onBlur={() => { 
                if (location.trim() && !businessSelected) setShowAddressInput(true); 
              }} 
              placeholder="Where do you work?..." 
              className={`app-input ${showAddressInput && !businessSelected ? "border-red-500" : ""}`} 
              variant="dropdown" 
            />
            {showAddressInput && (!businessSelected || isManualAddress) && (
              <div className="mt-2 space-y-2">
                <p className="text-red-500 text-xs">Business not found. Please enter the address:</p>
                <input 
                  type="text" 
                  placeholder="Enter business address (e.g., 123 Main St, City, State)..." 
                  className={`app-input w-full ${addressError ? "border-red-500 border-2" : ""}`} 
                  value={manualAddress} 
                  onChange={(e) => { 
                    setManualAddress(e.target.value); 
                    if (addressError) setAddressError(''); 
                  }} 
                  onBlur={handleAddressBlur} 
                />
                {addressError && <p className="text-red-500 text-sm px-1">{addressError}</p>}
                <p className="text-gray-500 text-xs px-1">
                  Please include street number, street name, and street type (e.g., St, Ave, Rd)
                </p>
              </div>
            )}
          </div>

          {/* Anonymous message */}
          <div className="text-center">
            <p className="text-app-black text-sm">
              <span>Answers Kept Anonymous 🤐</span>
            </p>
          </div>

          {/* Job Role */}
          <div>
            <JobSearchDropdown 
              value={role} 
              onChange={(value) => { 
                if (!isProfane(value)) setRole(value); 
              }} 
              onBlur={checkForCompletion} 
              placeholder="Share your job!..." 
              className="app-input" 
            />
          </div>

          {/* Make a difference message */}
          <div className="text-center">
            <p className="text-app-black text-sm font-normal">
              <span>Make A Difference! ❤️</span>
            </p>
          </div>

          {/* Salary + Time Period */}
          <div>
            <div className="flex items-center space-x-3">
              <input 
                type="text" 
                inputMode="decimal" 
                value={salary} 
                onChange={handleSalaryChange}
                onBlur={handleSalaryBlur}
                placeholder="Pay Est. ($)" 
                className="app-input text-left flex-1" 
              />
              <select 
                value={timePeriod} 
                onChange={e => setTimePeriod(e.target.value)} 
                className="px-4 py-3 bg-white text-sm"
                style={{
                  border: "2px solid hsl(var(--app-gray-light))",
                  borderRadius: "0.5rem",
                  height: "48px",
                  fontSize: "16px",
                }}
              >
                <option value="HR">HR</option>
                <option value="MO">MO</option>
                <option value="YR">YR</option>
              </select>
            </div>
          </div>

          {/* Anonymous reassurance */}
          <div className="text-center">
            <p className="text-app-black text-sm">
              <span className="hidden sm:inline">Don't worry, your boss won't find out 😉</span>
              <span className="sm:hidden">Don't worry, it's anonymous 😉</span>
            </p>
          </div>

          {/* Continue Button */}
          <div>
            <button 
              onClick={checkForCompletion} 
              disabled={!isComplete} 
              className={`w-full py-3 px-6 rounded-lg font-medium transition-all ${
                isComplete 
                  ? 'bg-app-yellow text-app-black hover:bg-app-yellow/90' 
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InitiationPage;
