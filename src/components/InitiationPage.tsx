import React, { useState } from 'react';
// framer-motion removed to prevent dynamic import parse issue
import JobSearchDropdown from './JobSearchDropdown';
import BusinessSearchDropdown from './BusinessSearchDropdown';
import { isProfane } from '../utils/profanityFilter';
import { useToast } from '@/hooks/use-toast';

// Import the predefined job options to check against
const JOB_OPTIONS = ["Software Engineer", "Frontend Developer", "Backend Developer", "Full Stack Developer", "Mobile App Developer", "Web Developer", "UI Designer", "UX Designer", "Data Scientist", "Machine Learning Engineer", "AI Researcher", "Cloud Architect", "DevOps Engineer", "Systems Administrator", "Network Engineer", "Database Administrator", "Cybersecurity Analyst", "QA Engineer", "Game Developer", "Embedded Systems Engineer", "Technical Writer", "Product Manager", "Scrum Master", "IT Support Specialist", "Help Desk Technician", "Doctor", "Nurse", "Licensed Practical Nurse", "Certified Nursing Assistant", "Pharmacist", "Pharmacy Technician", "Paramedic", "Emergency Medical Technician", "Dentist", "Dental Hygienist", "Dental Assistant", "Veterinarian", "Veterinary Technician", "Physical Therapist", "Occupational Therapist", "Radiologic Technologist", "Medical Assistant", "Surgical Technologist", "Respiratory Therapist", "Home Health Aide", "Barista", "Server", "Cook", "Line Cook", "Prep Cook", "Sous Chef", "Chef", "Pastry Chef", "Food Service Worker", "Waiter", "Waitress", "Host", "Hostess", "Busser", "Dishwasher", "Caterer", "Food Runner", "Fast Food Worker", "Drive-Thru Operator", "Bartender", "Barback", "Delivery Driver", "Pizza Delivery Driver", "Hotel Housekeeper", "Front Desk Clerk", "Hotel Concierge", "Bellhop", "Room Service Attendant", "Valet Attendant", "Casino Dealer", "Casino Host", "Event Coordinator", "Wedding Planner", "Banquet Server", "Club Promoter", "Tour Guide", "Cashier", "Retail Associate", "Sales Associate", "Stock Associate", "Customer Service Representative", "Customer Service", "Inventory Clerk", "Shelf Stocker", "Store Manager", "Assistant Store Manager", "Greeter", "Bagging Clerk", "Mall Security Guard", "Merchandiser", "Personal Shopper", "Gift Wrapper", "Loss Prevention Specialist", "Taxi Driver", "Ride-share Driver", "Driver", "Bus Driver", "School Bus Driver", "Truck Driver", "Delivery Driver", "Courier", "Bicycle Messenger", "Forklift Operator", "Warehouse Worker", "Order Picker", "Package Handler", "Logistics Coordinator", "Dock Worker", "Shipping Clerk", "Nanny", "Babysitter", "Daycare Worker", "Preschool Teacher", "Childcare Assistant", "Elder Caregiver", "Home Health Aide", "Housekeeper", "Cleaner", "Janitor", "Maid", "Pet Sitter", "Dog Walker", "Pet Groomer", "Landscaper", "Gardener", "Pool Cleaner", "Electrician", "Plumber", "Carpenter", "Welder", "HVAC Technician", "Auto Mechanic", "Diesel Mechanic", "Machinist", "Construction Worker", "General Laborer", "Roofing Specialist", "Painter", "Drywall Installer", "Flooring Installer", "Bricklayer", "Receptionist", "Administrative Assistant", "Office Clerk", "Data Entry Clerk", "File Clerk", "Executive Assistant", "Secretary", "Office Manager", "Virtual Assistant", "Call Center Representative", "Collections Agent", "Telemarketer", "Appointment Setter", "Mailroom Clerk", "Switchboard Operator", "Accountant", "Auditor", "Bookkeeper", "Tax Preparer", "Financial Analyst", "Budget Analyst", "Loan Officer", "Insurance Agent", "Claims Adjuster", "Bank Teller", "Mortgage Broker", "Investment Analyst", "Payroll Specialist", "Real Estate Agent", "Property Manager", "Teacher", "Teaching Assistant", "Substitute Teacher", "School Counselor", "Principal", "Tutor", "Librarian", "Library Assistant", "Academic Advisor", "Professor", "Lawyer", "Paralegal", "Legal Assistant", "Court Clerk", "Judge", "Security Guard", "Private Investigator", "Police Officer", "Corrections Officer", "Firefighter", "Manager", "Assistant Manager", "Shift Leader", "Supervisor", "Team Lead", "Freelance Writer", "Graphic Designer", "Illustrator", "Photographer", "Video Editor", "Voice Actor", "Music Producer", "Social Media Influencer", "Virtual Tutor", "Translator", "Maintenance Worker", "Facilities Technician", "Groundskeeper", "Building Superintendent", "Handyman", "Lifeguard", "Camp Counselor", "Amusement Park Worker", "Theme Park Attendant", "Carnival Worker", "Tour Bus Driver", "Street Performer", "Festival Staff", "Farm Worker", "Fruit Picker", "City Planner", "Urban Planner", "Building Inspector", "City Clerk", "City Council Member", "Mayor's Assistant", "Public Works Laborer", "Water Treatment Plant Operator", "Waste Management Worker", "Sanitation Worker", "Street Sweeper Operator", "Parking Enforcement Officer", "Meter Reader", "Building Maintenance Worker", "Parks and Recreation Worker", "Recreation Coordinator", "Community Outreach Specialist", "City Bus Driver", "Transit Operator", "Traffic Engineer", "Civil Engineer (Municipal)", "City Electrician", "Zoning Officer", "Public Safety Officer", "Emergency Management Coordinator", "City Attorney", "Planning and Zoning Coordinator", "City Engineer", "City Project Manager", "Permit Technician", "Code Enforcement Officer", "Neighborhood Services Coordinator", "City Grant Writer", "Community Development Specialist", "Animal Control Officer", "Public Health Inspector", "City Auditor", "Budget Officer", "City Finance Director", "Environmental Compliance Specialist", "City Surveyor", "Municipal Court Clerk", "Recycling Program Coordinator", "Water Quality Technician", "Traffic Signal Technician", "Road Maintenance Worker", "City Arborist", "Crew Member", "Associate", "Team Member", "Helper", "Laborer", "Worker", "Staff Member", "General Worker", "Operator", "Technician", "Specialist", "Coordinator", "Agent", "Assistant", "Personal Trainer", "Psychiatrist", "Consultant"];
interface InitiationPageProps {
  onComplete: (data: {
    salary: string;
    role: string;
    location: string;
    fullLocation?: string;
    timePeriod: string;
  }) => void;
}

