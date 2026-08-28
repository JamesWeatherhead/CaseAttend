import type { LearnerLevel } from '../constants';
import type { ResearchStudyBundleV1 } from './researchStudyBundle';

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

export function createResearchArmDraft(index: number): ResearchArmDraft {
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

export function createResearchTaskDraft(
  phase: 'pre' | 'post',
  index: number,
): ResearchTaskDraft {
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

export function getResearchSetupTaskDrafts(
  draft: ResearchSetupDraft,
): readonly ResearchTaskDraft[] {
  if (draft.structuredTasks && draft.structuredTasks.length > 0) {
    return draft.structuredTasks.map((task) => ({
      ...task,
      options: task.options.map((option) => ({ ...option })),
    }));
  }
  return draft.tasks.split('\n').map((line) => line.trim()).filter(Boolean)
    .map((instructions, index) => ({
      ...createResearchTaskDraft('pre', index),
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
    arms: [createResearchArmDraft(0)],
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
