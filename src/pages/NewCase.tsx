/**
 * NewCase — doctor-submitted new case (patient name/age/sex + optional note +
 * photos/scans). Unlike the read-only rest of the portal, submitting AUTO-CREATES
 * the real clinical records via the service-role cases function (createCase),
 * then uploads the staged files onto the returned aligner set. The clinic is
 * notified through the staff "Portal activity" bell (the function drops a
 * 'CaseSubmitted' flag server-side).
 *
 * Guarded like CaseDetail: requireDoctor, and any resolved non-doctor state
 * bounces to the Dashboard (which owns the full auth-error UI).
 */

import React, { useState, useEffect, useCallback, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createCase, uploadPhoto, clearDashboardCache } from '../lib/api';
import { useAuthenticatedDoctor } from '../hooks/useAuthenticatedDoctor';
import { useToast } from '../contexts/ToastContext';
import PortalHeader from '../components/shared/PortalHeader';

const MAX_FILE_BYTES = 100 * 1024 * 1024; // mirrors the Edge Function / bucket limit
const NAME_MIN = 2;
const NAME_MAX = 80;
const AGE_MIN = 1;
const AGE_MAX = 120;
const NOTE_MAX = 2000;

type FileCategory = 'photos' | 'files';

interface StagedFile {
  key: string;
  file: File;
  category: FileCategory;
}

interface FieldErrors {
  patientName?: string;
  age?: string;
  sex?: string;
  note?: string;
}

