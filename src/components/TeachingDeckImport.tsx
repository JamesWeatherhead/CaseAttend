import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Download, FileSpreadsheet, Images, Upload } from 'lucide-react';
import type { CasePackageV1 } from '../core/casePackage';
import type { LessonPlanV1 } from '../core/lessonPlan';
import type { PortableCasePackageV1 } from '../core/portableCasePackage';
import type { DomainKey } from '../lib/domains';
import { extractPowerPointTeachingDeck, type PowerPointTeachingDeck } from '../services/pptxTeachingDeck';
import { importLessonObjectives, type LessonObjectiveImportRow } from '../services/lessonObjectivesImport';
import { assembleTeachingDeckLesson, teachingDeckImageCandidates, teachingLevelLabel, validateTeachingObjectiveSelection, type TeachingDeckImageCandidate } from '../services/teachingDeckAssembly';
import { exportPortableCaseArchive, portableCaseArchiveBlob } from '../services/portableCaseArchive';
import './TeachingDeckImport.css';

interface Props {
  onCancel: () => void;
  onEditExistingCase?: () => void;
  onCreated: (casePackage: CasePackageV1, lessonPlan: LessonPlanV1) => void;
  saveLesson: (portable: PortableCasePackageV1) => Promise<{ persistent: boolean }>;
}

