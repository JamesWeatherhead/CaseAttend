import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileJson,
  Info,
  LockKeyhole,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { LEARNER_LEVELS, type LearnerLevel } from '../constants';
import {
  finalizeCasePackageV1,
  type CasePackageV1,
} from '../core/casePackage';
import {
  createCaseLessonBundleV1,
  type CaseLessonBundleV1,
} from '../core/caseLessonBundle';
import {
  LESSON_PLAN_SCHEMA,
  LESSON_PLAN_SCHEMA_VERSION,
  composeLessonPrompt,
  finalizeLessonPlanV1,
  getLessonPlanRef,
  validateLessonPlanDraftV1,
  type LessonPlanV1,
  type LessonPlanV1Draft,
  type LessonTutorPromptSections,
} from '../core/lessonPlan';
import { listCasePackages } from '../data/caseRegistry';
import LessonSourceDropzone, { type LessonSourceParser } from './LessonSourceDropzone';
import type { LessonSourceOutline } from '../services/lessonSourceImport';
import './LessonBuilder.css';

interface LessonBuilderProps {
  onExit: () => void;
  loadCasePackages?: () => Promise<readonly CasePackageV1[]>;
  initialCaseId?: string;
  loadStoredLesson?: (casePackage: CasePackageV1) => Promise<LessonPlanV1 | null>;
  saveUpdatedBundle?: (
    casePackage: CasePackageV1,
    lessonPlan: LessonPlanV1,
    expectedCaseManifestSha256: string,
  ) => Promise<boolean>;
  exportPortableCase?: (casePackage: CasePackageV1) => Promise<void>;
  resolveAssetUri?: (uri: string) => Promise<string>;
  parseLessonSource?: LessonSourceParser;
}

interface ObjectiveRow {
  key: number;
  id: string;
  description: string;
  criterionId: string;
  criterion: string;
  evidence: string;
}

interface HintRow {
  key: number;
  id: string;
  objectiveId: string;
  text: string;
}

interface EscalationRow {
  key: number;
  id: string;
  when: string;
  action: string;
}

interface StoppingRow {
  key: number;
  id: string;
  when: string;
  message: string;
}

interface CitationRow {
  key: number;
  id: string;
  title: string;
  url: string;
  doi: string;
  scope: 'artifact-provenance' | 'clinical-teaching';
}

interface BuilderForm {
  caseId: string;
  id: string;
  title: string;
  version: string;
  levels: LearnerLevel[];
  prerequisites: string;
  neutralDescription: string;
  objectives: ObjectiveRow[];
  socraticOpening: string;
  hints: HintRow[];
  escalations: EscalationRow[];
  stopping: StoppingRow[];
  tutorInstructions: string;
  answerNotes: string;
  citations: CitationRow[];
  reviewed: boolean;
  reviewer: string;
  credentials: string;
  reviewedAt: string;
}

interface FinalizedBundle {
  casePackage: CasePackageV1;
  lessonPlan: LessonPlanV1;
  prompt: LessonTutorPromptSections;
  bundle: CaseLessonBundleV1;
}

const STEPS = [
  { short: 'Setup', title: 'Set up the lesson' },
  { short: 'Objectives/evidence', title: 'Define objectives and evidence' },
  { short: 'Tutor path', title: 'Design the tutor path' },
  { short: 'Sources/review', title: 'Add sources and review state' },
  { short: 'Review/export', title: 'Review and export' },
] as const;

const INPUT_CLASS = 'lesson-builder-input';
const KEBAB_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function lines(value: string): string[] {
  return value.split('\n').map((line) => line.trim()).filter(Boolean);
}

function normalizeId(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'new-lesson';
}

function initialForm(casePackage?: CasePackageV1): BuilderForm {
  const sourceUrl = casePackage?.provenance.sourceUrl ?? '';
  return {
    caseId: casePackage?.id ?? '',
    id: casePackage ? `${casePackage.id}-lesson` : 'new-lesson',
    title: casePackage ? `${casePackage.title}: guided visual reasoning` : '',
    version: '1.0.0',
    levels: ['ms_clinical'],
    prerequisites: '',
    neutralDescription: casePackage?.neutralDescription ?? '',
    objectives: [{
      key: 1,
      id: 'objective-1',
      description: '',
      criterionId: 'rubric-objective-1',
      criterion: '',
      evidence: '',
    }],
    socraticOpening: '',
    hints: [{ key: 1, id: 'hint-1', objectiveId: 'objective-1', text: '' }],
    escalations: [{ key: 1, id: 'escalation-1', when: '', action: '' }],
    stopping: [{ key: 1, id: 'stopping-1', when: '', message: '' }],
    tutorInstructions: '',
    answerNotes: '',
    citations: [{
      key: 1,
      id: 'source-1',
      title: casePackage?.provenance.sourceName ?? '',
      url: sourceUrl,
      doi: '',
      scope: 'artifact-provenance',
    }],
    reviewed: false,
    reviewer: '',
    credentials: '',
    reviewedAt: '',
  };
}

function assertVisualBuilderCanRepresent(lessonPlan: LessonPlanV1): void {
  const unsupported: string[] = [];
  if (lessonPlan.learnerOpenings !== undefined) {
    unsupported.push('audience-specific learner openings');
  }
  if (lessonPlan.allowedHints.some((hint) => hint.objectiveIds.length !== 1)) {
    unsupported.push('hints linked to more than one objective');
  }
  const criteriaByObjective = new Map<string, number>();
  lessonPlan.rubric.criteria.forEach((criterion) => {
    if (criterion.objectiveIds.length !== 1) {
      unsupported.push('rubric criteria linked to more than one objective');
      return;
    }
    const objectiveId = criterion.objectiveIds[0];
    criteriaByObjective.set(objectiveId, (criteriaByObjective.get(objectiveId) ?? 0) + 1);
  });
  if (lessonPlan.objectives.some((objective) => (criteriaByObjective.get(objective.id) ?? 0) !== 1)) {
    unsupported.push('objectives with multiple rubric criteria');
  }
  const uniqueUnsupported = [...new Set(unsupported)];
  if (uniqueUnsupported.length > 0) {
    throw new Error(
      `This valid Lesson Plan v1 uses structures the visual builder cannot edit without losing data: ${uniqueUnsupported.join(', ')}. No lesson content was changed. Use the portable package or SDK as-is, or create a simplified revision before opening it here.`,
    );
  }
}

function isoToLocalDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace(/Z$/, '');
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .replace(/Z$/, '');
}

