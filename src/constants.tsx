import React from 'react';

export const Logo = ({ className = "", invert = false, height = "h-14", src }: { className?: string; invert?: boolean; height?: string; src?: string }) => (
  <img 
    src={src || "https://elsewedydevelopment.com/wp-content/uploads/2020/03/SDM-web-Logo-footer.png"} 
    alt="Elsewedy Development Logo" 
    className={`${height} w-auto object-contain ${invert ? "invert brightness-0" : ""} ${className}`}
    referrerPolicy="no-referrer"
  />
);

export const COLORS = {
  primary: '#A6192E',
  black: '#2D2926',
  gray: '#767676',
  lightGray: '#F2F2F2',
};

export const STATUS_COLORS: Record<string, string> = {
  'New': 'bg-blue-100 text-blue-700 border-blue-200',
  'In Progress': 'bg-indigo-100 text-indigo-700 border-indigo-200',
  'Waiting on User': 'bg-amber-100 text-amber-700 border-amber-200',
  'Waiting on Vendor': 'bg-orange-100 text-orange-700 border-orange-200',
  'Resolved': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Closed': 'bg-slate-100 text-slate-700 border-slate-200',
  'Reopened': 'bg-rose-100 text-rose-700 border-rose-200',
};

export const PRIORITY_COLORS: Record<string, string> = {
  'Critical': 'bg-red-100 text-red-700 border-red-200',
  'High': 'bg-orange-100 text-orange-700 border-orange-200',
  'Medium': 'bg-blue-100 text-blue-700 border-blue-200',
  'Low': 'bg-slate-100 text-slate-700 border-slate-200',
};

export const WORKING_HOURS_PER_DAY = 9;
export const WORKING_START_TIME = '09:00';
export const WORKING_END_TIME = '18:00'; // 9 hours from 9 AM
export const WEEKEND_DAYS = [5, 6]; // Friday (5) and Saturday (6)
