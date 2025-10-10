import React, { useState, useEffect, useRef } from "react";
import { Plus, Minus } from "lucide-react";
import JobSearchDropdown from "./JobSearchDropdown";
import BusinessSearchDropdown from "./BusinessSearchDropdown";
import { isProfane } from "../utils/profanityFilter";
import { useToast } from "@/hooks/use-toast";
import { useDevice } from "@/contexts/DeviceContext";
import { nycNeighborhoods } from "../utils/nyc_neighborhoods";
import { usePosts } from "@/hooks/usePosts";
import { getCurrentJob } from "@/services/currentJobs";
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
  onStoriesClick?: () => void;
  onPostClick?: (post: Post) => void;
  onJobUpdate?: (jobData: { salary: string; role: string; location: string; timePeriod: string }) => void;
  onPageLeave?: () => void;
  onSearchTrigger?: (searchTerm: string) => void;
}
const SettingsPage: React.FC<SettingsPageProps> = ({
  initialData,
  onStoriesClick,
  onPostClick,
  onJobUpdate,
  onPageLeave,
  onSearchTrigger,
}) => {
  const { deviceId } = useDevice();
  const { toast } = useToast();
  const { getUserPostsAndCommented, trackCommentedPost } = usePosts();
  const userPosts = getUserPostsAndCommented();

  // Add ref for the scrollable container
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [currentJob, setCurrentJob] = useState<UserInfo>({
    salary: initialData.salary,
    role: initialData.role,
    location: initialData.fullLocation || initialData.location,
    isHiring: false,
  });
  const [currentJobFullLocation, setCurrentJobFullLocation] = useState<string>(
    initialData.fullLocation || initialData.location,
  );
  const [currentTimePeriod, setCurrentTimePeriod] = useState(initialData.timePeriod || "HR");

  // Business selection states for current job
  const [currentJobBusinessInput, setCurrentJobBusinessInput] = useState("");
  const [currentJobBusinessSelected, setCurrentJobBusinessSelected] = useState(!!initialData.location);
  const [currentJobShowAddressInput, setCurrentJobShowAddressInput] = useState(false);
  const [currentJobAddress, setCurrentJobAddress] = useState("");
  const [currentJobAddressError, setCurrentJobAddressError] = useState("");

  // Past jobs state
  const [pastJobs, setPastJobs] = useState<PastJob[]>([
    {
      id: "1",
      salary: "",
      role: "",
      location: "",
    },
  ]);
  const [pastJobTimePeriods, setPastJobTimePeriods] = useState<{
    [id: string]: string;
  }>({
    "1": "HR",
  });

  // Business selection states for past jobs
  const [pastJobBusinessInputs, setPastJobBusinessInputs] = useState<{
    [id: string]: string;
  }>({});
  const [pastJobBusinessSelected, setPastJobBusinessSelected] = useState<{
    [id: string]: boolean;
  }>({});
  const [pastJobShowAddressInputs, setPastJobShowAddressInputs] = useState<{
    [id: string]: boolean;
  }>({});
  const [pastJobAddresses, setPastJobAddresses] = useState<{
    [id: string]: string;
  }>({});
  const [pastJobAddressErrors, setPastJobAddressErrors] = useState<{
    [id: string]: string;
  }>({});
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
  useEffect(() => {
    currentJobRef.current = currentJob;
  }, [currentJob]);
  useEffect(() => {
    currentJobFullLocationRef.current = currentJobFullLocation;
  }, [currentJobFullLocation]);
  useEffect(() => {
    currentTimePeriodRef.current = currentTimePeriod;
  }, [currentTimePeriod]);
  useEffect(() => {
    pastJobsRef.current = pastJobs;
  }, [pastJobs]);
  useEffect(() => {
    pastJobTimePeriodsRef.current = pastJobTimePeriods;
  }, [pastJobTimePeriods]);
  useEffect(() => {
    changedJobsRef.current = changedJobs;
  }, [changedJobs]);
  useEffect(() => {
    currentJobChangedRef.current = currentJobChanged;
  }, [currentJobChanged]);

  // Load current job from Supabase on mount
  useEffect(() => {
    const loadCurrentJob = async () => {
      const jobData = await getCurrentJob();
      if (jobData) {
        setCurrentJob({
          salary: jobData.salary ? `$${jobData.salary}` : "",
          role: jobData.role || "",
          location: jobData.location || "",
          isHiring: false,
        });
        setCurrentJobFullLocation(jobData.location || "");
        setCurrentTimePeriod(jobData.time_period || "HR");
        setCurrentJobBusinessInput(jobData.location || "");
        setCurrentJobBusinessSelected(!!jobData.location);
      }
    };
    loadCurrentJob();
  }, []);

  // Initialize past job states
  useEffect(() => {
    const newInputs: {
      [id: string]: string;
    } = {};
    const newSelected: {
      [id: string]: boolean;
    } = {};
    const newShowAddress: {
      [id: string]: boolean;
    } = {};
    const newAddresses: {
      [id: string]: string;
    } = {};
    const newAddressErrors: {
      [id: string]: string;
    } = {};
    pastJobs.forEach((job) => {
      newInputs[job.id] = job.location || "";
      newSelected[job.id] = !!job.location;
      newShowAddress[job.id] = false;
      newAddresses[job.id] = "";
      newAddressErrors[job.id] = "";
    });
    setPastJobBusinessInputs(newInputs);
    setPastJobBusinessSelected(newSelected);
    setPastJobShowAddressInputs(newShowAddress);
    setPastJobAddresses(newAddresses);
    setPastJobAddressErrors(newAddressErrors);
  }, [pastJobs.length]);

  // Close help popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showHelpPopup) {
        setShowHelpPopup(false);
      }
    };
    if (showHelpPopup) {
      document.addEventListener("click", handleClickOutside);
    }
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [showHelpPopup]);

  // Address validation function
  const isValidAddress = (address: string): boolean => {
    if (!address || address.trim().length === 0) return false;
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
      "street",
      "st",
      "avenue",
      "ave",
      "road",
      "rd",
      "drive",
      "dr",
      "lane",
      "ln",
      "boulevard",
      "blvd",
      "court",
      "ct",
      "place",
      "pl",
      "way",
      "circle",
      "cir",
      "plaza",
      "square",
      "sq",
      "parkway",
      "pkwy",
      "trail",
      "tr",
      "terrace",
      "ter",
      "highway",
      "hwy",
      "loop",
      "row",
      "walk",
      "alley",
      "crescent",
      "cres",
      "grove",
      "heights",
      "hill",
      "park",
      "ridge",
      "view",
      "crossing",
      "xing",
    ];
    const addressLower = trimmedAddress.toLowerCase();
    const hasStreetType = streetTypes.some(
      (type) =>
        addressLower.includes(" " + type + " ") ||
        addressLower.endsWith(" " + type) ||
        addressLower.includes(" " + type + ","),
    );

    // Check for common address patterns
    const addressPatterns = [
      // Pattern: number + street name + type (e.g., "123 Main St")
      /^\d+\s+[a-zA-Z\s]+\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|court|ct|place|pl|way|circle|cir|plaza|square|sq|parkway|pkwy|trail|tr|terrace|ter|highway|hwy|loop|row|walk|alley|crescent|cres|grove|heights|hill|park|ridge|view|crossing|xing)\b/i,
      // Pattern with apartment/unit numbers
      /^\d+\s+[a-zA-Z\s]+\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|court|ct|place|pl|way|circle|cir|plaza|square|sq|parkway|pkwy|trail|tr|terrace|ter|highway|hwy|loop|row|walk|alley|crescent|cres|grove|heights|hill|park|ridge|view|crossing|xing)\b.*?(apt|apartment|unit|suite|ste)?\s*\#?\d*$/i,
    ];
    const matchesPattern = addressPatterns.some((pattern) => pattern.test(trimmedAddress));

    // Address is valid if it has street type or matches common patterns
    return hasStreetType || matchesPattern;
  };
  const validateProfanity = (text: string, fieldName: string): boolean => {
    if (isProfane(text)) {
      toast({
        title: `Invalid ${fieldName}`,
        description: `Inappropriate content detected in ${fieldName}`,
        variant: "destructive",
      });
      return false;
    }
    return true;
  };
  const isPastJobComplete = (job: PastJob, timePeriod: string) => {
    return (
      job.salary &&
      job.role &&
      job.location &&
      timePeriod &&
      pastJobBusinessSelected[job.id] &&
      (!pastJobShowAddressInputs[job.id] || isValidAddress(pastJobAddresses[job.id]))
    );
  };
  const isCurrentJobComplete = () => {
    return (
      currentJob.salary &&
      currentJob.role &&
      currentJob.location &&
      currentTimePeriod &&
      currentJobBusinessSelected &&
      (!currentJobShowAddressInput || isValidAddress(currentJobAddress))
    );
  };
  useEffect(() => {
    return () => {
      if (hasCreatedPostsRef.current || !onJobUpdate) return;
      hasCreatedPostsRef.current = true;
      const hasCurrentJobChangedFromRefs = () =>
        currentJobRef.current.salary !== initialCurrentJob.salary ||
        currentJobRef.current.role !== initialCurrentJob.role ||
        currentJobRef.current.location !== initialCurrentJob.location ||
        currentTimePeriodRef.current !== initialTimePeriod;
      const isCurrentJobCompleteFromRefs = () =>
        currentJobRef.current.salary &&
        currentJobRef.current.role &&
        currentJobRef.current.location &&
        currentTimePeriodRef.current;
      if (currentJobChangedRef.current && hasCurrentJobChangedFromRefs() && isCurrentJobCompleteFromRefs()) {
        onJobUpdate({
          salary: currentJobRef.current.salary,
          role: currentJobRef.current.role,
          location: currentJobFullLocationRef.current || currentJobRef.current.location,
          timePeriod: currentTimePeriodRef.current,
        });
      }
      changedJobsRef.current.forEach((jobId) => {
        const job = pastJobsRef.current.find((j) => j.id === jobId);
        const timePeriod = pastJobTimePeriodsRef.current[jobId];
        if (job && isPastJobComplete(job, timePeriod)) {
          onJobUpdate({
            salary: job.salary,
            role: job.role,
            location: job.location,
            timePeriod: timePeriod,
          });
        }
      });
      onPageLeave?.();
    };
  }, []);
  const addPastJob = () => {
    const newJobId = Date.now().toString();
    const newJob: PastJob = {
      id: newJobId,
      salary: "",
      role: "",
      location: "",
    };
    setPastJobs([...pastJobs, newJob]);
    setPastJobTimePeriods({
      ...pastJobTimePeriods,
      [newJobId]: "HR",
    });

    // Initialize states for new job
    setPastJobBusinessInputs({
      ...pastJobBusinessInputs,
      [newJobId]: "",
    });
    setPastJobBusinessSelected({
      ...pastJobBusinessSelected,
      [newJobId]: false,
    });
    setPastJobShowAddressInputs({
      ...pastJobShowAddressInputs,
      [newJobId]: false,
    });
    setPastJobAddresses({
      ...pastJobAddresses,
      [newJobId]: "",
    });
    setPastJobAddressErrors({
      ...pastJobAddressErrors,
      [newJobId]: "",
    });
  };
  const removePastJob = (id: string) => {
    setPastJobs(pastJobs.filter((job) => job.id !== id));

    // Clean up states for removed job
    const newInputs = {
      ...pastJobBusinessInputs,
    };
    const newSelected = {
      ...pastJobBusinessSelected,
    };
    const newShowAddress = {
      ...pastJobShowAddressInputs,
    };
    const newAddresses = {
      ...pastJobAddresses,
    };
    const newAddressErrors = {
      ...pastJobAddressErrors,
    };
    delete newInputs[id];
    delete newSelected[id];
    delete newShowAddress[id];
    delete newAddresses[id];
    delete newAddressErrors[id];
    setPastJobBusinessInputs(newInputs);
    setPastJobBusinessSelected(newSelected);
    setPastJobShowAddressInputs(newShowAddress);
    setPastJobAddresses(newAddresses);
    setPastJobAddressErrors(newAddressErrors);
  };
  const updatePastJob = (id: string, field: keyof Omit<PastJob, "id">, value: string) => {
    const processedValue =
      field === "salary" ? (value.replace(/[^0-9.]/g, "") ? `$${value.replace(/[^0-9.]/g, "")}` : "") : value;
    setPastJobs(
      pastJobs.map((job) =>
        job.id === id
          ? {
              ...job,
              [field]: processedValue,
            }
          : job,
      ),
    );
    setChangedJobs((prev) => new Set([...prev, id]));
  };
  const updatePastJobTimePeriod = (id: string, timePeriod: string) => {
    setPastJobTimePeriods({
      ...pastJobTimePeriods,
      [id]: timePeriod,
    });
    setChangedJobs((prev) => new Set([...prev, id]));
  };

  // Current job handlers
  const handleSalaryChange = (value: string) => {
    const cleanValue = value.replace(/[^0-9.]/g, "");
    setCurrentJob({
      ...currentJob,
      salary: cleanValue ? `$${cleanValue}` : "",
    });
    setCurrentJobChanged(true);
  };
  const handleCurrentJobRoleChange = (value: string) => {
    setCurrentJob({
      ...currentJob,
      role: value,
    });
    setCurrentJobChanged(true);
  };
  const handleCurrentJobRoleBlur = () => {
    if (currentJob.role && !validateProfanity(currentJob.role, "role")) {
      setCurrentJob({
        ...currentJob,
        role: "",
      });
    }
  };
  const handleCurrentJobBusinessInputChange = (value: string) => {
    setCurrentJobBusinessInput(value);
    setCurrentJobBusinessSelected(false);
    setCurrentJobShowAddressInput(false);
    setCurrentJobAddressError("");
  };
  const handleCurrentJobBusinessSelect = (business: any) => {
    setCurrentJobBusinessSelected(true);
    setCurrentJobShowAddressInput(false);
    setCurrentJob({
      ...currentJob,
      location: business.name || business.location,
    });
    setCurrentJobFullLocation(business.fullLocation || business.name || business.location);
    setCurrentJobChanged(true);
  };
  const handleCurrentJobBusinessBlur = () => {
    if (currentJobBusinessInput.trim() && !currentJobBusinessSelected) {
      setCurrentJobShowAddressInput(true);
    }
  };
  const handleCurrentJobAddressChange = (value: string) => {
    setCurrentJobAddress(value);
    if (currentJobAddressError) {
      setCurrentJobAddressError("");
    }
  };
  const handleCurrentJobAddressBlur = () => {
    const address = currentJobAddress.trim();
    if (!address) {
      setCurrentJobAddressError("Please enter a business address");
      return;
    }
    if (isProfane(address)) {
      setCurrentJobAddressError("Invalid address content");
      return;
    }
    if (!isValidAddress(address)) {
      setCurrentJobAddressError('Please enter a valid street address (e.g., "123 Main St, City, State")');
      return;
    }

    // Address is valid - save it
    setCurrentJob({
      ...currentJob,
      location: address,
    });
    setCurrentJobFullLocation(address);
    setCurrentJobBusinessSelected(true);
    setCurrentJobChanged(true);
    setCurrentJobAddressError("");
  };
  const handleCurrentTimePeriodChange = (value: string) => {
    setCurrentTimePeriod(value);
    setCurrentJobChanged(true);
  };

  // Past job handlers
  const handlePastJobBusinessInputChange = (jobId: string, value: string) => {
    setPastJobBusinessInputs({
      ...pastJobBusinessInputs,
      [jobId]: value,
    });
    setPastJobBusinessSelected({
      ...pastJobBusinessSelected,
      [jobId]: false,
    });
    setPastJobShowAddressInputs({
      ...pastJobShowAddressInputs,
      [jobId]: false,
    });
    setPastJobAddressErrors({
      ...pastJobAddressErrors,
      [jobId]: "",
    });
  };
  const handlePastJobBusinessSelect = (jobId: string, business: any) => {
    setPastJobBusinessSelected({
      ...pastJobBusinessSelected,
      [jobId]: true,
    });
    setPastJobShowAddressInputs({
      ...pastJobShowAddressInputs,
      [jobId]: false,
    });
    updatePastJob(jobId, "location", business.name || business.location);
  };
  const handlePastJobBusinessBlur = (jobId: string) => {
    if (pastJobBusinessInputs[jobId]?.trim() && !pastJobBusinessSelected[jobId]) {
      setPastJobShowAddressInputs({
        ...pastJobShowAddressInputs,
        [jobId]: true,
      });
    }
  };
  const handlePastJobAddressChange = (jobId: string, value: string) => {
    setPastJobAddresses({
      ...pastJobAddresses,
      [jobId]: value,
    });
    if (pastJobAddressErrors[jobId]) {
      setPastJobAddressErrors({
        ...pastJobAddressErrors,
        [jobId]: "",
      });
    }
  };
  const handlePastJobAddressBlur = (jobId: string) => {
    const address = pastJobAddresses[jobId]?.trim() || "";
    if (!address) {
      setPastJobAddressErrors({
        ...pastJobAddressErrors,
        [jobId]: "Please enter a business address",
      });
      return;
    }
    if (isProfane(address)) {
      setPastJobAddressErrors({
        ...pastJobAddressErrors,
        [jobId]: "Invalid address content",
      });
      return;
    }
    if (!isValidAddress(address)) {
      setPastJobAddressErrors({
        ...pastJobAddressErrors,
        [jobId]: 'Please enter a valid street address (e.g., "123 Main St, City, State")',
      });
      return;
    }

    // Address is valid - save it
    updatePastJob(jobId, "location", address);
    setPastJobBusinessSelected({
      ...pastJobBusinessSelected,
      [jobId]: true,
    });
    setPastJobAddressErrors({
      ...pastJobAddressErrors,
      [jobId]: "",
    });
  };
  const handlePastJobRoleBlur = (jobId: string, value: string) => {
    if (value && !validateProfanity(value, "role")) {
      updatePastJob(jobId, "role", "");
    }
  };

  // Handle help button click with scroll to bottom
  const handleHelpButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowHelpPopup(!showHelpPopup);

    // Scroll to bottom after a short delay to allow popup to render
    setTimeout(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({
          top: scrollContainerRef.current.scrollHeight,
          behavior: "smooth",
        });
      }
    }, 100);
  };
  return (
    <div className="w-full h-full flex items-center justify-center bg-transparent overflow-hidden">
      <div className="app-card p-6 animate-fade-in flex flex-col w-full" style={{ maxHeight: "80vh", height: "auto" }}>
        {/* Scrollable content area */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pr-2">
          <h1 className="text-xl font-medium text-app-black mb-2">Your Page! 😊</h1>

          {/* Neighborhoods
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-2">Neighborhoods</h3>
          <div className="flex flex-wrap gap-x-3 gap-y-2">
            {Object.values(nycNeighborhoods).flat().map(n => <button key={n.name} onClick={() => onSearchTrigger?.(n.name)} className="px-1.5 py-0.5 bg-app-yellow text-app-black rounded text-xs hover:bg-app-yellow/90 transition-colors">{n.name}</button>)}
          </div>
        </div> */}

          {/* Current Job */}
          <div className="mb-8">
            <h2 className="text-lg font-medium text-app-black mb-4">Current Job</h2>
            <div className="space-y-4">
              {/* Business Location */}
              <div>
                <BusinessSearchDropdown
                  value={currentJobBusinessInput}
                  onChange={handleCurrentJobBusinessInputChange}
                  onSelect={handleCurrentJobBusinessSelect}
                  onBlur={handleCurrentJobBusinessBlur}
                  className={`app-input w-full ${currentJobShowAddressInput && !currentJobBusinessSelected ? "border-red-500" : ""}`}
                  placeholder="Where do you work?..."
                  salary={currentJob.salary}
                  role={currentJob.role}
                  timePeriod={currentTimePeriod}
                />

                {/* Address input for current job */}
                {currentJobShowAddressInput && !currentJobBusinessSelected && (
                  <div className="mt-2 space-y-2">
                    <p className="text-red-500 text-xs">Business not found. Please enter the address:</p>
                    <input
                      type="text"
                      placeholder="Enter business address (e.g., 123 Main St, City, State)..."
                      className={`app-input w-full ${currentJobAddressError ? "border-red-500 border-2" : ""}`}
                      value={currentJobAddress}
                      onChange={(e) => handleCurrentJobAddressChange(e.target.value)}
                      onBlur={handleCurrentJobAddressBlur}
                    />
                    {currentJobAddressError && <p className="text-red-500 text-sm px-1">{currentJobAddressError}</p>}
                    <p className="text-gray-500 text-xs px-1">
                      Please include street number, street name, and street type (e.g., St, Ave, Rd)
                    </p>
                  </div>
                )}
              </div>

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
                <input
                  type="text"
                  inputMode="numeric"
                  value={currentJob.salary}
                  onChange={(e) => handleSalaryChange(e.target.value)}
                  className="app-input flex-1"
                  placeholder="$14"
                />
                <select
                  value={currentTimePeriod}
                  onChange={(e) => handleCurrentTimePeriodChange(e.target.value)}
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
                <div className="w-6"></div>
              </div>
            </div>
          </div>

          {/* Past Jobs */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-app-black">Past Jobs</h2>
              <button
                onClick={addPastJob}
                className="w-6 h-6 bg-app-yellow rounded-full flex items-center justify-center"
              >
                <Plus className="w-4 h-4 text-app-black" />
              </button>
            </div>
            <div className="space-y-4">
              {pastJobs.map((job) => (
                <div key={job.id} className="space-y-3 w-full">
                  {/* Business Location */}
                  <div>
                    <BusinessSearchDropdown
                      value={pastJobBusinessInputs[job.id] || ""}
                      onChange={(value) => handlePastJobBusinessInputChange(job.id, value)}
                      onSelect={(business) => handlePastJobBusinessSelect(job.id, business)}
                      onBlur={() => handlePastJobBusinessBlur(job.id)}
                      className={`app-input w-full ${pastJobShowAddressInputs[job.id] && !pastJobBusinessSelected[job.id] ? "border-red-500" : ""}`}
                      placeholder="Where did you work?..."
                      salary={job.salary}
                      role={job.role}
                      timePeriod={pastJobTimePeriods[job.id]}
                    />

                    {/* Address input for past job */}
                    {pastJobShowAddressInputs[job.id] && !pastJobBusinessSelected[job.id] && (
                      <div className="mt-2 space-y-2">
                        <p className="text-red-500 text-xs">Business not found. Please enter the address:</p>
                        <input
                          type="text"
                          placeholder="Enter business address (e.g., 123 Main St, City, State)..."
                          className={`app-input w-full ${pastJobAddressErrors[job.id] ? "border-red-500 border-2" : ""}`}
                          value={pastJobAddresses[job.id] || ""}
                          onChange={(e) => handlePastJobAddressChange(job.id, e.target.value)}
                          onBlur={() => handlePastJobAddressBlur(job.id)}
                        />
                        {pastJobAddressErrors[job.id] && (
                          <p className="text-red-500 text-sm px-1">{pastJobAddressErrors[job.id]}</p>
                        )}
                        <p className="text-gray-500 text-xs px-1">
                          Please include street number, street name, and street type (e.g., St, Ave, Rd)
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Role */}
                  <JobSearchDropdown
                    value={job.role}
                    onChange={(value) => updatePastJob(job.id, "role", value)}
                    onBlur={() => handlePastJobRoleBlur(job.id, job.role)}
                    placeholder="Search or select a job role..."
                    className="app-input w-full"
                  />

                  {/* Salary + Time Period + Remove Button */}
                  <div className="flex items-center space-x-3">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={job.salary}
                      onChange={(e) => updatePastJob(job.id, "salary", e.target.value)}
                      className="app-input flex-1"
                      placeholder="$17"
                    />
                    <select
                      value={pastJobTimePeriods[job.id] || "HR"}
                      onChange={(e) => updatePastJobTimePeriod(job.id, e.target.value)}
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
                    <button
                      onClick={() => removePastJob(job.id)}
                      className="w-6 h-6 bg-app-yellow rounded-full flex items-center justify-center"
                    >
                      <Minus className="w-4 h-4 text-app-black" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* My Stories & Comments */}
          <div className="mt-8">
            <button
              onClick={() => setIsStoriesExpanded(!isStoriesExpanded)}
              className="flex items-center justify-between w-full text-left"
            >
              <h3 className="text-lg font-medium text-app-black">My Stories 📖</h3>
            </button>
            {isStoriesExpanded && (
              <div className="mt-4 space-y-2">
                {userPosts.length === 0 ? (
                  <p className="text-app-gray-medium text-sm">
                    No stories or comments yet. Share your workplace experiences!
                  </p>
                ) : (
                  <>
                    {userPosts.slice(0, 3).map((post) => (
                      <div
                        key={post.id}
                        className="story-item border-l-2 border-app-gray-light pl-4 cursor-pointer hover:bg-app-gray-light/30 p-2 rounded"
                        onClick={() => onPostClick?.(post)}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-xs text-app-gray-medium">
                            {post.author === "You" ? "Your story" : "Commented on"}
                          </p>
                          {post.businessName && (
                            <span className="text-xs text-app-gray-medium">at {post.businessName}</span>
                          )}
                        </div>
                        <p className="text-app-gray-dark text-sm">
                          {post.text.length > 100 ? `${post.text.substring(0, 100)}...` : post.text}
                        </p>
                      </div>
                    ))}
                    {userPosts.length >= 5 && (
                      <button
                        onClick={onStoriesClick}
                        className="w-full mt-3 px-4 py-2 bg-app-yellow text-app-black rounded hover:bg-app-yellow/90 transition-colors"
                      >
                        View All Stories & Comments ({userPosts.length})
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
                <strong>Disclaimer:</strong> The information presented in this app is based on surveys, user input, and
                publicly available sources. We do not independently verify all information, and it should not be taken
                as factual statements about any individual or organization.
              </p>
              <a
                href="https://breakroom-privacy-policy.lovable.app/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
              >
                Privacy Policy
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
export default SettingsPage;
