import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Contact, Lead, ContactEditLog } from './types';
import { crmService, normalizePhone } from './crmService';
import { csvCell } from '../../lib/plots';
import { useAuth } from '../../services/AuthContext';
import { ColumnSelector } from './ColumnSelector';
import { 
  Users, 
  Search, 
  Plus, 
  Phone, 
  Mail, 
  MessageSquare, 
  Briefcase, 
  Building, 
  Globe, 
  PlusCircle, 
  X, 
  UserCheck, 
  TrendingUp,
  Bookmark,
  Languages,
  Edit,
  History,
  Calendar,
  User,
  Trash2,
  Download,
  Square,
  CheckSquare
} from 'lucide-react';
import { motion } from 'motion/react';

// Predefined lists of option strings for standard values
const JOB_TITLE_OPTIONS = [
  'Procurement Manager',
  'Purchasing Officer',
  'General Manager',
  'Managing Director',
  'Chief Executive Officer',
  'Project Engineer',
  'Operations Manager',
  'Supply Chain Lead',
  'Commercial Manager',
  'Logistics Executive',
  'CEO',
  'CFO',
  'Consultant',
  'Legal Advisor'
];

const DEPARTMENT_OPTIONS = [
  'Procurement',
  'Purchasing',
  'Engineering',
  'Supply Chain',
  'Executive Office',
  'Operations',
  'Finance',
  'Legal',
  'Logistics',
  'Marketing',
  'Sales'
];

const NATIONALITY_OPTIONS = [
  'Egyptian',
  'Saudi',
  'Emirati',
  'Kuwaiti',
  'Qatari',
  'Bahraini',
  'Omani',
  'Jordanian',
  'Syrian',
  'Lebanese',
  'Iraqi',
  'Yemeni',
  'Libyan',
  'Tunisian',
  'Algerian',
  'Moroccan',
  'Sudanese',
  'Palestinian',
  'British',
  'American',
  'Canadian',
  'Australian',
  'German',
  'French',
  'Italian',
  'Spanish',
  'Dutch',
  'Swiss',
  'Turkish',
  'Indian',
  'Pakistani',
  'Chinese',
  'Japanese',
  'South Korean',
  'South African',
  'Russian',
  'Greek',
  'Cypriot',
  'Austrian',
  'Belgian',
  'Irish',
  'New Zealander',
  'Malaysian',
  'Indonesian',
  'Thai',
  'Nigerian',
  'Kenyan',
  'Ghanaian'
];

const COUNTRY_CITIES_MAP: Record<string, string[]> = {
  'Egypt': [
    'Cairo', 'Giza', 'Alexandria', 'Suez', 'Port Said', 'Luxor', 'Aswan', 'Tanta', 'Mansoura', 
    'Asyut', 'Fayoum', 'Zagazig', 'Damietta', 'Ismailia', 'Sharm El Sheikh', 'Hurghada', 
    'El Gouna', 'New Administrative Capital', '6th of October City', '10th of Ramadan City', 
    'Sadat City', 'New Damietta', 'Obour City', 'Shorouk City', 'Badr City'
  ],
  'Saudi Arabia': [
    'Riyadh', 'Jeddah', 'Dammam', 'Mecca', 'Medina', 'Khobar', 'Dhahran', 'Jubail', 'Yanbu', 
    'Tabuk', 'Abha', 'Taif', 'Buraidah'
  ],
  'United Arab Emirates': [
    'Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain', 'Al Ain'
  ],
  'Kuwait': [
    'Kuwait City', 'Hawally', 'Salmiya', 'Jahra', 'Ahmadi'
  ],
  'Qatar': [
    'Doha', 'Al Rayyan', 'Al Wakrah', 'Al Khor'
  ],
  'Bahrain': [
    'Manama', 'Riffa', 'Muharraq'
  ],
  'Oman': [
    'Muscat', 'Salalah', 'Sohar', 'Nizwa'
  ],
  'Jordan': [
    'Amman', 'Zarqa', 'Irbid', 'Aqaba'
  ],
  'Lebanon': [
    'Beirut', 'Tripoli', 'Sidon', 'Tyre'
  ],
  'Syria': [
    'Damascus', 'Aleppo', 'Homs', 'Latakia'
  ],
  'Iraq': [
    'Baghdad', 'Basra', 'Erbil', 'Mosul', 'Sulaymaniyah'
  ],
  'Yemen': [
    'Sanaa', 'Aden', 'Taiz', 'Hodeidah'
  ],
  'Libya': [
    'Tripoli (Libya)', 'Benghazi'
  ],
  'Tunisia': [
    'Tunis', 'Sfax'
  ],
  'Algeria': [
    'Algiers', 'Oran'
  ],
  'Morocco': [
    'Casablanca', 'Rabat', 'Marrakesh', 'Tangier'
  ],
  'Sudan': [
    'Khartoum', 'Port Sudan'
  ],
  'Palestine': [
    'Gaza', 'Ramallah', 'Jerusalem'
  ],
  'United Kingdom': [
    'London', 'Manchester', 'Birmingham'
  ],
  'United States': [
    'New York', 'Los Angeles', 'Chicago', 'Houston', 'Miami', 'San Francisco', 'Washington D.C.'
  ],
  'Canada': [
    'Toronto', 'Vancouver', 'Montreal'
  ],
  'Australia': [
    'Sydney', 'Melbourne'
  ],
  'Germany': [
    'Berlin', 'Munich', 'Frankfurt', 'Hamburg'
  ],
  'France': [
    'Paris', 'Lyon', 'Marseille'
  ],
  'Italy': [
    'Rome', 'Milan'
  ],
  'Spain': [
    'Madrid', 'Barcelona'
  ],
  'Netherlands': [
    'Amsterdam', 'Rotterdam'
  ],
  'Switzerland': [
    'Zurich', 'Geneva'
  ],
  'Sweden': [
    'Stockholm'
  ],
  'Norway': [
    'Oslo'
  ],
  'Turkey': [
    'Istanbul', 'Ankara', 'Izmir'
  ],
  'India': [
    'Mumbai', 'Delhi', 'Bangalore'
  ],
  'Pakistan': [
    'Karachi', 'Lahore', 'Islamabad'
  ],
  'China': [
    'Beijing', 'Shanghai', 'Shenzhen', 'Guangzhou'
  ],
  'Japan': [
    'Tokyo', 'Osaka'
  ],
  'South Korea': [
    'Seoul'
  ],
  'Singapore': [
    'Singapore'
  ],
  'Brazil': [
    'Rio de Janeiro', 'Sao Paulo'
  ],
  'South Africa': [
    'Johannesburg', 'Cape Town'
  ],
  'Russia': [
    'Moscow', 'Saint Petersburg'
  ],
  'Greece': [
    'Athens'
  ],
  'Cyprus': [
    'Nicosia', 'Limassol'
  ],
  'Austria': [
    'Vienna'
  ],
  'Belgium': [
    'Brussels'
  ],
  'Ireland': [
    'Dublin'
  ],
  'New Zealand': [
    'Auckland', 'Wellington'
  ],
  'Malaysia': [
    'Kuala Lumpur'
  ],
  'Indonesia': [
    'Jakarta'
  ],
  'Thailand': [
    'Bangkok'
  ],
  'Vietnam': [
    'Hanoi', 'Ho Chi Minh City'
  ],
  'Nigeria': [
    'Lagos'
  ],
  'Kenya': [
    'Nairobi'
  ],
  'Ghana': [
    'Accra'
  ]
};

