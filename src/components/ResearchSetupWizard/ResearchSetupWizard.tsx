import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FlaskConical,
  LockKeyhole,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import type { LearnerLevel } from '../../constants';
import type { ResearchStudyBundleV1 } from '../../core/researchStudyBundle';
import './ResearchSetupWizard.css';

export interface ResearchMaterialOption {
  key: string;
  title: string;
  domain: string;
  caseRef: {
    id: string;
    schemaVersion: string;
    sha256: string;
  };
  lessonRef: {
    id: string;
    version: string;
    sha256: string;
  };
  snapshotBehavior?: 'reuse-exact-portable' | 'reencode-built-in';
}

export interface ResearchArmDraft {
  id: string;
  label: string;
  allocationWeight: number;
  providerId: string;
  providerPolicyUrl: string;
  model: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  historyWindowMessages: number;
  learnerLevel: LearnerLevel;
  mode: 'chat' | 'deep_think';
  allowAnnotations: boolean;
}

export interface ResearchTaskOptionDraft {
  id: string;
  label: string;
}

export interface ResearchTaskDraft {
  id: string;
  phase: 'pre' | 'post';
  title: string;
  instructions: string;
  responseKind: 'none' | 'single-choice' | 'integer-scale';
  options: readonly ResearchTaskOptionDraft[];
  min: number;
  max: number;
  minLabel: string;
  maxLabel: string;
}

export interface ResearchSetupDraft {
  id: string;
  version: string;
  title: string;
  protocolDesign: 'exploratory' | 'confirmatory';
  purpose: string;
  population: string;
  includesMinors: boolean;
  vulnerableGroups: string;
  hypotheses: string;
  objectives: string;
  outcomes: string;
  deploymentOperatorName: string;
  deploymentPrivacyPolicyUrl: string;
  materialKey: string;
  assignment: 'fixed' | 'sha256-weighted-v1';
  fixedArmId: string;
  arms: readonly ResearchArmDraft[];
  /** Legacy v1 textarea retained only so previously saved working drafts migrate safely. */
  tasks: string;
  structuredTasks?: readonly ResearchTaskDraft[];
  participantKeyInformation: string;
  participantPurpose: string;
  participantProcedures: string;
  participantRisks: string;
  participantBenefits: string;
  participantPrivacy: string;
  participantVoluntaryParticipation: string;
  participantCompensation: string;
  contactName: string;
  contactRole: string;
  contactEmail: string;
  rawChatEnabled: boolean;
  rawChatJustification: string;
  rawChatIncludesLearnerText: boolean;
  rawChatIncludesModelText: boolean;
  rawChatParticipantDisclosure: string;
  browserDeleteAfter: string;
  exportedCopiesDeleteAfter: string;
  deletionProcedure: string;
  accessRoles: string;
  providerReviewConfirmed: boolean;
  dataFlowReviewConfirmed: boolean;
  oversight: {
    status: 'draft' | 'institution-determined';
    determination: 'approved' | 'exempt' | 'not-human-subjects-research';
    institutionName: string;
    protocolReference: string;
    determinedAt: string;
  };
}

export interface FrozenResearchSetup {
  id: string;
  version: string;
  sha256: string;
  frozenAt: string;
  draft: ResearchSetupDraft;
  bundle: ResearchStudyBundleV1;
  /** Core launch-readiness errors. Empty means the frozen bundle itself is launch-ready. */
  launchErrors: readonly string[];
}

export interface ResearchSetupStorageStatus {
  persistent: boolean;
  launchAllowed: boolean;
  message: string;
}

export interface ResearchSetupWizardProps {
  materials: readonly ResearchMaterialOption[];
  storageStatus: ResearchSetupStorageStatus;
  initialDraft?: ResearchSetupDraft;
  onExit: () => void;
  onSaveDraft: (draft: ResearchSetupDraft) => Promise<void>;
  onExportSupportPacket: (
    draft: ResearchSetupDraft,
    frozen?: FrozenResearchSetup,
  ) => Promise<void>;
  onFreeze: (draft: ResearchSetupDraft) => Promise<FrozenResearchSetup>;
  onLaunchParticipant: (frozen: FrozenResearchSetup) => void;
}

const STEPS = [
  { short: 'Purpose', title: 'Define the research question' },
  { short: 'Materials', title: 'Pin exact teaching materials' },
  { short: 'Design', title: 'Set arms and assignment' },
  { short: 'Model and tasks', title: 'Record inference and task policy' },
  { short: 'Data', title: 'Minimize participant data' },
  { short: 'Review', title: 'Review, freeze, and export' },
] as const;

const KEBAB_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const MAX_UI_TASKS_PER_PHASE = 16;

function isHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function lines(value: string): string[] {
  return value.split('\n').map((line) => line.trim()).filter(Boolean);
}

function newArm(index: number): ResearchArmDraft {
  return {
    id: `arm-${index + 1}`,
    label: index === 0 ? 'Configured tutor' : `Study arm ${index + 1}`,
    allocationWeight: 1,
    providerId: '',
    providerPolicyUrl: '',
    model: '',
    temperature: 0.2,
    topP: 1,
    maxTokens: 2048,
    historyWindowMessages: 12,
    learnerLevel: 'ms_preclinical',
    mode: 'chat',
    allowAnnotations: true,
  };
}

function newTask(phase: 'pre' | 'post', index: number): ResearchTaskDraft {
  return {
    id: `${phase}-task-${index + 1}`,
    phase,
    title: '',
    instructions: '',
    responseKind: 'none',
    options: [],
    min: 1,
    max: 5,
    minLabel: 'Low',
    maxLabel: 'High',
  };
}

export function getResearchSetupTaskDrafts(draft: ResearchSetupDraft): readonly ResearchTaskDraft[] {
  if (draft.structuredTasks && draft.structuredTasks.length > 0) {
    return draft.structuredTasks.map((task) => ({
      ...task,
      options: task.options.map((option) => ({ ...option })),
    }));
  }
  return lines(draft.tasks).map((instructions, index) => ({
    ...newTask('pre', index),
    id: `pre-task-${index + 1}`,
    title: instructions.slice(0, 256),
    instructions,
  }));
}

export function createInitialResearchSetupDraft(
  materialKey = '',
): ResearchSetupDraft {
  return {
    id: '',
    version: '1.0.0',
    title: '',
    protocolDesign: 'exploratory',
    purpose: '',
    population: '',
    includesMinors: false,
    vulnerableGroups: '',
    hypotheses: '',
    objectives: '',
    outcomes: '',
    deploymentOperatorName: '',
    deploymentPrivacyPolicyUrl: '',
    materialKey,
    assignment: 'fixed',
    fixedArmId: 'arm-1',
    arms: [newArm(0)],
    tasks: '',
    structuredTasks: [],
    participantKeyInformation: '',
    participantPurpose: '',
    participantProcedures: '',
    participantRisks: '',
    participantBenefits: '',
    participantPrivacy: '',
    participantVoluntaryParticipation: '',
    participantCompensation: '',
    contactName: '',
    contactRole: '',
    contactEmail: '',
    rawChatEnabled: false,
    rawChatJustification: '',
    rawChatIncludesLearnerText: true,
    rawChatIncludesModelText: true,
    rawChatParticipantDisclosure: '',
    browserDeleteAfter: '',
    exportedCopiesDeleteAfter: '',
    deletionProcedure: '',
    accessRoles: '',
    providerReviewConfirmed: false,
    dataFlowReviewConfirmed: false,
    oversight: {
      status: 'draft',
      determination: 'approved',
      institutionName: '',
      protocolReference: '',
      determinedAt: '',
    },
  };
}

function cloneDraft(draft: ResearchSetupDraft): ResearchSetupDraft {
  return {
    ...draft,
    arms: draft.arms.map((arm) => ({ ...arm })),
    structuredTasks: getResearchSetupTaskDrafts(draft),
    oversight: { ...draft.oversight },
  };
}

