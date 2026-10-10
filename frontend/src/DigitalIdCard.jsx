import React, { useState, useEffect, useRef } from 'react';
import {
  Printer, RotateCcw, Sparkles, User, Upload, ShieldCheck, Layers, Shield
} from 'lucide-react';
import { api } from './api.js';
import './digital-id.css';
import collegeLogoUrl from '../assets/gvpcew-official-logo.png';
import principalSignatureUrl from '../assets/principal-signature.png';

export function DigitalIdCard({ student }) {
  const [profile, setProfile] = useState(student?.profile || null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setError('');
    api.get('/students/profile').then(({ data }) => {
      if (alive) {
        setProfile(data.profile);
        if (!data.profile?.roll_number) setError('Ask the college office to link your student record.');
      }
    }).catch(() => {
      if (alive) setError('Could not refresh your student record. Please retry.');
    });
    return () => { alive = false; };
  }, [attempt]);

  return (
    <div>
      {error && (
        <p className="error" role="alert">
          {error} <button onClick={() => setAttempt(x => x + 1)}>Retry</button>
        </p>
      )}
      {profile?.roll_number ? (
        <IdCardEditor key={profile.roll_number} student={{ profile }} />
      ) : (
        !error && <p role="status">Loading your digital ID card…</p>
      )}
    </div>
  );
}

function Barcode({ value }) {
  const str = String(value || '324103210170');
  const chars = str.split('');
  const bars = [];
  let x = 0;

  // Start pattern
  bars.push({ x, w: 2.2 }); x += 3.5;
  bars.push({ x, w: 1.2 }); x += 2.4;
  bars.push({ x, w: 2.8 }); x += 4.5;

  chars.forEach((c) => {
    const code = c.charCodeAt(0);
    const w1 = ((code % 3) + 1) * 1.1;
    const g1 = (((code * 3) % 3) + 1) * 1.1;
    const w2 = (((code * 7) % 3) + 1) * 1.1;
    const g2 = (((code * 2) % 2) + 1) * 1.1;

    bars.push({ x, w: w1 }); x += w1 + g1;
    bars.push({ x, w: w2 }); x += w2 + g2;
  });

  // Stop pattern
  bars.push({ x, w: 2.8 }); x += 4.5;
  bars.push({ x, w: 1.2 }); x += 2.4;
  bars.push({ x, w: 2.2 }); x += 2.2;

  const totalWidth = x;

  return (
    <div className="id-barcode-box">
      <svg
        viewBox={`0 0 ${totalWidth} 26`}
        className="id-barcode-svg"
        preserveAspectRatio="none"
      >
        {bars.map((b, i) => (
          <rect key={i} x={b.x} y="0" width={b.w} height="26" fill="#111827" />
        ))}
      </svg>
      <span className="id-barcode-text">*{str}*</span>
    </div>
  );
}

