import React, { useState, useEffect, useRef } from 'react';
import { Settings } from 'lucide-react';

interface ColumnSelectorProps {
  columns: { key: string; label: string }[];
  visibleColumns: string[];
  onChange: (visibleColumns: string[]) => void;
}

export const ColumnSelector: React.FC<ColumnSelectorProps> = ({ columns, visibleColumns, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape
  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [isOpen]);

  const toggleColumn = (key: string) => {
    if (visibleColumns.includes(key)) {
      onChange(visibleColumns.filter(c => c !== key));
    } else {
      onChange([...visibleColumns, key]);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button 
        type="button"
        aria-haspopup="true"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-2 border border-brand-gray/20 rounded-lg text-brand-gray hover:bg-brand-light"
      >
        <Settings size={16} />
        <span className="text-xs font-bold uppercase">Columns</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 bg-white p-4 rounded-xl border border-brand-gray/20 shadow-lg z-50 w-56">
          <h4 className="font-bold text-xs uppercase mb-3">Display Columns</h4>
          <div className="space-y-2">
            {columns.map(col => (
              <label key={col.key} className="flex items-center gap-2 text-xs">
                <input 
                  type="checkbox" 
                  checked={visibleColumns.includes(col.key)}
                  onChange={() => toggleColumn(col.key)}
                />
                {col.label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