function formFromLesson(casePackage: CasePackageV1, lessonPlan: LessonPlanV1): BuilderForm {
  assertVisualBuilderCanRepresent(lessonPlan);
  return {
    caseId: casePackage.id,
    id: lessonPlan.id,
    title: lessonPlan.title,
    version: lessonPlan.version,
    levels: [...lessonPlan.learner.levels],
    prerequisites: lessonPlan.learner.prerequisites.join('\n'),
    neutralDescription: lessonPlan.neutralDescription,
    objectives: lessonPlan.objectives.map((objective, index) => {
      const criterion = lessonPlan.rubric.criteria.find((entry) => (
        entry.objectiveIds.includes(objective.id)
      ));
      return {
        key: index + 1,
        id: objective.id,
        description: objective.description,
        criterionId: criterion?.id ?? `rubric-${objective.id}`,
        criterion: criterion?.criterion ?? '',
        evidence: criterion?.observableEvidence.join('\n') ?? '',
      };
    }),
    socraticOpening: lessonPlan.socraticOpening,
    hints: lessonPlan.allowedHints.map((hint, index) => ({
      key: index + 1,
      id: hint.id,
      objectiveId: hint.objectiveIds[0] ?? '',
      text: hint.text,
    })),
    escalations: lessonPlan.escalationConditions.map((condition, index) => ({
      key: index + 1,
      id: condition.id,
      when: condition.when,
      action: condition.action,
    })),
    stopping: lessonPlan.stoppingConditions.map((condition, index) => ({
      key: index + 1,
      id: condition.id,
      when: condition.when,
      message: condition.message,
    })),
    tutorInstructions: lessonPlan.educatorTutorInstructions,
    answerNotes: lessonPlan.teachingNotes.join('\n'),
    citations: lessonPlan.citations.map((citation, index) => ({
      key: index + 1,
      id: citation.id,
      title: citation.title,
      url: citation.url ?? '',
      doi: citation.doi ?? '',
      scope: citation.scope,
    })),
    reviewed: lessonPlan.clinicalReview.reviewed,
    reviewer: lessonPlan.clinicalReview.reviewed ? lessonPlan.clinicalReview.reviewer : '',
    credentials: lessonPlan.clinicalReview.reviewed ? lessonPlan.clinicalReview.credentials : '',
    reviewedAt: lessonPlan.clinicalReview.reviewed
      ? isoToLocalDateTime(lessonPlan.clinicalReview.reviewedAt)
      : '',
  };
}

function isPristineForCase(form: BuilderForm, casePackage: CasePackageV1): boolean {
  return JSON.stringify(form) === JSON.stringify(initialForm(casePackage));
}

function reviewedAtIso(value: string): string {
  const time = Date.parse(value);
  return Number.isNaN(time) ? value : new Date(time).toISOString();
}

function buildDraft(form: BuilderForm): LessonPlanV1Draft {
  return {
    schema: LESSON_PLAN_SCHEMA,
    schemaVersion: LESSON_PLAN_SCHEMA_VERSION,
    version: form.version.trim(),
    id: form.id.trim(),
    title: form.title.trim(),
    neutralDescription: form.neutralDescription.trim(),
    teachingNotes: lines(form.answerNotes),
    learner: {
      levels: form.levels,
      prerequisites: lines(form.prerequisites),
    },
    objectives: form.objectives.map((objective) => ({
      id: objective.id.trim(),
      description: objective.description.trim(),
    })),
    socraticOpening: form.socraticOpening.trim(),
    allowedHints: form.hints.map((hint) => ({
      id: hint.id.trim(),
      objectiveIds: [hint.objectiveId],
      text: hint.text.trim(),
    })),
    escalationConditions: form.escalations.map((condition) => ({
      id: condition.id.trim(),
      when: condition.when.trim(),
      action: condition.action.trim(),
    })),
    stoppingConditions: form.stopping.map((condition) => ({
      id: condition.id.trim(),
      when: condition.when.trim(),
      message: condition.message.trim(),
    })),
    educatorTutorInstructions: form.tutorInstructions.trim(),
    rubric: {
      criteria: form.objectives.map((objective) => ({
        id: objective.criterionId.trim() || `rubric-${objective.id.trim()}`,
        objectiveIds: [objective.id.trim()],
        criterion: objective.criterion.trim(),
        observableEvidence: lines(objective.evidence),
      })),
    },
    citations: form.citations.map((citation) => ({
      id: citation.id.trim(),
      title: citation.title.trim(),
      scope: citation.scope,
      ...(citation.url.trim() ? { url: citation.url.trim() } : {}),
      ...(citation.doi.trim() ? { doi: citation.doi.trim() } : {}),
    })),
    clinicalReview: form.reviewed
      ? {
          reviewed: true,
          reviewer: form.reviewer.trim(),
          credentials: form.credentials.trim(),
          reviewedAt: reviewedAtIso(form.reviewedAt),
        }
      : { reviewed: false },
  };
}

function required(value: string, message: string, errors: string[]): void {
  if (!value.trim()) errors.push(message);
}

function validateStep(step: number, form: BuilderForm): string[] {
  const errors: string[] = [];
  if (step === 0) {
    required(form.caseId, 'Choose a teaching case.', errors);
    required(form.id, 'Enter a stable lesson ID.', errors);
    if (form.id.trim() && !KEBAB_ID.test(form.id.trim())) {
      errors.push('Lesson ID must use lowercase kebab-case.');
    }
    required(form.title, 'Enter a lesson title.', errors);
    if (!SEMVER.test(form.version.trim())) errors.push('Content version must use SemVer, for example 1.0.0.');
    if (form.levels.length === 0) errors.push('Choose at least one learner level.');
    required(form.neutralDescription, 'Add a neutral description that does not reveal the answer.', errors);
  }
  if (step === 1) {
    if (form.objectives.length === 0) errors.push('Add at least one objective.');
    const seen = new Set<string>();
    form.objectives.forEach((objective, index) => {
      const label = `Objective ${index + 1}`;
      required(objective.id, `${label} needs a stable ID.`, errors);
      if (objective.id.trim() && !KEBAB_ID.test(objective.id.trim())) errors.push(`${label} ID must use lowercase kebab-case.`);
      if (seen.has(objective.id.trim())) errors.push(`${label} repeats an earlier ID.`);
      seen.add(objective.id.trim());
      required(objective.description, `${label} needs a learner-facing description.`, errors);
      required(objective.criterion, `${label} needs an assessment criterion.`, errors);
      if (lines(objective.evidence).length === 0) errors.push(`${label} needs observable evidence.`);
    });
  }
  if (step === 2) {
    required(form.socraticOpening, 'Write the tutor\'s first Socratic question.', errors);
    required(form.tutorInstructions, 'Add educator instructions for the tutor.', errors);
    if (lines(form.answerNotes).length === 0) errors.push('Add at least one answer-revealing teaching note.');
    form.hints.forEach((hint, index) => {
      required(hint.id, `Hint ${index + 1} needs a stable ID.`, errors);
      required(hint.objectiveId, `Hint ${index + 1} must link to an objective.`, errors);
      required(hint.text, `Hint ${index + 1} needs text.`, errors);
    });
    form.escalations.forEach((condition, index) => {
      required(condition.id, `Escalation ${index + 1} needs a stable ID.`, errors);
      required(condition.when, `Escalation ${index + 1} needs a trigger.`, errors);
      required(condition.action, `Escalation ${index + 1} needs an action.`, errors);
    });
    form.stopping.forEach((condition, index) => {
      required(condition.id, `Stopping condition ${index + 1} needs a stable ID.`, errors);
      required(condition.when, `Stopping condition ${index + 1} needs a trigger.`, errors);
      required(condition.message, `Stopping condition ${index + 1} needs a learner message.`, errors);
    });
  }
  if (step === 3) {
    if (form.citations.length === 0) errors.push('Add at least one verifiable source.');
    form.citations.forEach((citation, index) => {
      required(citation.id, `Source ${index + 1} needs a stable ID.`, errors);
      required(citation.title, `Source ${index + 1} needs a title.`, errors);
      if (!citation.url.trim() && !citation.doi.trim()) {
        errors.push(`Source ${index + 1} needs an HTTPS URL or DOI.`);
      }
      if (citation.url.trim() && !citation.url.trim().startsWith('https://')) {
        errors.push(`Source ${index + 1} URL must begin with https://.`);
      }
    });
    if (form.reviewed) {
      if (!form.citations.some((citation) => citation.scope === 'clinical-teaching')) {
        errors.push('A clinician-reviewed lesson needs at least one clinical-teaching source. Artifact provenance alone is not sufficient.');
      }
      required(form.reviewer, 'Record the clinical reviewer name.', errors);
      required(form.credentials, 'Record the reviewer credentials.', errors);
      required(form.reviewedAt, 'Record when clinical review was completed.', errors);
    }
  }
  return errors;
}

interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}

const Field: React.FC<FieldProps> = ({ label, htmlFor, hint, required: isRequired, children }) => (
  <div className="lesson-builder-field">
    <label htmlFor={htmlFor}>
      {label}{isRequired && <span aria-hidden="true"> *</span>}
    </label>
    {hint && <p id={`${htmlFor}-hint`} className="lesson-builder-hint">{hint}</p>}
    {children}
  </div>
);

const LessonCasePreview: React.FC<{
  casePackage: CasePackageV1;
  resolveAssetUri?: (uri: string) => Promise<string>;
}> = ({ casePackage, resolveAssetUri }) => {
  const [src, setSrc] = useState(
    casePackage.preview.src.startsWith('case://assets/') ? '' : casePackage.preview.src,
  );
  useEffect(() => {
    let active = true;
    if (!casePackage.preview.src.startsWith('case://assets/')) {
      setSrc(casePackage.preview.src);
      return () => { active = false; };
    }
    setSrc('');
    if (!resolveAssetUri) return () => { active = false; };
    void resolveAssetUri(casePackage.preview.src).then((resolved) => {
      if (active) setSrc(resolved);
    }).catch(() => {
      if (active) setSrc('');
    });
    return () => { active = false; };
  }, [casePackage.preview.src, resolveAssetUri]);
  return src
    ? <img src={src} alt={casePackage.preview.alt} />
    : <div role="img" aria-label={casePackage.preview.alt}>Preview stored in this browser</div>;
};