function IdCardEditor({ student }) {
  const STORAGE_KEY = 'gvpcew_digital_id_v3:' + student.profile.roll_number;
  const fileInputRef = useRef(null);

  const p = student.profile;
  const info = p.id_details || {};
  const defaultDetails = {
    name: p.full_name || 'PONNAGANTI SRAVANI',
    course: info.course || 'B.Tech',
    branch: p.department || 'Computer Science Engineering',
    branchCode: info.department_code || 'CSE',
    batch: info.batch || '2024–2028',
    section: p.section || 'A',
    rollNo: p.roll_number || '324103210170',
    dob: info.dob || '',
    bloodGroup: info.bloodGroup || 'B+',
    validTill: info.validTill || 'May 2028',
    fatherName: info.fatherName || '',
    emergencyContact: info.emergencyContact || '',
    address: 'Madhurawada, Visakhapatnam - 530048',
    collegeContact: '0891-2739144, 2526639',
    photo: p.photo_url || ''
  };

  const [photoDetails, setDetails] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return { ...defaultDetails, photo: JSON.parse(saved)?.photo || defaultDetails.photo };
      const legacy = JSON.parse(localStorage.getItem('gvpcew_digital_id_v2') || 'null');
      if (legacy?.rollNo === p.roll_number) return { ...defaultDetails, photo: legacy.photo || defaultDetails.photo };
    } catch {}
    return defaultDetails;
  });

  const details = { ...defaultDetails, photo: photoDetails.photo };
  const [showBack, setShowBack] = useState(false);
  const [notice, setNotice] = useState('');

  // Persist photo to local storage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ photo: details.photo }));
    } catch {
      setNotice('Browser storage is full or unavailable.');
    }
  }, [details.photo]);

  const showNotice = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(prev => (prev === msg ? '' : prev)), 3500);
  };

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        showNotice('Choose a JPEG, PNG, or WebP photo.');
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        showNotice('Please choose an image under 2MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setDetails(prev => ({ ...prev, photo: reader.result }));
        showNotice('Photograph updated successfully!');
      };
      reader.onerror = () => showNotice('Could not read this photo. Please try again.');
      reader.readAsDataURL(file);
    }
  };

  const handleReset = () => {
    setDetails(defaultDetails);
    showNotice('Photo reset to default.');
  };

  // Convert numeric section to letter if needed (1 -> A, 2 -> B, 3 -> C, 4 -> D)
  const rawSec = String(details.section || 'A').trim().toUpperCase();
  const sectionLetter = rawSec === '1' ? 'A' : rawSec === '2' ? 'B' : rawSec === '3' ? 'C' : rawSec === '4' ? 'D' : rawSec;

  const branchLabel = (details.branchCode || (details.branch?.toLowerCase().includes('comm') ? 'ECE' : 'CSE')).toUpperCase();

  return (
    <div className="digital-id-container">
      <p className="id-help no-print">
        Official digital identification card issued by Gayatri Vidya Parishad College of Engineering for Women.
      </p>

      {/* Hidden file input for photo upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handlePhotoUpload}
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
      />

      {/* Action Toolbar */}
      <div className="id-card-toolbar no-print">
        <div className="id-toolbar-left">
          <button
            type="button"
            className="id-tool-btn upload-photo-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Upload student photograph"
          >
            <Upload className="w-4 h-4 text-emerald-600" />
            <span>Upload Photo</span>
          </button>

          <button
            type="button"
            className="id-tool-btn"
            style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e40af' }}
            onClick={() => setShowBack(prev => !prev)}
          >
            <Layers className="w-4 h-4" />
            <span>{showBack ? 'View Front Side' : 'View Back Side'}</span>
          </button>
        </div>

        <div className="id-toolbar-right">
          <button
            type="button"
            className="id-tool-btn print-card-btn"
            onClick={() => window.print()}
            title="Print Official ID Badge"
          >
            <Printer className="w-4 h-4" />
            <span>Print ID Card</span>
          </button>

          <button
            type="button"
            className="calendar-btn-subtle"
            onClick={handleReset}
            title="Reset photo"
            aria-label="Reset photo"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Notice Toast */}
      {notice && (
        <div className="calendar-notice-banner no-print" role="status">
          <Sparkles className="w-4 h-4 text-emerald-600" />
          <span>{notice}</span>
        </div>
      )}

      {/* ID Card Stage */}
      <div className="id-card-stage id-preview">
        {!showBack ? (
          /* FRONT SIDE - EXACT REPLICA OF THE OFFICIAL GVPCEW DIGITAL ID CARD */
          <article className="official-gvpcew-id-card" aria-label="Official Student Digital ID Card">
            
            {/* Top Institutional Header */}
            <header className="official-gvpcew-header">
              <div className="official-gvpcew-emblem-wrap">
                <img src={collegeLogoUrl} alt="Gayatri Vidya Parishad Emblem" className="official-gvpcew-emblem" />
              </div>
              <div className="official-gvpcew-titles">
                <h1 className="official-gvpcew-inst-name">GAYATRI VIDYA PARISHAD</h1>
                <h2 className="official-gvpcew-college-name">COLLEGE OF ENGINEERING FOR WOMEN</h2>
                <p className="official-gvpcew-affiliation">(Autonomous • Affiliated to Andhra University, Visakhapatnam)</p>
                <p className="official-gvpcew-accreditation">Approved by AICTE, New Delhi • Accredited by NBA &amp; NAAC</p>
              </div>
            </header>

            {/* Main Card Body */}
            <div className="official-gvpcew-body">
              {/* Left Column: Student Photograph */}
              <div className="official-gvpcew-photo-col">
                <button
                  type="button"
                  className="official-gvpcew-photo-btn"
                  onClick={() => fileInputRef.current?.click()}
                  title="Click to change photo"
                  aria-label="Student Photograph"
                >
                  {details.photo ? (
                    <img src={details.photo} alt="Student Photograph" className="official-gvpcew-student-img" />
                  ) : (
                    <div className="official-gvpcew-photo-placeholder">
                      <User className="w-10 h-10 text-slate-400" />
                      <span>Upload Photo</span>
                    </div>
                  )}
                  <span className="official-gvpcew-photo-overlay no-print">Change Photo</span>
                </button>
              </div>

              {/* Right Column: Student Details & Signatures */}
              <div className="official-gvpcew-info-col">
                <div className="official-gvpcew-details-grid">
                  <div className="official-gvpcew-row">
                    <span className="official-gvpcew-field-label">Name</span>
                    <span className="official-gvpcew-colon">:</span>
                    <span className="official-gvpcew-field-value student-name-value">{details.name}</span>
                  </div>

                  <div className="official-gvpcew-row">
                    <span className="official-gvpcew-field-label">Course</span>
                    <span className="official-gvpcew-colon">:</span>
                    <span className="official-gvpcew-field-value">{details.course}</span>
                  </div>

                  <div className="official-gvpcew-row">
                    <span className="official-gvpcew-field-label">Batch</span>
                    <span className="official-gvpcew-colon">:</span>
                    <span className="official-gvpcew-field-value">{details.batch}</span>
                  </div>

                  <div className="official-gvpcew-row">
                    <span className="official-gvpcew-field-label">Section</span>
                    <span className="official-gvpcew-colon">:</span>
                    <span className="official-gvpcew-field-value section-badge-wrap">
                      {sectionLetter}
                      <Shield className="official-gvpcew-shield-watermark" aria-hidden="true" />
                    </span>
                  </div>

                  <div className="official-gvpcew-row roll-no-row">
                    <span className="official-gvpcew-field-label">Roll No</span>
                    <span className="official-gvpcew-colon">:</span>
                    <span className="official-gvpcew-field-value student-roll-value">{details.rollNo}</span>
                  </div>
                </div>

                {/* Bottom Barcode & Signature Row */}
                <div className="official-gvpcew-bottom-row">
                  <div className="official-gvpcew-barcode-wrap">
                    <Barcode value={details.rollNo} />
                  </div>

                  <div className="official-gvpcew-signature-wrap">
                    <img
                      src={principalSignatureUrl}
                      alt="Principal Signature"
                      className="official-gvpcew-signature-img"
                    />
                    <span className="official-gvpcew-principal-label">PRINCIPAL</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Institutional Footer */}
            <footer className="official-gvpcew-footer">
              <div className="official-gvpcew-footer-branch">
                {branchLabel}
              </div>
              <div className="official-gvpcew-footer-center">
                <p className="official-gvpcew-footer-address">Madhurawada, Visakhapatnam – 530048</p>
                <p className="official-gvpcew-footer-contact">Contact : {details.collegeContact}</p>
              </div>
              <div className="official-gvpcew-footer-inst-code">
                GVPW
              </div>
            </footer>

          </article>
        ) : (
          /* BACK SIDE */
          <article className="official-gvpcew-id-card back" aria-label="Student ID Card Terms & Details">
            <header className="official-gvpcew-header back-header">
              <div className="official-gvpcew-back-header-row">
                <span className="official-gvpcew-back-title">GVPCEW STUDENT ID CARD (TERMS &amp; DETAILS)</span>
                <span className="official-gvpcew-back-pin">PIN: 530048</span>
              </div>
            </header>

            <div className="official-gvpcew-body back-body">
              <div className="official-gvpcew-back-grid">
                <div><strong>Date of Birth:</strong> {details.dob || '—'}</div>
                <div><strong>Blood Group:</strong> <span className="blood-group-badge">{details.bloodGroup || '—'}</span></div>
                <div><strong>Father / Guardian:</strong> {details.fatherName || '—'}</div>
                <div><strong>Emergency Contact:</strong> {details.emergencyContact || details.collegeContact}</div>
                <div className="span-full"><strong>Valid Upto:</strong> {details.validTill || 'May 2028'} (Subject to Institution Norms)</div>
              </div>

              <div className="official-gvpcew-instructions-box">
                <strong>INSTRUCTIONS:</strong>
                <ol>
                  <li>This card is non-transferable and must be carried on campus at all times.</li>
                  <li>Loss of card must be reported immediately to the Academic Office.</li>
                  <li>Mandatory for Library access, Laboratory work, and University Examinations.</li>
                </ol>
              </div>

              <div className="official-gvpcew-back-footer-row">
                <span>Web: <strong>www.gvpcew.ac.in</strong></span>
                <span className="shield-verified"><ShieldCheck className="w-3.5 h-3.5" /> Official Digital Identity</span>
              </div>
            </div>

            <footer className="official-gvpcew-footer">
              <div className="official-gvpcew-footer-branch">GVPCEW</div>
              <div className="official-gvpcew-footer-center">
                <p className="official-gvpcew-footer-address">Kommadi, Madhurawada, Visakhapatnam – 530048</p>
              </div>
              <div className="official-gvpcew-footer-inst-code">AUTONOMOUS</div>
            </footer>
          </article>
        )}
      </div>
    </div>
  );
}
