import React, { useEffect, useState, useMemo } from 'react';
import { Users, CheckSquare, Square, Search, Filter, CheckCircle2, GraduationCap, Building2 } from 'lucide-react';
import { api } from './api.js';

export const sectionLabel = s =>
  `${s.department} · Year ${s.year_number} · Semester ${s.semester_number} · Section ${s.section_name} · ${s.academic_year}`;

export function PublicationAudience({
  value = [],
  onChange,
  disabled = false,
  title = 'Target Class Sections & Student Audience',
  description = 'Select the specific class sections that will receive and have access to this syllabus.',
  department = ''
}) {
  const [sections, setSections] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState(department || 'all');
  const [selectedYear, setSelectedYear] = useState('all');

  useEffect(() => {
    if (department && department !== 'all') {
      setSelectedDept(department);
    }
  }, [department]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get('/auth/context')
      .then(({ data }) => {
        if (alive) {
          setSections(data.sections || []);
          setLoading(false);
        }
      })
      .catch(e => {
        if (alive) {
          setError(e.response?.data?.message || 'Unable to load assigned class sections.');
          setLoading(false);
        }
      });
    return () => { alive = false; };
  }, []);

  const departments = useMemo(() => {
    const list = [...new Set(sections.map(s => s.department).filter(Boolean))];
    return list.sort();
  }, [sections]);

  const years = useMemo(() => {
    const list = [...new Set(sections.map(s => s.year_number).filter(Boolean))];
    return list.sort((a, b) => a - b);
  }, [sections]);

  const filteredSections = useMemo(() => {
    return sections.filter(s => {
      const matchesDept = selectedDept === 'all' || s.department === selectedDept;
      const matchesYear = selectedYear === 'all' || String(s.year_number) === selectedYear;
      const label = sectionLabel(s).toLowerCase();
      const matchesSearch = !search || label.includes(search.toLowerCase());
      return matchesDept && matchesYear && matchesSearch;
    });
  }, [sections, selectedDept, selectedYear, search]);

  const allFilteredSelected = filteredSections.length > 0 && filteredSections.every(s => value.includes(s.id));

  const toggleSelectAll = () => {
    if (disabled) return;
    if (allFilteredSelected) {
      const filteredIds = new Set(filteredSections.map(s => s.id));
      onChange(value.filter(id => !filteredIds.has(id)));
    } else {
      const newIds = new Set([...value, ...filteredSections.map(s => s.id)]);
      onChange(Array.from(newIds));
    }
  };

  const toggleSection = (id) => {
    if (disabled) return;
    if (value.includes(id)) {
      onChange(value.filter(item => item !== id));
    } else {
      onChange([...value, id]);
    }
  };

  return (
    <div className="audience-selector-container">
      <div className="audience-header">
        <div className="audience-title-group">
          <div className="audience-icon-badge">
            <Users size={18} />
          </div>
          <div>
            <h4 className="audience-title">{title}</h4>
            <p className="audience-subtitle">{description}</p>
          </div>
        </div>

        <div className="audience-stats-pill">
          <span className="audience-count-highlight">{value.length}</span> of {sections.length} classes selected
        </div>
      </div>

      {error && (
        <p role="alert" className="audience-error-msg">{error}</p>
      )}

      {loading ? (
        <div className="audience-loading-state">
          <small>Loading class sections…</small>
        </div>
      ) : !sections.length ? (
        <div className="audience-empty-state">
          <p>No class sections currently assigned. An administrator can configure department responsibilities.</p>
        </div>
      ) : (
        <div className="audience-body">
          {/* Controls toolbar */}
          <div className="audience-controls">
            <div className="audience-search-wrapper">
              <Search size={14} className="audience-search-icon" />
              <input
                type="search"
                className="audience-search-input"
                placeholder="Search department, year, semester, section..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                disabled={disabled}
              />
            </div>

            {departments.length > 1 && (
              <select
                className="audience-filter-select"
                value={selectedDept}
                onChange={e => setSelectedDept(e.target.value)}
                disabled={disabled}
              >
                <option value="all">All Departments</option>
                {departments.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            )}

            {years.length > 1 && (
              <select
                className="audience-filter-select"
                value={selectedYear}
                onChange={e => setSelectedYear(e.target.value)}
                disabled={disabled}
              >
                <option value="all">All Years</option>
                {years.map(y => (
                  <option key={y} value={String(y)}>Year {y}</option>
                ))}
              </select>
            )}

            <button
              type="button"
              className={`audience-select-all-btn ${allFilteredSelected ? 'selected' : ''}`}
              onClick={toggleSelectAll}
              disabled={disabled || !filteredSections.length}
            >
              {allFilteredSelected ? <CheckSquare size={14} /> : <Square size={14} />}
              {allFilteredSelected ? 'Deselect Visible' : 'Select Visible'}
            </button>
          </div>

          {/* Section Grid Cards */}
          <div className="audience-grid">
            {filteredSections.map(s => {
              const isSelected = value.includes(s.id);
              return (
                <button
                  type="button"
                  key={s.id}
                  className={`audience-card-item ${isSelected ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
                  onClick={() => toggleSection(s.id)}
                  disabled={disabled}
                  aria-pressed={isSelected}
                >
                  <div className="audience-card-checkbox">
                    {isSelected ? (
                      <CheckCircle2 size={18} className="audience-check-icon checked" />
                    ) : (
                      <div className="audience-check-circle" />
                    )}
                  </div>

                  <div className="audience-card-info">
                    <div className="audience-card-top">
                      <span className="audience-dept-pill">{s.department}</span>
                      <span className="audience-sem-tag">Y{s.year_number} · S{s.semester_number}</span>
                    </div>
                    <strong className="audience-sec-name">Section {s.section_name}</strong>
                    <span className="audience-batch-text">{s.academic_year}</span>
                  </div>
                </button>
              );
            })}

            {!filteredSections.length && (
              <p className="audience-no-match">No class sections match the selected filter.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
