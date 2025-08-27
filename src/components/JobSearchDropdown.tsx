import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface JobSearchDropdownProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
}

const JOB_OPTIONS = [
    "Software Engineer", "Frontend Developer", "Backend Developer", "Full Stack Developer", "Mobile App Developer",
    "Web Developer", "UI Designer", "UX Designer", "Data Scientist", "Machine Learning Engineer",
    "AI Researcher", "Cloud Architect", "DevOps Engineer", "Systems Administrator", "Network Engineer",
    "Database Administrator", "Cybersecurity Analyst", "QA Engineer", "Game Developer", "Embedded Systems Engineer",
    "Technical Writer", "Product Manager", "Scrum Master", "IT Support Specialist", "Help Desk Technician",

    "Doctor", "Nurse", "Licensed Practical Nurse", "Certified Nursing Assistant", "Pharmacist",
    "Pharmacy Technician", "Paramedic", "Emergency Medical Technician", "Dentist", "Dental Hygienist",
    "Dental Assistant", "Veterinarian", "Veterinary Technician", "Physical Therapist", "Occupational Therapist",
    "Radiologic Technologist", "Medical Assistant", "Surgical Technologist", "Respiratory Therapist", "Home Health Aide",

    "Barista", "Server", "Cook", "Line Cook", "Prep Cook", "Sous Chef", "Chef", "Pastry Chef", "Food Service Worker",
    "Waiter", "Waitress", "Host", "Hostess", "Busser", "Dishwasher", "Caterer", "Food Runner", "Fast Food Worker",
    "Drive-Thru Operator", "Bartender", "Barback", "Delivery Driver", "Pizza Delivery Driver", "Hotel Housekeeper",
    "Front Desk Clerk", "Hotel Concierge", "Bellhop", "Room Service Attendant", "Valet Attendant", "Casino Dealer",
    "Casino Host", "Event Coordinator", "Wedding Planner", "Banquet Server", "Club Promoter", "Tour Guide",

    "Cashier", "Retail Associate", "Sales Associate", "Stock Associate", "Customer Service Representative",
    "Customer Service", "Inventory Clerk", "Shelf Stocker", "Store Manager", "Assistant Store Manager", "Greeter",
    "Bagging Clerk", "Mall Security Guard", "Merchandiser", "Personal Shopper", "Gift Wrapper", "Loss Prevention Specialist",

    "Taxi Driver", "Ride-share Driver", "Driver", "Bus Driver", "School Bus Driver", "Truck Driver",
    "Delivery Driver", "Courier", "Bicycle Messenger", "Forklift Operator", "Warehouse Worker",
    "Order Picker", "Package Handler", "Logistics Coordinator", "Dock Worker", "Shipping Clerk",

    "Nanny", "Babysitter", "Daycare Worker", "Preschool Teacher", "Childcare Assistant",
    "Elder Caregiver", "Home Health Aide", "Housekeeper", "Cleaner", "Janitor", "Maid",
    "Pet Sitter", "Dog Walker", "Pet Groomer", "Landscaper", "Gardener", "Pool Cleaner",

    "Electrician", "Plumber", "Carpenter", "Welder", "HVAC Technician", "Auto Mechanic",
    "Diesel Mechanic", "Machinist", "Construction Worker", "General Laborer",
    "Roofing Specialist", "Painter", "Drywall Installer", "Flooring Installer", "Bricklayer",

    "Receptionist", "Administrative Assistant", "Office Clerk", "Data Entry Clerk", "File Clerk",
    "Executive Assistant", "Secretary", "Office Manager", "Virtual Assistant", "Call Center Representative",
    "Collections Agent", "Telemarketer", "Appointment Setter", "Mailroom Clerk", "Switchboard Operator",

    "Accountant", "Auditor", "Bookkeeper", "Tax Preparer", "Financial Analyst",
    "Budget Analyst", "Loan Officer", "Insurance Agent", "Claims Adjuster", "Bank Teller",
    "Mortgage Broker", "Investment Analyst", "Payroll Specialist", "Real Estate Agent", "Property Manager",

    "Teacher", "Teaching Assistant", "Substitute Teacher", "School Counselor", "Principal",
    "Tutor", "Librarian", "Library Assistant", "Academic Advisor", "Professor",

    "Lawyer", "Paralegal", "Legal Assistant", "Court Clerk", "Judge",
    "Security Guard", "Private Investigator", "Police Officer", "Corrections Officer", "Firefighter",

    "Manager", "Assistant Manager", "Shift Leader", "Supervisor", "Team Lead",

    "Freelance Writer", "Graphic Designer", "Illustrator", "Photographer", "Video Editor",
    "Voice Actor", "Music Producer", "Social Media Influencer", "Virtual Tutor", "Translator",

    "Maintenance Worker", "Facilities Technician", "Groundskeeper", "Building Superintendent", "Handyman",

    "Lifeguard", "Camp Counselor", "Amusement Park Worker", "Theme Park Attendant", "Carnival Worker",
    "Tour Bus Driver", "Street Performer", "Festival Staff", "Farm Worker", "Fruit Picker",

    "City Planner", "Urban Planner", "Building Inspector", "City Clerk", "City Council Member",
    "Mayor's Assistant", "Public Works Laborer", "Water Treatment Plant Operator", "Waste Management Worker",
    "Sanitation Worker", "Street Sweeper Operator", "Parking Enforcement Officer", "Meter Reader",
    "Building Maintenance Worker", "Parks and Recreation Worker", "Recreation Coordinator", "Community Outreach Specialist",
    "City Bus Driver", "Transit Operator", "Traffic Engineer", "Civil Engineer (Municipal)", "City Electrician",
    "Zoning Officer", "Public Safety Officer", "Emergency Management Coordinator", "City Attorney",
    "Planning and Zoning Coordinator", "City Engineer", "City Project Manager", "Permit Technician",
    "Code Enforcement Officer", "Neighborhood Services Coordinator", "City Grant Writer", "Community Development Specialist",
    "Animal Control Officer", "Public Health Inspector", "City Auditor", "Budget Officer", "City Finance Director",
    "Environmental Compliance Specialist", "City Surveyor", "Municipal Court Clerk", "Recycling Program Coordinator",
    "Water Quality Technician", "Traffic Signal Technician", "Road Maintenance Worker", "City Arborist",

    "Crew Member", "Associate", "Team Member", "Helper", "Laborer", "Worker", "Staff Member",
    "General Worker", "Operator", "Technician", "Specialist", "Coordinator", "Agent", "Assistant",
  
    "Personal Trainer", "Psychiatrist"
];

