import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen, Download, FolderOpen, Pencil, Printer, RefreshCw, Upload, X,
  UserCheck, Layers, FileText, CheckCircle2, ChevronRight, Search, Filter,
  Eye, GraduationCap, Sparkles, BookMarked, Users, Check, AlertCircle, Calendar,
  Maximize2, ArrowRight, LayoutGrid, CheckSquare, Plus, FileSpreadsheet, ShieldCheck, Table
} from 'lucide-react';
import { SyllabusEditor, SyllabusDocument, syllabusTemplates } from './SyllabusEditor.jsx';
import './syllabus.css';

import { api } from './api.js';
import { PublicationAudience } from './PublicationAudience.jsx';

function auth() {
  try {
    return { Authorization: `Bearer ${JSON.parse(localStorage.getItem('gvpcew_session') || '{}').token || ''}` };
  } catch {
    return {};
  }
}

const blankForm = {
  title: '',
  department: 'CSE',
  batch: '2024–25 onwards',
  description: '',
  subjectId: '',
  facultyId: '',
  publishFullSyllabus: true
};

function SyllabusFullscreenViewer({ syllabus, onClose, editor, busy, onPublish, onEdit, onDownload }) {
  const [pdfUrl, setPdfUrl] = useState(syllabus._localBlobUrl || '');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [pdfAttempt, setPdfAttempt] = useState(0);
  const [viewMode, setViewMode] = useState(syllabus._localBlobUrl || syllabus.has_pdf || !syllabus.structure ? 'pdf' : 'paper');

  useEffect(() => {
    let alive = true;
    let createdUrl = null;

    if (!syllabus._localBlobUrl && syllabus.id && !syllabus.id.startsWith('temp-') && (syllabus.has_pdf || !syllabus.structure)) {
      setPdfLoading(true);
      setPdfError('');
      api.get(`/syllabi/${syllabus.id}/pdf`, { headers: auth(), responseType: 'blob' })
        .then(({ data }) => {
          if (alive) {
            createdUrl = URL.createObjectURL(data);
            setPdfUrl(createdUrl);
            setPdfLoading(false);
          }
        })
        .catch(() => {
          if (alive) {
            setPdfError('Could not load the PDF document in full screen mode. Please retry.');
            setPdfLoading(false);
          }
        });
    } else if (syllabus._localBlobUrl) {
      setPdfUrl(syllabus._localBlobUrl);
      setPdfLoading(false);
    } else {
      setPdfLoading(false);
    }

    return () => {
      alive = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [syllabus.id, syllabus._localBlobUrl, syllabus.has_pdf, syllabus.structure, pdfAttempt]);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const is4Year = !syllabus.subject_id;
  const hasBothViews = Boolean(pdfUrl || syllabus.has_pdf || syllabus._localBlobUrl) && Boolean(syllabus.structure);

  return (
    <div className="syllabus-fullscreen-overlay" role="dialog" aria-modal="true" aria-label="Syllabus Fullscreen Preview">
      <header className="syllabus-fullscreen-topbar">
        <div className="syllabus-fullscreen-info">
          <div className="syllabus-preview-tags">
            {is4Year ? (
              <span className="syllabus-pill-4yr"><GraduationCap size={14} /> 4-Year B.Tech Curriculum</span>
            ) : (
              <span className="syllabus-pill-course"><BookMarked size={14} /> Course Syllabus</span>
            )}
            {syllabus.assigned_faculty_name && (
              <span className="syllabus-pill-faculty"><Users size={14} /> Faculty: {syllabus.assigned_faculty_name} {syllabus.assigned_faculty_code ? `(${syllabus.assigned_faculty_code})` : ''}</span>
            )}
            <span className={`syllabus-badge ${syllabus.status}`}>
              {syllabus.status === 'published' ? 'Published' : 'Draft · Coordinator'}
            </span>
          </div>

          <h2 className="syllabus-fullscreen-title">
            {syllabus.subject_code ? `${syllabus.subject_code} — ` : ''}{syllabus.title}
          </h2>
          <p className="syllabus-fullscreen-subtitle">
            {syllabus.department} · Admitted Batch: {syllabus.batch}
          </p>
        </div>

        {/* View Switcher if both PDF and structured paper view exist */}
        {hasBothViews && (
          <div className="syllabus-view-mode-toggle">
            <button
              type="button"
              className={`view-mode-btn ${viewMode === 'pdf' ? 'active' : ''}`}
              onClick={() => setViewMode('pdf')}
              title="View original sliced PDF"
            >
              <FileText size={14} />
              <span>Original Sliced PDF</span>
            </button>
            <button
              type="button"
              className={`view-mode-btn ${viewMode === 'paper' ? 'active' : ''}`}
              onClick={() => setViewMode('paper')}
              title="View interactive structured paper"
            >
              <Layers size={14} />
              <span>Structured Paper</span>
            </button>
          </div>
        )}

        <div className="syllabus-fullscreen-actions">
          {(pdfUrl || syllabus.has_pdf || syllabus.file_name) && (
            <button
              type="button"
              className="syllabus-fullscreen-btn"
              onClick={(e) => onDownload ? onDownload(syllabus, e) : (pdfUrl ? window.open(pdfUrl, '_blank') : null)}
            >
              <Download size={15} /> Download PDF
            </button>
          )}

          {syllabus.structure && (
            <button type="button" className="syllabus-fullscreen-btn" onClick={() => window.print()}>
              <Printer size={15} /> Print
            </button>
          )}

          {editor && syllabus.structure && onEdit && (
            <button
              type="button"
              className="syllabus-fullscreen-btn"
              disabled={busy}
              onClick={() => onEdit(syllabus)}
            >
              <Pencil size={15} /> {syllabus.status === 'draft' ? 'Edit Draft' : 'Create Revision'}
            </button>
          )}

          {editor && syllabus.status === 'draft' && onPublish && (
            <button
              type="button"
              className="syllabus-primary-btn syllabus-fullscreen-publish-btn"
              disabled={busy}
              onClick={() => onPublish(syllabus)}
            >
              <CheckCircle2 size={15} /> Publish
            </button>
          )}

          <button
            type="button"
            className="syllabus-fullscreen-close-btn"
            onClick={onClose}
            title="Close Preview (Press Esc)"
          >
            <X size={18} /> <span>Close (Esc)</span>
          </button>
        </div>
      </header>

      <main className="syllabus-fullscreen-content">
        {viewMode === 'paper' && syllabus.structure ? (
          <div className="syllabus-fullscreen-document-scroll">
            <div className="syllabus-fullscreen-document-wrap">
              <SyllabusDocument record={syllabus} />
            </div>
          </div>
        ) : pdfLoading ? (
          <div className="syllabus-fullscreen-state">
            <RefreshCw size={36} className="spin" />
            <p>Loading sliced PDF document in full screen mode…</p>
          </div>
        ) : pdfError ? (
          <div className="syllabus-fullscreen-state error">
            <AlertCircle size={36} />
            <p>{pdfError}</p>
            <button type="button" className="syllabus-primary-btn" onClick={() => setPdfAttempt(n => n + 1)}>Retry Loading PDF</button>
          </div>
        ) : pdfUrl ? (
          <iframe
            title={`${syllabus.title} PDF full screen view`}
            src={pdfUrl}
            className="syllabus-fullscreen-iframe"
          />
        ) : syllabus.structure ? (
          <div className="syllabus-fullscreen-document-scroll">
            <div className="syllabus-fullscreen-document-wrap">
              <SyllabusDocument record={syllabus} />
            </div>
          </div>
        ) : (
          <div className="syllabus-fullscreen-state">
            <p>Preparing full screen preview…</p>
          </div>
        )}
      </main>
    </div>
  );
}

export function SyllabusManagement({ role }) {
  const editor = ['academic_coordinator', 'admin'].includes(role);
  
  // Tabs: 'repository' | 'upload_split' | 'templates'
  const [activeTab, setActiveTab] = useState('repository');
  
  const [sectionIds, setSectionIds] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [templatePicker, setTemplatePicker] = useState(false);
  const [editing, setEditing] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all'); // all, 4year, split
  const [deptFilter, setDeptFilter] = useState('all');
  const [repoSemFilter, setRepoSemFilter] = useState('all');
  const [downloadingId, setDownloadingId] = useState(null);
  const [form, setForm] = useState(blankForm);
  const [file, setFile] = useState(null);

  async function downloadSyllabusPdf(syllabus, e) {
    if (e) e.stopPropagation();
    if (!syllabus?.id) return;
    if (syllabus._localBlobUrl) {
      const a = document.createElement('a');
      a.href = syllabus._localBlobUrl;
      a.download = syllabus.file_name || `${syllabus.subject_code || 'Syllabus'}.pdf`;
      a.click();
      return;
    }
    setDownloadingId(syllabus.id);
    try {
      const { data } = await api.get(`/syllabi/${syllabus.id}/pdf`, {
        headers: auth(),
        responseType: 'blob'
      });
      const blobUrl = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = syllabus.file_name || `${syllabus.subject_code || syllabus.title || 'Syllabus'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } catch {
      setError('Could not download syllabus PDF. Please try again.');
    } finally {
      setDownloadingId(null);
    }
  }

  // Fullscreen Preview State
  const [fullscreenSyllabus, setFullscreenSyllabus] = useState(null);

  // Metadata for faculty, subjects & sections
  const [metaFaculty, setMetaFaculty] = useState([]);
  const [metaSubjects, setMetaSubjects] = useState([]);
  const [metaSections, setMetaSections] = useState([]);
  const [metaDepartments, setMetaDepartments] = useState([]);

  // Detected 4-year split courses
  const [detected, setDetected] = useState([]);
  const [detectedViewLayout, setDetectedViewLayout] = useState('table'); // 'table' | 'cards'
  const [detectedYearFilter, setDetectedYearFilter] = useState('all');
  const [detectedFilterSem, setDetectedFilterSem] = useState('all');
  const [detectedCategoryFilter, setDetectedCategoryFilter] = useState('all');
  const [detectedSearch, setDetectedSearch] = useState('');
  const [inspectingSubject, setInspectingSubject] = useState(null);
  const [debugSubject, setDebugSubject] = useState(null);
  const [detectingElective, setDetectingElective] = useState(false);

  async function loadMetadata() {
    if (!editor) return;
    try {
      const { data } = await api.get('/syllabi/metadata', { headers: auth() });
      const fac = data.faculty || [];
      const subs = data.subjects || [];
      const secs = data.sections || [];
      const depts = data.departments || [];
      setMetaFaculty(fac);
      setMetaSubjects(subs);
      setMetaSections(secs);
      setMetaDepartments(depts);
      if (secs.length > 0) {
        setSectionIds(prev => {
          if (prev && prev.length > 0) return prev;
          const match = secs.filter(s => !form.department || s.department.toUpperCase() === form.department.toUpperCase()).map(s => s.id);
          return match.length ? match : secs.map(s => s.id);
        });
      }
    } catch {
      api.get('/subjects', { headers: auth() })
        .then(({ data }) => setMetaSubjects(data.subjects || []))
        .catch(() => {});
    }
  }

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/syllabi', { headers: auth(), params: { manage: editor } });
      setRecords(data.syllabi || []);
    } catch (e) {
      setError(e.response?.data?.message || 'Could not connect to the syllabus service. Check the server connection and retry.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    loadMetadata();
  }, [editor]);

  // Handle autonomous PDF detection & split
  async function detectSyllabusSplit() {
    if (!file) {
      setError('Please select a 4-year B.Tech syllabus PDF file to upload and split.');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError('The selected PDF file exceeds 25 MB. Please select an optimized PDF.');
      return;
    }
    setDetecting(true);
    setError('');
    setNotice('');
    setDetected([]);

    try {
      const base64Pdf = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(file);
      });

      const { data } = await api.post('/syllabi/detect', {
        pdf: base64Pdf,
        department: form.department,
        year: '',
        semester: ''
      }, { headers: auth() });

      if (data.subjects && data.subjects.length > 0) {
        // Auto-match subjects with existing catalog faculty if available & preserve authentic page boundaries
        const enriched = data.subjects.map(item => {
          const code = (item.courseCode || item.course_code || '').toUpperCase();
          const title = item.courseTitle || item.course_name || '';
          const match = metaSubjects.find(s => s.code.toUpperCase() === code);
          const start = item.startPage ?? item.start_page ?? item.page_start;
          const end = item.endPage ?? item.end_page ?? item.page_end;
          const total = item.totalPages ?? item.total_pages ?? item.pageCount ?? (end != null && start != null ? (end - start + 1) : undefined);

          return {
            ...item,
            courseCode: code,
            course_code: code,
            courseTitle: title,
            course_name: title,
            startPage: start,
            start_page: start,
            page_start: start,
            endPage: end,
            end_page: end,
            page_end: end,
            totalPages: total,
            total_pages: total,
            pageCount: total,
            page_count: total,
            pages: item.pages || (total && start ? Array.from({ length: total }, (_, i) => start + i) : []),
            faculty_id: match?.faculty_id || item.faculty_id || ''
          };
        });

        setDetected(enriched);
        setNotice(`✨ Successfully extracted ${data.subjects.length} courses across all semesters! Review and assign faculty below.`);
      } else {
        setError('No courses could be identified automatically. Verify that your PDF is a text-based curriculum document.');
      }
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to analyze and split the syllabus PDF. Please verify the document format.');
    } finally {
      setDetecting(false);
    }
  }

  // Upload an additional elective PDF (e.g. 24EC11EL04) and merge into detected list
  async function uploadAdditionalElectivePdf(electiveFile) {
    if (!electiveFile) return;
    setDetectingElective(true);
    setError('');
    setNotice('');

    try {
      const base64Pdf = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(electiveFile);
      });

      const { data } = await api.post('/syllabi/detect', {
        pdf: base64Pdf,
        department: form.department,
        year: '',
        semester: ''
      }, { headers: auth() });

      if (data.subjects && data.subjects.length > 0) {
        const newSubjects = data.subjects.map(item => {
          const code = (item.courseCode || item.course_code || '').toUpperCase();
          const title = item.courseTitle || item.course_name || '';
          const match = metaSubjects.find(s => s.code.toUpperCase() === code);
          const start = item.startPage ?? item.start_page ?? item.page_start;
          const end = item.endPage ?? item.end_page ?? item.page_end;
          const total = item.totalPages ?? item.total_pages ?? item.pageCount ?? (end != null && start != null ? (end - start + 1) : undefined);

          return {
            ...item,
            courseCode: code,
            course_code: code,
            courseTitle: title,
            course_name: title,
            startPage: start,
            start_page: start,
            page_start: start,
            endPage: end,
            end_page: end,
            page_end: end,
            totalPages: total,
            total_pages: total,
            pageCount: total,
            page_count: total,
            pages: item.pages || (total && start ? Array.from({ length: total }, (_, i) => start + i) : []),
            faculty_id: match?.faculty_id || item.faculty_id || ''
          };
        });

        // Merge into existing detected array: replace matching codes, or append
        setDetected(current => {
          const updated = [...current];
          for (const newSub of newSubjects) {
            const existingIdx = updated.findIndex(u => (u.courseCode || u.course_code || '').toUpperCase() === (newSub.courseCode || newSub.course_code || '').toUpperCase());
            if (existingIdx >= 0) {
              updated[existingIdx] = { ...updated[existingIdx], ...newSub };
            } else {
              updated.push(newSub);
            }
          }
          return updated;
        });

        setNotice(`✨ Extracted ${data.subjects.length} elective course(s) (${data.subjects.map(s => s.course_code || s.courseCode).join(', ')}) from "${electiveFile.name}" and merged into the curriculum!`);
      } else {
        setError('No elective courses could be extracted from the uploaded PDF.');
      }
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to process elective PDF.');
    } finally {
      setDetectingElective(false);
    }
  }

  // Preview the raw uploaded PDF in full screen
  function previewUploadedPdf() {
    if (!file) return;
    const blobUrl = URL.createObjectURL(file);
    setFullscreenSyllabus({
      id: 'temp-upload',
      title: form.title || file.name.replace('.pdf', ''),
      department: form.department,
      batch: form.batch,
      status: 'draft',
      file_name: file.name,
      _localBlobUrl: blobUrl
    });
  }

  // Download full split syllabus ZIP archive with semester folders + course_index.csv
  async function downloadSplitZip() {
    if (!detected.length) return;
    setBusy(true);
    try {
      const res = await api.post('/syllabi/export-zip', {
        subjects: detected,
        archiveName: `${form.department || 'CSE'}_4Year_Syllabus_Split_Archive.zip`
      }, {
        headers: auth(),
        responseType: 'blob'
      });
      const blob = new Blob([res.data], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${form.department || 'CSE'}_4Year_Syllabus_Split_Archive.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError('Failed to generate and download the ZIP archive.');
    } finally {
      setBusy(false);
    }
  }

  // Preview an individual detected split course
  function previewDetectedCourse(item, idx) {
    let localPdfUrl = '';
    if (item.pdf_base64) {
      try {
        const byteCharacters = atob(item.pdf_base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        localPdfUrl = URL.createObjectURL(blob);
      } catch (err) {
        console.warn('Could not create blob URL for sliced PDF:', err);
      }
    }

    const cCode = item.courseCode || item.course_code || 'COURSE';
    const cTitle = item.courseTitle || item.course_name || 'Course Syllabus';
    const fName = item.fileName || item.file_name || `${cCode}_Syllabus.pdf`;

    const virtualRecord = {
      id: `temp-detected-${idx}`,
      title: cTitle,
      subject_code: cCode,
      department: form.department,
      batch: form.batch,
      status: 'draft',
      file_name: fName,
      _localBlobUrl: localPdfUrl,
      has_pdf: Boolean(localPdfUrl),
      startPage: item.startPage ?? item.start_page ?? item.page_start,
      endPage: item.endPage ?? item.end_page ?? item.page_end,
      totalPages: item.totalPages ?? item.total_pages ?? item.pageCount,
      assigned_faculty_name: metaFaculty.find(f => f.id === item.faculty_id)?.full_name || '',
      structure: {
        ...item,
        code: cCode,
        title: cTitle,
        annexure: item.annexure || '',
        category: item.category || '',
        ltpc: item.ltpc || `${item.l || '3'}-0-${item.p || '0'}-${item.credits || '3'}`,
        co_intro: item.co_intro || 'At the end of the Course, the student shall be able to',
        co_list: item.co_list || [],
        units_list: item.units_list || [],
        unit_1: item.unit_1 || '',
        unit_2: item.unit_2 || '',
        unit_3: item.unit_3 || '',
        unit_4: item.unit_4 || '',
        unit_5: item.unit_5 || '',
        unit_1_lectures: item.unit_1_lectures || '09 Lectures',
        unit_2_lectures: item.unit_2_lectures || '09 Lectures',
        unit_3_lectures: item.unit_3_lectures || '12 Lectures',
        unit_4_lectures: item.unit_4_lectures || '09 Lectures',
        unit_5_lectures: item.unit_5_lectures || '09 Lectures',
        text_books_list: item.text_books_list || [],
        reference_books_list: item.reference_books_list || [],
        web_references_list: item.web_references_list || [],
        semesters: [{
          name: item.semester || `Semester ${item.semester_number || 1}`,
          courses: [{
            ...item,
            code: item.course_code,
            category: item.category || '',
            title: item.course_name,
            l: item.l || '3',
            p: item.p || '0',
            internal: item.internal || '30',
            external: item.external || '70',
            total: '100',
            credits: item.credits || '3',
            objectives: item.objectives || '',
            co_intro: item.co_intro || '',
            co_list: item.co_list || [],
            unit_1: item.unit_1 || '',
            unit_2: item.unit_2 || '',
            unit_3: item.unit_3 || '',
            unit_4: item.unit_4 || '',
            unit_5: item.unit_5 || '',
            unit_1_lectures: item.unit_1_lectures || '09 Lectures',
            unit_2_lectures: item.unit_2_lectures || '09 Lectures',
            unit_3_lectures: item.unit_3_lectures || '12 Lectures',
            unit_4_lectures: item.unit_4_lectures || '09 Lectures',
            unit_5_lectures: item.unit_5_lectures || '09 Lectures',
            text_books_list: item.text_books_list || [],
            reference_books_list: item.reference_books_list || [],
            web_references_list: item.web_references_list || [],
            units: [
              item.unit_1 ? `UNIT I — ${item.unit_1}` : '',
              item.unit_2 ? `UNIT II — ${item.unit_2}` : '',
              item.unit_3 ? `UNIT III — ${item.unit_3}` : '',
              item.unit_4 ? `UNIT IV — ${item.unit_4}` : '',
              item.unit_5 ? `UNIT V — ${item.unit_5}` : ''
            ].filter(Boolean).join('\n\n'),
            outcomes: item.course_outcomes || '',
            references: [item.textbooks, item.reference_books, item.web_references].filter(Boolean).join('\n\n')
          }]
        }]
      },
      subject_id: 'detected-preview'
    };
    setFullscreenSyllabus(virtualRecord);
  }

  // Final confirmation: publish the 4-year syllabus and all designated split courses
  async function publishSplitSyllabi() {
    if (!detected.length) {
      setError('No courses available to publish. Upload and extract a syllabus first.');
      return;
    }
    if (!sectionIds || !sectionIds.length) {
      setError('Please select at least one target class section in the Target Student Classes & Audience list before publishing.');
      return;
    }
    if (!form.batch || !form.batch.trim()) {
      setError('Please specify the admitted batch (e.g. 2024–25 onwards).');
      return;
    }
    const selectedSectionsList = metaSections.filter(s => sectionIds.includes(s.id));
    const distinctDepts = [...new Set(selectedSectionsList.map(s => s.department))];
    if (distinctDepts.length > 1) {
      setError(`A syllabus must target classes in one department. Currently selected classes belong to: ${distinctDepts.join(', ')}.`);
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');

    try {
      let base64Pdf = null;
      if (file) {
        base64Pdf = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = reject;
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(file);
        });
      }

      const { data } = await api.post('/syllabi/publish-detected', {
        subjects: detected,
        sectionIds,
        batch: form.batch.trim(),
        file_name: file?.name || '4-Year-BTech-Syllabus.pdf',
        publishFullSyllabus: form.publishFullSyllabus,
        fullTitle: form.title?.trim() || `${form.department} — 4-Year B.Tech Curriculum & Course Structure`,
        fullDescription: form.description?.trim() || '',
        pdf: base64Pdf
      }, { headers: auth() });

      await refresh();
      setDetected([]);
      setFile(null);
      setForm(blankForm);
      setActiveTab('repository');
      const count = data.syllabi ? data.syllabi.length : detected.length;
      setNotice(`🎉 Published ${count} syllabus records! The 4-Year Curriculum is shared with target student classes, and split courses are assigned to designated faculty.`);
    } catch (e) {
      setError(e.response?.data?.message || 'Could not publish the split syllabi. Please review and try again.');
    } finally {
      setBusy(false);
    }
  }

  // Save manual portal structure draft
  async function saveStructure(draft) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { data } = await api.request({
        method: draft.id ? 'put' : 'post',
        url: draft.id ? `/syllabi/${draft.id}` : '/syllabi',
        data: {
          sectionIds,
          title: draft.title,
          department: draft.department,
          batch: draft.batch,
          description: draft.description,
          structure: draft.structure,
          subjectId: draft.subjectId || undefined,
          facultyId: draft.facultyId || undefined
        },
        headers: auth()
      });
      setRecords(current => [data.syllabus, ...current.filter(row => row.id !== data.syllabus.id)]);
      setEditing(null);
      setActiveTab('repository');
      setQuery('');
      setStatusFilter('all');
      setNotice('Draft saved successfully. You can preview it in full screen and publish whenever ready.');
    } catch (e) {
      setError(e.response?.data?.message || 'Could not save your syllabus. Your edits are still preserved; please retry.');
    } finally {
      setBusy(false);
    }
  }

  async function publishRecord(row) {
    if (!row?.id) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { data } = await api.post(`/syllabi/${row.id}/publish`, {}, { headers: auth() });
      setRecords(current => current.map(r => r.id === data.syllabus.id ? data.syllabus : r));
      if (fullscreenSyllabus?.id === data.syllabus.id) {
        setFullscreenSyllabus(data.syllabus);
      }
      setNotice(`🎉 Syllabus "${data.syllabus.title}" published! Students and assigned faculty can now access it.`);
    } catch (e) {
      setError(e.response?.data?.message || 'Publishing failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  // Auto-match all detected courses with faculty from subjects catalog
  function autoMatchFaculty() {
    setDetected(current => current.map(item => {
      const match = metaSubjects.find(s => s.code.toUpperCase() === item.course_code.toUpperCase());
      return match?.faculty_id ? { ...item, faculty_id: match.faculty_id } : item;
    }));
    setNotice('Auto-matched existing subject faculty from the academic catalog.');
  }

  // Batch assign all visible detected courses to a specific faculty member
  function bulkAssignFaculty(facultyId) {
    if (!facultyId) return;
    setDetected(current => current.map(item => {
      const matchesYear = detectedYearFilter === 'all' || String(item.year_number) === detectedYearFilter;
      const matchesSem = detectedFilterSem === 'all' || String(item.semester_number) === detectedFilterSem;
      const matchesCategory = detectedCategoryFilter === 'all' || (item.category && item.category.toUpperCase().includes(detectedCategoryFilter.toUpperCase()));
      return (matchesYear && matchesSem && matchesCategory) ? { ...item, faculty_id: facultyId } : item;
    }));
    const fac = metaFaculty.find(f => f.id === facultyId);
    setNotice(`Assigned all matching filtered courses to ${fac?.full_name || 'selected faculty'}.`);
  }

  // Hierarchical filter for detected split subjects (Year -> Semester -> Category -> Search)
  const filteredDetected = useMemo(() => {
    return detected.filter(item => {
      const matchesYear = detectedYearFilter === 'all'
        || String(item.year_number) === detectedYearFilter
        || (item.year && item.year.includes(detectedYearFilter));

      const matchesSem = detectedFilterSem === 'all'
        || String(item.semester_number) === detectedFilterSem
        || (item.semester && item.semester.toLowerCase().includes(detectedFilterSem.toLowerCase()));

      const matchesCategory = detectedCategoryFilter === 'all'
        || (item.category && item.category.toUpperCase().includes(detectedCategoryFilter.toUpperCase()));

      const matchesQuery = !detectedSearch
        || (item.course_code + ' ' + item.course_name + ' ' + (item.semester || '') + ' ' + (item.category || '')).toLowerCase().includes(detectedSearch.toLowerCase());

      return matchesYear && matchesSem && matchesCategory && matchesQuery;
    });
  }, [detected, detectedYearFilter, detectedFilterSem, detectedCategoryFilter, detectedSearch]);

  // Unique departments in repository records
  const repositoryDepartments = useMemo(() => {
    const list = [...new Set(records.map(r => r.department).filter(Boolean))];
    return list.sort();
  }, [records]);

  // Filter visible syllabi in library
  const visible = useMemo(() => {
    return records.filter(row => {
      const matchesStatus = statusFilter === 'all' || row.status === statusFilter;
      const matchesType = typeFilter === 'all'
        || (typeFilter === '4year' && !row.subject_id)
        || (typeFilter === 'split' && row.subject_id);
      const matchesDept = deptFilter === 'all' || row.department === deptFilter;
      const matchesSearch = !query
        || `${row.title} ${row.department} ${row.batch} ${row.assigned_faculty_name || ''} ${row.subject_code || ''}`.toLowerCase().includes(query.toLowerCase());

      let matchesSem = true;
      if (repoSemFilter !== 'all' && row.subject_id) {
        const semName = (row.structure?.semesters?.[0]?.name || row.structure?.semester || row.title || '').toLowerCase();
        const romanMap = {
          '1': ['sem 1', 'sem-1', 'semester 1', 'i-i', 'i year - i'],
          '2': ['sem 2', 'sem-2', 'semester 2', 'i-ii', 'i year - ii'],
          '3': ['sem 3', 'sem-3', 'semester 3', 'ii-i', 'ii year - i'],
          '4': ['sem 4', 'sem-4', 'semester 4', 'ii-ii', 'ii year - ii'],
          '5': ['sem 5', 'sem-5', 'semester 5', 'iii-i', 'iii year - i'],
          '6': ['sem 6', 'sem-6', 'semester 6', 'iii-ii', 'iii year - ii'],
          '7': ['sem 7', 'sem-7', 'semester 7', 'iv-i', 'iv year - i'],
          '8': ['sem 8', 'sem-8', 'semester 8', 'iv-ii', 'iv year - ii']
        };
        const patterns = romanMap[repoSemFilter] || [];
        matchesSem = patterns.some(p => semName.includes(p));
      }

      return matchesStatus && matchesType && matchesDept && matchesSearch && matchesSem;
    });
  }, [records, statusFilter, typeFilter, deptFilter, query, repoSemFilter]);

  const masterCurriculum = useMemo(() => {
    return records.find(r => !r.subject_id && (deptFilter === 'all' || r.department === deptFilter) && r.status === 'published')
      || records.find(r => !r.subject_id && (deptFilter === 'all' || r.department === deptFilter));
  }, [records, deptFilter]);

  const courseSyllabiCount = useMemo(() => {
    return visible.filter(r => Boolean(r.subject_id)).length;
  }, [visible]);

  // Metric stats
  const totalCount = records.length;
  const fourYearCount = records.filter(r => !r.subject_id).length;
  const splitCount = records.filter(r => Boolean(r.subject_id)).length;
  const publishedCount = records.filter(r => r.status === 'published').length;
  const draftCount = records.filter(r => r.status === 'draft').length;

  return (
    <div className="syllabus-workspace-refined">
      {/* Clean Top Navigation Toolbar */}
      {editor && !editing && (
        <div className="syllabus-top-toolbar">
          <div className="syllabus-navigation-tabs">
            <button
              type="button"
              className={`syllabus-nav-tab ${activeTab === 'repository' ? 'active' : ''}`}
              onClick={() => setActiveTab('repository')}
            >
              <BookOpen size={16} />
              <span>Syllabi Repository</span>
              <span className="syllabus-tab-badge">{records.length}</span>
            </button>

            <button
              type="button"
              className={`syllabus-nav-tab ${activeTab === 'upload_split' ? 'active' : ''}`}
              onClick={() => { setActiveTab('upload_split'); setError(''); setNotice(''); }}
            >
              <Sparkles size={16} />
              <span>Upload & Split 4-Year PDF</span>
              {detected.length > 0 && <span className="syllabus-tab-badge pulse">{detected.length}</span>}
            </button>

            <button
              type="button"
              className={`syllabus-nav-tab ${activeTab === 'templates' ? 'active' : ''}`}
              onClick={() => { setActiveTab('templates'); setError(''); setNotice(''); }}
            >
              <FolderOpen size={16} />
              <span>Curriculum Starters & Templates</span>
            </button>
          </div>

          <button
            type="button"
            className="syllabus-secondary-btn"
            onClick={refresh}
            disabled={loading || busy}
            title="Refresh list from server"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      )}

      {/* Notifications and Alerts */}
      {error && (
        <div role="alert" className="syllabus-alert-banner error">
          <AlertCircle size={20} />
          <span>{error}</span>
          <button type="button" className="alert-dismiss-btn" onClick={() => setError('')}><X size={15} /></button>
        </div>
      )}
      {notice && (
        <div role="status" className="syllabus-alert-banner success">
          <CheckCircle2 size={20} />
          <span>{notice}</span>
          <button type="button" className="alert-dismiss-btn" onClick={() => setNotice('')}><X size={15} /></button>
        </div>
      )}

      {/* Manual Editor Active */}
      {editing ? (
        <SyllabusEditor
          initial={editing}
          onSave={saveStructure}
          onCancel={() => setEditing(null)}
          busy={busy}
        />
      ) : activeTab === 'upload_split' && editor ? (
        /* Upload & Course-ID Auto-Split Section */
        <div className="syllabus-upload-workflow-panel">
          <div className="syllabus-panel-top-title">
            <div>
              <span className="syllabus-step-pill">AUTOMATED CURRICULUM PIPELINE</span>
              <h3>Autonomous 4-Year B.Tech Syllabus Parser</h3>
              <p className="syllabus-panel-desc">
                Upload your official 4-Year B.Tech curriculum PDF. The system automatically parses all courses across 8 semesters, extracts unit contents, textbook references, and prepares split course assignments for faculty.
              </p>
            </div>
            <button
              type="button"
              className="syllabus-secondary-btn"
              onClick={() => { setActiveTab('repository'); setDetected([]); setFile(null); }}
            >
              Back to Repository
            </button>
          </div>

          <form className="syllabus-unified-upload-form" onSubmit={e => { e.preventDefault(); detectSyllabusSplit(); }}>
            <div className="syllabus-upload-columns">
              {/* Left Column: Form Details & File Picker */}
              <div className="syllabus-upload-card">
                <h4 className="syllabus-card-section-title">
                  <FileText size={16} /> 1. Curriculum Document Details
                </h4>

                <div className="syllabus-form-grid">
                  <div className="form-control-item">
                    <label>Department</label>
                    <select
                      value={form.department}
                      onChange={e => {
                        const newDept = e.target.value;
                        setForm(prev => ({ ...prev, department: newDept }));
                        if (metaSections.length > 0) {
                          const matching = metaSections.filter(s => s.department.toUpperCase() === newDept.toUpperCase()).map(s => s.id);
                          if (matching.length > 0) setSectionIds(matching);
                        }
                      }}
                    >
                      {metaDepartments.length > 0 ? (
                        metaDepartments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)
                      ) : (
                        ['CSE', 'ECE', 'EEE', 'IT', 'CSM', 'CSD'].map(d => <option key={d} value={d}>{d}</option>)
                      )}
                    </select>
                  </div>

                  <div className="form-control-item">
                    <label>Admitted Batch</label>
                    <input
                      required
                      placeholder="e.g. 2024–25 onwards (or 2022–2026)"
                      value={form.batch}
                      onChange={e => setForm({ ...form, batch: e.target.value })}
                    />
                  </div>

                  <div className="form-control-item full-width">
                    <label>Document Title</label>
                    <input
                      placeholder="e.g. B.Tech Computer Science & Engineering — Four Year Scheme & Syllabus"
                      value={form.title}
                      onChange={e => setForm({ ...form, title: e.target.value })}
                    />
                  </div>

                  <div className="form-control-item full-width">
                    <label>4-Year Curriculum Syllabus PDF File</label>
                    <div className="syllabus-dropzone-box">
                      <Upload size={28} className="dropzone-icon" />
                      <div className="dropzone-text">
                        <strong>{file ? file.name : 'Choose official B.Tech Syllabus PDF'}</strong>
                        <span>{file ? `${(file.size / (1024 * 1024)).toFixed(2)} MB PDF selected` : 'Drag and drop or browse from computer (Max 25 MB)'}</span>
                      </div>
                      <input
                        type="file"
                        accept=".pdf"
                        required
                        className="dropzone-file-input"
                        onChange={e => setFile(e.target.files?.[0] || null)}
                      />
                    </div>
                  </div>
                </div>

                <div className="syllabus-extract-btn-wrap">
                  <button
                    type="submit"
                    className="syllabus-primary-btn extract-btn"
                    disabled={detecting || busy || !file}
                  >
                    <Sparkles size={18} />
                    {detecting ? 'Analyzing Curriculum & Splitting by Course ID…' : 'Extract & Split Courses by Course ID'}
                  </button>
                </div>
              </div>

              {/* Right Column: Publication Audience Selection */}
              <div className="syllabus-upload-card audience-card-wrapper">
                <PublicationAudience
                  value={sectionIds}
                  onChange={setSectionIds}
                  department={form.department}
                  disabled={busy || detecting}
                  title="Target Student Classes & Audience"
                  description="Select which class sections will have access to this curriculum upon publication."
                />
              </div>
            </div>

            {/* Detected Split Courses Review Panel */}
            {detected.length > 0 && (
              <section className="syllabus-split-panel-refined" aria-label="Detected Courses Review">
                <div className="syllabus-split-header-refined">
                  <div>
                    <div className="syllabus-split-title-row">
                      <span className="syllabus-badge-split-count"><Layers size={15} /> {detected.length} Courses Detected</span>
                      <h4>Review & Allocate Split Courses</h4>
                    </div>
                    <p className="syllabus-split-sub">
                      Map designated faculty recipients for each split course. When published, the complete 4-year curriculum is distributed to selected student sections, and authentic sliced course PDFs are allocated to faculty.
                    </p>
                  </div>

                  <div className="syllabus-split-actions-refined">
                    {file && (
                      <button
                        type="button"
                        className="syllabus-secondary-btn"
                        onClick={previewUploadedPdf}
                      >
                        <Maximize2 size={15} /> Preview 4-Year PDF
                      </button>
                    )}

                    <label className="syllabus-secondary-btn elective-upload-btn" title="Upload an individual elective syllabus PDF (e.g. 24EC11EL04)">
                      <Upload size={15} />
                      <span>{detectingElective ? 'Merging Elective…' : 'Add Elective PDF'}</span>
                      <input
                        type="file"
                        accept=".pdf"
                        style={{ display: 'none' }}
                        disabled={detectingElective || busy}
                        onChange={e => {
                          const f = e.target.files?.[0];
                          if (f) uploadAdditionalElectivePdf(f);
                          e.target.value = '';
                        }}
                      />
                    </label>

                    <button
                      type="button"
                      className="syllabus-secondary-btn highlight"
                      onClick={autoMatchFaculty}
                    >
                      <UserCheck size={16} /> Auto-Match Catalog Faculty
                    </button>
                  </div>
                </div>

                {/* Hierarchical Filter & Bulk Assignment Bar */}
                <div className="syllabus-split-controls-bar">
                  {/* Row 1: Year & Category Filters */}
                  <div className="syllabus-hierarchy-filter-row">
                    <div className="syllabus-filter-group">
                      <span className="syllabus-filter-label"><GraduationCap size={13} /> Year:</span>
                      {[
                        { id: 'all', label: 'All Years' },
                        { id: '1', label: 'Year I' },
                        { id: '2', label: 'Year II' },
                        { id: '3', label: 'Year III' },
                        { id: '4', label: 'Year IV' }
                      ].map(tab => (
                        <button
                          key={tab.id}
                          type="button"
                          className={`syllabus-sem-chip ${detectedYearFilter === tab.id ? 'active' : ''}`}
                          onClick={() => setDetectedYearFilter(tab.id)}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <div className="syllabus-filter-group">
                      <span className="syllabus-filter-label"><Filter size={13} /> Category:</span>
                      {[
                        { id: 'all', label: 'All' },
                        { id: 'BS', label: 'BS (Science)' },
                        { id: 'ES', label: 'ES (Engg)' },
                        { id: 'HSS', label: 'HSS (Humanities)' },
                        { id: 'PC', label: 'PC (Core)' },
                        { id: 'PE', label: 'PE (Elective)' },
                        { id: 'OE', label: 'OE (Open)' }
                      ].map(cat => (
                        <button
                          key={cat.id}
                          type="button"
                          className={`syllabus-sem-chip ${detectedCategoryFilter === cat.id ? 'active' : ''}`}
                          onClick={() => setDetectedCategoryFilter(cat.id)}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Row 2: Semester Chips */}
                  <div className="syllabus-sem-filter-chips">
                    <span className="syllabus-filter-label"><Calendar size={13} /> Semester:</span>
                    {[
                      { id: 'all', label: 'All Semesters' },
                      { id: '1', label: 'I-I (Sem 1)' },
                      { id: '2', label: 'I-II (Sem 2)' },
                      { id: '3', label: 'II-I (Sem 3)' },
                      { id: '4', label: 'II-II (Sem 4)' },
                      { id: '5', label: 'III-I (Sem 5)' },
                      { id: '6', label: 'III-II (Sem 6)' },
                      { id: '7', label: 'IV-I (Sem 7)' },
                      { id: '8', label: 'IV-II (Sem 8)' }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        type="button"
                        className={`syllabus-sem-chip ${detectedFilterSem === tab.id ? 'active' : ''}`}
                        onClick={() => setDetectedFilterSem(tab.id)}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Row 3: Search & Bulk Assign */}
                  <div className="syllabus-split-search-row">
                    <div className="syllabus-search-mini">
                      <Search size={14} />
                      <input
                        type="search"
                        placeholder="Search by course code, title, category..."
                        value={detectedSearch}
                        onChange={e => setDetectedSearch(e.target.value)}
                      />
                      {detectedSearch && (
                        <button type="button" className="clear-mini-btn" onClick={() => setDetectedSearch('')}>
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    <div className="syllabus-bulk-assign">
                      <label>
                        <span>Bulk Assign ({filteredDetected.length} filtered):</span>
                        <select
                          defaultValue=""
                          onChange={e => {
                            bulkAssignFaculty(e.target.value);
                            e.target.value = '';
                          }}
                        >
                          <option value="" disabled>-- Select Faculty --</option>
                          {metaFaculty.map(f => (
                            <option key={f.id} value={f.id}>
                              {f.full_name} ({f.employee_code || f.department || 'Faculty'})
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Filter counts summary & Layout Switcher */}
                <div className="syllabus-filter-status-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span>Showing <strong>{filteredDetected.length}</strong> of {detected.length} detected courses</span>
                    {(detectedYearFilter !== 'all' || detectedFilterSem !== 'all' || detectedCategoryFilter !== 'all' || detectedSearch) && (
                      <button
                        type="button"
                        className="syllabus-text-reset-btn"
                        onClick={() => {
                          setDetectedYearFilter('all');
                          setDetectedFilterSem('all');
                          setDetectedCategoryFilter('all');
                          setDetectedSearch('');
                        }}
                      >
                        Reset All Filters
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      className="syllabus-secondary-btn syllabus-sm-btn"
                      onClick={downloadSplitZip}
                      disabled={busy || !detected.length}
                      title="Download full split syllabus ZIP archive with semester folders and course_index.csv"
                    >
                      <Download size={13} /> Download ZIP Archive
                    </button>

                    <div className="syllabus-view-mode-switch">
                      <button
                        type="button"
                        className={`syllabus-view-mode-switch-btn ${detectedViewLayout === 'table' ? 'active' : ''}`}
                        onClick={() => setDetectedViewLayout('table')}
                        title="Boundary Verification Table"
                      >
                        <Table size={13} /> Verification Table
                      </button>
                      <button
                        type="button"
                        className={`syllabus-view-mode-switch-btn ${detectedViewLayout === 'cards' ? 'active' : ''}`}
                        onClick={() => setDetectedViewLayout('cards')}
                        title="Course Cards Grid"
                      >
                        <LayoutGrid size={13} /> Cards Grid
                      </button>
                    </div>
                  </div>
                </div>

                {/* Boundary Verification Table View */}
                {detectedViewLayout === 'table' ? (
                  <div className="syllabus-boundary-table-container">
                    <table className="syllabus-boundary-table">
                      <thead>
                        <tr>
                          <th>Course Code</th>
                          <th>Course Title</th>
                          <th style={{ textAlign: 'center' }}>Start Page</th>
                          <th style={{ textAlign: 'center' }}>End Page</th>
                          <th style={{ textAlign: 'center' }}>Total Pages</th>
                          <th>Category</th>
                          <th>Designated Faculty</th>
                          <th style={{ textAlign: 'center' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDetected.map((item, idx) => {
                          const originalIdx = detected.findIndex(d => (d.courseCode || d.course_code) === (item.courseCode || item.course_code));
                          const startP = item.startPage ?? item.start_page ?? item.page_start;
                          const endP = item.endPage ?? item.end_page ?? item.page_end;
                          const countP = item.totalPages ?? item.total_pages ?? item.pageCount ?? item.page_count ?? (endP != null && startP != null ? (endP - startP + 1) : null);
                          const cCode = item.courseCode || item.course_code;
                          const cTitle = item.courseTitle || item.course_name;
                          const fName = item.fileName || item.file_name;

                          return (
                            <tr key={cCode + idx}>
                              <td>
                                <span className="syllabus-course-id-badge">{cCode}</span>
                              </td>
                              <td>
                                <div style={{ fontWeight: 750, color: '#0f172a' }}>{cTitle}</div>
                                <div style={{ fontSize: '11px', color: '#64748b' }}>{fName}</div>
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <span className="syllabus-boundary-badge">{startP != null ? startP : '—'}</span>
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <span className="syllabus-boundary-badge">{endP != null ? endP : '—'}</span>
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <span className="syllabus-boundary-badge highlight">{countP != null ? `${countP} ${countP === 1 ? 'page' : 'pages'}` : '— pages'}</span>
                              </td>
                              <td>
                                {item.category && (
                                  <span className={`syllabus-cat-pill cat-${item.category.toLowerCase().replace(/[^a-z0-9]/g, '')}`}>
                                    {item.category}
                                  </span>
                                )}
                              </td>
                              <td>
                                <select
                                  style={{ fontSize: '12px', padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', maxWidth: '210px' }}
                                  value={item.faculty_id || ''}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setDetected(rows => rows.map((r, i) => i === originalIdx ? { ...r, faculty_id: val } : r));
                                  }}
                                >
                                  <option value="">-- Unassigned (Pool) --</option>
                                  {metaFaculty.map(f => (
                                    <option key={f.id} value={f.id}>
                                      {f.full_name} ({f.employee_code || f.department || 'Faculty'})
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <div className="syllabus-table-actions" style={{ justifyContent: 'center' }}>
                                  <button
                                    type="button"
                                    className="syllabus-secondary-btn syllabus-sm-btn"
                                    onClick={() => previewDetectedCourse(item, originalIdx)}
                                    title="Preview Full Sliced PDF and Structure"
                                  >
                                    <Eye size={12} /> Preview
                                  </button>
                                  <button
                                    type="button"
                                    className="syllabus-secondary-btn syllabus-sm-btn"
                                    onClick={() => setInspectingSubject({ ...item, _idx: originalIdx })}
                                    title="Edit Units and Outcomes"
                                  >
                                    <Pencil size={12} /> Edit
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  /* Split Course Cards Grid */
                  <div className="syllabus-split-grid">
                    {filteredDetected.map((item, idx) => {
                      const originalIdx = detected.findIndex(d => (d.courseCode || d.course_code) === (item.courseCode || item.course_code));
                      const unitsCount = item.units_list?.length || [item.unit_1, item.unit_2, item.unit_3, item.unit_4, item.unit_5].filter(Boolean).length;
                      const coCount = item.co_list?.length || 0;
                      const hasPdf = Boolean(item.pdf_base64);
                      const startP = item.startPage ?? item.start_page ?? item.page_start;
                      const endP = item.endPage ?? item.end_page ?? item.page_end;
                      const countP = item.totalPages ?? item.total_pages ?? item.pageCount ?? item.page_count ?? (endP != null && startP != null ? (endP - startP + 1) : null);
                      const cCode = item.courseCode || item.course_code;
                      const cTitle = item.courseTitle || item.course_name;

                      return (
                        <div key={cCode + idx} className="syllabus-split-card">
                          <div className="syllabus-split-card-top">
                            <div className="syllabus-code-cat-group">
                              <span className="syllabus-course-id-badge">{cCode}</span>
                              {item.category && (
                                <span className={`syllabus-cat-pill cat-${item.category.toLowerCase().replace(/[^a-z0-9]/g, '')}`}>
                                  {item.category}
                                </span>
                              )}
                            </div>
                            <div className="syllabus-card-pills-group">
                              <span className="syllabus-pages-pill" title={`Original PDF Pages ${startP != null ? startP : '—'} to ${endP != null ? endP : '—'} (${hasPdf ? 'Sliced PDF attached' : 'Text only'})`}>
                                <FileText size={11} /> P.{startP != null ? startP : '—'}{endP != null && endP !== startP ? `–${endP}` : ''} ({countP != null ? `${countP}p` : '—'})
                              </span>
                              <span className="syllabus-sem-pill">{item.semester || `Sem ${item.semester_number || 1}`}</span>
                            </div>
                          </div>

                          <h5 className="syllabus-course-name">{cTitle}</h5>

                          <div className="syllabus-split-card-meta">
                            <span>Credits: <strong>{item.credits || '3'}</strong></span>
                            <span>L-P: <strong>{item.l || '3'}-{item.p || '0'}</strong></span>
                            <span>Marks: <strong>{item.internal || '30'}/{item.external || '70'}</strong></span>
                          </div>

                          <div className="syllabus-card-health-badges">
                            <span className={`health-badge ${unitsCount >= 5 ? 'good' : 'neutral'}`}>
                              <BookOpen size={11} /> {unitsCount} Units
                            </span>
                            {coCount > 0 && (
                              <span className="health-badge good">
                                <CheckCircle2 size={11} /> {coCount} COs
                              </span>
                            )}
                            {hasPdf && (
                              <span className="health-badge good">
                                <ShieldCheck size={11} /> Authentic Sliced PDF
                              </span>
                            )}
                          </div>

                          <div className="syllabus-faculty-assign-row">
                            <label>
                              <span className="syllabus-assign-label"><Users size={12} /> Designated Faculty Recipient:</span>
                              <select
                                value={item.faculty_id || ''}
                                onChange={e => {
                                  const val = e.target.value;
                                  setDetected(rows => rows.map((r, i) => i === originalIdx ? { ...r, faculty_id: val } : r));
                                }}
                              >
                                <option value="">-- Unassigned (Department Pool) --</option>
                                {metaFaculty.map(f => (
                                  <option key={f.id} value={f.id}>
                                    {f.full_name} ({f.employee_code || f.department || 'Faculty'})
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>

                          <div className="syllabus-card-footer">
                            <button
                              type="button"
                              className="syllabus-secondary-btn syllabus-sm-btn"
                              onClick={() => previewDetectedCourse(item, originalIdx)}
                              title="Preview PDF and Structured Paper"
                            >
                              <Eye size={13} /> Preview
                            </button>
                            <button
                              type="button"
                              className="syllabus-secondary-btn syllabus-sm-btn"
                              onClick={() => setInspectingSubject({ ...item, _idx: originalIdx })}
                              title="Edit Units and Outcomes text"
                            >
                              <Pencil size={13} /> Edit Units
                            </button>
                            <button
                              type="button"
                              className="syllabus-secondary-btn syllabus-sm-btn debug-btn"
                              onClick={() => setDebugSubject(item)}
                              title="View Extraction Diagnostics & Raw JSON"
                            >
                              <Search size={13} /> Diagnostics
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Publish & Distribution Confirmation Bar */}
                <div className="syllabus-publish-confirm-bar">
                  <div className="syllabus-confirm-options">
                    <label className="syllabus-checkbox-label">
                      <input
                        type="checkbox"
                        checked={form.publishFullSyllabus}
                        onChange={e => setForm({ ...form, publishFullSyllabus: e.target.checked })}
                      />
                      <span>
                        <strong>Share complete 4-Year Syllabus PDF with target students ({sectionIds.length} classes selected)</strong>
                        <small>All students in selected class sections will have direct access to read, print, and download the full document.</small>
                      </span>
                    </label>
                    {sectionIds.length === 0 && (
                      <div className="syllabus-inline-warning" style={{ color: '#b91c1c', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px', marginTop: '6px', fontWeight: 600 }}>
                        <AlertCircle size={14} /> Please select at least one class section in the Target Student Classes & Audience list above before publishing.
                      </div>
                    )}
                  </div>

                  <div className="syllabus-confirm-actions">
                    <button
                      type="button"
                      className="syllabus-primary-btn"
                      disabled={busy || detecting || !detected.length}
                      onClick={publishSplitSyllabi}
                    >
                      <CheckCircle2 size={18} />
                      {busy ? 'Publishing & Distributing…' : `Publish 4-Year Syllabus & Distribute ${detected.length} Split Courses`}
                    </button>
                  </div>
                </div>
              </section>
            )}
          </form>
        </div>
      ) : activeTab === 'templates' && editor ? (
        /* Templates Starter Section */
        <div className="syllabus-templates-view">
          <div className="syllabus-panel-top-title">
            <div>
              <span className="syllabus-step-pill">CURRICULUM BLUEPRINTS</span>
              <h3>Curriculum Starters & Structured Frameworks</h3>
              <p className="syllabus-panel-desc">
                Select a pre-built curriculum starter to launch the interactive portal syllabus builder. Customize semester schemes, exam marks, and unit outlines.
              </p>
            </div>
            <button
              type="button"
              className="syllabus-secondary-btn"
              onClick={() => setActiveTab('repository')}
            >
              Back to Repository
            </button>
          </div>

          <div className="syllabus-templates-grid">
            {syllabusTemplates.map(template => (
              <div key={template.id} className="syllabus-template-card">
                <span className="template-badge">{template.tag}</span>
                <h4>{template.name}</h4>
                <p>{template.description}</p>
                <button
                  type="button"
                  className="syllabus-primary-btn template-launch-btn"
                  onClick={() => {
                    const starter = template.create();
                    setEditing({ ...starter, department: form.department || starter.department });
                    setNotice('');
                    setError('');
                  }}
                >
                  <span>Use This Framework</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Default Repository Tab View */
        <div className="syllabus-repository-view">
          {/* Action starters row for Coordinator */}
          {editor && (
            <div className="syllabus-quick-actions-bar">
              <button
                type="button"
                className="quick-action-card"
                onClick={() => setActiveTab('upload_split')}
              >
                <div className="action-icon-wrap upload">
                  <Upload size={22} />
                </div>
                <div className="action-text">
                  <strong>Upload 4-Year B.Tech Syllabus PDF</strong>
                  <span>Autonomous PDF extraction & split by Course ID across 8 semesters</span>
                </div>
                <ChevronRight size={18} className="action-arrow" />
              </button>

              <button
                type="button"
                className="quick-action-card"
                onClick={() => setActiveTab('templates')}
              >
                <div className="action-icon-wrap template">
                  <FolderOpen size={22} />
                </div>
                <div className="action-text">
                  <strong>Create from Interactive Template</strong>
                  <span>Build structured multi-semester curriculum with unit-wise editor</span>
                </div>
                <ChevronRight size={18} className="action-arrow" />
              </button>
            </div>
          )}

          {/* Repository Header & Filters */}
          <div className="syllabus-repository-header">
            <div>
              <h3 className="repo-title">
                {editor ? 'College Syllabi Repository' : role === 'faculty' ? 'Your Assigned Course Syllabi' : 'Official Course Syllabi'}
              </h3>
              <p className="repo-subtitle">
                {visible.length} of {records.length} curriculum documents showing
              </p>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="syllabus-filter-toolbar">
            <div className="syllabus-search-box">
              <Search size={16} />
              <input
                type="search"
                placeholder="Search by title, course code, department, batch, or faculty..."
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              {query && (
                <button type="button" className="clear-search-btn" onClick={() => setQuery('')}>
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="syllabus-filter-selects">
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                <option value="all">All Document Types</option>
                <option value="4year">4-Year Complete Curriculums</option>
                <option value="split">Individual Subject Syllabi</option>
              </select>

              {repositoryDepartments.length > 1 && (
                <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
                  <option value="all">All Departments</option>
                  {repositoryDepartments.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              )}

              {editor && (
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                  <option value="all">All Status</option>
                  <option value="published">Published</option>
                  <option value="draft">Drafts</option>
                </select>
              )}
            </div>
          </div>

          {/* Documents Content */}
          {loading ? (
            <div className="syllabus-empty-state">
              <RefreshCw size={34} className="spin" />
              <p>Loading syllabus repository…</p>
            </div>
          ) : !records.length ? (
            <div className="syllabus-empty-state">
              <BookOpen size={42} />
              <h3>{editor ? 'No syllabus documents found' : 'No syllabus published yet'}</h3>
              <p>{editor ? 'Upload a 4-year B.Tech syllabus PDF or choose a template to create one.' : 'Published course syllabi will appear here once released by the academic coordinator.'}</p>
              {editor && (
                <button
                  type="button"
                  className="syllabus-primary-btn"
                  onClick={() => setActiveTab('upload_split')}
                >
                  <Upload size={16} /> Upload 4-Year Syllabus PDF
                </button>
              )}
            </div>
          ) : (
            <>
              {!visible.length && (
                <div className="syllabus-no-results">
                  <p>No documents match your active search filters.</p>
                  <button type="button" className="syllabus-secondary-btn" onClick={() => { setQuery(''); setTypeFilter('all'); setStatusFilter('all'); setDeptFilter('all'); }}>
                    Clear Filters
                  </button>
                </div>
              )}

              {/* Featured 4-Year B.Tech Autonomous Master Scheme Showcase */}
              {masterCurriculum && typeFilter !== 'split' && !query && repoSemFilter === 'all' && (
                <div className="syllabus-featured-master-card">
                  <div className="master-card-top-row">
                    <span className="master-badge-curriculum">
                      <GraduationCap size={15} /> 4-Year B.Tech Autonomous Scheme & Regulations
                    </span>
                    <span className={`syllabus-status-pill ${masterCurriculum.status}`}>
                      <CheckCircle2 size={12} /> {masterCurriculum.status === 'published' ? 'Published · Official' : 'Draft'}
                    </span>
                  </div>

                  <div className="master-card-content">
                    <div className="master-card-details">
                      <h3 className="master-card-title">{masterCurriculum.title}</h3>
                      <p className="master-card-desc">
                        {masterCurriculum.description || 'Autonomous Four-Year scheme of instruction, course structures, credit schemes, professional electives, and detailed syllabus for all eight semesters.'}
                      </p>

                      <div className="master-meta-tags">
                        <span className="repo-meta-badge dept">{masterCurriculum.department}</span>
                        <span className="repo-meta-badge batch">Admitted Batch: {masterCurriculum.batch}</span>
                        <span className="repo-meta-badge sections">
                          <Users size={12} /> {(masterCurriculum.academic_section_ids || []).length || 'All'} Class Sections Enrolled
                        </span>
                        {masterCurriculum.has_pdf && (
                          <span className="repo-meta-badge pdf-tag">
                            <FileText size={12} /> Official Scheme PDF
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="master-card-actions">
                      <button
                        type="button"
                        className="syllabus-primary-btn master-cta-btn"
                        onClick={() => setFullscreenSyllabus(masterCurriculum)}
                        title="Open interactive reader"
                      >
                        <Eye size={15} />
                        <span>Read Full Scheme</span>
                      </button>

                      {(masterCurriculum.has_pdf || masterCurriculum.file_name) && (
                        <button
                          type="button"
                          className="syllabus-secondary-btn master-download-btn"
                          disabled={downloadingId === masterCurriculum.id}
                          onClick={(e) => downloadSyllabusPdf(masterCurriculum, e)}
                          title="Download 4-Year Curriculum PDF"
                        >
                          {downloadingId === masterCurriculum.id ? (
                            <RefreshCw size={15} className="spin" />
                          ) : (
                            <Download size={15} />
                          )}
                          <span>Download PDF</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Course Syllabi Section Header with Semester Chips */}
              {typeFilter !== '4year' && (
                <div className="syllabus-section-divider">
                  <div className="divider-title-group">
                    <BookMarked size={16} />
                    <h4>Course Syllabi & Allocations ({courseSyllabiCount})</h4>
                  </div>

                  <div className="repo-sem-filter-chips">
                    {[
                      { id: 'all', label: 'All Semesters' },
                      { id: '1', label: 'Sem 1 (I-I)' },
                      { id: '2', label: 'Sem 2 (I-II)' },
                      { id: '3', label: 'Sem 3 (II-I)' },
                      { id: '4', label: 'Sem 4 (II-II)' },
                      { id: '5', label: 'Sem 5 (III-I)' },
                      { id: '6', label: 'Sem 6 (III-II)' },
                      { id: '7', label: 'Sem 7 (IV-I)' },
                      { id: '8', label: 'Sem 8 (IV-II)' }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        type="button"
                        className={`repo-sem-chip ${repoSemFilter === tab.id ? 'active' : ''}`}
                        onClick={() => setRepoSemFilter(tab.id)}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="syllabus-cards-grid">
                {visible.map(row => {
                  const is4Year = !row.subject_id;
                  const sectionsCount = (row.academic_section_ids || []).length;
                  const semName = row.structure?.semesters?.[0]?.name || row.structure?.semester || '';
                  const category = row.structure?.category || '';
                  const credits = row.structure?.credits || row.structure?.semesters?.[0]?.courses?.[0]?.credits || '';

                  return (
                    <div key={row.id} className="syllabus-repo-card">
                      <div className="repo-card-top">
                        <div className="repo-card-top-left">
                          {row.subject_code && (
                            <span className="repo-course-code-badge">{row.subject_code}</span>
                          )}
                          <span className={`syllabus-status-pill ${row.status}`}>
                            <CheckCircle2 size={11} /> {row.status === 'published' ? 'Published' : 'Draft'}
                          </span>
                        </div>
                        <span className={`syllabus-type-pill ${is4Year ? 'curriculum' : 'course'}`}>
                          {is4Year ? '4-Year Scheme' : 'Course Syllabus'}
                        </span>
                      </div>

                      <div className="repo-card-main">
                        <strong className="repo-card-title">
                          {row.title}
                        </strong>

                        <div className="repo-card-meta-tags">
                          <span className="repo-meta-badge dept">{row.department}</span>
                          <span className="repo-meta-badge batch">Batch: {row.batch}</span>
                          {semName && (
                            <span className="repo-meta-badge sem">
                              <Calendar size={11} /> {semName.replace(/semester/i, 'Sem')}
                            </span>
                          )}
                          {category && (
                            <span className="repo-meta-badge category">{category}</span>
                          )}
                          {credits && (
                            <span className="repo-meta-badge credits">{credits} Credits</span>
                          )}
                          {sectionsCount > 0 && (
                            <span className="repo-meta-badge sections">
                              <Users size={12} /> {sectionsCount} {sectionsCount === 1 ? 'Class' : 'Classes'}
                            </span>
                          )}
                        </div>

                        {row.assigned_faculty_name && (
                          <div className="repo-faculty-box">
                            <Users size={13} />
                            <span>Faculty: <strong>{row.assigned_faculty_name}</strong></span>
                          </div>
                        )}
                      </div>

                      <div className="repo-card-footer">
                        <span className="repo-date-text">
                          {row.published_at ? `Published ${new Date(row.published_at).toLocaleDateString('en-IN')}` : 'Draft'}
                        </span>

                        <div className="repo-card-buttons">
                          <button
                            type="button"
                            className="syllabus-preview-cta-btn"
                            onClick={() => setFullscreenSyllabus(row)}
                            title="Open full screen preview and reader"
                          >
                            <Eye size={13} /> View
                          </button>

                          {(row.has_pdf || row.file_name) && (
                            <button
                              type="button"
                              className="syllabus-download-cta-btn"
                              disabled={downloadingId === row.id}
                              onClick={(e) => downloadSyllabusPdf(row, e)}
                              title="Download PDF"
                            >
                              {downloadingId === row.id ? (
                                <RefreshCw size={13} className="spin" />
                              ) : (
                                <Download size={13} />
                              )}
                              <span>PDF</span>
                            </button>
                          )}

                          {editor && row.status === 'draft' && (
                            <button
                              type="button"
                              className="syllabus-publish-chip-btn"
                              disabled={busy}
                              onClick={() => publishRecord(row)}
                              title="Publish draft"
                            >
                              <CheckCircle2 size={13} /> Publish
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Inspect / Edit Subject Modal */}
      {inspectingSubject && (
        <div className="syllabus-modal-backdrop">
          <section role="dialog" aria-modal="true" className="syllabus-template-modal syllabus-inspect-modal">
            <div className="syllabus-heading">
              <div>
                <p className="eyebrow">COURSE SYLLABUS INSPECTION & EDITING</p>
                <h2>{inspectingSubject.course_code} — {inspectingSubject.course_name}</h2>
                <p className="muted">{inspectingSubject.semester} · {inspectingSubject.credits || '3'} Credits</p>
              </div>
              <button type="button" className="syllabus-icon-button" onClick={() => setInspectingSubject(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="syllabus-inspect-body">
              <label>
                Course Objectives
                <textarea
                  rows={4}
                  value={inspectingSubject.objectives || ''}
                  onChange={e => {
                    const val = e.target.value;
                    setInspectingSubject(curr => ({ ...curr, objectives: val }));
                    setDetected(rows => rows.map((r, i) => i === inspectingSubject._idx ? { ...r, objectives: val } : r));
                  }}
                  placeholder="Course learning objectives..."
                />
              </label>

              <label>
                Course Outcomes (COs)
                <textarea
                  rows={4}
                  value={inspectingSubject.course_outcomes || ''}
                  onChange={e => {
                    const val = e.target.value;
                    setInspectingSubject(curr => ({ ...curr, course_outcomes: val }));
                    setDetected(rows => rows.map((r, i) => i === inspectingSubject._idx ? { ...r, course_outcomes: val } : r));
                  }}
                  placeholder="Upon completion of this course, students will be able to..."
                />
              </label>

              {['unit_1', 'unit_2', 'unit_3', 'unit_4', 'unit_5'].map((uKey, uIdx) => (
                <label key={uKey}>
                  UNIT {['I', 'II', 'III', 'IV', 'V'][uIdx]} Topics & Syllabus
                  <textarea
                    rows={4}
                    value={inspectingSubject[uKey] || ''}
                    onChange={e => {
                      const val = e.target.value;
                      setInspectingSubject(curr => ({ ...curr, [uKey]: val }));
                      setDetected(rows => rows.map((r, i) => i === inspectingSubject._idx ? { ...r, [uKey]: val } : r));
                    }}
                    placeholder={`Topics covered in Unit ${['I', 'II', 'III', 'IV', 'V'][uIdx]}...`}
                  />
                </label>
              ))}

              <label>
                Textbooks
                <textarea
                  rows={3}
                  value={inspectingSubject.textbooks || ''}
                  onChange={e => {
                    const val = e.target.value;
                    setInspectingSubject(curr => ({ ...curr, textbooks: val }));
                    setDetected(rows => rows.map((r, i) => i === inspectingSubject._idx ? { ...r, textbooks: val } : r));
                  }}
                  placeholder="Primary prescribed textbooks..."
                />
              </label>

              <label>
                Reference Books & Web Resources
                <textarea
                  rows={3}
                  value={inspectingSubject.reference_books || ''}
                  onChange={e => {
                    const val = e.target.value;
                    setInspectingSubject(curr => ({ ...curr, reference_books: val }));
                    setDetected(rows => rows.map((r, i) => i === inspectingSubject._idx ? { ...r, reference_books: val } : r));
                  }}
                  placeholder="Reference material and online links..."
                />
              </label>
            </div>

            <div className="syllabus-inspect-footer">
              <button type="button" className="syllabus-primary-btn" onClick={() => setInspectingSubject(null)}>
                <Check size={16} /> Done Editing Course
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Extraction Diagnostics & Debug Inspector Modal */}
      {debugSubject && (
        <div className="syllabus-modal-backdrop">
          <section role="dialog" aria-modal="true" className="syllabus-template-modal syllabus-debug-modal">
            <div className="syllabus-heading">
              <div>
                <p className="eyebrow">STAGE 1 & STAGE 2 EXTRACTION DIAGNOSTICS</p>
                <h2>{debugSubject.course_code} — {debugSubject.course_name}</h2>
                <p className="muted">Detailed Boundary & Document Understanding Inspector</p>
              </div>
              <button type="button" className="syllabus-icon-button" onClick={() => setDebugSubject(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="syllabus-debug-body">
              <div className="syllabus-debug-stats-grid">
                <div className="debug-stat-card">
                  <span className="stat-label">Document Source</span>
                  <strong>{debugSubject.source_type || 'MAIN_CURRICULUM'}</strong>
                </div>
                <div className="debug-stat-card">
                  <span className="stat-label">Structure Table Page</span>
                  <strong>{debugSubject.structure_page ? `Page ${debugSubject.structure_page}` : 'N/A (Elective Scheme)'}</strong>
                </div>
                <div className="debug-stat-card">
                  <span className="stat-label">Detailed Syllabus Pages</span>
                  <strong>Pages {debugSubject.page_start} – {debugSubject.page_end} ({debugSubject.page_count || 1}p)</strong>
                </div>
                <div className="debug-stat-card">
                  <span className="stat-label">Sliced PDF Status</span>
                  <strong className={debugSubject.pdf_base64 ? 'text-green' : 'text-orange'}>
                    {debugSubject.pdf_base64 ? `Attached (${Math.round((debugSubject.pdf_base64.length * 0.75) / 1024)} KB)` : 'Not attached'}
                  </strong>
                </div>
                <div className="debug-stat-card">
                  <span className="stat-label">Category & L-T-P-C</span>
                  <strong>{debugSubject.category || 'PC'} · {debugSubject.ltpc || `${debugSubject.l || 3}-0-${debugSubject.p || 0}-${debugSubject.credits || 3}`}</strong>
                </div>
                <div className="debug-stat-card">
                  <span className="stat-label">Validation Status</span>
                  <strong className={debugSubject.validation?.isValid !== false ? 'text-green' : 'text-red'}>
                    {debugSubject.validation?.isValid !== false ? '✅ Passed Integrity Checks' : `⚠️ ${debugSubject.validation?.errors?.join(', ')}`}
                  </strong>
                </div>
              </div>

              {/* Units & Outcomes breakdown */}
              <div className="syllabus-debug-section">
                <h4><Layers size={15} /> Extracted Units Breakdown ({debugSubject.units_list?.length || 0} Units)</h4>
                <div className="debug-units-list">
                  {(debugSubject.units_list || []).map((u, uIdx) => (
                    <div key={uIdx} className="debug-unit-row">
                      <div className="debug-unit-header">
                        <strong>{u.unit || `UNIT-${uIdx + 1}`}</strong>
                        <span>{u.lectures || '09 Lectures'}</span>
                      </div>
                      <p className="debug-unit-text">{u.content ? u.content.slice(0, 240) + (u.content.length > 240 ? '…' : '') : 'No content extracted'}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Course Outcomes */}
              <div className="syllabus-debug-section">
                <h4><CheckCircle2 size={15} /> Extracted Course Outcomes ({debugSubject.co_list?.length || 0} COs)</h4>
                <div className="debug-co-list">
                  {(debugSubject.co_list || []).map((co, coIdx) => (
                    <div key={coIdx} className="debug-co-row">
                      <span className="debug-co-code">{co.code}</span>
                      <span className="debug-co-text">{co.text}</span>
                    </div>
                  ))}
                  {(!debugSubject.co_list || !debugSubject.co_list.length) && (
                    <p className="muted">No individual CO markers found; outcomes may be in free text format.</p>
                  )}
                </div>
              </div>

              {/* Raw JSON Structure */}
              <div className="syllabus-debug-section">
                <h4><FileText size={15} /> Raw Extracted Course JSON Payload</h4>
                <pre className="syllabus-debug-json">
                  {JSON.stringify({
                    course_code: debugSubject.course_code,
                    course_name: debugSubject.course_name,
                    category: debugSubject.category,
                    year: debugSubject.year,
                    semester: debugSubject.semester,
                    credits: debugSubject.credits,
                    l: debugSubject.l,
                    p: debugSubject.p,
                    internal: debugSubject.internal,
                    external: debugSubject.external,
                    structure_page: debugSubject.structure_page,
                    page_start: debugSubject.page_start,
                    page_end: debugSubject.page_end,
                    co_list: debugSubject.co_list,
                    units_list: debugSubject.units_list,
                    text_books_list: debugSubject.text_books_list,
                    reference_books_list: debugSubject.reference_books_list,
                    web_references_list: debugSubject.web_references_list,
                    validation: debugSubject.validation
                  }, null, 2)}
                </pre>
              </div>
            </div>

            <div className="syllabus-inspect-footer">
              <button type="button" className="syllabus-primary-btn" onClick={() => setDebugSubject(null)}>
                <Check size={16} /> Close Diagnostics
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Fullscreen Syllabus Preview Modal */}
      {fullscreenSyllabus && (
        <SyllabusFullscreenViewer
          syllabus={fullscreenSyllabus}
          onClose={() => setFullscreenSyllabus(null)}
          editor={editor}
          busy={busy}
          onPublish={publishRecord}
          onDownload={downloadSyllabusPdf}
          onEdit={(rec) => {
            setFullscreenSyllabus(null);
            setSectionIds(rec.academic_section_ids || []);
            setEditing({ ...rec, id: rec.status === 'draft' ? rec.id : undefined });
          }}
        />
      )}
    </div>
  );
}