const InitiationPage: React.FC<InitiationPageProps> = ({ onComplete }) => {
  const [salary, setSalary] = useState('');
  const [role, setRole] = useState('');
  const [location, setLocation] = useState('');
  const [fullLocation, setFullLocation] = useState('');
  const [timePeriod, setTimePeriod] = useState('HR');
  const [isComplete, setIsComplete] = useState(false);
  const [showNewBusinessForm, setShowNewBusinessForm] = useState(false);
  const [newBusinessAddress, setNewBusinessAddress] = useState('');
  const [isCreatingBusiness, setIsCreatingBusiness] = useState(false);
  const { toast } = useToast();

  /** Format salary as $123.00 */
  const formatSalary = (input: string) => {
    const cleanValue = input.replace(/[^0-9.]/g, '');
    const number = parseFloat(cleanValue);
    if (isNaN(number)) return '';
    return `$${number.toFixed(2)}`;
  };

  const handleSalaryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Remove non-numeric characters except decimal point
    let raw = e.target.value.replace(/[^0-9.]/g, "");
    
    // Ensure only one decimal point
    const parts = raw.split('.');
    if (parts.length > 2) {
      raw = parts[0] + '.' + parts.slice(1).join('');
    }
    
    // Limit to 2 decimal places
    if (parts[1] && parts[1].length > 2) {
      raw = parts[0] + '.' + parts[1].substring(0, 2);
    }
    
    // Format with $ prefix for display
    const formatted = raw ? `$${raw}` : '';
    setSalary(formatted);
  };

  const checkForCompletion = () => {
    const allFilled =
      salary.trim() !== '' && role.trim() !== '' && location.trim() !== '';
    const isValidRole =
      JOB_OPTIONS.includes(role.trim()) || role.trim() === 'Other';

    if (allFilled && isValidRole && !isComplete) {
      setIsComplete(true);

      // Delay to allow for UI animations if needed
      setTimeout(() => {
        const dataToPass = {
          salary,
          role,
          location,
          fullLocation: fullLocation || location,
          timePeriod,
        };
        onComplete(dataToPass);
      }, 300);
    }
  };

  const handleRoleChange = (value: string) => {
    const isPredefinedOption = JOB_OPTIONS.includes(value);
    if (!isPredefinedOption && value && isProfane(value)) {
      toast({
        title: 'Invalid role',
        description: 'Inappropriate content detected in job role',
        variant: 'destructive',
      });
      return;
    }
    setRole(value);
  };

  const handleLocationChange = (value: string, fullLocation?: string) => {
    setLocation(value);
    setFullLocation(fullLocation || value);
    setShowNewBusinessForm(value && value.length > 2);
  };

  const handleLocationBlur = () => {
    const value = location.trim();
    if (!value) {
      setLocation('');
      setFullLocation('');
      return;
    }
    if (value && isProfane(value)) {
      toast({
        title: 'Invalid location',
        description: 'Inappropriate content detected in location',
        variant: 'destructive',
      });
      setLocation('');
      setFullLocation('');
      return;
    }
    setTimeout(() => checkForCompletion(), 10);
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center">
      <div className="app-card flex flex-col justify-center px-8 py-12">
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-app-black mb-6 font-normal text-lg">
              Make A Difference! ❤️
              <br />
              Share A Past Or Current Job
            </h1>
          </div>

          <div className="space-y-6">
            {/* Salary + Time Period */}
            <div>
              <div className="flex items-center space-x-3">
                <input
                  type="text"
                  inputMode="numeric"
                  value={salary}
                  onChange={handleSalaryChange}
                  onBlur={checkForCompletion}
                  placeholder="$0.00"
                  className="app-input text-center text-lg flex-1 !py-0 h-12"
                />
                <select
                  value={timePeriod}
                  onChange={(e) => setTimePeriod(e.target.value)}
                  className="app-input text-lg w-auto !py-0 h-12"
                >
                  <option value="HR">HR</option>
                  <option value="MO">MO</option>
                  <option value="YR">YR</option>
                </select>
              </div>
            </div>

            <div className="text-center">
              <p className="text-app-black mb-4 text-lg font-normal">
                3 Easy Questions. Kept Anonymous 🤐
              </p>
            </div>

            {/* Role */}
            <div>
              <JobSearchDropdown
                value={role}
                onChange={handleRoleChange}
                onBlur={checkForCompletion}
                placeholder="Search or select a job role..."
                className="app-input"
              />
            </div>

            <div className="text-center">
              <p className="text-app-black mb-4 text-lg">
                Find Work That Works For You 👷‍♀️
              </p>
            </div>

            {/* Location */}
            <div>
              <BusinessSearchDropdown
                value={location}
                onChange={handleLocationChange}
                onBlur={handleLocationBlur}
                placeholder="Where'd you work?..."
                className="app-input"
                salary={salary}
                role={role}
                timePeriod={timePeriod}
              />
            </div>

            <div className="text-center mt-8">
              <p className="text-app-black text-lg">
                Don't worry, your boss won't find out 😉
              </p>
            </div>

            {/* New Business Form */}
            {showNewBusinessForm && (
              <div className="space-y-4 mt-6">
                <div>
                  <input
                    type="text"
                    value={newBusinessAddress}
                    onChange={(e) => setNewBusinessAddress(e.target.value)}
                    placeholder="Enter business address..."
                    className="app-input"
                  />
                </div>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={async () => {
                      if (!newBusinessAddress.trim()) {
                        toast({
                          title: 'Address required',
                          description: 'Please enter the business address',
                          variant: 'destructive',
                        });
                        return;
                      }
                      if (!salary || !role) {
                        toast({
                          title: 'Missing information',
                          description: 'Please fill in salary and role first',
                          variant: 'destructive',
                        });
                        return;
                      }
                      setIsCreatingBusiness(true);
                      try {
                        await new Promise((resolve) =>
                          setTimeout(resolve, 500)
                        ); // Simulate creation
                        toast({
                          title: 'Business created!',
                          description: 'New business has been added to the map',
                        });
                        setShowNewBusinessForm(false);
                        setNewBusinessAddress('');
                        setTimeout(() => checkForCompletion(), 100);
                      } catch {
                        toast({
                          title: 'Error',
                          description:
                            'Failed to create business. Please try again.',
                          variant: 'destructive',
                        });
                      } finally {
                        setIsCreatingBusiness(false);
                      }
                    }}
                    disabled={isCreatingBusiness}
                    className="app-input flex-1 bg-app-yellow text-app-black font-medium"
                  >
                    {isCreatingBusiness
                      ? 'Adding Business...'
                      : 'Add New Business'}
                  </button>
                  <button
                    onClick={() => {
                      setShowNewBusinessForm(false);
                      setNewBusinessAddress('');
                      setLocation('');
                    }}
                    className="app-input w-auto px-6 bg-gray-100 text-app-gray-dark"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InitiationPage;