function ImageChoice({ candidate, selected, onChange }: { candidate: TeachingDeckImageCandidate; selected: boolean; onChange: () => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const next = URL.createObjectURL(new Blob([candidate.bytes.slice().buffer], { type: candidate.mimeType }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [candidate]);
  return <label className={`td-image ${selected ? 'selected' : ''}`}>
    <div className="td-image-preview">{url && <img src={url} alt={`Extracted image from slide ${candidate.sourceSlides.join(', ')}`} />}</div>
    <span><input type="checkbox" checked={selected} onChange={onChange} /> Slide {candidate.sourceSlides.join(', ')}</span>
  </label>;
}

export default function TeachingDeckImport({ onCancel, onEditExistingCase, onCreated, saveLesson }: Props) {
  const [step, setStep] = useState(0);
  const [deckFile, setDeckFile] = useState<File | null>(null);
  const [objectivesFile, setObjectivesFile] = useState<File | null>(null);
  const [deck, setDeck] = useState<PowerPointTeachingDeck | null>(null);
  const [rows, setRows] = useState<LessonObjectiveImportRow[]>([]);
  const [chosenRows, setChosenRows] = useState<Set<number>>(new Set());
  const [chosenImages, setChosenImages] = useState<Set<string>>(new Set());
  const [showAllImages, setShowAllImages] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [attribution, setAttribution] = useState('');
  const [license, setLicense] = useState('');
  const [licenseUrl, setLicenseUrl] = useState('');
  const [domain, setDomain] = useState<DomainKey>('radiology');
  const [modality, setModality] = useState('OT');
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<PortableCasePackageV1 | null>(null);
  const [persistent, setPersistent] = useState(false);
  const [savedInSession, setSavedInSession] = useState(false);
  const [exported, setExported] = useState(false);
  const operation = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const selectedRows = useMemo(() => rows.filter(row => chosenRows.has(row.rowNumber)), [rows, chosenRows]);
  const candidates = useMemo(() => deck ? teachingDeckImageCandidates(deck, selectedRows, showAllImages) : [], [deck, selectedRows, showAllImages]);
  const allCandidates = useMemo(() => deck ? teachingDeckImageCandidates(deck, rows, true) : [], [deck, rows]);
  const levels = [...new Set(selectedRows.map(row => teachingLevelLabel(row.level)))];
  const needsProtection = Boolean(deckFile || objectivesFile || deck) && !(result && (persistent || exported));

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; operation.current?.abort(); };
  }, []);
  useEffect(() => { heading.current?.focus(); }, [step, result]);
  useEffect(() => {
    if (!needsProtection) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [needsProtection]);

  const leave = (action: () => void) => {
    if (needsProtection && !window.confirm(result ? 'This lesson is only available in this visit. Export a copy before leaving. Leave anyway?' : 'Leave this lesson draft? Your imported files and edits have not been saved.')) return;
    operation.current?.abort();
    action();
  };
  const toggleRow = (row: number) => {
    setChosenRows(previous => { const next = new Set(previous); if (next.has(row)) next.delete(row); else next.add(row); return next; });
    setReviewed(false);
  };
  const toggleImage = (id: string) => {
    setChosenImages(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    setReviewed(false);
  };
  const clearSourceDetails = () => {
    setTitle(''); setDescription(''); setSourceName(''); setSourceUrl('');
    setAttribution(''); setLicense(''); setLicenseUrl(''); setModality('OT');
    setReviewed(false);
  };
  const run = async (label: string, action: (signal: AbortSignal) => Promise<void>) => {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(label); setError('');
    try { await action(controller.signal); }
    catch (failure) {
      if (mounted.current && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'This could not be completed. Please try again.');
    } finally {
      if (operation.current === controller) operation.current = null;
      if (mounted.current) setBusy('');
    }
  };
  const readFiles = async (powerPoint: File, objectives: File, signal: AbortSignal) => {
    const importedDeck = await extractPowerPointTeachingDeck(powerPoint, { signal });
    if (signal.aborted || !mounted.current) return;
    const importedObjectives = await importLessonObjectives(objectives, { signal });
    if (signal.aborted || !mounted.current) return;
    setDeck(importedDeck); setRows(importedObjectives.rows);
    setChosenRows(new Set(importedObjectives.rows.map(row => row.rowNumber)));
    setChosenImages(new Set(teachingDeckImageCandidates(importedDeck, importedObjectives.rows).map(image => image.id)));
    setWarnings([...importedDeck.warnings, ...importedObjectives.warnings]);
    setReviewed(false); setShowAllImages(false); setStep(1);
  };
  const loadExample = (kind: 'cranial-nerves' | 'facial-branches') => void run('Opening teaching example…', async signal => {
    const deckName = kind === 'cranial-nerves' ? 'neuroanatomy-lab.pptx' : 'original-lecture.pptx';
    const base = `/teaching-examples/${kind}/`;
    const deckResponse = await fetch(base + deckName, { signal });
    if (!deckResponse.ok) throw new Error('The example PowerPoint could not be loaded. You can download it or use your own files.');
    const objectivesResponse = await fetch(base + 'objectives.xlsx', { signal });
    if (!objectivesResponse.ok) throw new Error('The example objectives could not be loaded.');
    const powerPoint = new File([await deckResponse.blob()], deckName);
    const objectives = new File([await objectivesResponse.blob()], 'objectives.xlsx');
    if (signal.aborted) return;
    setDeckFile(powerPoint); setObjectivesFile(objectives);
    setSourceName('Lack et al. — Cranial Nerve Anatomy, MedEdPORTAL (2022)');
    setSourceUrl('https://doi.org/10.15766/mep_2374-8265.11261');
    if (kind === 'cranial-nerves') {
      setTitle('Facial movement: anatomy and visual reasoning');
      setDescription('An axial contrast-enhanced MRI from a published teaching case of facial weakness.');
      setAttribution('Lack et al., Wake Forest School of Medicine. Neuroanatomy Lab, MedEdPORTAL 2022. The source labels the teaching images author-owned.');
      setLicense('CC BY 4.0'); setLicenseUrl('https://creativecommons.org/licenses/by/4.0/'); setModality('MR');
    } else {
      setTitle('Face and neck: tracing a branching pathway');
      setDescription('An anatomical illustration of branching structures in the face and neck from a published teaching presentation.');
      setAttribution('Illustration: Patrick J. Lynch, medical illustrator, and C. Carl Jaffe, MD, cardiologist (CC BY 2.5), via Wikimedia Commons, File:Head facial nerve branches.jpg. Lecture: Lack et al., MedEdPORTAL 2022 (CC BY 4.0).');
      setLicense('CC BY 2.5'); setLicenseUrl('https://creativecommons.org/licenses/by/2.5/'); setModality('OT');
    }
    await readFiles(powerPoint, objectives, signal);
  });
  const reviewSelection = () => {
    try {
      validateTeachingObjectiveSelection(selectedRows);
      if (!chosenImages.size) throw new Error('Select at least one teaching image.');
      const available = new Set(deck?.slides.map(slide => slide.index));
      const selectedSlides = new Set(allCandidates.filter(image => chosenImages.has(image.id)).flatMap(image => [...image.sourceSlides]));
      for (const row of selectedRows) {
        if (row.slides.some(slide => !available.has(slide))) throw new Error(`Objective row ${row.rowNumber} refers to a hidden or missing slide.`);
        if (row.slides.length && !row.slides.some(slide => selectedSlides.has(slide))) throw new Error(`Choose an image from slide ${row.slides.join(' or ')} for objective row ${row.rowNumber}.`);
      }
      setError(''); setStep(2);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Review your selection.'); }
  };
  const create = () => void run('Creating your lesson…', async signal => {
    if (!deck) return;
    const portable = await assembleTeachingDeckLesson({ deck, rows: selectedRows, selectedImageIds: [...chosenImages], title, neutralDescription: description,
      source: { name: sourceName, url: sourceUrl, attribution, license: { name: license, ...(licenseUrl ? { url: licenseUrl } : {}) } }, domain, modality, reviewed }, { signal });
    if (signal.aborted || !mounted.current) return;
    // Save is atomic and cannot be cancelled once storage owns the write.
    setBusy('Saving your lesson…');
    let saved = false;
    let savedForThisSession = false;
    try { saved = (await saveLesson(portable)).persistent; savedForThisSession = true; }
    catch { setError('The browser could not save this lesson. Export a portable copy now to keep your work.'); }
    if (!mounted.current) return;
    setResult(portable); setPersistent(saved); setSavedInSession(savedForThisSession);
  });
  const retrySave = () => void run('Saving your lesson…', async () => {
    if (!result) return;
    const status = await saveLesson(result);
    if (!mounted.current) return;
    setPersistent(status.persistent); setSavedInSession(true);
  });
  const exportLesson = () => void run('Preparing your copy…', async signal => {
    if (!result) return;
    const bytes = await exportPortableCaseArchive(result);
    if (signal.aborted || !mounted.current) return;
    const url = URL.createObjectURL(portableCaseArchiveBlob(bytes));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${result.casePackage.id}.caseattend`;
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000); setExported(true);
  });

  return <main className="td-page">
    <header className="td-top"><button type="button" onClick={() => leave(onCancel)} disabled={!!busy}><ArrowLeft aria-hidden="true" /> Cases</button><span>CaseAttend · Lesson builder</span></header>
    <div className="td-shell">
      <p className="td-eyebrow">YOUR MATERIAL. THEIR REASONING.</p>
      <h1 ref={heading} tabIndex={-1}>{result ? 'Your lesson is ready.' : 'From teaching slides to a lesson.'}</h1>
      <p className="td-lead">Bring your images and learning objectives. You supply the answers; the tutor helps students work toward them.</p>
      {!result && <ol className="td-steps" aria-label="Lesson creation progress">{['Add your files', 'Choose what to teach', 'Review & create'].map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined} className={step >= index ? 'active' : ''}><span>{step > index ? <Check size={16} /> : index + 1}</span>{label}</li>)}</ol>}
      {error && <p className="td-error" role="alert">{error}</p>}
      {busy && <div className="td-status" role="status">{busy}{!result && busy !== 'Saving your lesson…' && <button type="button" onClick={() => operation.current?.abort()}>Cancel</button>}</div>}
      {result ? <section className="td-card td-complete" aria-label="Created lesson">
        <div className="td-success"><Check /></div><h2>{result.casePackage.title}</h2>
        <p>{result.assets.length} image{result.assets.length === 1 ? '' : 's'} · {result.lessonPlan.objectives.length} objectives · {result.lessonPlan.learner.levels.length} learning levels</p>
        <p role="status">{persistent ? 'Saved in this browser. Export a copy to share it or keep a backup.' : exported ? 'Download started. Check that you have the portable file before leaving this visit.' : savedInSession ? 'Available only in this visit. Export a copy before leaving.' : 'This lesson has not been saved. Export a copy to keep your work, or retry saving.'}</p>
        <p className="td-muted">Educator draft. No independent clinical review is recorded. The portable file includes instructor answer keys.</p>
        <div className="td-actions"><button className="td-primary" disabled={!!busy || !savedInSession || !persistent && !exported} onClick={() => onCreated(result.casePackage, result.lessonPlan)}>Open lesson <ArrowRight /></button><button disabled={!!busy} onClick={exportLesson}><Download /> {exported ? 'Export again' : 'Export portable copy'}</button>{!savedInSession && <button disabled={!!busy} onClick={retrySave}>Retry save</button>}</div>
      </section> : <fieldset className="td-content" disabled={!!busy}>
        {step === 0 && <>
          <section className="td-card">
            <h2>Two files. One teaching workflow.</h2>
            <div className="td-upload-grid">
              <label className="td-upload"><Images /><strong>Teaching slides</strong><span>PowerPoint (.pptx), up to 25 MB</span><input aria-label="Teaching PowerPoint" type="file" accept=".pptx" onChange={event => { setDeckFile(event.target.files?.[0] ?? null); clearSourceDetails(); }} />{deckFile && <small>{deckFile.name}</small>}</label>
              <label className="td-upload"><FileSpreadsheet /><strong>Learning objectives</strong><span>Excel or CSV, up to 8 MB</span><input aria-label="Learning objectives spreadsheet" type="file" accept=".xlsx,.csv" onChange={event => { setObjectivesFile(event.target.files?.[0] ?? null); clearSourceDetails(); }} />{objectivesFile && <small>{objectivesFile.name}</small>}</label>
            </div>
            <p className="td-muted">Files are read in this browser. Importing uses no AI credits. Include Level, Objective, Expected evidence and Answer key columns; add Hint, Slides and Source URL when available.</p>
            <div className="td-actions"><button className="td-primary" disabled={!deckFile || !objectivesFile} onClick={() => void run('Reading your teaching material…', signal => readFiles(deckFile!, objectivesFile!, signal))}><Upload /> Review my material</button>{onEditExistingCase && <button className="td-link" onClick={() => leave(onEditExistingCase)}>Use an existing case instead</button>}</div>
          </section>
          <section className="td-examples"><h2>Try it with a real teaching example</h2><p>Published university material, with objectives for six learning levels. Review the source and selected images before creating your lesson.</p><div className="td-example-grid">
            <article><h3>Facial movement · MRI</h3><p>Wake Forest neuroanatomy lab · 12 objectives · CC BY 4.0</p><button onClick={() => loadExample('cranial-nerves')}>Use MRI example <ArrowRight /></button><div><a href="/teaching-examples/cranial-nerves/neuroanatomy-lab.pptx" download>PowerPoint</a><a href="/teaching-examples/cranial-nerves/objectives.xlsx" download>Excel objectives</a></div></article>
            <article><h3>Face & neck · illustration</h3><p>Wikimedia illustration in a university lecture · 6 objectives · image CC BY 2.5</p><button onClick={() => loadExample('facial-branches')}>Use illustration example <ArrowRight /></button><div><a href="/teaching-examples/facial-branches/original-lecture.pptx" download>PowerPoint</a><a href="/teaching-examples/facial-branches/objectives.xlsx" download>Excel objectives</a></div></article>
          </div><p className="td-muted">Teaching package: Lack et al., MedEdPORTAL 2022. Illustration: Patrick J. Lynch and C. Carl Jaffe. <a href="https://doi.org/10.15766/mep_2374-8265.11261" target="_blank" rel="noreferrer">Original publication</a></p></section>
        </>}
        {step === 1 && <>
          <section className="td-card"><div className="td-section-heading"><div><h2>Choose your teaching images</h2><p>We found {allCandidates.length} unique images. Images from your objective slides are shown first.</p></div><label className="td-inline-check"><input type="checkbox" checked={showAllImages} onChange={event => setShowAllImages(event.target.checked)} /> Show all slide images</label></div>
            <p className="td-notice">Only embedded images are extracted. Slide arrows, labels, crops and layout may be absent; inspect each selected image. Any labels inside the image itself remain visible to students.</p>
            <div className="td-image-grid">{candidates.map(candidate => <ImageChoice key={candidate.id} candidate={candidate} selected={chosenImages.has(candidate.id)} onChange={() => toggleImage(candidate.id)} />)}</div>
            {!candidates.length && <p>No supported images match these objectives. Show all slide images or revise the spreadsheet slide references.</p>}
            <p className="td-muted">{chosenImages.size} selected across the presentation, including any currently hidden by this filter.</p>
          </section>
          <section className="td-card"><h2>Objectives & educator answer keys</h2><p>{selectedRows.length} selected · {levels.join(' · ') || 'Choose at least one objective'}</p><p className="td-muted">This review is for the educator. The student sees objective numbers and evidence status, while the tutor uses your authored answers.</p>
            <div className="td-objectives">{rows.map((row, index) => <article key={row.rowNumber}>
              <label className="td-objective-title"><input type="checkbox" checked={chosenRows.has(row.rowNumber)} onChange={() => toggleRow(row.rowNumber)} /><span><strong>{teachingLevelLabel(row.level)}</strong><span>{row.objective}</span><small>Spreadsheet row {row.rowNumber}{row.slides.length ? ` · Slide ${row.slides.join(', ')}` : ''}</small></span></label>
              <details><summary>Review answer key, evidence & hint</summary>{(['answerKey', 'evidence', 'hint'] as const).map(key => <label key={key}>{key === 'answerKey' ? 'Educator answer key' : key === 'evidence' ? 'Expected evidence' : 'Allowed hint'}<textarea value={row[key]} rows={3} maxLength={4000} onChange={event => { setRows(previous => previous.map((entry, i) => i === index ? { ...entry, [key]: event.target.value } : entry)); setReviewed(false); }} /></label>)}</details>
            </article>)}</div>
          </section>
          {deck && <details className="td-card"><summary>Instructor source text & speaker notes</summary><p className="td-muted">Reference only. This material is not automatically used as an answer key or shown to students.</p>{deck.slides.filter(slide => selectedRows.some(row => row.slides.includes(slide.index))).map(slide => <article key={slide.index}><h3>Slide {slide.index}</h3><p className="td-source-text">{slide.text}</p>{slide.notes && <p className="td-source-text">{slide.notes}</p>}</article>)}</details>}
          {warnings.length > 0 && <details className="td-card"><summary>Import notes ({warnings.length})</summary><ul>{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
          <div className="td-actions"><button onClick={() => setStep(0)}><ArrowLeft /> Files</button><button className="td-primary" onClick={reviewSelection}>Continue to review <ArrowRight /></button></div>
        </>}
        {step === 2 && <>
          <section className="td-card"><h2>What students will see</h2><p>Use a neutral title and introduction that leave the reasoning to the learner.</p><label>Lesson title<input value={title} maxLength={160} onChange={event => { setTitle(event.target.value); setReviewed(false); }} placeholder="e.g. A closer look at facial movement" /></label><label>Student introduction<textarea value={description} maxLength={2000} rows={3} onChange={event => { setDescription(event.target.value); setReviewed(false); }} placeholder="Brief context without the answer or diagnosis" /></label>
            <div className="td-form-grid"><label>Teaching area<select value={domain} onChange={event => { setDomain(event.target.value as DomainKey); setReviewed(false); }}>{['radiology', 'pathology', 'dermatology', 'ecg', 'ultrasound', 'ophthalmology'].map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label><label>Image type<select value={modality} onChange={event => { setModality(event.target.value); setReviewed(false); }}><option value="OT">Illustration / other</option><option value="MR">MRI</option><option value="CT">CT</option><option value="CR">X-ray</option><option value="US">Ultrasound</option></select></label></div>
          </section>
          <section className="td-card"><h2>Credit the teaching material</h2><p>Use the licence for your selected images. A presentation can contain images with different licences.</p><label>Source name<input value={sourceName} maxLength={240} onChange={event => { setSourceName(event.target.value); setReviewed(false); }} placeholder="Course, author or publication" /></label><label>Source URL<input type="url" value={sourceUrl} onChange={event => { setSourceUrl(event.target.value); setReviewed(false); }} placeholder="https://…" /></label><label>Author attribution<textarea value={attribution} rows={3} maxLength={4000} onChange={event => { setAttribution(event.target.value); setReviewed(false); }} /></label><div className="td-form-grid"><label>Image licence<input value={license} onChange={event => { setLicense(event.target.value); setReviewed(false); }} placeholder="e.g. CC BY 4.0" /></label><label>Licence URL (optional)<input type="url" value={licenseUrl} onChange={event => { setLicenseUrl(event.target.value); setReviewed(false); }} placeholder="https://…" /></label></div></section>
          <section className="td-card"><h2>Ready to coach</h2><p>{chosenImages.size} images · {selectedRows.length} objectives · {levels.length} levels</p><p className="td-muted">Students attempt an observation before asking for help. Optional paid objective checks start off and can be enabled in the lesson. Their results are formative evidence, not proof of mastery.</p><label className="td-review-check"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} /><span>I reviewed the selected images, answer keys, source credits and neutral introduction for this educational lesson.</span></label><p className="td-muted">This records your authoring review. It does not record an independent clinical review or a privacy-screening attestation.</p></section>
          <div className="td-actions"><button onClick={() => setStep(1)}><ArrowLeft /> Material</button><button className="td-primary" disabled={!reviewed} onClick={create}>Create lesson <ArrowRight /></button></div>
        </>}
      </fieldset>}
    </div>
  </main>;
}
