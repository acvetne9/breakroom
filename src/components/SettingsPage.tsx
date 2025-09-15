import React, { useState, useEffect, useRef } from 'react';
import { Plus, Minus } from 'lucide-react';
import JobSearchDropdown from './JobSearchDropdown';
import BusinessSearchDropdown from './BusinessSearchDropdown';
import { isProfane } from '../utils/profanityFilter';
import { useToast } from '@/hooks/use-toast';
import { useDevice } from '@/contexts/DeviceContext';
import { nycNeighborhoods } from '../utils/nyc_neighborhoods'

interface UserInfo {
  salary: string;
  role: string;
  location: string;
  isHiring: boolean;
}

interface PastJob {
  id: string;
  salary: string;
  role: string;
  location: string;
}

interface Post {
  id: string;
  author: string;
  text: string;
  businessName?: string;
  createdAt: Date;
}

interface SettingsPageProps {
  initialData: {
    salary: string;
    role: string;
    location: string;
    fullLocation?: string;
    timePeriod?: string;
  };
  userPosts?: Post[];
  onStoriesClick?: () => void;
  onPostClick?: (post: Post) => void;
  onJobUpdate?: (jobData: { salary: string; role: string; location: string; timePeriod: string }) => void;
  onPageLeave?: () => void;
  onSearchTrigger?: (searchTerm: string) => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({
  initialData,
  userPosts = [],
  onStoriesClick,
  onPostClick,
  onJobUpdate,
  onPageLeave,
  onSearchTrigger
}) => {
  const { deviceId } = useDevice();
  const { toast } = useToast();

  // Add ref for the scrollable container
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [currentJob, setCurrentJob] = useState<UserInfo>({
    salary: initialData.salary,
    role: initialData.role,
    location: initialData.fullLocation || initialData.location,
    isHiring: false
  });

  const [currentJobFullLocation, setCurrentJobFullLocation] = useState<string>(
    initialData.fullLocation || initialData.location
  );
  
  // Add validation states for addresses
  const [currentJobLocationValid, setCurrentJobLocationValid] = useState<boolean>(true);
  const [pastJobLocationValidation, setPastJobLocationValidation] = useState<{[id: string]: boolean}>({});
  const [lastValidCurrentLocation, setLastValidCurrentLocation] = useState<string>(
    initialData.fullLocation || initialData.location
  );
  const [lastValidPastLocations, setLastValidPastLocations] = useState<{[id: string]: string}>({});
  
  const [currentTimePeriod, setCurrentTimePeriod] = useState(initialData.timePeriod || 'HR');
  
  // New business form states
  const [showNewBusinessForm, setShowNewBusinessForm] = useState(false);
  const [newBusinessAddress, setNewBusinessAddress] = useState('');
  const [isCreatingBusiness, setIsCreatingBusiness] = useState(false);
  const [addressError, setAddressError] = useState('');

  // Current job state
  const [currentJobInput, setCurrentJobInput] = useState("");
  const [currentJobSelected, setCurrentJobSelected] = useState(false);
  
  // Past job state
  const [pastJobInput, setPastJobInput] = useState("");
  const [pastJobSelected, setPastJobSelected] = useState(false);
  
  const [pastJobs, setPastJobs] = useState<PastJob[]>([{
    id: '1',
    salary: '',
    role: '',
    location: ''
  }]);
  const [pastJobTimePeriods, setPastJobTimePeriods] = useState<{[id: string]: string}>({ '1': 'HR' });
  const [isStoriesExpanded, setIsStoriesExpanded] = useState(false);
  const [showHelpPopup, setShowHelpPopup] = useState(false);

  const [initialCurrentJob] = useState(currentJob);
  const [initialTimePeriod] = useState(currentTimePeriod);
  const [changedJobs, setChangedJobs] = useState<Set<string>>(new Set());
  const [currentJobChanged, setCurrentJobChanged] = useState(false);
  
  const currentJobRef = useRef(currentJob);
  const currentTimePeriodRef = useRef(currentTimePeriod);
  const pastJobsRef = useRef(pastJobs);
  const pastJobTimePeriodsRef = useRef(pastJobTimePeriods);
  const changedJobsRef = useRef(changedJobs);
  const currentJobChangedRef = useRef(currentJobChanged);
  const hasCreatedPostsRef = useRef(false);
  const currentJobFullLocationRef = useRef(currentJobFullLocation);
  
  useEffect(() => { currentJobRef.current = currentJob; }, [currentJob]);
  useEffect(() => { currentJobFullLocationRef.current = currentJobFullLocation; }, [currentJobFullLocation]);
  useEffect(() => { currentTimePeriodRef.current = currentTimePeriod; }, [currentTimePeriod]);
  useEffect(() => { pastJobsRef.current = pastJobs; }, [pastJobs]);
  useEffect(() => { pastJobTimePeriodsRef.current = pastJobTimePeriods; }, [pastJobTimePeriods]);
  useEffect(() => { changedJobsRef.current = changedJobs; }, [changedJobs]);
  useEffect(() => { currentJobChangedRef.current = currentJobChanged; }, [currentJobChanged]);

  // Initialize validation states for existing jobs
  useEffect(() => {
    const initialValidation: {[id: string]: boolean} = {};
    const initialValidLocations: {[id: string]: string} = {};
    
    pastJobs.forEach(job => {
      initialValidation[job.id] = true;
      if (job.location) {
        initialValidLocations[job.id] = job.location;
      }
    });
    
    setPastJobLocationValidation(initialValidation);
    setLastValidPastLocations(initialValidLocations);
  }, []);

  // Close help popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showHelpPopup) {
        setShowHelpPopup(false);
      }
    };

    if (showHelpPopup) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showHelpPopup]);

  // Address validation function
  const isValidAddress = (address: string): boolean => {
    if (!address || address.trim().length === 0) return true; // Empty is valid (optional field)
    
    const trimmedAddress = address.trim();
    
    // Check minimum length
    if (trimmedAddress.length < 10) {
      return false;
    }
    
    // Check for basic address components
    const hasNumbers = /\d/.test(trimmedAddress);
    const hasLetters = /[a-zA-Z]/.test(trimmedAddress);
    const hasSpaces = /\s/.test(trimmedAddress);
    
    // Must have numbers (street number), letters, and spaces
    if (!hasNumbers || !hasLetters || !hasSpaces) {
      return false;
    }
    
    // Common street types/suffixes
    const streetTypes = [
      'street', 'st', 'avenue', 'ave', 'road', 'rd', 'drive', 'dr', 'lane', 'ln',
      'boulevard', 'blvd', 'court', 'ct', 'place', 'pl', 'way', 'circle', 'cir',
      'plaza', 'square', 'sq', 'parkway', 'pkwy', 'trail', 'tr', 'terrace', 'ter',
      'highway', 'hwy', 'loop', 'row', 'walk', 'alley', 'crescent', 'cres',
      'grove', 'heights', 'hill', 'park', 'ridge', 'view', 'crossing', 'xing'
    ];
    
    const addressLower = trimmedAddress.toLowerCase();
    const hasStreetType = streetTypes.some(type => 
      addressLower.includes(' ' + type + ' ') || 
      addressLower.endsWith(' ' + type) ||
      addressLower.includes(' ' + type + ',')
    );
    
    // Check for common address patterns
    const addressPatterns = [
      // Pattern: number + street name + type (e.g., "123 Main St")
      /^\d+\s+[a-zA-Z\s]+\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|court|ct|place|pl|way|circle|cir|plaza|square|sq|parkway|pkwy|trail|tr|terrace|ter|highway|hwy|loop|row|walk|alley|crescent|cres|grove|heights|hill|park|ridge|view|crossing|xing)\b/i,
      // Pattern with apartment/unit numbers
      /^\d+\s+[a-zA-Z\s]+\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|court|ct|place|pl|way|circle|cir|plaza|square|sq|parkway|pkwy|trail|tr|terrace|ter|highway|hwy|loop|row|walk|alley|crescent|cres|grove|heights|hill|park|ridge|view|crossing|xing)\b.*?(apt|apartment|unit|suite|ste)?\s*\#?\d*$/i
    ];
    
    const matchesPattern = addressPatterns.some(pattern => pattern.test(trimmedAddress));
    
    // Address is valid if it has street type or matches common patterns
    return hasStreetType || matchesPattern;
  };

  const validateProfanity = (text: string, fieldName: string): boolean => {
    if (isProfane(text)) {
      toast({
        title: `Invalid ${fieldName}`,
        description: `Inappropriate content detected in ${fieldName}`,
        variant: "destructive"
      });
      return false;
    }
    return true;
  };

  const isPastJobComplete = (job: PastJob, timePeriod: string) => job.salary && job.role && job.location && timePeriod;
  const isCurrentJobComplete = () => currentJob.salary && currentJob.role && currentJob.location && currentTimePeriod;

  useEffect(() => {
    return () => {
      if (hasCreatedPostsRef.current || !onJobUpdate) return;
      hasCreatedPostsRef.current = true;

      const hasCurrentJobChangedFromRefs = () => (
        currentJobRef.current.salary !== initialCurrentJob.salary ||
        currentJobRef.current.role !== initialCurrentJob.role ||
        currentJobRef.current.location !== initialCurrentJob.location ||
        currentTimePeriodRef.current !== initialTimePeriod
      );

      const isCurrentJobCompleteFromRefs = () => (
        currentJobRef.current.salary && currentJobRef.current.role && currentJobRef.current.location && currentTimePeriodRef.current
      );

      if (currentJobChangedRef.current && hasCurrentJobChangedFromRefs() && isCurrentJobCompleteFromRefs()) {
        onJobUpdate({
          salary: currentJobRef.current.salary,
          role: currentJobRef.current.role,
          location: currentJobFullLocationRef.current || currentJobRef.current.location,
          timePeriod: currentTimePeriodRef.current
        });
      }

      changedJobsRef.current.forEach(jobId => {
        const job = pastJobsRef.current.find(j => j.id === jobId);
        const timePeriod = pastJobTimePeriodsRef.current[jobId];
        if (job && isPastJobComplete(job, timePeriod)) {
          onJobUpdate({
            salary: job.salary,
            role: job.role,
            location: job.location,
            timePeriod: timePeriod
          });
        }
      });
      
      onPageLeave?.();
    };
  }, []);

  const addPastJob = () => {
    const newJobId = Date.now().toString();
    const newJob: PastJob = { id: newJobId, salary: '', role: '', location: '' };
    setPastJobs([...pastJobs, newJob]);
    setPastJobTimePeriods({ ...pastJobTimePeriods, [newJobId]: 'HR' });
    setPastJobLocationValidation({ ...pastJobLocationValidation, [newJobId]: true });
    setLastValidPastLocations({ ...lastValidPastLocations, [newJobId]: '' });
  };

  const removePastJob = (id: string) => {
    setPastJobs(pastJobs.filter(job => job.id !== id));
    const newValidation = { ...pastJobLocationValidation };
    const newValidLocations = { ...lastValidPastLocations };
    delete newValidation[id];
    delete newValidLocations[id];
    setPastJobLocationValidation(newValidation);
    setLastValidPastLocations(newValidLocations);
  };

  const updatePastJob = (id: string, field: keyof Omit<PastJob, 'id'>, value: string) => {
    const processedValue = field === 'salary' ? (value.replace(/[^0-9.]/g, '') ? `$${value.replace(/[^0-9.]/g, '')}` : '') : value;
    setPastJobs(pastJobs.map(job => job.id === id ? { ...job, [field]: processedValue } : job));
    setChangedJobs(prev => new Set([...prev, id]));
    
    // Reset validation state when location changes
    if (field === 'location') {
      setPastJobLocationValidation({ ...pastJobLocationValidation, [id]: true });
    }
  };

  const updatePastJobTimePeriod = (id: string, timePeriod: string) => {
    setPastJobTimePeriods({ ...pastJobTimePeriods, [id]: timePeriod });
    setChangedJobs(prev => new Set([...prev, id]));
  };

  const handleSalaryChange = (value: string) => {
    const cleanValue = value.replace(/[^0-9.]/g, '');
    setCurrentJob({ ...currentJob, salary: cleanValue ? `$${cleanValue}` : '' });
    setCurrentJobChanged(true);
  };

  const handleCurrentJobRoleChange = (value: string) => { setCurrentJob({ ...currentJob, role: value }); setCurrentJobChanged(true); };
  const handleCurrentJobRoleBlur = () => { if (currentJob.role && !validateProfanity(currentJob.role, 'role')) setCurrentJob({ ...currentJob, role: '' }); };

  const handleCurrentJobLocationChange = (value: string, fullLocation?: string) => { 
    setCurrentJob({ ...currentJob, location: value }); 
    if (fullLocation) setCurrentJobFullLocation(fullLocation); 
    setCurrentJobChanged(true);
    // Reset validation state when location changes
    setCurrentJobLocationValid(true);
    
    // Only show new business form if value exists, has more than 2 characters, and isn't empty
    const shouldShowForm = value && value.trim().length > 2;
    setShowNewBusinessForm(shouldShowForm);
  };

  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewBusinessAddress(value);
    
    // Clear previous error when user starts typing
    if (addressError) {
      setAddressError('');
    }
  };

  const validateAndCreateBusiness = async () => {
    const address = newBusinessAddress.trim();
    
    if (!address) {
      setAddressError('Please enter a business address');
      toast({
        title: 'Address required',
        description: 'Please enter the business address',
        variant: 'destructive',
      });
      return;
    }

    if (isProfane(address)) {
      setAddressError('Invalid address content');
      toast({
        title: 'Invalid address',
        description: 'Inappropriate content detected in address',
        variant: 'destructive',
      });
      return;
    }

    if (!isValidAddress(address)) {
      setAddressError('Please enter a valid street address (e.g., "123 Main St, City, State")');
      return;
    }

    if (!currentJob.salary || !currentJob.role) {
      toast({
        title: 'Missing information',
        description: 'Please fill in salary and role first',
        variant: 'destructive',
      });
      return;
    }

    setIsCreatingBusiness(true);
    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 500));
      toast({
        title: 'Business created!',
        description: 'New business has been added to the map',
      });
      setShowNewBusinessForm(false);
      setNewBusinessAddress('');
      setAddressError('');
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to create business. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsCreatingBusiness(false);
    }
  };

  const handleCurrentJobLocationBlur = () => {
    if (currentJob.location && !validateProfanity(currentJob.location, 'location')) {
      setCurrentJob({ ...currentJob, location: '' });
      return;
    }
  
    // ✅ Skip validation if a business was selected (fullLocation exists)
    if (currentJobFullLocation) {
      setLastValidCurrentLocation(currentJob.location);
      setCurrentJobLocationValid(true);
      return;
    }
  
    // Validate only free-typed addresses
    if (currentJob.location && !isValidAddress(currentJob.location)) {
      setCurrentJobLocationValid(false);
    } else if (currentJob.location) {
      setLastValidCurrentLocation(currentJob.location);
      setCurrentJobLocationValid(true);
    }
  };


  const handleCurrentTimePeriodChange = (value: string) => { setCurrentTimePeriod(value); setCurrentJobChanged(true); };

  const handlePastJobBlur = (id: string, field: 'role' | 'location', value: string) => { 
    if (value && !validateProfanity(value, field)) {
      updatePastJob(id, field, '');
      return;
    }

    // Handle location validation for past jobs
    if (field === 'location' && value) {
      if (!isValidAddress(value)) {
        setPastJobLocationValidation({ ...pastJobLocationValidation, [id]: false });
      } else {
        setLastValidPastLocations({ ...lastValidPastLocations, [id]: value });
        setPastJobLocationValidation({ ...pastJobLocationValidation, [id]: true });
      }
    }
  };

  // Handle page navigation with invalid address recovery
  const handlePageLeave = () => {
    // Restore valid addresses if current ones are invalid
    if (!currentJobLocationValid && lastValidCurrentLocation) {
      setCurrentJob({ ...currentJob, location: lastValidCurrentLocation });
      setCurrentJobFullLocation(lastValidCurrentLocation);
    }

    // Restore valid past job locations
    Object.keys(pastJobLocationValidation).forEach(jobId => {
      if (!pastJobLocationValidation[jobId] && lastValidPastLocations[jobId]) {
        updatePastJob(jobId, 'location', lastValidPastLocations[jobId]);
      }
    });
  };

  // Override the page leave effect to handle address restoration
  useEffect(() => {
    return () => {
      handlePageLeave();
      
      if (hasCreatedPostsRef.current || !onJobUpdate) return;
      hasCreatedPostsRef.current = true;

      const hasCurrentJobChangedFromRefs = () => (
        currentJobRef.current.salary !== initialCurrentJob.salary ||
        currentJobRef.current.role !== initialCurrentJob.role ||
        currentJobRef.current.location !== initialCurrentJob.location ||
        currentTimePeriodRef.current !== initialTimePeriod
      );

      const isCurrentJobCompleteFromRefs = () => (
        currentJobRef.current.salary && currentJobRef.current.role && currentJobRef.current.location && currentTimePeriodRef.current
      );

      if (currentJobChangedRef.current && hasCurrentJobChangedFromRefs() && isCurrentJobCompleteFromRefs()) {
        onJobUpdate({
          salary: currentJobRef.current.salary,
          role: currentJobRef.current.role,
          location: currentJobFullLocationRef.current || currentJobRef.current.location,
          timePeriod: currentTimePeriodRef.current
        });
      }

      changedJobsRef.current.forEach(jobId => {
        const job = pastJobsRef.current.find(j => j.id === jobId);
        const timePeriod = pastJobTimePeriodsRef.current[jobId];
        if (job && isPastJobComplete(job, timePeriod)) {
          onJobUpdate({
            salary: job.salary,
            role: job.role,
            location: job.location,
            timePeriod: timePeriod
          });
        }
      });
      
      onPageLeave?.();
    };
  }, []);

  // Handle help button click with scroll to bottom
  const handleHelpButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowHelpPopup(!showHelpPopup);
    
    // Scroll to bottom after a short delay to allow popup to render
    setTimeout(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({
          top: scrollContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }
    }, 100);
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <div ref={scrollContainerRef} className="app-card p-6 overflow-y-auto relative">
        <h1 className="text-xl font-medium text-app-black mb-8">Your Page! 😊</h1>

        {/* Neighborhoods */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-2">Neighborhoods</h3>
          <div className="flex flex-wrap gap-x-3 gap-y-2">
            {Object.values(nycNeighborhoods).flat().map(n => (
              <button key={n.name} onClick={() => onSearchTrigger?.(n.name)} className="px-1.5 py-0.5 bg-app-yellow text-app-black rounded text-xs hover:bg-app-yellow/90 transition-colors">{n.name}</button>
            ))}
          </div>
        </div>

        {/* Current Job */}
        <div className="mb-8">
          <h2 className="text-lg font-medium text-app-black mb-4">Current Job</h2>
          <div className="space-y-4">
            {/* Location */}
            <div>
              <BusinessSearchDropdown
                value={currentJobInput}
                onChange={(val) => {
                  setCurrentJobInput(val);
                  setCurrentJobSelected(false); // reset validity when typing
                }}
                onSelect={(business) => {
                  setCurrentJobSelected(true);  // mark valid
                  // store selected if you need it: setCurrentJob(business)
                }}
                className={`app-input w-full ${
                  !currentJobSelected && currentJobInput.trim() !== "" ? "border-red-500" : ""
                }`}
                placeholder="Where do you work?..."
                salary={currentJob.salary}
                role={currentJob.role}
                timePeriod={currentTimePeriod}
              />
            
              {/* Show error + address input */}
              {!currentJobSelected && currentJobInput.trim() !== "" && (
                <>
                  <p className="text-red-500 text-xs mt-1">Please enter a valid address</p>
                  <input
                    type="text"
                    placeholder="Enter business address..."
                    className="app-input w-full mt-2"
                    value={currentJobAddress}
                    onChange={(e) => setCurrentJobAddress(e.target.value)}
                  />
                </>
              )}
            </div>


            {/* New Business Form for Current Job */}
            {showNewBusinessForm && (
              <div className="space-y-4">
                <div>
                  <input
                    type="text"
                    value={newBusinessAddress}
                    onChange={handleAddressChange}
                    placeholder="Enter business address (e.g., 123 Main St, City, State)..."
                    className={`app-input w-full ${addressError ? 'border-red-500 border-2' : ''}`}
                  />
                  {addressError && (
                    <p className="text-red-500 text-sm mt-1 px-1">{addressError}</p>
                  )}
                  <p className="text-gray-500 text-xs mt-1 px-1">
                    Please include street number, street name, and street type (e.g., St, Ave, Rd)
                  </p>
                </div>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={validateAndCreateBusiness}
                    disabled={isCreatingBusiness}
                    className="app-input flex-1 bg-app-yellow text-app-black font-medium"
                  >
                    {isCreatingBusiness ? 'Adding Business...' : 'Add New Business'}
                  </button>
                  <button
                    onClick={() => {
                      setShowNewBusinessForm(false);
                      setNewBusinessAddress('');
                      setAddressError('');
                      setCurrentJob({ ...currentJob, location: '' });
                    }}
                    className="app-input w-auto px-6 bg-gray-100 text-app-gray-dark"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            
            {/* Role */}
            <JobSearchDropdown
              value={currentJob.role}
              onChange={handleCurrentJobRoleChange}
              onBlur={handleCurrentJobRoleBlur}
              placeholder="Search or select a job role..."
              className="app-input w-full"
            />
            
            {/* Salary + Time Period */}
            <div className="flex items-center space-x-3">
              <input type="text" inputMode="numeric" value={currentJob.salary} onChange={e => handleSalaryChange(e.target.value)} className="app-input flex-1" placeholder="$14" />
              <select value={currentTimePeriod} onChange={e => handleCurrentTimePeriodChange(e.target.value)} className="px-4 py-3 bg-white text-sm" style={{ border: '2px solid hsl(var(--app-gray-light))', borderRadius: '0.5rem', height: '48px', fontSize: '16px' }}>
                <option value="HR">HR</option>
                <option value="MO">MO</option>
                <option value="YR">YR</option>
              </select>
              <div className="w-6"></div>
            </div>
          </div>
        </div>

        {/* Past Jobs */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-app-black">Past Jobs</h2>
            <button onClick={addPastJob} className="w-6 h-6 bg-app-yellow rounded-full flex items-center justify-center">
              <Plus className="w-4 h-4 text-app-black" />
            </button>
          </div>
          <div className="space-y-4">
            {pastJobs.map(job => (
              <div key={job.id} className="space-y-3 w-full">
                {/* Location */}
                <div>
                  <BusinessSearchDropdown
                    value={pastJobInput}
                    onChange={(val) => {
                      setPastJobInput(val);
                      setPastJobSelected(false);
                    }}
                    onSelect={(business) => {
                      setPastJobSelected(true);
                      // store selected if you need it: setPastJob(business)
                    }}
                    className={`app-input w-full ${
                      !pastJobSelected && pastJobInput.trim() !== "" ? "border-red-500" : ""
                    }`}
                    placeholder="Where did you work?..."
                    salary={pastJob.salary}
                    role={pastJob.role}
                    timePeriod={pastTimePeriod}
                  />
                
                  {!pastJobSelected && pastJobInput.trim() !== "" && (
                    <>
                      <p className="text-red-500 text-xs mt-1">Please enter a valid address</p>
                      <input
                        type="text"
                        placeholder="Enter business address..."
                        className="app-input w-full mt-2"
                        value={pastJobAddress}
                        onChange={(e) => setPastJobAddress(e.target.value)}
                      />
                    </>
                  )}
                </div>
                
                {/* Role */}
                <JobSearchDropdown
                  value={job.role}
                  onChange={value => updatePastJob(job.id, 'role', value)}
                  onBlur={() => handlePastJobBlur(job.id, 'role', job.role)}
                  placeholder="Search or select a job role..."
                  className="app-input w-full"
                />
                
                {/* Salary + Time Period + Remove Button */}
                <div className="flex items-center space-x-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={job.salary}
                    onChange={e => updatePastJob(job.id, 'salary', e.target.value)}
                    className="app-input flex-1"
                    placeholder="$17"
                  />
                  <select
                    value={pastJobTimePeriods[job.id] || 'HR'}
                    onChange={e => updatePastJobTimePeriod(job.id, e.target.value)}
                    className="px-4 py-3 bg-white text-sm"
                    style={{
                      border: '2px solid hsl(var(--app-gray-light))',
                      borderRadius: '0.5rem',
                      height: '48px',
                      fontSize: '16px'
                    }}
                  >
                    <option value="HR">HR</option>
                    <option value="MO">MO</option>
                    <option value="YR">YR</option>
                  </select>
                  {/* Remove button only here at bottom */}
                  <button onClick={() => removePastJob(job.id)} className="w-6 h-6 bg-app-yellow rounded-full flex items-center justify-center">
                    <Minus className="w-4 h-4 text-app-black" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Your Stories */}
        <div className="mt-8">
          <button onClick={() => setIsStoriesExpanded(!isStoriesExpanded)} className="flex items-center justify-between w-full text-left">
            <h3 className="text-lg font-medium text-app-black">Your Stories 📖</h3>
          </button>
          {isStoriesExpanded && (
            <div className="mt-4 space-y-2">
              {userPosts.length === 0 ? (
                <p className="text-app-gray-medium text-sm">No stories yet. Share your workplace experiences!</p>
              ) : (
                <>
                  {userPosts.slice(0, 3).map(post => (
                    <div key={post.id} className="story-item border-l-2 border-app-gray-light pl-4 cursor-pointer hover:bg-app-gray-light/30 p-2 rounded" onClick={() => onPostClick?.(post)}>
                      <p className="text-app-gray-dark text-sm">{post.text.length > 100 ? `${post.text.substring(0, 100)}...` : post.text}</p>
                    </div>
                  ))}
                  {userPosts.length >= 5 && (
                    <button onClick={onStoriesClick} className="w-full mt-3 px-4 py-2 bg-app-yellow text-app-black rounded hover:bg-app-yellow/90 transition-colors">
                      View All Stories ({userPosts.length})
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Help Button - At the bottom left of scrollable content */}
        <div className="mt-8 flex justify-start relative">
          <button 
            onClick={handleHelpButtonClick}
            className="w-6 h-6 bg-app-gray-light rounded-full flex items-center justify-center hover:bg-app-gray-medium transition-colors text-app-black font-bold text-sm"
          >
            ?
          </button>
        </div>

        {/* Help Popup - Styled like other cards with rounded edges */}
        {showHelpPopup && (
          <div 
            className="mt-4 w-full bg-white border-2 border-app-yellow rounded-xl p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-app-gray-dark">
              <strong>Disclaimer:</strong> The information presented in this app is based on surveys, user input, and publicly available sources. We do not independently verify all information, and it should not be taken as factual statements about any individual or organization.
            </p>
          </div>
        )}

      </div>
    </div>
  );
};

export default SettingsPage