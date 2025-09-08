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

  const [currentJob, setCurrentJob] = useState<UserInfo>({
    salary: initialData.salary,
    role: initialData.role,
    location: initialData.fullLocation || initialData.location,
    isHiring: false
  });

  const [currentJobFullLocation, setCurrentJobFullLocation] = useState<string>(
    initialData.fullLocation || initialData.location
  );
  
  const [currentTimePeriod, setCurrentTimePeriod] = useState(initialData.timePeriod || 'HR');
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
  };

  const removePastJob = (id: string) => setPastJobs(pastJobs.filter(job => job.id !== id));
  const updatePastJob = (id: string, field: keyof Omit<PastJob, 'id'>, value: string) => {
    const processedValue = field === 'salary' ? (value.replace(/[^0-9.]/g, '') ? `$${value.replace(/[^0-9.]/g, '')}` : '') : value;
    setPastJobs(pastJobs.map(job => job.id === id ? { ...job, [field]: processedValue } : job));
    setChangedJobs(prev => new Set([...prev, id]));
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
  const handleCurrentJobLocationChange = (value: string, fullLocation?: string) => { setCurrentJob({ ...currentJob, location: value }); if (fullLocation) setCurrentJobFullLocation(fullLocation); setCurrentJobChanged(true); };
  const handleCurrentJobLocationBlur = () => { if (currentJob.location && !validateProfanity(currentJob.location, 'location')) setCurrentJob({ ...currentJob, location: '' }); };
  const handleCurrentTimePeriodChange = (value: string) => { setCurrentTimePeriod(value); setCurrentJobChanged(true); };
  const handlePastJobBlur = (id: string, field: 'role' | 'location', value: string) => { if (value && !validateProfanity(value, field)) updatePastJob(id, field, ''); };

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <div className="app-card p-6 overflow-y-auto relative">
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
            <BusinessSearchDropdown
              value={currentJob.location}
              onChange={handleCurrentJobLocationChange}
              onBlur={handleCurrentJobLocationBlur}
              className="app-input w-full"
              placeholder="Where'd you work?..."
              salary={currentJob.salary}
              role={currentJob.role}
              timePeriod={currentTimePeriod}
            />
            
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
                <BusinessSearchDropdown
                  value={job.location}
                  onChange={(value) => updatePastJob(job.id, 'location', value)}
                  onBlur={() => handlePastJobBlur(job.id, 'location', job.location)}
                  className="app-input w-full"
                  placeholder="Where'd you work?..."
                  salary={job.salary}
                  role={job.role}
                  timePeriod={pastJobTimePeriods[job.id]}
                />
                
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
            onClick={(e) => {
              e.stopPropagation();
              setShowHelpPopup(!showHelpPopup);
            }}
            className="w-6 h-6 bg-app-gray-light rounded-full flex items-center justify-center hover:bg-app-gray-medium transition-colors text-app-black font-bold text-sm"
          >
            ?
          </button>
        </div>

        {/* Help Popup - Styled like other cards */}
        {showHelpPopup && (
          <div 
            className="mt-4 w-full bg-white border-2 border-app-yellow rounded-lg p-4 shadow-lg"
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