const LessonBuilder: React.FC<LessonBuilderProps> = ({
  onExit,
  loadCasePackages = listCasePackages,
  initialCaseId,
  loadStoredLesson,
  saveUpdatedBundle,
  exportPortableCase,
  resolveAssetUri,
  parseLessonSource,
}) => {
  const [casePackages, setCasePackages] = useState<readonly CasePackageV1[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<BuilderForm>(() => initialForm());
  const [errors, setErrors] = useState<string[]>([]);
  const [finalized, setFinalized] = useState<FinalizedBundle | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [hasImportedDraft, setHasImportedDraft] = useState(false);
  const [importExpanded, setImportExpanded] = useState(false);
  const [stepListOpen, setStepListOpen] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const settingsRef = useRef<HTMLDetailsElement>(null);
  const caseChangeRequestRef = useRef(0);

  const selectedCase = useMemo(
    () => casePackages.find((casePackage) => casePackage.id === form.caseId),
    [casePackages, form.caseId],
  );
  const hasSettingsError = errors.some(error => /^(?:Enter a stable lesson ID|Lesson ID|Content version|id |version )/i.test(error.replace(/^- /, '')));

  useEffect(() => {
    let active = true;
    loadCasePackages()
      .then(async (packages) => {
        if (!active) return;
        if (packages.length === 0) throw new Error('No Case Packages are available.');
        const initialCase = packages.find((casePackage) => casePackage.id === initialCaseId)
          ?? packages[0];
        const storedLesson = loadStoredLesson
          ? await loadStoredLesson(initialCase)
          : null;
        if (!active) return;
        setCasePackages(packages);
        setForm(storedLesson ? formFromLesson(initialCase, storedLesson) : initialForm(initialCase));
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : 'Could not load Case Packages.');
        setLoading(false);
      });
    return () => { active = false; };
  }, [initialCaseId, loadCasePackages, loadStoredLesson]);

  useEffect(() => {
    setFinalized(null);
    setStatusMessage('');
  }, [form]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (errors.length > 0) {
      if (hasSettingsError && settingsRef.current) settingsRef.current.open = true;
      errorRef.current?.focus();
    }
  }, [errors, hasSettingsError, step]);

  useEffect(() => {
    if (step !== 0) setImportExpanded(false);
  }, [step]);

  const showErrors = (nextErrors: string[]) => {
    setErrors(nextErrors);
  };

  const updateForm = <K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors([]);
  };

  const changeCase = async (caseId: string): Promise<boolean> => {
    const nextCase = casePackages.find((casePackage) => casePackage.id === caseId);
    if (!nextCase || nextCase.id === form.caseId) return false;
    if (
      selectedCase
      && !isPristineForCase(form, selectedCase)
      && !window.confirm('Changing the teaching case will clear the lesson content entered for this case. Continue?')
    ) {
      return false;
    }
    const requestId = ++caseChangeRequestRef.current;
    setBusy(true);
    try {
      const storedLesson = loadStoredLesson
        ? await loadStoredLesson(nextCase)
        : null;
      if (requestId !== caseChangeRequestRef.current) return false;
      setForm(storedLesson ? formFromLesson(nextCase, storedLesson) : initialForm(nextCase));
      setHasImportedDraft(false);
      setErrors([]);
      return true;
    } catch (error) {
      if (requestId !== caseChangeRequestRef.current) return false;
      showErrors([
        error instanceof Error
          ? error.message
          : 'The exact saved lesson revision could not be loaded.',
      ]);
      return false;
    } finally {
      if (requestId === caseChangeRequestRef.current) setBusy(false);
    }
  };

  const toggleLevel = (level: LearnerLevel) => {
    updateForm(
      'levels',
      form.levels.includes(level)
        ? form.levels.filter((entry) => entry !== level)
        : [...form.levels, level],
    );
  };

  const updateObjective = (key: number, field: keyof Omit<ObjectiveRow, 'key'>, value: string) => {
    setForm((current) => {
      const previous = current.objectives.find((row) => row.key === key);
      return {
        ...current,
        objectives: current.objectives.map((row) => row.key === key ? { ...row, [field]: value } : row),
        hints: field === 'id' && previous
          ? current.hints.map((hint) => hint.objectiveId === previous.id ? { ...hint, objectiveId: value } : hint)
          : current.hints,
      };
    });
    setErrors([]);
  };

  const addObjective = () => {
    const key = Math.max(0, ...form.objectives.map((row) => row.key)) + 1;
    updateForm('objectives', [...form.objectives, {
      key,
      id: `objective-${key}`,
      description: '',
      criterionId: `rubric-objective-${key}`,
      criterion: '',
      evidence: '',
    }]);
  };

  const removeObjective = (key: number) => {
    if (form.objectives.length === 1) return;
    updateForm('objectives', form.objectives.filter((row) => row.key !== key));
  };

  const moveObjective = (key: number, direction: -1 | 1) => {
    setForm((current) => {
      const index = current.objectives.findIndex((objective) => objective.key === key);
      const destination = index + direction;
      if (index < 0 || destination < 0 || destination >= current.objectives.length) return current;
      const objectives = [...current.objectives];
      [objectives[index], objectives[destination]] = [objectives[destination], objectives[index]];
      return { ...current, objectives };
    });
    setErrors([]);
  };

  const addHint = () => {
    const key = Math.max(0, ...form.hints.map((row) => row.key)) + 1;
    updateForm('hints', [...form.hints, {
      key,
      id: `hint-${key}`,
      objectiveId: form.objectives[0]?.id ?? '',
      text: '',
    }]);
  };

  const addEscalation = () => {
    const key = Math.max(0, ...form.escalations.map((row) => row.key)) + 1;
    updateForm('escalations', [...form.escalations, { key, id: `escalation-${key}`, when: '', action: '' }]);
  };

  const addStopping = () => {
    const key = Math.max(0, ...form.stopping.map((row) => row.key)) + 1;
    updateForm('stopping', [...form.stopping, { key, id: `stopping-${key}`, when: '', message: '' }]);
  };

  const addCitation = () => {
    const key = Math.max(0, ...form.citations.map((row) => row.key)) + 1;
    updateForm('citations', [...form.citations, {
      key,
      id: `source-${key}`,
      title: '',
      url: '',
      doi: '',
      scope: 'clinical-teaching',
    }]);
  };

  const applyImportedOutline = (outline: LessonSourceOutline): boolean => {
    if (!selectedCase) {
      showErrors(['Choose a Case Package before applying an imported draft.']);
      return false;
    }
    if (
      !isPristineForCase(form, selectedCase)
      && !window.confirm('Applying this imported draft will replace lesson fields you have edited. Continue?')
    ) {
      return false;
    }
    const candidates = outline.objectiveCandidates.length > 0
      ? outline.objectiveCandidates
      : [`Explain the key teaching points in ${outline.titleCandidate ?? 'the imported material'}.`];
    const objectives: ObjectiveRow[] = candidates.map((description, index) => ({
      key: index + 1,
      id: `objective-${index + 1}`,
      description,
      criterionId: `rubric-objective-${index + 1}`,
      criterion: 'The learner addresses this objective accurately in their own words.',
      evidence: 'Explains the key idea using evidence from the case',
    }));
    setForm((current) => ({
      ...current,
      title: outline.titleCandidate ?? current.title,
      objectives,
      socraticOpening: 'What do you notice in the case that connects to this teaching material?',
      hints: [{
        key: 1,
        id: 'hint-1',
        objectiveId: objectives[0].id,
        text: 'Return to the case and name the most relevant visible finding before answering.',
      }],
      escalations: [{
        key: 1,
        id: 'escalation-1',
        when: 'the learner gives two incomplete attempts',
        action: 'offer one focused hint linked to the current objective',
      }],
      stopping: [{
        key: 1,
        id: 'stopping-1',
        when: 'the learner explains the objectives and supports their reasoning',
        message: 'Summarize the supporting evidence and one durable takeaway, then stop.',
      }],
      tutorInstructions: 'Use the imported teaching material as an educator-review draft. Ask one focused question at a time. Do not treat unverified links as evidence or reveal answer notes before the learner attempts the objective.',
      answerNotes: outline.teachingNoteDraft,
      reviewed: false,
      reviewer: '',
      credentials: '',
      reviewedAt: '',
    }));
    setFinalized(null);
    setHasImportedDraft(true);
    setErrors([]);
    return true;
  };

  const finalize = async (): Promise<FinalizedBundle | null> => {
    if (!selectedCase) {
      showErrors(['Choose a teaching case before finalizing the lesson.']);
      return null;
    }
    const fieldErrors = STEPS.flatMap((_item, index) => validateStep(index, form));
    if (fieldErrors.length) {
      showErrors(fieldErrors);
      return null;
    }
    const draft = buildDraft(form);
    const validation = validateLessonPlanDraftV1(draft);
    if (!validation.valid) {
      showErrors(validation.errors);
      return null;
    }
    setBusy(true);
    try {
      const lessonPlan = await finalizeLessonPlanV1(draft);
      const lessonPlanRef = getLessonPlanRef(lessonPlan);
      const { manifest: _oldManifest, ...caseDraft } = selectedCase;
      const casePackage = await finalizeCasePackageV1({
        ...caseDraft,
        lessonPlanRef,
        neutralDescription: lessonPlan.neutralDescription,
        teachingNotes: lessonPlan.teachingNotes,
      });
      const bundle = await createCaseLessonBundleV1(casePackage, lessonPlan);
      const prompt = await composeLessonPrompt(lessonPlan, {
        learnerLevel: form.levels[0],
        mode: 'chat',
        hasImage: true,
        caseContext: {
          id: casePackage.id,
          title: casePackage.title,
          vignette: casePackage.vignette,
          neutralDescription: casePackage.neutralDescription,
          domain: casePackage.domain,
        },
      });
      const nextFinalized = { casePackage, lessonPlan, prompt, bundle };
      const savedBrowserLocal = saveUpdatedBundle
        ? await saveUpdatedBundle(casePackage, lessonPlan, selectedCase.manifest.sha256)
        : false;
      setFinalized(nextFinalized);
      setErrors([]);
      setStatusMessage(
        savedBrowserLocal
          ? 'Browser-local case and exact lesson revision saved. The portable export is ready.'
          : lessonPlan.clinicalReview.reviewed
          ? 'Clinically reviewed lesson and linked Case Package validated. The export is ready.'
          : 'Draft lesson and linked Case Package validated. The draft export is ready.',
      );
      return nextFinalized;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'The lesson could not be finalized.';
      showErrors(message.split('\n').filter((line) => line && !line.startsWith('Cannot finalize')));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const goNext = async () => {
    const stepErrors = validateStep(step, form);
    if (stepErrors.length) {
      showErrors(stepErrors);
      return;
    }
    setErrors([]);
    const nextStep = Math.min(STEPS.length - 1, step + 1);
    setStep(nextStep);
    if (nextStep === STEPS.length - 1) await finalize();
  };

  const chooseStep = async (index: number) => {
    setStepListOpen(false);
    if (index === step) headingRef.current?.focus();
    setErrors([]);
    setStep(index);
    if (index === STEPS.length - 1) await finalize();
  };

  const downloadBundle = async () => {
    try {
      const ready = finalized ?? await finalize();
      if (!ready) return;
      if (ready.casePackage.preview.src.startsWith('case://assets/') && exportPortableCase) {
        await exportPortableCase(ready.casePackage);
        setStatusMessage('The portable case, exact lesson, and referenced images were downloaded from this browser.');
        return;
      }
      const url = URL.createObjectURL(new Blob([`${JSON.stringify(ready.bundle, null, 2)}\n`], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${ready.lessonPlan.id}-${ready.lessonPlan.version}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setStatusMessage('The versioned case and lesson bundle was downloaded from this browser.');
    } catch (error: unknown) {
      setStatusMessage('');
      showErrors([
        error instanceof Error
          ? `The export could not be completed: ${error.message}`
          : 'The export could not be completed. Your lesson remains in this browser.',
      ]);
    }
  };

  if (loading) {
    return <main className="lesson-builder-loading" aria-busy="true">Loading Case Packages...</main>;
  }

  if (loadError) {
    return (
      <main className="lesson-builder-loading">
        <AlertCircle aria-hidden="true" />
        <p>{loadError}</p>
        <button type="button" className="lesson-builder-button secondary" onClick={onExit}>Back to cases</button>
      </main>
    );
  }

  return (
    <main className="lesson-builder-shell">
      <header className="lesson-builder-topbar">
        <button type="button" className="lesson-builder-back" aria-label="Back to cases" onClick={onExit}>
          <ArrowLeft aria-hidden="true" />
          Back to cases
        </button>
        <div className="lesson-builder-brand" aria-label="CaseAttend Lesson Builder">
          <img src="/logo.svg" alt="" />
          <span>CaseAttend</span>
          <span className="lesson-builder-product">Lesson Builder</span>
        </div>
        <span className="lesson-builder-local"><LockKeyhole aria-hidden="true" /> Browser-only builder</span>
      </header>

      <div className="lesson-builder-layout">
        <aside className="lesson-builder-sidebar">
          <div>
            <p className="lesson-builder-eyebrow">For educators</p>
            <h1>Build a guided lesson</h1>
            <p>Choose a case, set your learning goals, then shape the questions and hints.</p>
          </div>
          <nav aria-label="Lesson builder steps" className={stepListOpen ? 'is-open' : ''}>
            <button type="button" className="lesson-builder-step-toggle" aria-label="All lesson steps" aria-describedby="lesson-builder-current-step" aria-expanded={stepListOpen} aria-controls="lesson-builder-step-list"
              onClick={() => setStepListOpen(open => !open)}>
              <span id="lesson-builder-current-step">Step {step + 1} of {STEPS.length} · {STEPS[step].short}</span>
              <span>All steps <ChevronDown aria-hidden="true" /></span>
            </button>
            <ol id="lesson-builder-step-list">
              {STEPS.map((item, index) => (
                <li key={item.short}>
                  <button
                    type="button"
                    aria-current={step === index ? 'step' : undefined}
                    onClick={() => void chooseStep(index)}
                  >
                    <span className="lesson-builder-step-number" aria-hidden="true">
                      {index < step ? <Check /> : index + 1}
                    </span>
                    <span>{item.short}</span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>
          <div className="lesson-builder-privacy-note">
            <ShieldCheck aria-hidden="true" />
            <p>
              This builder does not contact a model or read an API key. Finalization and export happen in this browser.
            </p>
          </div>
        </aside>

        <section className="lesson-builder-workspace" aria-labelledby="lesson-builder-step-title">
          <div className="lesson-builder-workspace-header">
            <p>Step {step + 1} of {STEPS.length}</p>
            <h2 id="lesson-builder-step-title" ref={headingRef} tabIndex={-1}>{STEPS[step].title}</h2>
          </div>

          {hasImportedDraft && (
            <p className="lesson-builder-import-state" role="status">
              <ShieldCheck aria-hidden="true" /> Imported draft · educator review required
            </p>
          )}

          {errors.length > 0 && (
            <div className="lesson-builder-error-summary" role="alert" tabIndex={-1} ref={errorRef}>
              <AlertCircle aria-hidden="true" />
              <div>
                <h3>Review these items</h3>
                <ul>{errors.map((error, index) => <li key={`${error}-${index}`}>{error.replace(/^- /, '')}</li>)}</ul>
                {hasSettingsError && step !== 0 && (
                  <button type="button" className="lesson-builder-button secondary compact" onClick={() => { setStep(0); setErrors(validateStep(0, form)); }}>Edit lesson settings</button>
                )}
                <div className="lesson-builder-error-actions">
                  {['Edit setup', 'Edit learning goals', 'Edit tutor path', 'Edit sources'].map((label, index) => (
                    index !== step && !(index === 0 && hasSettingsError)
                    && validateStep(index, form).some(error => errors.includes(error))
                    && <button key={label} type="button" className="lesson-builder-button secondary compact"
                      onClick={() => { setStep(index); setErrors(validateStep(index, form)); }}>{label}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <form onSubmit={(event) => event.preventDefault()} noValidate>
            {step === 0 && (
              <div className="lesson-builder-section-stack">
                <div className="lesson-builder-case-choice">
                  <Field label="Teaching case" htmlFor="lesson-case" hint="The case provides the images. Importing a document adds teaching text." required>
                    <select
                      id="lesson-case"
                      className={INPUT_CLASS}
                      value={form.caseId}
                      onChange={(event) => { void changeCase(event.target.value); }}
                      disabled={busy}
                      aria-describedby="lesson-case-hint"
                      required
                    >
                      {casePackages.map((casePackage) => (
                        <option key={casePackage.id} value={casePackage.id}>{casePackage.title}</option>
                      ))}
                    </select>
                  </Field>
                  {selectedCase && (
                    <aside className="lesson-builder-case-preview compact" aria-label="Selected teaching case">
                      <LessonCasePreview casePackage={selectedCase} resolveAssetUri={resolveAssetUri} />
                      <div>
                        <span>{selectedCase.presentation.subtitle}</span>
                        <h3>{selectedCase.title}</h3>
                        <p>{selectedCase.provenance.clinicianReview.reviewed ? 'Clinician reviewed' : 'Not clinician reviewed'}</p>
                      </div>
                      <details className="lesson-builder-case-details">
                        <summary>Case details</summary>
                        <p>{selectedCase.vignette}</p>
                        <dl>
                          <div><dt>Specialty</dt><dd>{selectedCase.domain}</dd></div>
                          <div><dt>Case version</dt><dd>{selectedCase.schemaVersion}</dd></div>
                        </dl>
                      </details>
                    </aside>
                  )}
                </div>
                <Field label="Lesson title" htmlFor="lesson-title" required>
                  <input id="lesson-title" className={INPUT_CLASS} value={form.title} onChange={(event) => updateForm('title', event.target.value)} required />
                </Field>
                <fieldset className="lesson-builder-field">
                  <legend>Learner levels <span aria-hidden="true">*</span></legend>
                  <p className="lesson-builder-hint">Select every level this lesson is designed to support.</p>
                  <div className="lesson-builder-checkboxes">
                    {LEARNER_LEVELS.map((level) => (
                      <label key={level.id}>
                        <input type="checkbox" checked={form.levels.includes(level.id)} onChange={() => toggleLevel(level.id)} />
                        <span>{level.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <details className="lesson-builder-disclosure" onToggle={event => setImportExpanded(event.currentTarget.open)}>
                  <summary>Import teaching text <span>PDF or PowerPoint · optional</span></summary>
                  <LessonSourceDropzone
                    key={form.caseId}
                    onApply={applyImportedOutline}
                    parseSource={parseLessonSource}
                    disabled={busy}
                    expanded={importExpanded}
                  />
                </details>
                <Field label="Neutral case description" htmlFor="lesson-description" hint="Describe what is visible without revealing the answer." required>
                  <textarea id="lesson-description" className={INPUT_CLASS} rows={3} value={form.neutralDescription} onChange={(event) => updateForm('neutralDescription', event.target.value)} aria-describedby="lesson-description-hint" required />
                </Field>
                <Field label="Prerequisites" htmlFor="lesson-prerequisites" hint="Optional. One learner prerequisite per line.">
                  <textarea id="lesson-prerequisites" className={INPUT_CLASS} rows={2} value={form.prerequisites} onChange={(event) => updateForm('prerequisites', event.target.value)} aria-describedby="lesson-prerequisites-hint" />
                </Field>
                <details className="lesson-builder-disclosure" ref={settingsRef}>
                  <summary>Lesson settings <span>Identifier and content version</span></summary>
                  <div className="lesson-builder-field-grid">
                    <Field label="Stable lesson ID" htmlFor="lesson-id" hint="Lowercase kebab-case. Keep this ID across revisions." required>
                      <input id="lesson-id" className={INPUT_CLASS} value={form.id} onBlur={() => updateForm('id', normalizeId(form.id))} onChange={(event) => updateForm('id', event.target.value)} aria-describedby="lesson-id-hint" required />
                    </Field>
                    <Field label="Content version" htmlFor="lesson-version" hint="Use semantic versioning, such as 1.0.0." required>
                      <input id="lesson-version" className={INPUT_CLASS} value={form.version} onChange={(event) => updateForm('version', event.target.value)} aria-describedby="lesson-version-hint" required />
                    </Field>
                  </div>
                </details>
              </div>
            )}

            {step === 1 && (
              <div className="lesson-builder-section-stack">
                <p className="lesson-builder-lede">
                  Give each objective a stable ID, then define what a learner must do or say to show progress. Each rubric criterion is linked directly to its objective.
                </p>
                {form.objectives.map((objective, index) => (
                  <fieldset className="lesson-builder-repeater" key={objective.key}>
                    <legend>Objective {index + 1}</legend>
                    <div className="lesson-builder-repeater-actions">
                      <button type="button" className="lesson-builder-icon-button repeater-action" aria-label={`Move objective ${index + 1} up`} disabled={index === 0} onClick={() => moveObjective(objective.key, -1)}>
                        <ArrowUp aria-hidden="true" />
                      </button>
                      <button type="button" className="lesson-builder-icon-button repeater-action" aria-label={`Move objective ${index + 1} down`} disabled={index === form.objectives.length - 1} onClick={() => moveObjective(objective.key, 1)}>
                        <ArrowDown aria-hidden="true" />
                      </button>
                      <button type="button" className="lesson-builder-icon-button repeater-action" aria-label={`Remove objective ${index + 1}`} disabled={form.objectives.length === 1} onClick={() => removeObjective(objective.key)}>
                        <Trash2 aria-hidden="true" />
                      </button>
                    </div>
                    <div className="lesson-builder-field-grid">
                      <Field label="Objective ID" htmlFor={`objective-${objective.key}-id`} required>
                        <input id={`objective-${objective.key}-id`} className={INPUT_CLASS} value={objective.id} onBlur={() => updateObjective(objective.key, 'id', normalizeId(objective.id))} onChange={(event) => updateObjective(objective.key, 'id', event.target.value)} required />
                      </Field>
                      <Field label="Learner-facing objective" htmlFor={`objective-${objective.key}-description`} required>
                        <input id={`objective-${objective.key}-description`} className={INPUT_CLASS} value={objective.description} onChange={(event) => updateObjective(objective.key, 'description', event.target.value)} required />
                      </Field>
                    </div>
                    <Field label="Assessment criterion" htmlFor={`objective-${objective.key}-criterion`} hint="State the standard for satisfactory performance." required>
                      <textarea id={`objective-${objective.key}-criterion`} className={INPUT_CLASS} rows={3} value={objective.criterion} onChange={(event) => updateObjective(objective.key, 'criterion', event.target.value)} aria-describedby={`objective-${objective.key}-criterion-hint`} required />
                    </Field>
                    <Field label="Observable evidence" htmlFor={`objective-${objective.key}-evidence`} hint="One observable behavior, statement, or chat pattern per line." required>
                      <textarea id={`objective-${objective.key}-evidence`} className={INPUT_CLASS} rows={4} value={objective.evidence} onChange={(event) => updateObjective(objective.key, 'evidence', event.target.value)} aria-describedby={`objective-${objective.key}-evidence-hint`} required />
                    </Field>
                  </fieldset>
                ))}
                <button type="button" className="lesson-builder-button secondary add" onClick={addObjective}><Plus aria-hidden="true" /> Add objective</button>
              </div>
            )}

            {step === 2 && (
              <div className="lesson-builder-section-stack">
                <div className="lesson-builder-info-card">
                  <BookOpen aria-hidden="true" />
                  <p>The fixed public safety policy always has higher authority. These fields control teaching behavior only.</p>
                </div>
                <Field label="Socratic opening" htmlFor="lesson-opening" hint="Write the first focused question the learner receives." required>
                  <textarea id="lesson-opening" className={INPUT_CLASS} rows={3} value={form.socraticOpening} onChange={(event) => updateForm('socraticOpening', event.target.value)} aria-describedby="lesson-opening-hint" required />
                </Field>

                <section className="lesson-builder-subsection" aria-labelledby="hints-heading">
                  <div className="lesson-builder-subsection-heading"><div><h3 id="hints-heading">Allowed hints</h3><p>Hints are explicit and linked to an objective.</p></div><button type="button" className="lesson-builder-button secondary compact" onClick={addHint}><Plus aria-hidden="true" /> Add hint</button></div>
                  {form.hints.map((hint, index) => (
                    <div className="lesson-builder-inline-row" key={hint.key}>
                      <Field label={`Hint ${index + 1} ID`} htmlFor={`hint-${hint.key}-id`} required>
                        <input id={`hint-${hint.key}-id`} className={INPUT_CLASS} value={hint.id} onChange={(event) => updateForm('hints', form.hints.map((row) => row.key === hint.key ? { ...row, id: event.target.value } : row))} required />
                      </Field>
                      <Field label="Linked objective" htmlFor={`hint-${hint.key}-objective`} required>
                        <select id={`hint-${hint.key}-objective`} className={INPUT_CLASS} value={hint.objectiveId} onChange={(event) => updateForm('hints', form.hints.map((row) => row.key === hint.key ? { ...row, objectiveId: event.target.value } : row))} required>
                          <option value="">Choose an objective</option>
                          {form.objectives.map((objective) => <option key={objective.key} value={objective.id}>{objective.id || `Objective ${objective.key}`}</option>)}
                        </select>
                      </Field>
                      <Field label="Hint text" htmlFor={`hint-${hint.key}-text`} required>
                        <textarea id={`hint-${hint.key}-text`} className={INPUT_CLASS} rows={2} value={hint.text} onChange={(event) => updateForm('hints', form.hints.map((row) => row.key === hint.key ? { ...row, text: event.target.value } : row))} required />
                      </Field>
                      <button type="button" className="lesson-builder-icon-button inline" aria-label={`Remove hint ${index + 1}`} onClick={() => updateForm('hints', form.hints.filter((row) => row.key !== hint.key))}><Trash2 aria-hidden="true" /></button>
                    </div>
                  ))}
                </section>

                <section className="lesson-builder-subsection" aria-labelledby="escalation-heading">
                  <div className="lesson-builder-subsection-heading"><div><h3 id="escalation-heading">Escalation conditions</h3><p>Define when the tutor may become more explicit.</p></div><button type="button" className="lesson-builder-button secondary compact" onClick={addEscalation}><Plus aria-hidden="true" /> Add escalation</button></div>
                  {form.escalations.map((condition, index) => (
                    <div className="lesson-builder-inline-row conditions" key={condition.key}>
                      <Field label={`Escalation ${index + 1} ID`} htmlFor={`escalation-${condition.key}-id`} required><input id={`escalation-${condition.key}-id`} className={INPUT_CLASS} value={condition.id} onChange={(event) => updateForm('escalations', form.escalations.map((row) => row.key === condition.key ? { ...row, id: event.target.value } : row))} required /></Field>
                      <Field label="When" htmlFor={`escalation-${condition.key}-when`} required><textarea id={`escalation-${condition.key}-when`} className={INPUT_CLASS} rows={2} value={condition.when} onChange={(event) => updateForm('escalations', form.escalations.map((row) => row.key === condition.key ? { ...row, when: event.target.value } : row))} required /></Field>
                      <Field label="Tutor action" htmlFor={`escalation-${condition.key}-action`} required><textarea id={`escalation-${condition.key}-action`} className={INPUT_CLASS} rows={2} value={condition.action} onChange={(event) => updateForm('escalations', form.escalations.map((row) => row.key === condition.key ? { ...row, action: event.target.value } : row))} required /></Field>
                      <button type="button" className="lesson-builder-icon-button inline" aria-label={`Remove escalation ${index + 1}`} onClick={() => updateForm('escalations', form.escalations.filter((row) => row.key !== condition.key))}><Trash2 aria-hidden="true" /></button>
                    </div>
                  ))}
                </section>

                <section className="lesson-builder-subsection" aria-labelledby="stopping-heading">
                  <div className="lesson-builder-subsection-heading"><div><h3 id="stopping-heading">Stopping conditions</h3><p>Define when the tutor should stop and what it should say.</p></div><button type="button" className="lesson-builder-button secondary compact" onClick={addStopping}><Plus aria-hidden="true" /> Add condition</button></div>
                  {form.stopping.map((condition, index) => (
                    <div className="lesson-builder-inline-row conditions" key={condition.key}>
                      <Field label={`Stopping ${index + 1} ID`} htmlFor={`stopping-${condition.key}-id`} required><input id={`stopping-${condition.key}-id`} className={INPUT_CLASS} value={condition.id} onChange={(event) => updateForm('stopping', form.stopping.map((row) => row.key === condition.key ? { ...row, id: event.target.value } : row))} required /></Field>
                      <Field label="When" htmlFor={`stopping-${condition.key}-when`} required><textarea id={`stopping-${condition.key}-when`} className={INPUT_CLASS} rows={2} value={condition.when} onChange={(event) => updateForm('stopping', form.stopping.map((row) => row.key === condition.key ? { ...row, when: event.target.value } : row))} required /></Field>
                      <Field label="Learner message" htmlFor={`stopping-${condition.key}-message`} required><textarea id={`stopping-${condition.key}-message`} className={INPUT_CLASS} rows={2} value={condition.message} onChange={(event) => updateForm('stopping', form.stopping.map((row) => row.key === condition.key ? { ...row, message: event.target.value } : row))} required /></Field>
                      <button type="button" className="lesson-builder-icon-button inline" aria-label={`Remove stopping condition ${index + 1}`} onClick={() => updateForm('stopping', form.stopping.filter((row) => row.key !== condition.key))}><Trash2 aria-hidden="true" /></button>
                    </div>
                  ))}
                </section>

                <Field label="Educator tutor instructions" htmlFor="lesson-tutor-instructions" hint="Describe tone, sequence, learner agency, and what the tutor should avoid." required>
                  <textarea id="lesson-tutor-instructions" className={INPUT_CLASS} rows={5} value={form.tutorInstructions} onChange={(event) => updateForm('tutorInstructions', event.target.value)} aria-describedby="lesson-tutor-instructions-hint" required />
                </Field>
                <Field label="Answer-revealing teaching notes" htmlFor="lesson-answer-notes" hint="One note per line. These notes are exported and sent to the model, but are not shown as the neutral case description." required>
                  <textarea id="lesson-answer-notes" className={INPUT_CLASS} rows={5} value={form.answerNotes} onChange={(event) => updateForm('answerNotes', event.target.value)} aria-describedby="lesson-answer-notes-hint" required />
                </Field>
              </div>
            )}

            {step === 3 && (
              <div className="lesson-builder-section-stack">
                <div className="lesson-builder-info-card">
                  <ShieldCheck aria-hidden="true" />
                  <p>Record review truthfully. CaseAttend stores the state you enter but does not verify a reviewer or make a lesson IRB approved. Artifact provenance identifies the case image but does not support clinical teaching claims.</p>
                </div>
                <section className="lesson-builder-subsection" aria-labelledby="sources-heading">
                  <div className="lesson-builder-subsection-heading"><div><h3 id="sources-heading">Verifiable sources</h3><p>Use an HTTPS source URL, a DOI, or both.</p></div><button type="button" className="lesson-builder-button secondary compact" onClick={addCitation}><Plus aria-hidden="true" /> Add source</button></div>
                  {form.citations.map((citation, index) => (
                    <fieldset className="lesson-builder-repeater citation" key={citation.key}>
                      <legend>Source {index + 1}</legend>
                      <button type="button" className="lesson-builder-icon-button" aria-label={`Remove source ${index + 1}`} disabled={form.citations.length === 1} onClick={() => updateForm('citations', form.citations.filter((row) => row.key !== citation.key))}><Trash2 aria-hidden="true" /></button>
                      <div className="lesson-builder-field-grid">
                        <Field label="Source ID" htmlFor={`source-${citation.key}-id`} required><input id={`source-${citation.key}-id`} className={INPUT_CLASS} value={citation.id} onChange={(event) => updateForm('citations', form.citations.map((row) => row.key === citation.key ? { ...row, id: event.target.value } : row))} required /></Field>
                        <Field label="Source title" htmlFor={`source-${citation.key}-title`} required><input id={`source-${citation.key}-title`} className={INPUT_CLASS} value={citation.title} onChange={(event) => updateForm('citations', form.citations.map((row) => row.key === citation.key ? { ...row, title: event.target.value } : row))} required /></Field>
                        <Field label="Source role" htmlFor={`source-${citation.key}-scope`} hint="Artifact provenance identifies the image. Clinical teaching sources support educational claims." required>
                          <select id={`source-${citation.key}-scope`} className={INPUT_CLASS} value={citation.scope} onChange={(event) => updateForm('citations', form.citations.map((row) => row.key === citation.key ? { ...row, scope: event.target.value as CitationRow['scope'] } : row))} aria-describedby={`source-${citation.key}-scope-hint`} required>
                            <option value="artifact-provenance">Artifact provenance</option>
                            <option value="clinical-teaching">Clinical teaching</option>
                          </select>
                        </Field>
                        <Field label="HTTPS URL" htmlFor={`source-${citation.key}-url`}><input id={`source-${citation.key}-url`} className={INPUT_CLASS} type="url" inputMode="url" placeholder="https://" value={citation.url} onChange={(event) => updateForm('citations', form.citations.map((row) => row.key === citation.key ? { ...row, url: event.target.value } : row))} /></Field>
                        <Field label="DOI" htmlFor={`source-${citation.key}-doi`} hint="Example: 10.1000/example"><input id={`source-${citation.key}-doi`} className={INPUT_CLASS} value={citation.doi} onChange={(event) => updateForm('citations', form.citations.map((row) => row.key === citation.key ? { ...row, doi: event.target.value } : row))} aria-describedby={`source-${citation.key}-doi-hint`} /></Field>
                      </div>
                    </fieldset>
                  ))}
                </section>

                <fieldset className="lesson-builder-review-card">
                  <legend>Clinical content review</legend>
                  <label className="lesson-builder-review-toggle">
                    <input type="checkbox" checked={form.reviewed} onChange={(event) => updateForm('reviewed', event.target.checked)} />
                    <span><strong>Reviewed by a qualified clinician</strong><small>Leave this off unless review has actually occurred.</small></span>
                  </label>
                  {form.reviewed && (
                    <div className="lesson-builder-field-grid review-fields">
                      <Field label="Reviewer name" htmlFor="reviewer-name" required><input id="reviewer-name" className={INPUT_CLASS} value={form.reviewer} onChange={(event) => updateForm('reviewer', event.target.value)} required /></Field>
                      <Field label="Credentials" htmlFor="reviewer-credentials" required><input id="reviewer-credentials" className={INPUT_CLASS} value={form.credentials} onChange={(event) => updateForm('credentials', event.target.value)} required /></Field>
                      <Field label="Review date and time" htmlFor="reviewed-at" required><input id="reviewed-at" className={INPUT_CLASS} type="datetime-local" step="0.001" value={form.reviewedAt} onChange={(event) => updateForm('reviewedAt', event.target.value)} required /></Field>
                    </div>
                  )}
                </fieldset>
              </div>
            )}

            {step === 4 && (
              <div className="lesson-builder-section-stack">
                <div className="lesson-builder-review-hero">
                  <div className="lesson-builder-review-icon"><FileJson aria-hidden="true" /></div>
                  <div>
                    <p className="lesson-builder-eyebrow">Case plus lesson bundle</p>
                    <h3>{finalized ? (finalized.lessonPlan.clinicalReview.reviewed ? 'Clinically reviewed lesson ready to export' : 'Validated draft ready to export') : 'Complete validation to export'}</h3>
                    <p>The export links this exact Lesson Plan hash from a newly hashed Case Package.</p>
                  </div>
                  {finalized && <span className="lesson-builder-ready"><Check aria-hidden="true" /> {finalized.lessonPlan.clinicalReview.reviewed ? 'Reviewed' : 'Draft'}</span>}
                </div>

                {finalized ? (
                  <>
                    <dl className="lesson-builder-manifest-grid">
                      <div><dt>Lesson ID</dt><dd>{finalized.lessonPlan.id}</dd></div>
                      <div><dt>Content version</dt><dd>{finalized.lessonPlan.version}</dd></div>
                      <div><dt>Lesson SHA-256</dt><dd>{finalized.lessonPlan.manifest.sha256}</dd></div>
                      <div><dt>Linked case SHA-256</dt><dd>{finalized.casePackage.manifest.sha256}</dd></div>
                      <div><dt>Review state</dt><dd>{finalized.lessonPlan.clinicalReview.reviewed ? 'Clinician reviewed' : 'Not clinician reviewed'}</dd></div>
                      <div><dt>Learner levels</dt><dd>{finalized.lessonPlan.learner.levels.join(', ')}</dd></div>
                    </dl>

                    <section className="lesson-builder-prompt-preview" aria-labelledby="prompt-preview-heading">
                      <div className="lesson-builder-subsection-heading">
                        <div><h3 id="prompt-preview-heading">Exact prompt preview</h3><p>Authority is separated so educator content cannot masquerade as fixed policy.</p></div>
                      </div>
                      <div className="lesson-builder-prompt-grid">
                        <article>
                          <header><LockKeyhole aria-hidden="true" /><div><strong>Fixed by CaseAttend</strong><span>Locked public safety policy</span></div></header>
                          <pre>{finalized.prompt.fixedSafetyPolicy.content}</pre>
                        </article>
                        <article>
                          <header><BookOpen aria-hidden="true" /><div><strong>Educator controlled</strong><span>Versioned lesson content</span></div></header>
                          <pre>{finalized.prompt.educatorControlledContent.content}</pre>
                        </article>
                      </div>
                      <details>
                        <summary>Runtime case context used for this preview</summary>
                        <pre>{finalized.prompt.runtimeContext.content}</pre>
                      </details>
                    </section>

                    <div className="lesson-builder-export-card">
                      <div><Download aria-hidden="true" /><div><h3>{finalized.casePackage.preview.src.startsWith('case://assets/') && exportPortableCase ? 'Download portable case' : 'Download JSON bundle'}</h3><p>{finalized.lessonPlan.clinicalReview.reviewed ? 'Includes the clinically reviewed lesson, case, sources, versions, and hashes.' : 'Draft export. Includes the unreviewed lesson, case, sources, answer notes, versions, and hashes.'} Nothing is uploaded.</p></div></div>
                      <button type="button" className="lesson-builder-button primary" onClick={() => void downloadBundle()}><Download aria-hidden="true" /> {finalized.casePackage.preview.src.startsWith('case://assets/') && exportPortableCase ? 'Export portable case' : 'Export JSON bundle'}</button>
                    </div>
                  </>
                ) : (
                  <div className="lesson-builder-empty-review">
                    <p>Fix any validation errors, then prepare the deterministic hashes and prompt preview.</p>
                    <button type="button" className="lesson-builder-button primary" disabled={busy} onClick={() => void finalize()}>{busy ? 'Validating...' : 'Validate lesson'}</button>
                  </div>
                )}
                <p className="lesson-builder-status" aria-live="polite">{statusMessage}</p>
              </div>
            )}

            <div className="lesson-builder-actions">
              <button type="button" className="lesson-builder-button secondary" disabled={step === 0} onClick={() => chooseStep(Math.max(0, step - 1))}><ChevronLeft aria-hidden="true" /> Back</button>
              {step < STEPS.length - 1 ? (
                <button type="button" className="lesson-builder-button primary" onClick={() => void goNext()}>
                  {step === STEPS.length - 2 ? 'Review lesson' : `Next: ${STEPS[step + 1].short.toLocaleLowerCase('en-US')}`}
                  <ChevronRight aria-hidden="true" />
                </button>
              ) : (
                <button type="button" className="lesson-builder-button secondary" onClick={onExit}>Done</button>
              )}
            </div>
          </form>
        </section>
      </div>
      <span className="sr-only" aria-live="polite">{busy ? 'Validating lesson' : ''}</span>
    </main>
  );
};

export default LessonBuilder;