const JobSearchDropdown: React.FC<JobSearchDropdownProps> = ({
  value,
  onChange,
  onBlur,
  placeholder = "Search or select a job role...",
  className = ""
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredOptions, setFilteredOptions] = useState(JOB_OPTIONS);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const filtered = JOB_OPTIONS.filter(job =>
      job.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredOptions(filtered);
  }, [searchTerm]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
        onBlur?.();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onBlur]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchTerm(newValue);
    // Always update parent with the current value (including empty string)
    onChange(newValue);
    setIsOpen(true);
  };

  const handleOptionSelect = (option: string) => {
    onChange(option);
    setSearchTerm('');
    setIsOpen(false);
    onBlur?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setIsOpen(false);
      setSearchTerm('');
      onBlur?.();
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setSearchTerm('');
    }
  };

  const displayValue = searchTerm || value;

  return (
    <div ref={dropdownRef} className="relative w-full">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`${className} pr-8`}
        />
        <button
          type="button"
          onClick={() => {
            setIsOpen(!isOpen);
            inputRef.current?.focus();
          }}
          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-app-gray-medium hover:text-app-black transition-colors"
        >
          <ChevronDown 
            className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
          />
        </button>
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white rounded-lg shadow-lg max-h-48 overflow-y-auto" style={{ border: '1px solid hsl(var(--app-gray-light))' }}>
          {searchTerm.length < 4 ? (
            <div className="px-3 py-2 text-app-gray-medium text-sm">
              Type at least 4 characters to search
            </div>
          ) : filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => handleOptionSelect(option)}
                className="w-full px-3 py-2 text-left transition-colors text-app-black hover:bg-gray-50"
              >
                {option}
              </button>
            ))
          ) : searchTerm && !searchTerm.match(/\d/) ? (
            <button
              key="other"
              type="button"
              onClick={() => handleOptionSelect("Other")}
              className="w-full px-3 py-2 text-left transition-colors text-app-black hover:bg-gray-50"
            >
              Other
            </button>
          ) : (
            <div className="px-3 py-2 text-app-gray-medium text-sm">
              No matching jobs found
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default JobSearchDropdown;