function validateStep(
  step: number,
  draft: ResearchSetupDraft,
  materials: readonly ResearchMaterialOption[],
): string[] {
  const errors: string[] = [];
  if (step === 0) {
    if (!draft.id.trim()) errors.push('Enter a stable study ID.');
    else if (!KEBAB_ID.test(draft.id.trim())) errors.push('Study ID must use lowercase kebab-case.');
    if (!SEMVER.test(draft.version.trim())) errors.push('Study version must use three-part SemVer, for example 1.0.0.');
    if (!draft.title.trim()) errors.push('Enter a study title.');
    if (!draft.purpose.trim()) errors.push('Describe the study purpose.');
    if (!draft.population.trim()) errors.push('Describe the intended participant population.');
    if (draft.protocolDesign === 'confirmatory' && lines(draft.hypotheses).length === 0) errors.push('A confirmatory study needs at least one hypothesis.');
    if (lines(draft.objectives).length === 0) errors.push('Add at least one learning objective.');
    if (lines(draft.outcomes).length === 0) errors.push('Add at least one outcome measure.');
    if (!draft.deploymentOperatorName.trim()) errors.push('Record the deployment operator name.');
    if (!draft.deploymentPrivacyPolicyUrl.trim() || !isHttpsUrl(draft.deploymentPrivacyPolicyUrl)) {
      errors.push('Add the deployment operator\'s HTTPS privacy-policy URL.');
    }
  }
  if (step === 1) {
    if (!draft.materialKey) errors.push('Select an exact Case Package and Lesson Plan bundle.');
    else if (!materials.some((entry) => entry.key === draft.materialKey)) {
      errors.push('The selected case and lesson bundle is no longer available. Select it again.');
    }
  }
  if (step === 2) {
    if (draft.arms.length === 0) errors.push('Add at least one study arm.');
    const seen = new Set<string>();
    draft.arms.forEach((arm, index) => {
      const label = `Arm ${index + 1}`;
      if (!arm.id.trim() || !KEBAB_ID.test(arm.id.trim())) errors.push(`${label} needs a lowercase kebab-case ID.`);
      else if (seen.has(arm.id.trim())) errors.push(`Arm ID '${arm.id.trim()}' is duplicated.`);
      seen.add(arm.id.trim());
      if (!arm.label.trim()) errors.push(`${label} needs a participant-neutral label.`);
      if (!Number.isInteger(arm.allocationWeight) || arm.allocationWeight < 1 || arm.allocationWeight > 1000) {
        errors.push(`${label} allocation weight must be an integer from 1 to 1000.`);
      }
    });
    if (draft.assignment === 'sha256-weighted-v1' && draft.arms.length < 2) {
      errors.push('SHA-256 weighted assignment requires at least two arms.');
    }
    if (draft.assignment === 'fixed' && !draft.arms.some((arm) => arm.id === draft.fixedArmId)) {
      errors.push('Select the fixed study arm.');
    }
  }
  if (step === 3) {
    draft.arms.forEach((arm, index) => {
      const label = `Arm ${index + 1}`;
      if (!arm.providerId.trim()) errors.push(`${label} needs one exact upstream provider identifier.`);
      if (!arm.providerPolicyUrl.trim() || !isHttpsUrl(arm.providerPolicyUrl)) errors.push(`${label} needs the upstream provider's HTTPS data or privacy policy URL.`);
      if (!arm.model.trim()) errors.push(`${label} needs an exact model identifier.`);
      if (!Number.isFinite(arm.temperature) || arm.temperature < 0 || arm.temperature > 2) {
        errors.push(`${label} temperature must be between 0 and 2.`);
      }
      if (!Number.isFinite(arm.topP) || arm.topP < 0 || arm.topP > 1) errors.push(`${label} top P must be between 0 and 1.`);
      if (!Number.isInteger(arm.maxTokens) || arm.maxTokens < 1 || arm.maxTokens > 32768) errors.push(`${label} max tokens must be an integer from 1 to 32768.`);
      if (!Number.isInteger(arm.historyWindowMessages) || arm.historyWindowMessages < 0 || arm.historyWindowMessages > 100) errors.push(`${label} history window must be an integer from 0 to 100 messages.`);
    });
    const tasks = getResearchSetupTaskDrafts(draft);
    if (tasks.length === 0) errors.push('Add at least one pre-activity or post-activity participant task.');
    (['pre', 'post'] as const).forEach((phase) => {
      if (tasks.filter((task) => task.phase === phase).length > MAX_UI_TASKS_PER_PHASE) {
        errors.push(`Research Setup supports up to ${MAX_UI_TASKS_PER_PHASE} ${phase}-activity tasks. Use a new protocol version or the SDK for a larger instrument.`);
      }
    });
    const taskIds = new Set<string>();
    tasks.forEach((task, taskIndex) => {
      const label = `Task ${taskIndex + 1}`;
      if (!task.id.trim() || !KEBAB_ID.test(task.id.trim())) errors.push(`${label} needs a lowercase kebab-case ID.`);
      else if (taskIds.has(task.id.trim())) errors.push(`Task ID '${task.id.trim()}' is duplicated across pre and post tasks.`);
      taskIds.add(task.id.trim());
      if (!task.title.trim()) errors.push(`${label} needs a short title.`);
      if (!task.instructions.trim()) errors.push(`${label} needs participant instructions.`);
      if (task.responseKind === 'single-choice') {
        if (task.options.length < 2 || task.options.length > 20) errors.push(`${label} needs 2 to 20 answer choices.`);
        const optionIds = new Set<string>();
        task.options.forEach((option, optionIndex) => {
          if (!option.id.trim() || !KEBAB_ID.test(option.id.trim())) errors.push(`${label}, choice ${optionIndex + 1} needs a lowercase kebab-case ID.`);
          else if (optionIds.has(option.id.trim())) errors.push(`${label} choice ID '${option.id.trim()}' is duplicated.`);
          optionIds.add(option.id.trim());
          if (!option.label.trim()) errors.push(`${label}, choice ${optionIndex + 1} needs a label.`);
        });
      }
      if (task.responseKind === 'integer-scale') {
        if (!Number.isInteger(task.min) || !Number.isInteger(task.max) || task.min >= task.max || task.min < -1000 || task.max > 1000) {
          errors.push(`${label} integer scale needs whole-number bounds from -1000 to 1000 with minimum below maximum.`);
        } else if (task.max - task.min > 100) {
          errors.push(`${label} integer scale cannot span more than 100 integer response values.`);
        }
        if (!task.minLabel.trim() || !task.maxLabel.trim()) errors.push(`${label} integer scale needs labels for both endpoints.`);
      }
    });
  }
  if (step === 4) {
    if (!draft.participantKeyInformation.trim()) errors.push('Add the participant key information.');
    if (!draft.participantPurpose.trim()) errors.push('Describe the study purpose in participant-facing language.');
    if (!draft.participantProcedures.trim()) errors.push('Describe participant procedures.');
    if (!draft.participantRisks.trim()) errors.push('Describe reasonably foreseeable risks.');
    if (!draft.participantBenefits.trim()) errors.push('Describe expected benefits or state that there may be no direct benefit.');
    if (!draft.participantPrivacy.trim()) errors.push('Describe participant privacy and confidentiality limits.');
    if (!draft.participantVoluntaryParticipation.trim()) errors.push('Describe voluntary participation and exit or withdrawal limits.');
    if (!draft.participantCompensation.trim()) errors.push('Describe compensation or state that there is none.');
    if (!draft.contactName.trim() || !draft.contactRole.trim()) errors.push('Add an approved study contact name and role.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.contactEmail.trim())) errors.push('Add a valid approved study contact email.');
    if (draft.rawChatEnabled && !draft.rawChatJustification.trim()) {
      errors.push('Explain why raw conversation content is necessary for a stated outcome.');
    }
    if (draft.rawChatEnabled && !draft.rawChatIncludesLearnerText && !draft.rawChatIncludesModelText) {
      errors.push('Select learner text, model text, or both for enabled raw-chat collection.');
    }
    if (draft.rawChatEnabled && !draft.rawChatParticipantDisclosure.trim()) errors.push('Add the exact participant disclosure for raw-chat collection.');
    const browserDelete = Date.parse(draft.browserDeleteAfter);
    const exportedDelete = Date.parse(draft.exportedCopiesDeleteAfter);
    if (!draft.browserDeleteAfter || Number.isNaN(browserDelete)) errors.push('Set an absolute browser-record deletion date and time.');
    if (!draft.exportedCopiesDeleteAfter || Number.isNaN(exportedDelete)) errors.push('Set an absolute deletion date and time for exported copies.');
    if (!Number.isNaN(browserDelete) && !Number.isNaN(exportedDelete) && exportedDelete < browserDelete) errors.push('Exported copies cannot have an earlier deletion date than browser records.');
    if (!draft.deletionProcedure.trim()) errors.push('Describe the deletion procedure and its limits.');
    if (lines(draft.accessRoles).length === 0) errors.push('List the roles allowed to access or export research data.');
  }
  if (step === 5) {
    if (!draft.providerReviewConfirmed) errors.push('Complete the provider terms and data-practices review before freezing.');
    if (!draft.dataFlowReviewConfirmed) errors.push('Complete the deployed data-flow review before freezing.');
    if (draft.oversight.status === 'institution-determined') {
      if (!draft.oversight.institutionName.trim()) errors.push('Record the institution name.');
      if (!draft.oversight.protocolReference.trim()) errors.push('Record the external institutional determination reference.');
      if (!draft.oversight.determinedAt || Number.isNaN(Date.parse(draft.oversight.determinedAt))) errors.push('Record the external determination date and time.');
    }
  }
  return errors;
}

function allErrors(
  draft: ResearchSetupDraft,
  materials: readonly ResearchMaterialOption[],
): string[] {
  return STEPS.flatMap((_, index) => validateStep(index, draft, materials));
}

function validatedDraftErrors(
  draft: ResearchSetupDraft,
  materials: readonly ResearchMaterialOption[],
): string[] {
  const errors = STEPS.slice(0, 5).flatMap((_, index) => validateStep(index, draft, materials));
  if (draft.oversight.status === 'institution-determined') {
    if (!draft.oversight.institutionName.trim()) errors.push('Record the institution name.');
    if (!draft.oversight.protocolReference.trim()) errors.push('Record the external institutional determination reference.');
    if (!draft.oversight.determinedAt || Number.isNaN(Date.parse(draft.oversight.determinedAt))) errors.push('Record the external determination date and time.');
  }
  return errors;
}

const Field: React.FC<{
  label: string;
  htmlFor: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}> = ({ label, htmlFor, hint, required, children }) => (
  <div className="research-field">
    <label htmlFor={htmlFor}>{label}{required && <span aria-hidden="true"> *</span>}</label>
    {hint && <p className="research-field-hint" id={`${htmlFor}-hint`}>{hint}</p>}
    {children}
  </div>
);

const ResearchSetupWizard: React.FC<ResearchSetupWizardProps> = ({
  materials,
  storageStatus,
  initialDraft,
  onExit,
  onSaveDraft,
  onExportSupportPacket,
  onFreeze,
  onLaunchParticipant,
}) => {
  const initial = useMemo(
    () => cloneDraft(initialDraft ?? createInitialResearchSetupDraft(materials[0]?.key ?? '')),
    [initialDraft, materials],
  );
  const [draft, setDraft] = useState<ResearchSetupDraft>(initial);
  const [step, setStep] = useState(0);
  const [highestStep, setHighestStep] = useState(0);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [status, setStatus] = useState('');
  const [busyLabel, setBusyLabel] = useState('');
  const [frozen, setFrozen] = useState<FrozenResearchSetup | null>(null);
  const [savedSignature, setSavedSignature] = useState(JSON.stringify(initial));
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);
  useEffect(() => { headingRef.current?.focus(); }, [step]);
  useEffect(() => { if (errors.length > 0) errorRef.current?.focus(); }, [errors]);

  const busy = Boolean(busyLabel);
  const dirty = !frozen && JSON.stringify(draft) !== savedSignature;

  useEffect(() => {
    if (!dirty && !busy) return undefined;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy, dirty]);

  const requestExit = () => {
    if (busy) return;
    if (dirty && !window.confirm('Leave Research Setup? Unsaved protocol changes will be lost. Stay to save a draft or export the support packet.')) return;
    onExit();
  };

  const updateDraft = (
    update: (current: ResearchSetupDraft) => ResearchSetupDraft,
    reset: 'none' | 'provider' | 'data-flow' | 'both' = 'none',
  ) => {
    setDraft((current) => {
      let next = update(current);
      if (reset === 'provider' || reset === 'both') next = { ...next, providerReviewConfirmed: false };
      if (reset === 'data-flow' || reset === 'both') next = { ...next, dataFlowReviewConfirmed: false };
      return next;
    });
    setFrozen(null);
    setErrors([]);
    setStatus(reset === 'none' ? '' : 'Configuration changed. Complete the affected review again before freezing.');
  };

  const updateField = <K extends keyof ResearchSetupDraft>(
    key: K,
    value: ResearchSetupDraft[K],
    reset: 'none' | 'provider' | 'data-flow' | 'both' = 'none',
  ) => updateDraft((current) => ({ ...current, [key]: value }), reset);

  const updateArm = <K extends keyof ResearchArmDraft>(
    index: number,
    key: K,
    value: ResearchArmDraft[K],
  ) => updateDraft((current) => ({
    ...current,
    arms: current.arms.map((arm, armIndex) => armIndex === index ? { ...arm, [key]: value } : arm),
  }), 'both');

  const updateTask = <K extends keyof ResearchTaskDraft>(
    index: number,
    key: K,
    value: ResearchTaskDraft[K],
  ) => updateDraft((current) => ({
    ...current,
    tasks: '',
    structuredTasks: getResearchSetupTaskDrafts(current).map((task, taskIndex) => (
      taskIndex === index ? { ...task, [key]: value } : task
    )),
  }), 'data-flow');

  const addTask = (phase: 'pre' | 'post') => updateDraft((current) => {
    const tasks = getResearchSetupTaskDrafts(current);
    const phaseCount = tasks.filter((task) => task.phase === phase).length;
    if (phaseCount >= MAX_UI_TASKS_PER_PHASE) return current;
    return { ...current, tasks: '', structuredTasks: [...tasks, newTask(phase, phaseCount)] };
  }, 'data-flow');

  const removeTask = (index: number) => updateDraft((current) => ({
    ...current,
    tasks: '',
    structuredTasks: getResearchSetupTaskDrafts(current).filter((_, taskIndex) => taskIndex !== index),
  }), 'data-flow');

  const moveTask = (index: number, direction: -1 | 1) => updateDraft((current) => {
    const tasks = [...getResearchSetupTaskDrafts(current)];
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= tasks.length) return current;
    [tasks[index], tasks[nextIndex]] = [tasks[nextIndex], tasks[index]];
    return { ...current, tasks: '', structuredTasks: tasks };
  }, 'data-flow');

  const addTaskOption = (taskIndex: number) => updateDraft((current) => ({
    ...current,
    tasks: '',
    structuredTasks: getResearchSetupTaskDrafts(current).map((task, index) => index === taskIndex
      ? {
          ...task,
          options: [...task.options, {
            id: `choice-${task.options.length + 1}`,
            label: '',
          }],
        }
      : task),
  }), 'data-flow');

  const updateTaskOption = (
    taskIndex: number,
    optionIndex: number,
    key: keyof ResearchTaskOptionDraft,
    value: string,
  ) => updateDraft((current) => ({
    ...current,
    tasks: '',
    structuredTasks: getResearchSetupTaskDrafts(current).map((task, index) => index === taskIndex
      ? {
          ...task,
          options: task.options.map((option, choiceIndex) => choiceIndex === optionIndex
            ? { ...option, [key]: value }
            : option),
        }
      : task),
  }), 'data-flow');

  const removeTaskOption = (taskIndex: number, optionIndex: number) => updateDraft((current) => ({
    ...current,
    tasks: '',
    structuredTasks: getResearchSetupTaskDrafts(current).map((task, index) => index === taskIndex
      ? { ...task, options: task.options.filter((_, choiceIndex) => choiceIndex !== optionIndex) }
      : task),
  }), 'data-flow');

  const addArm = () => {
    if (draft.arms.length >= 8) {
      setErrors(['Research Setup supports up to eight arms in this browser interface. Use the versioned schema and SDK for a larger design.']);
      return;
    }
    updateDraft((current) => ({ ...current, arms: [...current.arms, newArm(current.arms.length)] }), 'both');
  };

  const removeArm = (index: number) => updateDraft((current) => {
    const arms = current.arms.filter((_, armIndex) => armIndex !== index);
    return {
      ...current,
      arms,
      fixedArmId: arms.some((arm) => arm.id === current.fixedArmId) ? current.fixedArmId : arms[0]?.id ?? '',
    };
  }, 'both');

  const goToStep = (nextStep: number) => {
    if (busy || frozen) return;
    if (nextStep <= step) {
      setErrors([]);
      setStep(nextStep);
      return;
    }
    const currentErrors = validateStep(step, draft, materials);
    if (currentErrors.length > 0) {
      setErrors(currentErrors);
      return;
    }
    const bounded = Math.min(STEPS.length - 1, nextStep);
    setErrors([]);
    setStep(bounded);
    setHighestStep((current) => Math.max(current, bounded));
  };

  const saveDraft = async () => {
    const draftErrors = validatedDraftErrors(draft, materials);
    if (draftErrors.length > 0) {
      setErrors(draftErrors);
      return;
    }
    setBusyLabel('Validating and saving protocol draft in this browser');
    setErrors([]);
    try {
      await onSaveDraft(cloneDraft(draft));
      if (!mountedRef.current) return;
      setSavedSignature(JSON.stringify(draft));
      setStatus(storageStatus.persistent
        ? 'Draft saved in this browser.'
        : 'Draft is not durably stored. Export the support packet before closing this page.');
    } catch (saveError: unknown) {
      if (mountedRef.current) setErrors([saveError instanceof Error ? saveError.message : 'The research draft could not be saved.']);
    } finally {
      if (mountedRef.current) setBusyLabel('');
    }
  };

  const exportPacket = async () => {
    const draftErrors = validatedDraftErrors(draft, materials);
    if (!frozen && draftErrors.length > 0) {
      setErrors(draftErrors);
      return;
    }
    setBusyLabel('Preparing support packet');
    setErrors([]);
    try {
      await onExportSupportPacket(cloneDraft(draft), frozen ?? undefined);
      if (mountedRef.current) setStatus('Support packet exported. Review it before submitting protocol materials.');
    } catch (exportError: unknown) {
      if (mountedRef.current) setErrors([exportError instanceof Error ? exportError.message : 'The support packet could not be exported.']);
    } finally {
      if (mountedRef.current) setBusyLabel('');
    }
  };

  const freeze = async () => {
    const freezeErrors = allErrors(draft, materials);
    if (freezeErrors.length > 0) {
      setErrors(freezeErrors);
      return;
    }
    setBusyLabel('Freezing exact research configuration');
    setErrors([]);
    try {
      const result = await onFreeze(cloneDraft(draft));
      if (!mountedRef.current) return;
      setFrozen(result);
      setSavedSignature(JSON.stringify(draft));
      setStatus('Research configuration frozen. Its digest pins the exact materials and policies.');
    } catch (freezeError: unknown) {
      if (mountedRef.current) setErrors([freezeError instanceof Error ? freezeError.message : 'The research configuration could not be frozen.']);
    } finally {
      if (mountedRef.current) setBusyLabel('');
    }
  };

  const selectedMaterial = materials.find((entry) => entry.key === draft.materialKey);
  const taskDrafts = getResearchSetupTaskDrafts(draft);
  const institutionDetermined = draft.oversight.status === 'institution-determined';
  const launchBlockedReason = !institutionDetermined
    ? 'Record the institution\'s required determination outside CaseAttend before participant launch.'
    : draft.rawChatEnabled
      ? 'Browser-local Participant Mode cannot launch while raw conversation collection is enabled. Export the packet for separate institutional review or turn raw chat off.'
    : !storageStatus.persistent || !storageStatus.launchAllowed
      ? 'Participant launch requires persistent browser storage. Export the packet and resolve storage before enrollment.'
      : frozen?.launchErrors[0] ?? '';

  return (
    <main className="research-setup-shell" aria-busy={busy}>
      <header className="research-setup-topbar">
        <button type="button" className="research-setup-back" disabled={busy} onClick={requestExit}>
          <ArrowLeft aria-hidden="true" /><span>Back to cases</span>
        </button>
        <div className="research-setup-brand">
          <img src="/logo.svg" alt="" /><span>CaseAttend</span><small>Research Setup</small>
        </div>
        <span className="research-setup-local"><LockKeyhole aria-hidden="true" /><span>Browser-local setup</span></span>
      </header>

      <div className="research-setup-layout">
        <aside className="research-setup-sidebar" aria-label="Research Setup progress">
          <h1>Build a reproducible education study</h1>
          <p>Freeze exact teaching materials, model behavior, tasks, and a minimized data plan before participant launch.</p>
          <ol className="research-setup-steps">
            {STEPS.map((entry, index) => (
              <li key={entry.short}>
                <button
                  type="button"
                  aria-current={step === index ? 'step' : undefined}
                  disabled={busy || frozen !== null || index > highestStep + 1}
                  className={index < step ? 'complete' : ''}
                  onClick={() => goToStep(index)}
                >
                  <span className="research-setup-step-number" aria-hidden="true">{index < step ? <Check /> : index + 1}</span>
                  <span><strong>{entry.short}</strong><small>{entry.title}</small></span>
                </button>
              </li>
            ))}
          </ol>
          <div className={`research-storage-note ${storageStatus.persistent ? '' : 'warning'}`} role="status" aria-live="polite">
            <ShieldCheck aria-hidden="true" /><p>{storageStatus.message}{!storageStatus.persistent ? ' Export a support packet before closing this page.' : ''}</p>
          </div>
        </aside>

        <section className="research-setup-workspace" aria-labelledby="research-step-title">
          <div className="research-setup-heading">
            <p className="research-setup-eyebrow">Step {step + 1} of {STEPS.length}</p>
            <h2 id="research-step-title" ref={headingRef} tabIndex={-1}>{STEPS[step].title}</h2>
            <p>
              {step === 0 && 'Describe what you want to learn from the study before choosing technology or data fields.'}
              {step === 1 && 'Select the exact Case Package and Lesson Plan together. Their digests detect later content changes.'}
              {step === 2 && 'Define participant-neutral arms and the assignment rule that will be frozen with the protocol.'}
              {step === 3 && 'Record the exact provider, model, temperature, image-capture policy, and participant tasks for every arm.'}
              {step === 4 && 'Collect only what the stated outcomes require. Pseudonymous does not mean anonymous.'}
              {step === 5 && 'Export a draft for review, confirm the actual provider and data flow, then freeze an immutable configuration.'}
            </p>
          </div>

          {errors.length > 0 && (
            <div className="research-error-summary" role="alert" tabIndex={-1} ref={errorRef}>
              <AlertCircle aria-hidden="true" />
              <div><h3>Review these items</h3><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>
            </div>
          )}

          <form className="research-setup-form" onSubmit={(event) => event.preventDefault()}>
            <fieldset disabled={busy || frozen !== null}>
              {step === 0 && (
                <div className="research-section-stack research-step-fields">
                  <div className="research-info-card">
                    <FlaskConical aria-hidden="true" />
                    <p>
                      A vision-language model, or VLM, is an AI model that can interpret images and words together.
                      Many current frontier models are VLMs, but the terms are not synonyms. Research Setup records a testable education design; it does not decide whether the work needs IRB or ethics review.
                    </p>
                  </div>
                  <div className="research-field-grid">
                    <Field label="Study ID" htmlFor="research-id" hint="Stable lowercase kebab-case." required>
                      <input id="research-id" className="research-input" value={draft.id} onChange={(event) => updateField('id', event.target.value)} aria-describedby="research-id-hint" required />
                    </Field>
                    <Field label="Study version" htmlFor="research-version" hint="Three-part SemVer, for example 1.0.0." required>
                      <input id="research-version" className="research-input" value={draft.version} onChange={(event) => updateField('version', event.target.value)} aria-describedby="research-version-hint" required />
                    </Field>
                  </div>
                  <Field label="Study title" htmlFor="research-title" required>
                    <input id="research-title" className="research-input" value={draft.title} onChange={(event) => updateField('title', event.target.value)} required />
                  </Field>
                  <fieldset className="research-card-fieldset">
                    <legend>Protocol design</legend>
                    <div className="research-choice-grid">
                      <label className="research-choice"><input type="radio" name="protocol-design" checked={draft.protocolDesign === 'exploratory'} onChange={() => updateField('protocolDesign', 'exploratory')} /><span><strong>Exploratory</strong><small>Questions and outcomes are defined, but a directional hypothesis is optional.</small></span></label>
                      <label className="research-choice"><input type="radio" name="protocol-design" checked={draft.protocolDesign === 'confirmatory'} onChange={() => updateField('protocolDesign', 'confirmatory')} /><span><strong>Confirmatory</strong><small>At least one hypothesis is required before freezing.</small></span></label>
                    </div>
                  </fieldset>
                  <Field label="Purpose" htmlFor="research-purpose" hint="State the education or implementation question without claiming a benefit." required>
                    <textarea id="research-purpose" className="research-input" rows={4} value={draft.purpose} onChange={(event) => updateField('purpose', event.target.value)} aria-describedby="research-purpose-hint" required />
                  </Field>
                  <Field label="Participant population" htmlFor="research-population" hint="Describe intended participants and relevant eligibility, not identifiable people." required>
                    <textarea id="research-population" className="research-input" rows={3} value={draft.population} onChange={(event) => updateField('population', event.target.value)} aria-describedby="research-population-hint" required />
                  </Field>
                  <fieldset className="research-card-fieldset">
                    <legend>Population considerations</legend>
                    <label className="research-confirmation"><input type="checkbox" checked={draft.includesMinors} onChange={(event) => updateField('includesMinors', event.target.checked)} /><span><strong>The intended population includes minors.</strong><small>This records protocol scope. It does not determine safeguards or approve enrollment.</small></span></label>
                    <div className="research-field" style={{ marginTop: 14 }}>
                      <label htmlFor="research-vulnerable-groups">Potentially vulnerable groups</label>
                      <p className="research-field-hint" id="research-vulnerable-groups-hint">One group per line, or leave empty after deliberate review.</p>
                      <textarea id="research-vulnerable-groups" className="research-input" value={draft.vulnerableGroups} onChange={(event) => updateField('vulnerableGroups', event.target.value)} aria-describedby="research-vulnerable-groups-hint" />
                    </div>
                  </fieldset>
                  <div className="research-field-grid">
                    <Field label="Hypotheses" htmlFor="research-hypotheses" hint="One hypothesis per line. Required for confirmatory designs." required={draft.protocolDesign === 'confirmatory'}>
                      <textarea id="research-hypotheses" className="research-input" value={draft.hypotheses} onChange={(event) => updateField('hypotheses', event.target.value)} aria-describedby="research-hypotheses-hint" required={draft.protocolDesign === 'confirmatory'} />
                    </Field>
                    <Field label="Learning objectives" htmlFor="research-objectives" hint="One objective per line." required>
                      <textarea id="research-objectives" className="research-input" value={draft.objectives} onChange={(event) => updateField('objectives', event.target.value)} aria-describedby="research-objectives-hint" required />
                    </Field>
                  </div>
                  <Field label="Outcome measures" htmlFor="research-outcomes" hint="One measure per line. Identify primary and secondary outcomes in the protocol." required>
                    <textarea id="research-outcomes" className="research-input" value={draft.outcomes} onChange={(event) => updateField('outcomes', event.target.value)} aria-describedby="research-outcomes-hint" required />
                  </Field>
                  <fieldset className="research-card-fieldset">
                    <legend>Research deployment</legend>
                    <p>Record who operates the exact deployment participants will use and where its privacy information is published.</p>
                    <div className="research-field-grid">
                      <Field label="Deployment operator" htmlFor="research-operator" required><input id="research-operator" className="research-input" value={draft.deploymentOperatorName} onChange={(event) => updateField('deploymentOperatorName', event.target.value, 'data-flow')} required /></Field>
                      <Field label="Operator privacy-policy URL" htmlFor="research-privacy-url" hint="Required HTTPS URL." required><input id="research-privacy-url" className="research-input" type="url" inputMode="url" placeholder="https://" value={draft.deploymentPrivacyPolicyUrl} onChange={(event) => updateField('deploymentPrivacyPolicyUrl', event.target.value, 'data-flow')} aria-describedby="research-privacy-url-hint" required /></Field>
                    </div>
                  </fieldset>
                </div>
              )}

              {step === 1 && (
                <div className="research-section-stack research-step-fields">
                  <div className="research-warning-card">
                    <AlertCircle aria-hidden="true" />
                    <div><h3>Use reviewed teaching content</h3><p>A digest pins content but does not establish clinical review, permission, de-identification, or suitability for a participant population.</p></div>
                  </div>
                  <Field label="Exact case and lesson bundle" htmlFor="research-material" hint="CaseAttend snapshots and freezes both together. Built-in browser assets are safely re-encoded, so their final portable Case Package digest can differ from the source digest shown here." required>
                    <select id="research-material" className="research-input" value={draft.materialKey} onChange={(event) => updateField('materialKey', event.target.value, 'both')} aria-describedby="research-material-hint" required>
                      <option value="">Select a case and lesson</option>
                      {materials.map((entry) => <option key={entry.key} value={entry.key}>{entry.title} | {entry.caseRef.id} | lesson {entry.lessonRef.version}</option>)}
                    </select>
                  </Field>
                  {selectedMaterial && (
                    <section className="research-reference-card" aria-labelledby="research-material-summary">
                      <h3 id="research-material-summary">Selected source references</h3>
                      <p>
                        {selectedMaterial.snapshotBehavior === 'reencode-built-in'
                          ? 'At freeze, CaseAttend verifies these same-origin source bytes, safely re-encodes the images to remove metadata, and issues a new exact portable Case Package digest.'
                          : 'At freeze, CaseAttend verifies and reuses this exact browser-local portable package.'}
                      </p>
                      <dl>
                        <div><dt>Domain</dt><dd>{selectedMaterial.domain}</dd></div>
                        <div><dt>Case ID</dt><dd>{selectedMaterial.caseRef.id}</dd></div>
                        <div><dt>Case schema</dt><dd>{selectedMaterial.caseRef.schemaVersion}</dd></div>
                        <div><dt>Source case SHA-256</dt><dd>{selectedMaterial.caseRef.sha256}</dd></div>
                        <div><dt>Lesson</dt><dd>{selectedMaterial.lessonRef.id} at {selectedMaterial.lessonRef.version}</dd></div>
                        <div><dt>Lesson SHA-256</dt><dd>{selectedMaterial.lessonRef.sha256}</dd></div>
                      </dl>
                    </section>
                  )}
                </div>
              )}

              {step === 2 && (
                <div className="research-section-stack research-step-fields">
                  <fieldset className="research-card-fieldset">
                    <legend>Assignment rule</legend>
                    <p>The weighted rule deterministically assigns a pseudonymous participant reference. It does not store the raw participant code.</p>
                    <div className="research-choice-grid">
                      <label className="research-choice"><input type="radio" name="assignment" checked={draft.assignment === 'fixed'} onChange={() => updateField('assignment', 'fixed', 'data-flow')} /><span><strong>Fixed arm</strong><small>Every participant uses one selected arm.</small></span></label>
                      <label className="research-choice"><input type="radio" name="assignment" checked={draft.assignment === 'sha256-weighted-v1'} onChange={() => updateField('assignment', 'sha256-weighted-v1', 'data-flow')} /><span><strong>SHA-256 weighted</strong><small>Deterministic allocation across two or more weighted arms.</small></span></label>
                    </div>
                    {draft.assignment === 'fixed' && (
                      <div className="research-field" style={{ marginTop: 14 }}>
                        <label htmlFor="research-fixed-arm">Fixed arm</label>
                        <select id="research-fixed-arm" className="research-input" value={draft.fixedArmId} onChange={(event) => updateField('fixedArmId', event.target.value, 'data-flow')}>
                          {draft.arms.map((arm) => <option key={arm.id} value={arm.id}>{arm.label || arm.id}</option>)}
                        </select>
                      </div>
                    )}
                  </fieldset>

                  <section aria-labelledby="research-arms-heading">
                    <div className="research-repeat-row-header"><strong id="research-arms-heading">Study arms</strong><button type="button" className="research-setup-button secondary" onClick={addArm}><Plus aria-hidden="true" /> Add arm</button></div>
                    <ol className="research-repeat-list">
                      {draft.arms.map((arm, index) => (
                        <li className="research-repeat-row" key={`${index}-${arm.id}`}>
                          <div className="research-repeat-row-header"><strong>Arm {index + 1}</strong><button type="button" className="research-icon-button" disabled={draft.arms.length === 1} onClick={() => removeArm(index)} aria-label={`Remove arm ${index + 1}`}><Trash2 aria-hidden="true" /></button></div>
                          <div className="research-field-grid">
                            <Field label="Arm ID" htmlFor={`arm-${index}-id`} required><input id={`arm-${index}-id`} className="research-input" value={arm.id} onChange={(event) => updateArm(index, 'id', event.target.value)} required /></Field>
                            <Field label="Participant-neutral label" htmlFor={`arm-${index}-label`} required><input id={`arm-${index}-label`} className="research-input" value={arm.label} onChange={(event) => updateArm(index, 'label', event.target.value)} required /></Field>
                          </div>
                          <Field label="Allocation weight" htmlFor={`arm-${index}-weight`} hint="Relative integer weight from 1 to 1000." required><input id={`arm-${index}-weight`} className="research-input" type="number" min={1} max={1000} step={1} value={arm.allocationWeight} onChange={(event) => updateArm(index, 'allocationWeight', Number(event.target.value))} aria-describedby={`arm-${index}-weight-hint`} required /></Field>
                        </li>
                      ))}
                    </ol>
                  </section>
                </div>
              )}

              {step === 3 && (
                <div className="research-section-stack research-step-fields">
                  <div className="research-info-card"><FlaskConical aria-hidden="true" /><p>Record exact provider and model identifiers. Every arm requires one upstream provider, provider fallbacks off, parameter support on, zero-data-retention on, data collection denied, and streaming off.</p></div>
                  <ol className="research-repeat-list">
                    {draft.arms.map((arm, index) => (
                      <li className="research-repeat-row" key={arm.id}>
                        <div className="research-repeat-row-header"><strong>{arm.label || `Arm ${index + 1}`}</strong><span>{arm.id}</span></div>
                        <div className="research-field-grid">
                          <Field label="Upstream provider ID" htmlFor={`inference-${index}-provider`} hint="One OpenRouter provider identifier, not a URL." required><input id={`inference-${index}-provider`} className="research-input" value={arm.providerId} onChange={(event) => updateArm(index, 'providerId', event.target.value)} aria-describedby={`inference-${index}-provider-hint`} required /></Field>
                          <Field label="Exact model identifier" htmlFor={`inference-${index}-model`} required><input id={`inference-${index}-model`} className="research-input" value={arm.model} onChange={(event) => updateArm(index, 'model', event.target.value)} required /></Field>
                        </div>
                        <Field label="Upstream provider data or privacy policy URL" htmlFor={`inference-${index}-provider-policy`} hint="Required HTTPS page reviewed for this exact upstream provider; this is distinct from OpenRouter's policy." required><input id={`inference-${index}-provider-policy`} className="research-input" type="url" inputMode="url" value={arm.providerPolicyUrl} onChange={(event) => updateArm(index, 'providerPolicyUrl', event.target.value)} aria-describedby={`inference-${index}-provider-policy-hint`} required /></Field>
                        <div className="research-field-grid">
                          <Field label="Temperature" htmlFor={`inference-${index}-temperature`} hint="Numeric value from 0 to 2." required><input id={`inference-${index}-temperature`} className="research-input" type="number" min={0} max={2} step={0.01} value={arm.temperature} onChange={(event) => updateArm(index, 'temperature', Number(event.target.value))} aria-describedby={`inference-${index}-temperature-hint`} required /></Field>
                          <Field label="Top P" htmlFor={`inference-${index}-top-p`} hint="Numeric value from 0 to 1." required><input id={`inference-${index}-top-p`} className="research-input" type="number" min={0} max={1} step={0.01} value={arm.topP} onChange={(event) => updateArm(index, 'topP', Number(event.target.value))} aria-describedby={`inference-${index}-top-p-hint`} required /></Field>
                        </div>
                        <div className="research-field-grid">
                          <Field label="Maximum output tokens" htmlFor={`inference-${index}-max-tokens`} required><input id={`inference-${index}-max-tokens`} className="research-input" type="number" min={1} max={32768} step={1} value={arm.maxTokens} onChange={(event) => updateArm(index, 'maxTokens', Number(event.target.value))} required /></Field>
                          <Field label="History window messages" htmlFor={`inference-${index}-history`} required><input id={`inference-${index}-history`} className="research-input" type="number" min={0} max={100} step={1} value={arm.historyWindowMessages} onChange={(event) => updateArm(index, 'historyWindowMessages', Number(event.target.value))} required /></Field>
                        </div>
                        <div className="research-field-grid">
                          <Field label="Locked learner level" htmlFor={`inference-${index}-learner-level`} required><select id={`inference-${index}-learner-level`} className="research-input" value={arm.learnerLevel} onChange={(event) => updateArm(index, 'learnerLevel', event.target.value as LearnerLevel)}><option value="highschool">High school</option><option value="undergrad">Undergraduate</option><option value="ms_preclinical">Medical student, preclinical</option><option value="ms_clinical">Medical student, clinical</option><option value="resident">Resident</option></select></Field>
                          <Field label="Locked tutor mode" htmlFor={`inference-${index}-mode`} required><select id={`inference-${index}-mode`} className="research-input" value={arm.mode} onChange={(event) => updateArm(index, 'mode', event.target.value as ResearchArmDraft['mode'])}><option value="chat">Chat</option><option value="deep_think">Deep think</option></select></Field>
                        </div>
                        <div className="research-info-card"><LockKeyhole aria-hidden="true" /><p>The current teaching view is JPEG encoded and sent only when the participant sends. Tutor pointers are excluded and the visible viewport transform is baked into the image.</p></div>
                        <label className="research-confirmation"><input type="checkbox" checked={arm.allowAnnotations} onChange={(event) => updateArm(index, 'allowAnnotations', event.target.checked)} /><span><strong>Allow and include visible participant annotations.</strong><small>When enabled, visible annotations are included in the current-view capture sent with the participant's message.</small></span></label>
                      </li>
                    ))}
                  </ol>
                  <section aria-labelledby="research-tasks-heading">
                    <div className="research-repeat-row-header">
                      <div><strong id="research-tasks-heading">Pre-activity and post-activity tasks</strong><p className="research-field-hint">Instruction-only tasks collect no answer. Single choice records the option ID. Integer scale records a bounded score.</p></div>
                      <div className="research-action-group">
                        <button type="button" className="research-setup-button secondary" disabled={taskDrafts.filter((task) => task.phase === 'pre').length >= MAX_UI_TASKS_PER_PHASE} onClick={() => addTask('pre')}><Plus aria-hidden="true" /> Add pre task</button>
                        <button type="button" className="research-setup-button secondary" disabled={taskDrafts.filter((task) => task.phase === 'post').length >= MAX_UI_TASKS_PER_PHASE} onClick={() => addTask('post')}><Plus aria-hidden="true" /> Add post task</button>
                      </div>
                    </div>
                    {taskDrafts.length === 0 && <p className="research-empty-note">Add at least one task tied to the outcomes described in the protocol.</p>}
                    <ol className="research-repeat-list">
                      {taskDrafts.map((task, taskIndex) => (
                        <li className="research-repeat-row" key={`${taskIndex}-${task.id}`}>
                          <div className="research-repeat-row-header">
                            <strong>Task {taskIndex + 1}: {task.phase === 'pre' ? 'before activity' : 'after activity'}</strong>
                            <div className="research-action-group">
                              <button type="button" className="research-icon-button" disabled={taskIndex === 0} onClick={() => moveTask(taskIndex, -1)} aria-label={`Move task ${taskIndex + 1} up`}><ArrowUp aria-hidden="true" /></button>
                              <button type="button" className="research-icon-button" disabled={taskIndex === taskDrafts.length - 1} onClick={() => moveTask(taskIndex, 1)} aria-label={`Move task ${taskIndex + 1} down`}><ArrowDown aria-hidden="true" /></button>
                              <button type="button" className="research-icon-button" onClick={() => removeTask(taskIndex)} aria-label={`Remove task ${taskIndex + 1}`}><Trash2 aria-hidden="true" /></button>
                            </div>
                          </div>
                          <div className="research-field-grid">
                            <Field label="Task ID" htmlFor={`research-task-${taskIndex}-id`} hint="Stable lowercase kebab-case; unique across pre and post tasks." required><input id={`research-task-${taskIndex}-id`} className="research-input" value={task.id} onChange={(event) => updateTask(taskIndex, 'id', event.target.value)} aria-describedby={`research-task-${taskIndex}-id-hint`} required /></Field>
                            <Field label="When shown" htmlFor={`research-task-${taskIndex}-phase`} required><select id={`research-task-${taskIndex}-phase`} className="research-input" value={task.phase} onChange={(event) => updateTask(taskIndex, 'phase', event.target.value as ResearchTaskDraft['phase'])}><option value="pre">Before the activity</option><option value="post">After the activity</option></select></Field>
                          </div>
                          <Field label="Participant-facing title" htmlFor={`research-task-${taskIndex}-title`} required><input id={`research-task-${taskIndex}-title`} className="research-input" value={task.title} onChange={(event) => updateTask(taskIndex, 'title', event.target.value)} required /></Field>
                          <Field label="Participant instructions" htmlFor={`research-task-${taskIndex}-instructions`} required><textarea id={`research-task-${taskIndex}-instructions`} className="research-input" rows={3} value={task.instructions} onChange={(event) => updateTask(taskIndex, 'instructions', event.target.value)} required /></Field>
                          <Field label="Response type" htmlFor={`research-task-${taskIndex}-response`} required><select id={`research-task-${taskIndex}-response`} className="research-input" value={task.responseKind} onChange={(event) => updateTask(taskIndex, 'responseKind', event.target.value as ResearchTaskDraft['responseKind'])}><option value="none">Instruction only; no answer recorded</option><option value="single-choice">Single choice</option><option value="integer-scale">Integer scale</option></select></Field>
                          {task.responseKind === 'single-choice' && (
                            <fieldset className="research-card-fieldset">
                              <legend>Answer choices</legend>
                              <p>Use 2 to 20 participant-facing choices. Analysis records the stable choice ID, not free text.</p>
                              <ol className="research-repeat-list">
                                {task.options.map((option, optionIndex) => (
                                  <li className="research-repeat-row compact" key={`${optionIndex}-${option.id}`}>
                                    <div className="research-field-grid">
                                      <Field label={`Choice ${optionIndex + 1} ID`} htmlFor={`research-task-${taskIndex}-choice-${optionIndex}-id`} required><input id={`research-task-${taskIndex}-choice-${optionIndex}-id`} className="research-input" value={option.id} onChange={(event) => updateTaskOption(taskIndex, optionIndex, 'id', event.target.value)} required /></Field>
                                      <Field label={`Choice ${optionIndex + 1} label`} htmlFor={`research-task-${taskIndex}-choice-${optionIndex}-label`} required><input id={`research-task-${taskIndex}-choice-${optionIndex}-label`} className="research-input" value={option.label} onChange={(event) => updateTaskOption(taskIndex, optionIndex, 'label', event.target.value)} required /></Field>
                                    </div>
                                    <button type="button" className="research-icon-button" onClick={() => removeTaskOption(taskIndex, optionIndex)} aria-label={`Remove choice ${optionIndex + 1} from task ${taskIndex + 1}`}><Trash2 aria-hidden="true" /></button>
                                  </li>
                                ))}
                              </ol>
                              <button type="button" className="research-setup-button secondary" disabled={task.options.length >= 20} onClick={() => addTaskOption(taskIndex)}><Plus aria-hidden="true" /> Add choice</button>
                            </fieldset>
                          )}
                          {task.responseKind === 'integer-scale' && (
                            <fieldset className="research-card-fieldset">
                              <legend>Integer scale</legend>
                              <div className="research-field-grid">
                                <Field label="Minimum" htmlFor={`research-task-${taskIndex}-min`} required><input id={`research-task-${taskIndex}-min`} className="research-input" type="number" min={-1000} max={999} step={1} value={task.min} onChange={(event) => updateTask(taskIndex, 'min', Number(event.target.value))} required /></Field>
                                <Field label="Maximum" htmlFor={`research-task-${taskIndex}-max`} required><input id={`research-task-${taskIndex}-max`} className="research-input" type="number" min={-999} max={1000} step={1} value={task.max} onChange={(event) => updateTask(taskIndex, 'max', Number(event.target.value))} required /></Field>
                                <Field label="Minimum label" htmlFor={`research-task-${taskIndex}-min-label`} required><input id={`research-task-${taskIndex}-min-label`} className="research-input" value={task.minLabel} onChange={(event) => updateTask(taskIndex, 'minLabel', event.target.value)} required /></Field>
                                <Field label="Maximum label" htmlFor={`research-task-${taskIndex}-max-label`} required><input id={`research-task-${taskIndex}-max-label`} className="research-input" value={task.maxLabel} onChange={(event) => updateTask(taskIndex, 'maxLabel', event.target.value)} required /></Field>
                              </div>
                            </fieldset>
                          )}
                        </li>
                      ))}
                    </ol>
                  </section>
                </div>
              )}

              {step === 4 && (
                <div className="research-section-stack research-step-fields">
                  <div className="research-warning-card"><Users aria-hidden="true" /><div><h3>Pseudonymous is not anonymous</h3><p>A code can remain linkable through a separate key, timestamps, rare actions, or free text. Assign codes outside CaseAttend and keep the linkage key separately.</p></div></div>
                  <fieldset className="research-card-fieldset">
                    <legend>Pseudonymous participant codes</legend>
                    <p>Participant Mode accepts an institution-assigned 20-character Crockford Base32 code. The browser derives a manifest-scoped SHA-256 participant ID and does not store the entered code. Keep any linkage key outside CaseAttend.</p>
                  </fieldset>
                  <fieldset className="research-card-fieldset">
                    <legend>Participant information</legend>
                    <p>Use the exact institution-reviewed language. CaseAttend adds a fixed plain-language VLM disclosure and educational, not-medical-advice limitation.</p>
                    <div className="research-section-stack">
                      <Field label="Key information" htmlFor="participant-key-information" required><textarea id="participant-key-information" className="research-input" rows={4} value={draft.participantKeyInformation} onChange={(event) => updateField('participantKeyInformation', event.target.value, 'data-flow')} required /></Field>
                      <Field label="Purpose in participant-facing language" htmlFor="participant-purpose" required><textarea id="participant-purpose" className="research-input" rows={3} value={draft.participantPurpose} onChange={(event) => updateField('participantPurpose', event.target.value, 'data-flow')} required /></Field>
                      <Field label="Procedures" htmlFor="participant-procedures" required><textarea id="participant-procedures" className="research-input" rows={4} value={draft.participantProcedures} onChange={(event) => updateField('participantProcedures', event.target.value, 'data-flow')} required /></Field>
                      <div className="research-field-grid">
                        <Field label="Risks" htmlFor="participant-risks" required><textarea id="participant-risks" className="research-input" rows={4} value={draft.participantRisks} onChange={(event) => updateField('participantRisks', event.target.value, 'data-flow')} required /></Field>
                        <Field label="Benefits or no direct benefit" htmlFor="participant-benefits" required><textarea id="participant-benefits" className="research-input" rows={4} value={draft.participantBenefits} onChange={(event) => updateField('participantBenefits', event.target.value, 'data-flow')} required /></Field>
                      </div>
                      <Field label="Privacy and confidentiality limits" htmlFor="participant-privacy" required><textarea id="participant-privacy" className="research-input" rows={4} value={draft.participantPrivacy} onChange={(event) => updateField('participantPrivacy', event.target.value, 'data-flow')} required /></Field>
                      <div className="research-field-grid">
                        <Field label="Voluntary participation, exit, and withdrawal" htmlFor="participant-voluntary" required><textarea id="participant-voluntary" className="research-input" rows={4} value={draft.participantVoluntaryParticipation} onChange={(event) => updateField('participantVoluntaryParticipation', event.target.value, 'data-flow')} required /></Field>
                        <Field label="Compensation or none" htmlFor="participant-compensation" required><textarea id="participant-compensation" className="research-input" rows={4} value={draft.participantCompensation} onChange={(event) => updateField('participantCompensation', event.target.value, 'data-flow')} required /></Field>
                      </div>
                      <div className="research-field-grid">
                        <Field label="Approved contact name" htmlFor="participant-contact-name" required><input id="participant-contact-name" className="research-input" value={draft.contactName} onChange={(event) => updateField('contactName', event.target.value, 'data-flow')} required /></Field>
                        <Field label="Contact role" htmlFor="participant-contact-role" required><input id="participant-contact-role" className="research-input" value={draft.contactRole} onChange={(event) => updateField('contactRole', event.target.value, 'data-flow')} required /></Field>
                      </div>
                      <Field label="Contact email" htmlFor="participant-contact-email" required><input id="participant-contact-email" className="research-input" type="email" inputMode="email" value={draft.contactEmail} onChange={(event) => updateField('contactEmail', event.target.value, 'data-flow')} required /></Field>
                    </div>
                  </fieldset>
                  <fieldset className="research-card-fieldset">
                    <legend>Fixed browser-local collection fields</legend>
                    <p>Research Manifest v1 records versioned structured session events and inference metadata. Current-view images are generated on send and transmitted to the configured provider, but are not stored in session events or exported. Study export is a researcher-initiated local JSONL and CSV file; automatic upload is off.</p>
                  </fieldset>
                  <fieldset className="research-card-fieldset">
                    <legend>Raw conversation content</legend>
                    <label className="research-confirmation">
                      <input type="checkbox" checked={draft.rawChatEnabled} onChange={(event) => updateDraft((current) => ({ ...current, rawChatEnabled: event.target.checked, rawChatJustification: event.target.checked ? current.rawChatJustification : '', rawChatParticipantDisclosure: event.target.checked ? current.rawChatParticipantDisclosure : '' }), 'both')} />
                      <span><strong>Describe raw participant or model messages in a support packet.</strong><small>Off by default. Browser-local Participant Mode refuses to collect raw chat. Enabling this policy is export-only for a separately reviewed institution-managed implementation.</small></span>
                    </label>
                    {draft.rawChatEnabled && (
                      <div className="research-section-stack" style={{ marginTop: 14 }}>
                        <Field label="Raw-chat necessity" htmlFor="research-raw-chat-justification" required><textarea id="research-raw-chat-justification" className="research-input" rows={3} value={draft.rawChatJustification} onChange={(event) => updateField('rawChatJustification', event.target.value, 'both')} required /></Field>
                        <div className="research-choice-grid">
                          <label className="research-confirmation"><input type="checkbox" checked={draft.rawChatIncludesLearnerText} onChange={(event) => updateField('rawChatIncludesLearnerText', event.target.checked, 'both')} /><span><strong>Learner text</strong><small>Raw participant messages.</small></span></label>
                          <label className="research-confirmation"><input type="checkbox" checked={draft.rawChatIncludesModelText} onChange={(event) => updateField('rawChatIncludesModelText', event.target.checked, 'both')} /><span><strong>Model text</strong><small>Raw provider responses.</small></span></label>
                        </div>
                        <Field label="Exact participant disclosure for raw chat" htmlFor="research-raw-chat-disclosure" required><textarea id="research-raw-chat-disclosure" className="research-input" rows={3} value={draft.rawChatParticipantDisclosure} onChange={(event) => updateField('rawChatParticipantDisclosure', event.target.value, 'both')} required /></Field>
                      </div>
                    )}
                  </fieldset>
                  <div className="research-field-grid">
                    <Field label="Delete browser records after" htmlFor="research-browser-delete" hint="Absolute local date and time. Launch is blocked after this deadline." required><input id="research-browser-delete" className="research-input" type="datetime-local" value={draft.browserDeleteAfter} onChange={(event) => updateField('browserDeleteAfter', event.target.value, 'data-flow')} aria-describedby="research-browser-delete-hint" required /></Field>
                    <Field label="Delete exported copies after" htmlFor="research-export-delete" hint="Cannot be earlier than the browser-record deadline." required><input id="research-export-delete" className="research-input" type="datetime-local" value={draft.exportedCopiesDeleteAfter} onChange={(event) => updateField('exportedCopiesDeleteAfter', event.target.value, 'data-flow')} aria-describedby="research-export-delete-hint" required /></Field>
                  </div>
                  <div className="research-field-grid">
                    <Field label="Access roles" htmlFor="research-access" hint="One role per line. Do not enter individual names." required><textarea id="research-access" className="research-input" value={draft.accessRoles} onChange={(event) => updateField('accessRoles', event.target.value, 'data-flow')} aria-describedby="research-access-hint" required /></Field>
                  </div>
                  <Field label="Deletion procedure and limits" htmlFor="research-deletion" hint="Include browser records, exports, backups, linkage keys, and any provider-held copies." required><textarea id="research-deletion" className="research-input" rows={4} value={draft.deletionProcedure} onChange={(event) => updateField('deletionProcedure', event.target.value, 'data-flow')} aria-describedby="research-deletion-hint" required /></Field>
                </div>
              )}

              {step === 5 && (
                <div className="research-section-stack research-step-fields">
                  <div className="research-warning-card"><ShieldCheck aria-hidden="true" /><div><h3>CaseAttend does not approve research</h3><p>The checks below record researcher review. They do not establish IRB approval, consent, HIPAA de-identification, provider compliance, or legal permission.</p></div></div>
                  <fieldset className="research-card-fieldset">
                    <legend id="research-review-summary">Frozen configuration preview</legend>
                    <dl className="research-review-grid">
                      <div><dt>Study</dt><dd>{draft.id} at {draft.version}</dd></div>
                      <div><dt>Assignment</dt><dd>{draft.assignment === 'fixed' ? `Fixed: ${draft.fixedArmId}` : 'SHA-256 weighted v1'}</dd></div>
                      <div><dt>Source case</dt><dd>{selectedMaterial?.caseRef.id ?? 'Not selected'} / {selectedMaterial?.caseRef.sha256 ?? 'Missing'}</dd></div>
                      <div><dt>Lesson</dt><dd>{selectedMaterial?.lessonRef.id ?? 'Not selected'} / {selectedMaterial?.lessonRef.sha256 ?? 'Missing'}</dd></div>
                      <div><dt>Arms</dt><dd>{draft.arms.map((arm) => `${arm.label}: ${arm.providerId || 'provider missing'} / ${arm.model || 'model missing'} / temperature ${arm.temperature}`).join('; ')}</dd></div>
                      <div><dt>Raw chat</dt><dd>{draft.rawChatEnabled ? 'Enabled with justification' : 'Disabled'}</dd></div>
                      <div><dt>Retention</dt><dd>Browser: {draft.browserDeleteAfter || 'missing'}; exports: {draft.exportedCopiesDeleteAfter || 'missing'}</dd></div>
                      <div><dt>Oversight</dt><dd>{institutionDetermined ? 'Institutional determination documented externally' : 'Draft, no determination recorded'}</dd></div>
                    </dl>
                  </fieldset>
                  <fieldset className="research-card-fieldset">
                    <legend>Required pre-freeze review</legend>
                    <label className="research-confirmation"><input type="checkbox" checked={draft.providerReviewConfirmed} onChange={(event) => updateDraft((current) => ({ ...current, providerReviewConfirmed: event.target.checked }), 'none')} /><span><strong>I reviewed each configured provider's current terms and data practices.</strong><small>I checked retention, training use, regions, subprocessors, institutional agreements, and the exact model identifiers recorded above.</small></span></label>
                    <label className="research-confirmation"><input type="checkbox" checked={draft.dataFlowReviewConfirmed} onChange={(event) => updateDraft((current) => ({ ...current, dataFlowReviewConfirmed: event.target.checked }), 'none')} /><span><strong>I reviewed the actual deployed browser-to-provider data flow.</strong><small>I verified current-view capture, annotations, prompts, responses, enabled records, raw-chat policy, exports, retention, access, and deletion against the participant information.</small></span></label>
                  </fieldset>
                  <fieldset className="research-card-fieldset">
                    <legend>External institutional determination</legend>
                    <p>A draft can be frozen and exported for review without this record. Participant launch remains blocked until the responsible institution completes its required determination outside CaseAttend.</p>
                    <label className="research-confirmation"><input type="checkbox" checked={institutionDetermined} onChange={(event) => updateDraft((current) => ({ ...current, oversight: { ...current.oversight, status: event.target.checked ? 'institution-determined' : 'draft', ...(!event.target.checked ? { institutionName: '', protocolReference: '', determinedAt: '' } : {}) } }), 'none')} /><span><strong>The institution's required determination has been documented outside CaseAttend.</strong><small>This is a researcher record, not a CaseAttend approval or verification.</small></span></label>
                    {institutionDetermined && (
                      <div className="research-field-grid" style={{ marginTop: 14 }}>
                        <Field label="Determination" htmlFor="research-determination" required><select id="research-determination" className="research-input" value={draft.oversight.determination} onChange={(event) => updateDraft((current) => ({ ...current, oversight: { ...current.oversight, determination: event.target.value as ResearchSetupDraft['oversight']['determination'] } }), 'none')}><option value="approved">Approved</option><option value="exempt">Exempt</option><option value="not-human-subjects-research">Not human-subjects research</option></select></Field>
                        <Field label="Institution name" htmlFor="research-institution-name" required><input id="research-institution-name" className="research-input" value={draft.oversight.institutionName} onChange={(event) => updateDraft((current) => ({ ...current, oversight: { ...current.oversight, institutionName: event.target.value } }), 'none')} required /></Field>
                        <Field label="Protocol or determination reference" htmlFor="research-determination-ref" required><input id="research-determination-ref" className="research-input" value={draft.oversight.protocolReference} onChange={(event) => updateDraft((current) => ({ ...current, oversight: { ...current.oversight, protocolReference: event.target.value } }), 'none')} required /></Field>
                        <Field label="Determined at" htmlFor="research-determination-date" required><input id="research-determination-date" className="research-input" type="datetime-local" value={draft.oversight.determinedAt} onChange={(event) => updateDraft((current) => ({ ...current, oversight: { ...current.oversight, determinedAt: event.target.value } }), 'none')} required /></Field>
                      </div>
                    )}
                  </fieldset>
                </div>
              )}
            </fieldset>

            {step === 5 && (!frozen ? (
              <div className="research-freeze-card" style={{ marginTop: 22 }}>
                <h3>Freeze an immutable research configuration</h3>
                <p>Freezing validates every step and creates a digest. Later changes must be a new version rather than a silent edit.</p>
                <div className="research-action-group"><button type="button" className="research-setup-button primary" disabled={busy} onClick={() => void freeze()}><LockKeyhole aria-hidden="true" /> Freeze configuration</button></div>
              </div>
            ) : (
              <div className="research-freeze-card" style={{ marginTop: 22 }}>
                <h3>Frozen configuration ready</h3>
                <p>Manifest SHA-256: {frozen.sha256}</p>
                <p>Final portable Case Package SHA-256: {frozen.bundle.researchManifest.arms[0]?.caseSteps[0]?.casePackageRef.sha256 ?? 'missing'}</p>
                <div className="research-action-group">
                  <button type="button" className="research-setup-button secondary" onClick={() => void exportPacket()} disabled={busy}><Download aria-hidden="true" /> Export frozen support packet</button>
                  <button type="button" className="research-setup-button primary" onClick={() => onLaunchParticipant(frozen)} disabled={Boolean(launchBlockedReason)} aria-describedby={launchBlockedReason ? 'research-launch-blocker' : undefined}><Users aria-hidden="true" /> Open Participant Mode</button>
                </div>
                {launchBlockedReason && <p id="research-launch-blocker" style={{ marginTop: 10 }}>{launchBlockedReason}</p>}
              </div>
            ))}

            <p className="research-setup-status" role="status" aria-live="polite">{busyLabel || status}</p>
            <div className="research-setup-actions">
              <div className="research-action-group">
                <button type="button" className="research-setup-button secondary" disabled={busy || step === 0 || frozen !== null} onClick={() => goToStep(step - 1)}><ChevronLeft aria-hidden="true" /> Back</button>
                <button type="button" className="research-setup-button secondary" disabled={busy || frozen !== null} onClick={() => void saveDraft()}><Save aria-hidden="true" /> Save validated draft</button>
                <button type="button" className="research-setup-button secondary" disabled={busy} onClick={() => void exportPacket()}><Download aria-hidden="true" /> Export packet</button>
              </div>
              {step < STEPS.length - 1 && (
                <button type="button" className="research-setup-button primary" disabled={busy || frozen !== null} onClick={() => goToStep(step + 1)}>Next: {STEPS[step + 1].short.toLocaleLowerCase('en-US')} <ChevronRight aria-hidden="true" /></button>
              )}
            </div>
          </form>
        </section>
      </div>
    </main>
  );
};

export default ResearchSetupWizard;