/** image/* → photos; zip/stl/ply → files; anything else is rejected. */
function categorize(file: File): FileCategory | null {
  if (file.type.startsWith('image/')) return 'photos';
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (['zip', 'stl', 'ply'].includes(ext || '')) return 'files';
  return null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const NewCase: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();

  const { loading: authLoading, doctor } = useAuthenticatedDoctor({ requireDoctor: true });

  const [patientName, setPatientName] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<'' | 'Male' | 'Female'>('');
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  // -1 marks a failed file; 0..100 is byte progress. Keyed by StagedFile.key.
  const [fileProgress, setFileProgress] = useState<Record<string, number>>({});

  // Bounce any resolved non-doctor state to the Dashboard (mirrors CaseDetail).
  useEffect(() => {
    if (authLoading) return;
    if (!doctor?.dr_id) navigate('/');
  }, [authLoading, doctor?.dr_id, navigate]);

  const handleFilesSelected = useCallback(
    (e: ChangeEvent<HTMLInputElement>): void => {
      const picked = Array.from(e.target.files ?? []);
      e.target.value = ''; // allow re-picking the same file

      const accepted: StagedFile[] = [];
      for (const file of picked) {
        const category = categorize(file);
        if (!category) {
          toast.warning(`"${file.name}" isn't a supported photo or scan (JPEG/PNG/HEIC or ZIP/STL/PLY)`);
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          toast.warning(`"${file.name}" is larger than 100MB`);
          continue;
        }
        accepted.push({ key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`, file, category });
      }
      if (accepted.length) setFiles((prev) => [...prev, ...accepted]);
    },
    [toast]
  );

  const removeFile = useCallback((key: string): void => {
    setFiles((prev) => prev.filter((f) => f.key !== key));
  }, []);

  const validate = useCallback((): FieldErrors => {
    const next: FieldErrors = {};
    const name = patientName.trim();
    if (name.length < NAME_MIN || name.length > NAME_MAX) {
      next.patientName = `Enter the patient's name (${NAME_MIN}–${NAME_MAX} characters).`;
    }
    const ageNum = Number(age);
    if (!age.trim() || !Number.isInteger(ageNum) || ageNum < AGE_MIN || ageNum > AGE_MAX) {
      next.age = `Enter an age between ${AGE_MIN} and ${AGE_MAX}.`;
    }
    if (sex !== 'Male' && sex !== 'Female') {
      next.sex = 'Select a sex.';
    }
    if (note.trim().length > NOTE_MAX) {
      next.note = `Note is too long (max ${NOTE_MAX} characters).`;
    }
    return next;
  }, [patientName, age, sex, note]);

  const handleSubmit = useCallback(async (): Promise<void> => {
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      const result = await createCase({
        patientName: patientName.trim(),
        age: Number(age),
        sex: sex as 'Male' | 'Female',
        note: note.trim() || undefined,
      });

      // The new case must show on the dashboard immediately on return.
      clearDashboardCache();

      // Upload staged files sequentially (per-file progress bars). Failures after
      // creation don't roll the case back — SetPhotoUpload offers retry on the
      // case page.
      let failed = 0;
      for (const staged of files) {
        try {
          await uploadPhoto(result.aligner_set_id, staged.file, staged.category, (fraction) => {
            setFileProgress((prev) => ({ ...prev, [staged.key]: Math.round(fraction * 100) }));
          });
          setFileProgress((prev) => ({ ...prev, [staged.key]: 100 }));
        } catch {
          failed += 1;
          setFileProgress((prev) => ({ ...prev, [staged.key]: -1 }));
        }
      }

      if (failed > 0) {
        toast.warning(`Case created, but ${failed} file${failed > 1 ? 's' : ''} failed to upload — retry from the case page.`);
      } else {
        toast.success('Case submitted');
      }
      navigate(`/case/${result.work_id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not submit the case. Please try again.';
      toast.error(message);
      setSubmitting(false); // stay on the form so the doctor can fix/retry
    }
  }, [validate, patientName, age, sex, note, files, navigate, toast]);

  if (authLoading) {
    return (
      <div className="portal-container">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading portal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="portal-container">
      <PortalHeader doctor={doctor} />

      <main className="portal-main">
        <div className="case-detail-container">
          <button className="back-button" onClick={() => navigate('/')} disabled={submitting}>
            <i className="fas fa-arrow-left"></i>
            Back to Cases
          </button>

          <div className="new-case-card">
            <div className="new-case-heading">
              <h2>New Case</h2>
              <p>Submit a new patient for aligner treatment. The lab is notified automatically.</p>
            </div>

            {/* Patient name */}
            <div className="new-case-field">
              <label className="new-case-label" htmlFor="nc-name">
                Patient name <span className="new-case-required">*</span>
              </label>
              <input
                id="nc-name"
                type="text"
                className={`new-case-input ${errors.patientName ? 'invalid' : ''}`}
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="Full name"
                maxLength={NAME_MAX}
                disabled={submitting}
                autoFocus
              />
              {errors.patientName && <div className="new-case-error">{errors.patientName}</div>}
            </div>

            {/* Age + Sex */}
            <div className="new-case-row">
              <div className="new-case-field">
                <label className="new-case-label" htmlFor="nc-age">
                  Age <span className="new-case-required">*</span>
                </label>
                <input
                  id="nc-age"
                  type="number"
                  min={AGE_MIN}
                  max={AGE_MAX}
                  className={`new-case-input ${errors.age ? 'invalid' : ''}`}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="Years"
                  disabled={submitting}
                />
                {errors.age && <div className="new-case-error">{errors.age}</div>}
              </div>

              <div className="new-case-field">
                <label className="new-case-label">
                  Sex <span className="new-case-required">*</span>
                </label>
                <div className="new-case-pills">
                  {(['Male', 'Female'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`new-case-pill ${sex === option ? 'selected' : ''}`}
                      onClick={() => setSex(option)}
                      disabled={submitting}
                    >
                      <i className={option === 'Male' ? 'fas fa-mars' : 'fas fa-venus'}></i>
                      {option}
                    </button>
                  ))}
                </div>
                {errors.sex && <div className="new-case-error">{errors.sex}</div>}
              </div>
            </div>

            {/* Note */}
            <div className="new-case-field">
              <label className="new-case-label" htmlFor="nc-note">
                Note to the lab <span className="new-case-optional">(optional)</span>
              </label>
              <textarea
                id="nc-note"
                className={`new-case-textarea ${errors.note ? 'invalid' : ''}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anything the lab should know about this case..."
                maxLength={NOTE_MAX}
                disabled={submitting}
              />
              {errors.note && <div className="new-case-error">{errors.note}</div>}
            </div>

            {/* Files */}
            <div className="new-case-field">
              <label className="new-case-label">
                Photos &amp; scans <span className="new-case-optional">(optional)</span>
              </label>
              <label className={`new-case-dropzone ${submitting ? 'disabled' : ''}`}>
                <input
                  type="file"
                  multiple
                  accept="image/*,.zip,.stl,.ply"
                  onChange={handleFilesSelected}
                  disabled={submitting}
                />
                <i className="fas fa-cloud-arrow-up"></i>
                <span>Add photos or 3D scans (JPEG, PNG, HEIC · ZIP, STL, PLY)</span>
              </label>

              {files.length > 0 && (
                <div className="new-case-files">
                  {files.map((staged) => {
                    const progress = fileProgress[staged.key];
                    const isError = progress === -1;
                    const isDone = progress === 100;
                    return (
                      <div key={staged.key} className="new-case-file-row">
                        <i className={`new-case-file-icon fas ${staged.category === 'photos' ? 'fa-image' : 'fa-cube'}`}></i>
                        <div className="new-case-file-main">
                          <div className="new-case-file-name">{staged.file.name}</div>
                          <div className="new-case-file-meta">
                            {formatBytes(staged.file.size)}
                            {isError && <span className="new-case-file-failed"> · upload failed</span>}
                            {isDone && <span className="new-case-file-done"> · uploaded</span>}
                          </div>
                          {submitting && typeof progress === 'number' && progress >= 0 && (
                            <div className="new-case-file-progress">
                              <div className="new-case-file-progress-bar" style={{ width: `${progress}%` }}></div>
                            </div>
                          )}
                        </div>
                        {!submitting && (
                          <button
                            type="button"
                            className="new-case-file-remove"
                            onClick={() => removeFile(staged.key)}
                            aria-label={`Remove ${staged.file.name}`}
                          >
                            <i className="fas fa-xmark"></i>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="new-case-actions">
              <button className="btn-cancel" onClick={() => navigate('/')} disabled={submitting}>
                Cancel
              </button>
              <button className="btn-submit" onClick={handleSubmit} disabled={submitting}>
                {submitting ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i>
                    Submitting...
                  </>
                ) : (
                  <>
                    <i className="fas fa-paper-plane"></i>
                    Submit Case
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default NewCase;