const COUNTRY_OPTIONS = Object.keys(COUNTRY_CITIES_MAP);
const ALL_CITIES_OPTIONS = Object.values(COUNTRY_CITIES_MAP).flat();

interface SearchableSelectProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  label,
  value,
  onChange,
  options,
  placeholder = "Search or type...",
  required = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync search input with initial/current value when dropdown is closed
  useEffect(() => {
    if (!isOpen) {
      setSearch(value);
    }
  }, [value, isOpen]);

  // Filter options based on user's query
  const filteredOptions = useMemo(() => {
    if (!search || search.toLowerCase() === value.toLowerCase()) return options;
    return options.filter(opt =>
      opt.toLowerCase().includes(search.toLowerCase())
    );
  }, [options, search, value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearch(val);
    onChange(val);
    if (!isOpen) setIsOpen(true);
  };

  const handleSelectOption = (opt: string) => {
    onChange(opt);
    setSearch(opt);
    setIsOpen(false);
  };

  return (
    <div className="relative space-y-1.5" ref={containerRef}>
      <label className="block text-[10px] uppercase font-bold text-brand-gray">{label}</label>
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          required={required}
          className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-brand-red/50 pr-8"
        />
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-brand-gray/60 hover:text-brand-black"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto bg-white border border-brand-gray/20 rounded-xl shadow-lg font-sans text-xs">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectOption(opt)}
                className={`w-full text-left px-3 py-2 hover:bg-brand-gray/5 transition-colors ${
                  opt.toLowerCase() === value.toLowerCase() ? 'bg-brand-red/5 text-brand-red font-bold' : 'text-brand-black'
                }`}
              >
                {opt}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-brand-gray text-[11px] italic">
              No matching standard option. Press enter or continue typing to save custom value.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface CrmContactsProps {
  contacts: Contact[];
  leads: Lead[];
  onContactsUpdated: () => void;
  currentRole: string;
  setActiveSubTab?: (tab: string) => void;
}

export const CrmContacts: React.FC<CrmContactsProps> = ({ 
  contacts, 
  leads, 
  onContactsUpdated, 
  currentRole,
  setActiveSubTab
}) => {
  const { user } = useAuth();
  const isAdmin = (currentRole?.toLowerCase() || '').includes('admin') || (user?.role?.toLowerCase() || '').includes('admin');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deleteConfirmContactId, setDeleteConfirmContactId] = useState<string | null>(null);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<string>('');
  const [deleteConfirmBulk, setDeleteConfirmBulk] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const phoneKey = (v?: string) => normalizePhone(v || '');

  // Column management
  const [visibleColumns, setVisibleColumns] = useState<string[]>(['name', 'phone', 'company', 'pipelines', 'wonLost', 'view']);
  const columns = {
    name: visibleColumns.includes('name'),
    phone: visibleColumns.includes('phone'),
    company: visibleColumns.includes('company'),
    pipelines: visibleColumns.includes('pipelines'),
    wonLost: visibleColumns.includes('wonLost'),
    view: visibleColumns.includes('view'),
  };
  const columnsList = [
    { key: 'name', label: 'Contact Name' },
    { key: 'phone', label: 'Unique Phone Key' },
    { key: 'company', label: 'Associated Company' },
    { key: 'pipelines', label: 'Pipelines' },
    { key: 'wonLost', label: 'Won / Lost' },
    { key: 'view', label: 'View' },
  ];

  // Form states
  const [newContactForm, setNewContactForm] = useState({
    name: '',
    phoneNumber: '',
    alternativeNumber: '',
    email: '',
    company: '',
    jobTitle: '',
    department: '',
    industry: '',
    address: '',
    city: '',
    country: '',
    nationality: '',
    preferredLanguage: 'Arabic' as 'Arabic' | 'English',
    preferredCommunication: 'WhatsApp' as 'WhatsApp' | 'Email' | 'Call' | 'SMS',
  });

  const [editContactForm, setEditContactForm] = useState({
    name: '',
    phoneNumber: '',
    alternativeNumber: '',
    email: '',
    company: '',
    jobTitle: '',
    department: '',
    industry: '',
    address: '',
    city: '',
    country: '',
    nationality: '',
    preferredLanguage: 'Arabic' as 'Arabic' | 'English',
    preferredCommunication: 'WhatsApp' as 'WhatsApp' | 'Email' | 'Call' | 'SMS',
    status: 'Active' as 'Active' | 'Inactive'
  });

  // Cross-link hook: auto-select contact if set in localStorage
  useEffect(() => {
    const contactPhone = localStorage.getItem('selected_crm_contact_phone');
    if (contactPhone) {
      const found = contacts.find(c => phoneKey(c.phoneNumber) === phoneKey(contactPhone));
      if (found) {
        setSelectedContact(found);
      }
      localStorage.removeItem('selected_crm_contact_phone');
    }
  }, [contacts]);

  // Escape closes any open window
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setShowCreateModal(false); setShowEditModal(false); setDeleteConfirmContactId(null); setDeleteConfirmBulk(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Filter Contacts
  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      const text = `${c.serialNumber || ''} ${c.name || ''} ${c.phoneNumber || ''} ${c.email || ''} ${c.company || ''} ${c.city || ''}`.toLowerCase();
      return text.includes(searchTerm.toLowerCase());
    });
  }, [contacts, searchTerm]);

  // Export to CSV helper
  const exportToCSV = () => {
    const headers = [
      'Serial Number', 'Name', 'Phone', 'Alternative Phone', 'Email', 'Company', 
      'Job Title', 'Department', 'Industry', 'Address', 'City', 'Country', 
      'Nationality', 'Preferred Language', 'Preferred Communication', 'Created Date', 
      'Created By', 'Status'
    ];
    const rows = filteredContacts.map(c => [
      c.serialNumber || '',
      c.name,
      c.phoneNumber,
      c.alternativeNumber || '',
      c.email,
      c.company || '',
      c.jobTitle || '',
      c.department || '',
      c.industry || '',
      c.address || '',
      c.city || '',
      c.country || '',
      c.nationality || '',
      c.preferredLanguage,
      c.preferredCommunication,
      c.createdDate || '',
      c.createdBy || '',
      c.status
    ]);

    const formatCSVRow = (arr: any[]) => arr.map(csvCell).join(',');

    const csvContent = [headers.map(csvCell).join(','), ...rows.map(formatCSVRow)].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `CRM_Contacts_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Aggregate stats per contact
  const contactStats = useMemo(() => {
    const stats: Record<string, { totalLeads: number; wonDeals: number; lostDeals: number }> = {};
    
    // Seed stats for all contacts
    contacts.forEach(c => {
      stats[phoneKey(c.phoneNumber)] = { totalLeads: 0, wonDeals: 0, lostDeals: 0 };
    });

    leads.forEach(l => {
      const cleanPhone = phoneKey(l.phoneNumber);
      if (!stats[cleanPhone]) {
        stats[cleanPhone] = { totalLeads: 0, wonDeals: 0, lostDeals: 0 };
      }
      stats[cleanPhone].totalLeads++;
      if (l.status === 'Won') stats[cleanPhone].wonDeals++;
      if (l.status === 'Lost') stats[cleanPhone].lostDeals++;
    });

    return stats;
  }, [contacts, leads]);

  // Dynamic parent-child city options based on country
  const newContactCityOptions = useMemo(() => {
    const selectedCountry = newContactForm.country;
    if (selectedCountry && COUNTRY_CITIES_MAP[selectedCountry]) {
      return COUNTRY_CITIES_MAP[selectedCountry];
    }
    return ALL_CITIES_OPTIONS;
  }, [newContactForm.country]);

  const editContactCityOptions = useMemo(() => {
    const selectedCountry = editContactForm.country;
    if (selectedCountry && COUNTRY_CITIES_MAP[selectedCountry]) {
      return COUNTRY_CITIES_MAP[selectedCountry];
    }
    return ALL_CITIES_OPTIONS;
  }, [editContactForm.country]);

  const handleCreateContact = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newContactForm.name.trim();
    const phone = phoneKey(newContactForm.phoneNumber);
    if (!name || !phone) { setFormError('Name and a valid mobile number are required.'); return; }
    if (currentRole === 'Read Only') { setFormError('You do not have permission to create contacts.'); return; }

    // Re-read the stored list so only the new row is added (props may be stale)
    const stored = crmService.getContacts();
    const existing = stored.some(c => phoneKey(c.phoneNumber) === phone);
    if (existing) {
      setFormError('A contact with this mobile number already exists as a unique identifier.');
      return;
    }
    const emailKey = newContactForm.email.trim().toLowerCase();
    if (emailKey && stored.some(c => (c.email || '').trim().toLowerCase() === emailKey)) {
      setFormError('A contact with this email address already exists.');
      return;
    }

    // Find maximum numeric value of existing serial numbers
    let maxNum = 0;
    stored.forEach(c => {
      if (c.serialNumber && c.serialNumber.startsWith('C-')) {
        const num = parseInt(c.serialNumber.substring(2), 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });
    const nextSerial = 'C-' + String(maxNum + 1).padStart(4, '0');

    const newContact: Contact = {
      id: 'c_' + Math.random().toString(36).substr(2, 9),
      serialNumber: nextSerial,
      name,
      phoneNumber: phone,
      alternativeNumber: newContactForm.alternativeNumber.trim() ? phoneKey(newContactForm.alternativeNumber) : '',
      email: newContactForm.email,
      company: newContactForm.company,
      jobTitle: newContactForm.jobTitle,
      department: newContactForm.department,
      industry: newContactForm.industry,
      address: newContactForm.address,
      city: newContactForm.city,
      country: newContactForm.country,
      nationality: newContactForm.nationality,
      preferredLanguage: newContactForm.preferredLanguage,
      preferredCommunication: newContactForm.preferredCommunication,
      createdDate: new Date().toISOString().split('T')[0],
      createdBy: user?.name || user?.email || 'Unknown',
      status: 'Active',
    };

    crmService.saveContacts([newContact, ...stored]);
    
    // Auto-create company if named
    if (newContactForm.company) {
      const companies = crmService.getCompanies();
      const coExists = companies.some(co => (co.name || '').trim().toLowerCase() === newContactForm.company.trim().toLowerCase());
      if (!coExists) {
        const newCo = {
          id: 'co_' + Math.random().toString(36).substr(2, 9),
          name: newContactForm.company.trim(),
          industry: newContactForm.industry,
          city: newContactForm.city,
        };
        crmService.saveCompanies([newCo, ...companies]);
      }
    }

    setShowCreateModal(false);
    setFormError('');
    setNewContactForm({
      name: '',
      phoneNumber: '',
      alternativeNumber: '',
      email: '',
      company: '',
      jobTitle: '',
      department: '',
      industry: '',
      address: '',
      city: '',
      country: '',
      nationality: '',
      preferredLanguage: 'Arabic',
      preferredCommunication: 'WhatsApp',
    });
    onContactsUpdated();
  };

  const handleOpenEditModal = () => {
    if (!selectedContact) return;
    setEditContactForm({
      name: selectedContact.name,
      phoneNumber: selectedContact.phoneNumber,
      alternativeNumber: selectedContact.alternativeNumber || '',
      email: selectedContact.email || '',
      company: selectedContact.company || '',
      jobTitle: selectedContact.jobTitle || '',
      department: selectedContact.department || '',
      industry: selectedContact.industry || '',
      address: selectedContact.address || '',
      city: selectedContact.city || '',
      country: selectedContact.country || '',
      nationality: selectedContact.nationality || '',
      preferredLanguage: selectedContact.preferredLanguage || 'Arabic',
      preferredCommunication: selectedContact.preferredCommunication || 'WhatsApp',
      status: selectedContact.status || 'Active'
    });
    setShowEditModal(true);
  };

  const handleEditContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContact) return;
    const editPhone = phoneKey(editContactForm.phoneNumber);
    if (!editContactForm.name.trim() || !editPhone) { setFormError('Name and a valid mobile number are required.'); return; }
    if (currentRole === 'Read Only') { setFormError('You do not have permission to edit contacts.'); return; }

    // Re-read the stored list: edit only this contact, keep every other row as stored
    const stored = crmService.getContacts();
    const current = stored.find(c => c.id === selectedContact.id);
    if (!current) { setFormError('This contact no longer exists (it may have been deleted).'); return; }
    if (stored.some(c => c.id !== current.id && phoneKey(c.phoneNumber) === editPhone)) {
      setFormError('A contact with this mobile number already exists as a unique identifier.');
      return;
    }

    const newLogs: ContactEditLog[] = [...(current.editLogs || [])];
    const userWhoEdited = user?.name || user?.email || 'Unknown';
    const timestamp = new Date().toISOString();

    const compareAndLog = (fieldFriendlyName: string, oldValue: any, newValue: any) => {
      const oldStr = oldValue === undefined || oldValue === null ? '' : String(oldValue).trim();
      const newStr = newValue === undefined || newValue === null ? '' : String(newValue).trim();
      if (oldStr !== newStr) {
        newLogs.push({
          id: Math.random().toString(36).substr(2, 9),
          timestamp,
          user: userWhoEdited,
          field: fieldFriendlyName,
          from: oldStr || 'None',
          to: newStr || 'None'
        });
      }
    };

    compareAndLog('Name', current.name, editContactForm.name);
    compareAndLog('Unique Mobile Key', current.phoneNumber, editPhone);
    compareAndLog('Alternative Mobile', current.alternativeNumber, editContactForm.alternativeNumber);
    compareAndLog('Email Address', current.email, editContactForm.email);
    compareAndLog('Company Name', current.company, editContactForm.company);
    compareAndLog('Job Title', current.jobTitle, editContactForm.jobTitle);
    compareAndLog('Department', current.department, editContactForm.department);
    compareAndLog('Industry Focus', current.industry, editContactForm.industry);
    compareAndLog('Address', current.address, editContactForm.address);
    compareAndLog('City', current.city, editContactForm.city);
    compareAndLog('Country', current.country, editContactForm.country);
    compareAndLog('Nationality', current.nationality, editContactForm.nationality);
    compareAndLog('Preferred Language', current.preferredLanguage, editContactForm.preferredLanguage);
    compareAndLog('Preferred Inbound', current.preferredCommunication, editContactForm.preferredCommunication);
    compareAndLog('Status', current.status, editContactForm.status);

    const updatedContact: Contact = {
      ...current,
      name: editContactForm.name.trim(),
      phoneNumber: editPhone,
      alternativeNumber: editContactForm.alternativeNumber.trim() ? phoneKey(editContactForm.alternativeNumber) : '',
      email: editContactForm.email,
      company: editContactForm.company,
      jobTitle: editContactForm.jobTitle,
      department: editContactForm.department,
      industry: editContactForm.industry,
      address: editContactForm.address,
      city: editContactForm.city,
      country: editContactForm.country,
      nationality: editContactForm.nationality,
      preferredLanguage: editContactForm.preferredLanguage,
      preferredCommunication: editContactForm.preferredCommunication,
      status: editContactForm.status,
      editLogs: newLogs
    };

    const updatedContacts = stored.map(c => c.id === current.id ? updatedContact : c);
    crmService.saveContacts(updatedContacts);

    if (editContactForm.company.trim() && editContactForm.company.trim() !== (current.company || '').trim()) {
      const companies = crmService.getCompanies();
      const coExists = companies.some(co => (co.name || '').trim().toLowerCase() === editContactForm.company.trim().toLowerCase());
      if (!coExists) {
        const newCo = {
          id: 'co_' + Math.random().toString(36).substr(2, 9),
          name: editContactForm.company.trim(),
          industry: editContactForm.industry,
          city: editContactForm.city,
        };
        crmService.saveCompanies([newCo, ...companies]);
      }
    }

    setSelectedContact(updatedContact);
    setShowEditModal(false);
    setFormError('');
    onContactsUpdated();
  };

  const handleDeleteContact = (id: string) => {
    if (!isAdmin) {
      setNotice("Unauthorized: Only Administrators can delete contacts.");
      return;
    }
    setDeleteConfirmContactId(id);
  };

  const confirmDeleteContact = () => {
    if (!deleteConfirmContactId || !isAdmin) return;
    const id = deleteConfirmContactId;
    const remaining = crmService.getContacts().filter(c => c.id !== id);
    crmService.saveContacts(remaining);
    setSelectedContact(null);
    setDeleteConfirmContactId(null);
    onContactsUpdated();
  };

  const handleSelectContact = (id: string) => {
    if (selectedContactIds.includes(id)) {
      setSelectedContactIds(selectedContactIds.filter(item => item !== id));
    } else {
      setSelectedContactIds([...selectedContactIds, id]);
    }
  };

  const handleSelectAll = () => {
    if (selectedContactIds.length === filteredContacts.length) {
      setSelectedContactIds([]);
    } else {
      setSelectedContactIds(filteredContacts.map(c => c.id));
    }
  };

  const confirmBulkDelete = () => {
    if (!isAdmin) return;
    const remaining = crmService.getContacts().filter(c => !selectedContactIds.includes(c.id));
    crmService.saveContacts(remaining);
    setSelectedContactIds([]);
    setBulkAction('');
    setDeleteConfirmBulk(false);
    setSelectedContact(null);
    onContactsUpdated();
  };

  const executeBulkAction = () => {
    if (selectedContactIds.length === 0 || !bulkAction) return;

    if (bulkAction === 'delete') {
      if (!isAdmin) {
        setNotice("Unauthorized: Only Administrators can bulk delete contact records.");
        return;
      }
      setDeleteConfirmBulk(true);
    }
  };

  const contactLeads = useMemo(() => {
    if (!selectedContact) return [];
    const k = phoneKey(selectedContact.phoneNumber);
    return k ? leads.filter(l => phoneKey(l.phoneNumber) === k) : [];
  }, [selectedContact, leads]);

  const contactComments = useMemo(() => {
    if (!selectedContact) return [];
    const notes: { id: string; date: string; time?: string; user: string; comment: string; leadId: string; project: string }[] = [];
    contactLeads.forEach(l => {
      if (l.comments) {
        l.comments.forEach(c => {
          notes.push({
            ...c,
            leadId: l.id,
            project: l.project
          });
        });
      }
    });
    return notes.sort((a, b) => {
      const dateA = a.date + (a.time ? 'T' + a.time : '');
      const dateB = b.date + (b.time ? 'T' + b.time : '');
      return dateB.localeCompare(dateA);
    });
  }, [contactLeads, selectedContact]);

  return (
    <div className="space-y-6" id="crm-contacts-root">
      {notice && (
        <div role="alert" className="flex justify-between items-center text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2 text-xs font-bold">
          <span>{notice}</span>
          <button aria-label="Dismiss" onClick={() => setNotice('')}><X size={14} /></button>
        </div>
      )}
      
      {/* Header and Add button */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-xl font-bold text-brand-black flex items-center gap-2">
            <span>Corporate Contacts directory</span>
            <span className="text-xs bg-brand-red/10 text-brand-red font-bold px-2.5 py-0.5 rounded-full">
              {filteredContacts.length} Contacts
            </span>
          </h3>
          <p className="text-xs text-brand-gray/80 mt-1">Unique contacts are linked automatically to Sales Inquiries using normalized mobile numbers.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <ColumnSelector 
            columns={columnsList}
            visibleColumns={visibleColumns}
            onChange={setVisibleColumns}
          />
          {isAdmin && (
            <button
              onClick={exportToCSV}
              className="bg-white hover:bg-brand-gray/5 border border-brand-gray/25 text-brand-black px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow transition-all"
            >
              <Download size={14} />
              <span>Export</span>
            </button>
          )}
          {currentRole !== 'Read Only' && (
            <button
              onClick={() => { setFormError(''); setShowCreateModal(true); }}
              className="bg-brand-red hover:bg-brand-red-dark text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow"
            >
              <Plus size={14} />
              <span>New Contact</span>
            </button>
          )}
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-gray" size={16} />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search contacts (by name, mobile number, email, company, industry...)"
          className="w-full pl-10 pr-4 py-3 bg-white border border-brand-gray/20 rounded-2xl focus:outline-none focus:ring-1 focus:ring-brand-red shadow-sm text-xs font-semibold"
        />
      </div>

      {/* Bulk Action Controls Bar */}
      {selectedContactIds.length > 0 && (
        <div className="bg-brand-black text-white p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-4 shadow-md">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-brand-red rounded-full animate-ping" />
            <span className="text-xs font-bold">{selectedContactIds.length} Contacts selected for Bulk Action</span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={bulkAction}
              onChange={(e) => setBulkAction(e.target.value)}
              className="bg-white/10 border border-white/20 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:bg-white focus:text-brand-black"
            >
              <option value="" className="text-brand-black">Select Action...</option>
              {isAdmin && (
                <option value="delete" className="text-brand-black">Bulk Delete Records</option>
              )}
            </select>
            <button
              onClick={executeBulkAction}
              disabled={!bulkAction}
              className="bg-brand-red hover:bg-brand-red-dark disabled:opacity-50 text-white text-xs font-extrabold px-4 py-2 rounded-xl shadow transition-all"
            >
              Execute
            </button>
            <button
              onClick={() => setSelectedContactIds([])}
              className="text-xs text-white/60 hover:text-white ml-2 font-semibold"
            >
              Clear Choice
            </button>
          </div>
        </div>
      )}

      {/* Main Table and Side panel Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Table list */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-brand-gray/20 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-brand-gray/5 border-b border-brand-gray/15 text-brand-gray text-[10px] font-bold uppercase tracking-wider">
                  <th className="py-4 px-4 w-10">
                    <button onClick={handleSelectAll} className="focus:outline-none">
                      {selectedContactIds.length === filteredContacts.length && filteredContacts.length > 0 ? (
                        <CheckSquare size={16} className="text-brand-red" />
                      ) : (
                        <Square size={16} />
                      )}
                    </button>
                  </th>
                  <th className="py-4 px-4">Contact Name</th>
                  <th className="py-4 px-3">Unique Phone Key</th>
                  <th className="py-4 px-3">Associated Company</th>
                  <th className="py-4 px-3 text-center">Pipelines</th>
                  <th className="py-4 px-3 text-center">Won / Lost</th>
                  <th className="py-4 px-4 text-right">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-gray/10 text-xs font-medium text-brand-black">
                {filteredContacts.length > 0 ? (
                  filteredContacts.map((c) => {
                    const stats = contactStats[phoneKey(c.phoneNumber)] || { totalLeads: 0, wonDeals: 0, lostDeals: 0 };
                    const isSelected = selectedContactIds.includes(c.id);
                    return (
                      <tr key={c.id} className={`hover:bg-brand-gray/5 transition-all ${isSelected ? 'bg-brand-red/5' : ''}`}>
                        <td className="py-3.5 px-4">
                          <button onClick={() => handleSelectContact(c.id)} className="focus:outline-none">
                            {isSelected ? (
                              <CheckSquare size={16} className="text-brand-red" />
                            ) : (
                              <Square size={16} className="text-brand-gray/60" />
                            )}
                          </button>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-brand-black">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[9px] text-brand-red bg-brand-red/10 px-1.5 py-0.5 rounded font-bold">{c.serialNumber || 'N/A'}</span>
                            <span>{c.name}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-3 font-mono text-brand-gray">{c.phoneNumber}</td>
                        <td className="py-3.5 px-3 font-semibold text-brand-black">{c.company || 'Private Customer'}</td>
                        <td className="py-3.5 px-3 text-center">
                          <span className="bg-brand-red/10 text-brand-red px-2 py-0.5 rounded-full font-mono text-[10px] font-bold">
                            {stats.totalLeads} Leads
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-center text-[10px] font-mono">
                          <span className="text-emerald-700 font-bold">{stats.wonDeals} W</span>
                          <span className="mx-1 text-brand-gray">/</span>
                          <span className="text-rose-600 font-bold">{stats.lostDeals} L</span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => setSelectedContact(c)}
                            className="bg-brand-gray/10 hover:bg-brand-gray/20 text-brand-black px-3 py-1 rounded-lg font-bold"
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-brand-gray">
                      No corporate contacts matched search query.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Contact details card */}
        <div className="bg-white rounded-2xl border border-brand-gray/20 shadow-sm p-6 flex flex-col h-full justify-between">
          {selectedContact ? (
            <div className="space-y-6 text-xs">
              
              {/* Header profile */}
              <div className="flex items-center justify-between border-b border-brand-gray/10 pb-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-brand-red text-white flex items-center justify-center font-black text-xl">
                    {selectedContact.name.charAt(0)}
                  </div>
                  <div>
                    <h4 className="font-bold text-brand-black text-sm flex items-center gap-1.5">
                      <span>{selectedContact.name}</span>
                      <span className="font-mono text-[9px] text-brand-red bg-brand-red/10 px-1.5 py-0.5 rounded font-bold">{selectedContact.serialNumber || 'N/A'}</span>
                    </h4>
                    <p className="text-[10px] uppercase font-bold text-brand-gray tracking-wider mt-0.5">{selectedContact.jobTitle || 'Customer'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <button
                      onClick={() => handleDeleteContact(selectedContact.id)}
                      className="bg-rose-100 hover:bg-rose-200 text-rose-700 px-3 py-1.5 rounded-xl flex items-center gap-1 font-bold text-[10px] uppercase tracking-wider"
                      title="Delete Contact"
                    >
                      <Trash2 size={12} />
                      <span>Delete</span>
                    </button>
                  )}
                  {currentRole !== 'Read Only' && (
                    <button
                      onClick={() => { setFormError(''); handleOpenEditModal(); }}
                      className="bg-brand-red/10 hover:bg-brand-red/20 text-brand-red px-3 py-1.5 rounded-xl flex items-center gap-1 font-bold text-[10px] uppercase tracking-wider"
                      title="Edit Contact Specifications"
                    >
                      <Edit size={12} />
                      <span>Edit</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Details grid */}
              <div className="space-y-3">
                <h5 className="text-[10px] uppercase font-bold text-brand-gray tracking-widest border-b border-brand-gray/5 pb-1">Profile Specifications</h5>
                
                <div className="flex justify-between">
                  <span className="text-brand-gray font-semibold">Mobile Number:</span>
                  <span className="font-mono text-brand-black font-bold">{selectedContact.phoneNumber}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-brand-gray font-semibold">Email:</span>
                  <span className="text-brand-black font-semibold">{selectedContact.email || 'N/A'}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-brand-gray font-semibold">Company:</span>
                  {selectedContact.company ? (
                    <button
                      onClick={() => {
                        const targetCo = crmService.getCompanies().find(
                          co => (co.name || '').toLowerCase() === (selectedContact.company || '').toLowerCase()
                        );
                        if (targetCo) {
                          localStorage.setItem('selected_crm_company_name', targetCo.name);
                        } else {
                          localStorage.setItem('selected_crm_company_name', selectedContact.company);
                        }
                        setActiveSubTab?.('companies');
                      }}
                      className="text-brand-red font-bold hover:underline text-left text-xs"
                    >
                      {selectedContact.company}
                    </button>
                  ) : (
                    <span className="text-brand-gray">Private Person</span>
                  )}
                </div>

                <div className="flex justify-between">
                  <span className="text-brand-gray font-semibold">Department:</span>
                  <span className="text-brand-black font-bold">{selectedContact.department || 'N/A'}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-brand-gray font-semibold">Industry Focus:</span>
                  <span className="text-brand-black font-semibold">{selectedContact.industry || 'N/A'}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-brand-gray font-semibold">City:</span>
                  <span className="text-brand-black font-semibold">{[selectedContact.city, selectedContact.country].filter(Boolean).join(', ') || 'N/A'}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-brand-gray font-semibold">Nationality:</span>
                  <span className="text-brand-black font-semibold">{selectedContact.nationality || 'N/A'}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-brand-gray font-semibold">Language preference:</span>
                  <span className="text-brand-black font-bold bg-brand-gray/10 px-2 py-0.5 rounded text-[10px] flex items-center gap-1">
                    <Languages size={10} />
                    {selectedContact.preferredLanguage}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-brand-gray font-semibold">Inbound Channel:</span>
                  <span className="text-brand-black font-bold">{selectedContact.preferredCommunication}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-brand-gray font-semibold">Record Registered:</span>
                  <span className="text-brand-gray font-mono">{selectedContact.createdDate}</span>
                </div>
              </div>

              {/* Connected Lead inquiries */}
              <div className="space-y-3">
                <h5 className="text-[10px] uppercase font-bold text-brand-gray tracking-widest border-b border-brand-gray/5 pb-1">Associated Lead inquiries ({contactLeads.length})</h5>
                
                <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                  {contactLeads.map(l => {
                    let sColor = 'bg-brand-gray/10 text-brand-gray';
                    if (l.status === 'Won') sColor = 'bg-emerald-100 text-emerald-800';
                    else if (l.status === 'Lost') sColor = 'bg-rose-100 text-rose-800';
                    else if (l.status === 'New') sColor = 'bg-yellow-100 text-yellow-800';

                    const handleOpenLead = () => {
                      localStorage.setItem('selected_lead_id', l.id);
                      if (setActiveSubTab) {
                        setActiveSubTab('leads');
                      }
                    };

                    return (
                      <div key={l.id} className="p-2.5 bg-brand-gray/5 border border-brand-gray/15 rounded-xl flex justify-between items-center">
                        <div>
                          <button 
                            onClick={handleOpenLead}
                            className="font-mono font-bold text-brand-red hover:underline hover:text-brand-red-dark text-left"
                            title="Click to open this Sales Lead"
                          >
                            {l.id}
                          </button>
                          <span className="text-brand-gray ml-2 text-[10px]">{l.project}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${sColor}`}>{l.status}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Inquiry Notes & Activities */}
              <div className="space-y-3 border-t border-brand-gray/10 pt-4">
                <h5 className="text-[10px] uppercase font-bold text-brand-gray tracking-widest border-b border-brand-gray/5 pb-1">Inquiry Notes & Activity Logs</h5>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {contactComments.length > 0 ? (
                    contactComments.map((c, cIdx) => (
                      <div key={`${c.id}-${cIdx}`} className="p-3 bg-brand-gray/5 border border-brand-gray/15 rounded-xl space-y-1">
                        <div className="flex justify-between text-[10px] font-semibold text-brand-gray">
                          <span>{c.user} ({c.project})</span>
                          <span>{c.date} {c.time || ''}</span>
                        </div>
                        <p className="text-brand-black text-xs whitespace-pre-line leading-relaxed">{c.comment}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-center py-4 text-brand-gray text-[11px]">No notes added to associated inquiries yet.</p>
                  )}
                </div>
              </div>

              {/* Profile Change Log Section */}
              <div className="space-y-3 border-t border-brand-gray/10 pt-4">
                <h5 className="text-[10px] uppercase font-bold text-brand-gray tracking-widest border-b border-brand-gray/5 pb-1 flex items-center gap-1">
                  <History size={12} className="text-brand-red" />
                  <span>Contact Field Change Logs ({selectedContact.editLogs?.length || 0})</span>
                </h5>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {selectedContact.editLogs && selectedContact.editLogs.length > 0 ? (
                    selectedContact.editLogs.map((log, logIdx) => (
                      <div key={`${log.id}-${logIdx}`} className="p-2.5 bg-brand-gray/5 border border-brand-gray/15 rounded-xl space-y-1">
                        <div className="flex justify-between text-[10px] font-semibold text-brand-gray">
                          <span className="font-bold text-brand-black">{log.user}</span>
                          <span>{new Date(log.timestamp).toLocaleString()}</span>
                        </div>
                        <div className="text-[11px] leading-relaxed text-brand-black">
                          Edited <strong className="text-brand-red">{log.field}</strong> from <span className="font-mono bg-brand-gray/10 px-1 rounded">"{log.from}"</span> to <span className="font-mono bg-brand-gray/10 px-1 rounded">"{log.to}"</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-center py-4 text-brand-gray text-[11px]">No profile field edits have been logged yet.</p>
                  )}
                </div>
              </div>

            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-center text-brand-gray text-xs">
              <div className="space-y-2">
                <Users size={24} className="mx-auto text-brand-gray/40" />
                <p>Select a corporate contact to display profiles, associated company structures, and active sales pipelines.</p>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* -------------------- NEW CONTACT MODAL -------------------- */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-brand-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border border-brand-gray/20 rounded-2xl w-full max-w-lg shadow-xl overflow-hidden flex flex-col"
          >
            <div className="p-5 border-b border-brand-gray/15 flex justify-between items-center bg-brand-black text-white">
              <h4 className="font-bold text-sm uppercase tracking-wide">Register Corporate Contact</h4>
              <button onClick={() => setShowCreateModal(false)} className="text-white/60 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateContact} className="p-6 space-y-4 text-xs font-medium">
              {formError && <p role="alert" className="text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 font-bold">{formError}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Contact Full Name *</label>
                  <input
                    type="text"
                    required
                    value={newContactForm.name}
                    onChange={(e) => setNewContactForm({ ...newContactForm, name: e.target.value })}
                    placeholder="e.g., Eslam Mohamed"
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Unique Mobile Key *</label>
                  <input
                    type="text"
                    required
                    value={newContactForm.phoneNumber}
                    onChange={(e) => setNewContactForm({ ...newContactForm, phoneNumber: e.target.value })}
                    placeholder="e.g., 01118485856"
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Alternative Mobile</label>
                  <input
                    type="text"
                    value={newContactForm.alternativeNumber}
                    onChange={(e) => setNewContactForm({ ...newContactForm, alternativeNumber: e.target.value })}
                    placeholder="e.g., 01004958392"
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Email Address</label>
                  <input
                    type="email"
                    value={newContactForm.email}
                    onChange={(e) => setNewContactForm({ ...newContactForm, email: e.target.value })}
                    placeholder="e.g., eslam@company.com"
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1">
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Company Name</label>
                  <input
                    type="text"
                    value={newContactForm.company}
                    onChange={(e) => setNewContactForm({ ...newContactForm, company: e.target.value })}
                    placeholder="e.g., Stefner Steel"
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-1">
                  <SearchableSelect
                    label="Job Title"
                    value={newContactForm.jobTitle}
                    onChange={(val) => setNewContactForm({ ...newContactForm, jobTitle: val })}
                    options={JOB_TITLE_OPTIONS}
                    placeholder="Search or type job title..."
                  />
                </div>
                <div className="sm:col-span-1">
                  <SearchableSelect
                    label="Department"
                    value={newContactForm.department}
                    onChange={(val) => setNewContactForm({ ...newContactForm, department: val })}
                    options={DEPARTMENT_OPTIONS}
                    placeholder="Search or type department..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Address</label>
                  <input
                    type="text"
                    value={newContactForm.address}
                    onChange={(e) => setNewContactForm({ ...newContactForm, address: e.target.value })}
                    placeholder="e.g., Plot 27, 5th Settlement"
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 focus:outline-none text-xs"
                  />
                </div>
                <div className="sm:col-span-1">
                  <SearchableSelect
                    label="City"
                    value={newContactForm.city}
                    onChange={(val) => setNewContactForm({ ...newContactForm, city: val })}
                    options={newContactCityOptions}
                    placeholder="Search or type city..."
                  />
                </div>
                <div className="sm:col-span-1">
                  <SearchableSelect
                    label="Country"
                    value={newContactForm.country}
                    onChange={(val) => {
                      const updated = { ...newContactForm, country: val };
                      if (val && COUNTRY_CITIES_MAP[val]) {
                        if (!COUNTRY_CITIES_MAP[val].includes(newContactForm.city)) {
                          updated.city = '';
                        }
                      }
                      setNewContactForm(updated);
                    }}
                    options={COUNTRY_OPTIONS}
                    placeholder="Search or type country..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <SearchableSelect
                    label="Nationality"
                    value={newContactForm.nationality}
                    onChange={(val) => setNewContactForm({ ...newContactForm, nationality: val })}
                    options={NATIONALITY_OPTIONS}
                    placeholder="Search or type nationality..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Preferred Language</label>
                  <select
                    value={newContactForm.preferredLanguage}
                    onChange={(e) => setNewContactForm({ ...newContactForm, preferredLanguage: e.target.value as any })}
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 focus:outline-none"
                  >
                    <option value="Arabic">Arabic</option>
                    <option value="English">English</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Preferred Inbound</label>
                  <select
                    value={newContactForm.preferredCommunication}
                    onChange={(e) => setNewContactForm({ ...newContactForm, preferredCommunication: e.target.value as any })}
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 focus:outline-none"
                  >
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Email">Email</option>
                    <option value="Call">Phone Call</option>
                    <option value="SMS">SMS</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Industry Segment</label>
                  <select
                    value={newContactForm.industry}
                    onChange={(e) => setNewContactForm({ ...newContactForm, industry: e.target.value })}
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 focus:outline-none"
                  >
                    <option value="">— Not specified —</option>
                    <option value="Steel & Metallurgy">Steel & Metallurgy</option>
                    <option value="Logistics & Warehousing">Logistics & Warehousing</option>
                    <option value="Food Processing">Food Processing</option>
                    <option value="Pharmaceutical Packaging">Pharmaceutical packaging</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-brand-gray/10">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="bg-brand-gray/10 hover:bg-brand-gray/20 text-brand-black px-4 py-2 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-brand-red hover:bg-brand-red-dark text-white px-5 py-2 rounded-xl font-bold shadow"
                >
                  Create Contact
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* -------------------- EDIT CONTACT MODAL -------------------- */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-brand-black/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4"
          >
            <div className="flex justify-between items-center pb-2 border-b border-brand-gray/10">
              <div className="flex items-center gap-2">
                <Edit className="text-brand-red" size={20} />
                <h3 className="font-bold text-brand-black text-sm uppercase tracking-wider">Edit Corporate Contact Profile</h3>
              </div>
              <button 
                onClick={() => setShowEditModal(false)}
                className="p-1.5 hover:bg-brand-gray/10 rounded-full transition"
              >
                <X size={18} className="text-brand-gray" />
              </button>
            </div>

            <form onSubmit={handleEditContact} className="space-y-4 text-xs">
              {formError && <p role="alert" className="text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 font-bold">{formError}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Contact Name *</label>
                  <input
                    type="text"
                    required
                    value={editContactForm.name}
                    onChange={(e) => setEditContactForm({ ...editContactForm, name: e.target.value })}
                    placeholder="e.g., Eng. Ahmed Elsewedy"
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Unique Mobile Key *</label>
                  <input
                    type="text"
                    required
                    value={editContactForm.phoneNumber}
                    onChange={(e) => setEditContactForm({ ...editContactForm, phoneNumber: e.target.value })}
                    placeholder="e.g., +201000000000"
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Alternative Mobile</label>
                  <input
                    type="text"
                    value={editContactForm.alternativeNumber}
                    onChange={(e) => setEditContactForm({ ...editContactForm, alternativeNumber: e.target.value })}
                    placeholder="e.g., +201200000000"
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Email Address</label>
                  <input
                    type="email"
                    value={editContactForm.email}
                    onChange={(e) => setEditContactForm({ ...editContactForm, email: e.target.value })}
                    placeholder="e.g., contact@elsewedy.com"
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1">
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Company Name</label>
                  <input
                    type="text"
                    value={editContactForm.company}
                    onChange={(e) => setEditContactForm({ ...editContactForm, company: e.target.value })}
                    placeholder="e.g., Elsewedy Electric"
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-1">
                  <SearchableSelect
                    label="Job Title"
                    value={editContactForm.jobTitle}
                    onChange={(val) => setEditContactForm({ ...editContactForm, jobTitle: val })}
                    options={JOB_TITLE_OPTIONS}
                    placeholder="Search or type job title..."
                  />
                </div>
                <div className="sm:col-span-1">
                  <SearchableSelect
                    label="Department"
                    value={editContactForm.department}
                    onChange={(val) => setEditContactForm({ ...editContactForm, department: val })}
                    options={DEPARTMENT_OPTIONS}
                    placeholder="Search or type department..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Preferred Language</label>
                  <select
                    value={editContactForm.preferredLanguage}
                    onChange={(e) => setEditContactForm({ ...editContactForm, preferredLanguage: e.target.value as any })}
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 focus:outline-none"
                  >
                    <option value="Arabic">Arabic</option>
                    <option value="English">English</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Preferred Inbound</label>
                  <select
                    value={editContactForm.preferredCommunication}
                    onChange={(e) => setEditContactForm({ ...editContactForm, preferredCommunication: e.target.value as any })}
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 focus:outline-none"
                  >
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Email">Email</option>
                    <option value="Call">Phone Call</option>
                    <option value="SMS">SMS</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Industry Segment</label>
                  <select
                    value={editContactForm.industry}
                    onChange={(e) => setEditContactForm({ ...editContactForm, industry: e.target.value })}
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 focus:outline-none"
                  >
                    <option value="">— Not specified —</option>
                    <option value="Steel & Metallurgy">Steel & Metallurgy</option>
                    <option value="Logistics & Warehousing">Logistics & Warehousing</option>
                    <option value="Food Processing">Food Processing</option>
                    <option value="Pharmaceutical Packaging">Pharmaceutical packaging</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Address</label>
                  <input
                    type="text"
                    value={editContactForm.address}
                    onChange={(e) => setEditContactForm({ ...editContactForm, address: e.target.value })}
                    placeholder="e.g., Plot 27, 5th Settlement"
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-1">
                  <SearchableSelect
                    label="City"
                    value={editContactForm.city}
                    onChange={(val) => setEditContactForm({ ...editContactForm, city: val })}
                    options={editContactCityOptions}
                    placeholder="Search or type city..."
                  />
                </div>
                <div className="sm:col-span-1">
                  <SearchableSelect
                    label="Country"
                    value={editContactForm.country}
                    onChange={(val) => {
                      const updated = { ...editContactForm, country: val };
                      if (val && COUNTRY_CITIES_MAP[val]) {
                        if (!COUNTRY_CITIES_MAP[val].includes(editContactForm.city)) {
                          updated.city = '';
                        }
                      }
                      setEditContactForm(updated);
                    }}
                    options={COUNTRY_OPTIONS}
                    placeholder="Search or type country..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <SearchableSelect
                    label="Nationality"
                    value={editContactForm.nationality}
                    onChange={(val) => setEditContactForm({ ...editContactForm, nationality: val })}
                    options={NATIONALITY_OPTIONS}
                    placeholder="Search or type nationality..."
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-brand-gray mb-1.5">Contact Status</label>
                  <select
                    value={editContactForm.status}
                    onChange={(e) => setEditContactForm({ ...editContactForm, status: e.target.value as any })}
                    className="w-full bg-brand-gray/5 border border-brand-gray/20 rounded-xl px-3 py-2 focus:outline-none font-bold text-brand-black"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-brand-gray/10">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="bg-brand-gray/10 hover:bg-brand-gray/20 text-brand-black px-4 py-2 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-brand-red hover:bg-brand-red-dark text-white px-5 py-2 rounded-xl font-bold shadow"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* -------------------- CUSTOM DELETE CONFIRMATION DIALOG (ADMIN ONLY) -------------------- */}
      {deleteConfirmContactId && (
        <div className="fixed inset-0 bg-brand-black/50 backdrop-blur-xs flex items-center justify-center z-[100] p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border border-brand-gray/20 rounded-2xl w-full max-w-md shadow-xl overflow-hidden"
          >
            <div className="p-5 border-b border-brand-gray/15 flex justify-between items-center bg-rose-600 text-white">
              <h4 className="font-bold text-sm uppercase tracking-wide flex items-center gap-2">
                <Trash2 size={18} />
                <span>Confirm Contact Deletion</span>
              </h4>
              <button onClick={() => setDeleteConfirmContactId(null)} className="text-white/60 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <p className="text-brand-gray leading-relaxed text-sm">
                Are you absolutely sure you want to permanently delete contact <strong className="text-brand-black font-extrabold">{contacts.find(c => c.id === deleteConfirmContactId)?.name || deleteConfirmContactId}</strong>?
              </p>
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-800 leading-relaxed text-[11px]">
                <strong>Warning:</strong> This operation cannot be undone. All spec files, logs, and communication history linked to this contact will be permanently deleted from local store.
              </div>
              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmContactId(null)}
                  className="bg-brand-gray/10 hover:bg-brand-gray/20 text-brand-black px-4 py-2 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteContact}
                  className="bg-rose-600 hover:bg-rose-700 text-white px-5 py-2 rounded-xl font-bold shadow"
                >
                  Permanently Delete
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* -------------------- CUSTOM BULK DELETE CONFIRMATION DIALOG (ADMIN ONLY) -------------------- */}
      {deleteConfirmBulk && (
        <div className="fixed inset-0 bg-brand-black/50 backdrop-blur-xs flex items-center justify-center z-[100] p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border border-brand-gray/20 rounded-2xl w-full max-w-md shadow-xl overflow-hidden"
          >
            <div className="p-5 border-b border-brand-gray/15 flex justify-between items-center bg-rose-600 text-white">
              <h4 className="font-bold text-sm uppercase tracking-wide flex items-center gap-2">
                <Trash2 size={18} />
                <span>Confirm Bulk Deletion</span>
              </h4>
              <button onClick={() => setDeleteConfirmBulk(false)} className="text-white/60 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <p className="text-brand-gray leading-relaxed text-sm">
                Are you absolutely sure you want to permanently delete the <strong className="text-brand-black font-extrabold">{selectedContactIds.length}</strong> selected contacts?
              </p>
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-800 leading-relaxed text-[11px]">
                <strong>Warning:</strong> This operation cannot be undone. All spec files, logs, and communication history linked to these contacts will be permanently deleted from the local store.
              </div>
              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmBulk(false)}
                  className="bg-brand-gray/10 hover:bg-brand-gray/20 text-brand-black px-4 py-2 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmBulkDelete}
                  className="bg-rose-600 hover:bg-rose-700 text-white px-5 py-2 rounded-xl font-bold shadow"
                >
                  Permanently Delete Selected
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

    </div>
  );
};
