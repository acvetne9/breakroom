import React, { useState } from 'react';
import { Plus, Minus } from 'lucide-react';
import JobSearchDropdown from './JobSearchDropdown';
import { isProfane } from '../utils/profanityFilter';
import { useToast } from '@/hooks/use-toast';
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
}
const SettingsPage: React.FC<SettingsPageProps> = ({
  initialData,
  userPosts = [],
  onStoriesClick,
  onPostClick
}) => {
  const [currentJob, setCurrentJob] = useState<UserInfo>({
    salary: initialData.salary,
    role: initialData.role,
    location: initialData.fullLocation || initialData.location,
    isHiring: false
  });
  const [currentTimePeriod, setCurrentTimePeriod] = useState(initialData.timePeriod || 'HR');
  const [pastJobs, setPastJobs] = useState<PastJob[]>([{
    id: '1',
    salary: '',
    role: '',
    location: ''
  }]);
  const [isStoriesExpanded, setIsStoriesExpanded] = useState(false);
  const {
    toast
  } = useToast();
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
  const addPastJob = () => {
    const newJob: PastJob = {
      id: Date.now().toString(),
      salary: '',
      role: '',
      location: ''
    };
    setPastJobs([...pastJobs, newJob]);
  };
  const removePastJob = (id: string) => {
    setPastJobs(pastJobs.filter(job => job.id !== id));
  };
  const updatePastJob = (id: string, field: keyof Omit<PastJob, 'id'>, value: string) => {
    const processedValue = field === 'salary' ? value.replace(/[^0-9.]/g, '') ? `$${value.replace(/[^0-9.]/g, '')}` : '' : value;
    setPastJobs(pastJobs.map(job => job.id === id ? {
      ...job,
      [field]: processedValue
    } : job));
  };
  const handleSalaryChange = (value: string) => {
    // Only allow numbers and auto-add $
    const cleanValue = value.replace(/[^0-9.]/g, '');
    setCurrentJob({
      ...currentJob,
      salary: cleanValue ? `$${cleanValue}` : ''
    });
  };
  const handleCurrentJobRoleChange = (value: string) => {
    setCurrentJob({
      ...currentJob,
      role: value
    });
  };
  const handleCurrentJobLocationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCurrentJob({
      ...currentJob,
      location: value
    });
  };
  const handleCurrentJobRoleBlur = () => {
    if (currentJob.role && !validateProfanity(currentJob.role, 'role')) {
      setCurrentJob({
        ...currentJob,
        role: ''
      });
    }
  };
  const handleCurrentJobLocationBlur = () => {
    if (currentJob.location && !validateProfanity(currentJob.location, 'location')) {
      setCurrentJob({
        ...currentJob,
        location: ''
      });
    }
  };
  const handlePastJobBlur = (id: string, field: 'role' | 'location', value: string) => {
    if (value && !validateProfanity(value, field)) {
      updatePastJob(id, field, '');
    }
  };
  return <div className="relative w-full h-full flex items-center justify-center">
      <div className="app-card p-6 overflow-y-auto">
        <h1 className="text-xl font-medium text-app-black mb-8">Your Info.</h1>
        
        {/* Current Job Section */}
        <div className="mb-8">
          <h2 className="text-lg font-medium text-app-black mb-4">Current Job</h2>
          
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <input type="text" value={currentJob.salary} onChange={e => handleSalaryChange(e.target.value)} className="app-input flex-1" placeholder="$14" />
              <select 
                value={currentTimePeriod}
                onChange={(e) => setCurrentTimePeriod(e.target.value)}
                className="px-4 py-3 bg-white text-sm" 
                style={{
                  border: '1px solid hsl(var(--app-gray-light))',
                  borderRadius: '0.5rem',
                  height: '48px',
                  fontSize: '16px'
                }}
              >
                <option value="HR">HR</option>
                <option value="MO">MO</option>
                <option value="YR">YR</option>
              </select>
              <div className="w-6"></div>
            </div>

            <div className="flex items-center space-x-3">
              <JobSearchDropdown value={currentJob.role} onChange={handleCurrentJobRoleChange} onBlur={handleCurrentJobRoleBlur} placeholder="Search or select a job role..." className="app-input flex-1" />
              <div className="w-6"></div>
            </div>

            <div className="flex items-center space-x-3">
              <input type="text" value={currentJob.location} onChange={handleCurrentJobLocationChange} onBlur={handleCurrentJobLocationBlur} className="app-input flex-1" placeholder="Starbucks" />
              <div className="w-6"></div>
            </div>

            <div className="flex items-center space-x-4">
              <span className="text-app-black">Hiring?</span>
              <div className="flex space-x-2">
                <button onClick={() => setCurrentJob({
                ...currentJob,
                isHiring: true
              })} className={`px-4 py-2 rounded-lg text-sm ${currentJob.isHiring ? 'bg-app-yellow text-app-black' : 'bg-app-gray-light text-app-gray-medium'}`}>
                  Yes
                </button>
                <button onClick={() => setCurrentJob({
                ...currentJob,
                isHiring: false
              })} className={`px-4 py-2 rounded-lg text-sm ${!currentJob.isHiring ? 'bg-app-yellow text-app-black' : 'bg-app-gray-light text-app-gray-medium'}`}>
                  No
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Past Jobs Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-app-black">Past Jobs</h2>
            <button onClick={addPastJob} className="w-6 h-6 bg-app-yellow rounded-full flex items-center justify-center">
              <Plus className="w-4 h-4 text-app-black" />
            </button>
          </div>

          <div className="space-y-4">
            {pastJobs.map(job => <div key={job.id} className="space-y-3">
                <div className="flex items-center space-x-3">
                  <input type="text" value={job.salary} onChange={e => updatePastJob(job.id, 'salary', e.target.value)} className="app-input flex-1" placeholder="$17" />
                  <select className="px-4 py-3 bg-white text-sm" style={{
                border: '1px solid hsl(var(--app-gray-light))',
                borderRadius: '0.5rem',
                height: '48px',
                fontSize: '16px'
              }}>
                    <option>HR</option>
                    <option>MO</option>
                    <option>YR</option>
                  </select>
                  <div className="w-6"></div>
                </div>

                <div className="flex items-center space-x-3">
                  <JobSearchDropdown value={job.role} onChange={value => updatePastJob(job.id, 'role', value)} onBlur={() => handlePastJobBlur(job.id, 'role', job.role)} placeholder="Search or select a job role..." className="app-input flex-1" />
                  <div className="w-6"></div>
                </div>

                <div className="flex items-center space-x-3">
                  <input type="text" value={job.location} onChange={e => updatePastJob(job.id, 'location', e.target.value)} onBlur={() => handlePastJobBlur(job.id, 'location', job.location)} className="app-input flex-1" placeholder="Movie Theater" />
                  <button onClick={() => removePastJob(job.id)} className="w-6 h-6 bg-app-yellow rounded-full flex items-center justify-center">
                    <Minus className="w-4 h-4 text-app-black" />
                  </button>
                </div>
              </div>)}
          </div>
        </div>

        {/* Your Stories Section */}
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
                      <p className="text-app-gray-dark text-sm">
                        <span className="font-medium">@{post.author}:</span> {post.text.length > 100 ? `${post.text.substring(0, 100)}...` : post.text}
                      </p>
                    </div>
                  ))}
                  {userPosts.length > 0 && (
                    <button 
                      onClick={onStoriesClick} 
                      className="w-full mt-3 px-4 py-2 bg-app-yellow text-app-black rounded hover:bg-app-yellow/90 transition-colors"
                    >
                      View All Stories ({userPosts.length})
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>;
};
export default SettingsPage;