// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResearchStudyBundleV1 } from '../core/researchStudyBundle';
import ResearchSetupWizard, {
  createInitialResearchSetupDraft,
  type FrozenResearchSetup,
  type ResearchMaterialOption,
  type ResearchSetupDraft,
  type ResearchSetupWizardProps,
} from '../components/ResearchSetupWizard/ResearchSetupWizard';

const CASE_HASH = 'a'.repeat(64);
const LESSON_HASH = 'b'.repeat(64);
const MANIFEST_HASH = 'c'.repeat(64);

const material: ResearchMaterialOption = {
  key: 'portable-case-one',
  title: 'Portable visual case',
  domain: 'dermatology',
  caseRef: { id: 'portable-case-one', schemaVersion: '1.0', sha256: CASE_HASH },
  lessonRef: { id: 'portable-case-one-lesson', version: '1.0.0', sha256: LESSON_HASH },
};

function completeDraft(overrides: Partial<ResearchSetupDraft> = {}): ResearchSetupDraft {
  return {
    ...createInitialResearchSetupDraft(material.key),
    id: 'visual-reasoning-pilot',
    title: 'Visual reasoning pilot',
    purpose: 'Evaluate whether a question-first VLM tutor supports visual reasoning.',
    population: 'Adult medical students enrolled in the pilot course.',
    hypotheses: 'Question-first guidance improves the preregistered reasoning score.',
    objectives: 'Describe visual features using neutral language.',
    outcomes: 'Primary: preregistered visual-reasoning score.',
    deploymentOperatorName: 'Example University',
    deploymentPrivacyPolicyUrl: 'https://example.edu/privacy',
    arms: [{
      ...createInitialResearchSetupDraft().arms[0],
      id: 'question-first',
      label: 'Configured tutor',
      providerId: 'example-provider',
      providerPolicyUrl: 'https://example-provider.test/privacy',
      model: 'example/model-v1',
    }],
    fixedArmId: 'question-first',
    tasks: 'Review the case and describe the visible features.',
    participantKeyInformation: 'You are invited to test a visual teaching activity that uses AI.',
    participantPurpose: 'The purpose is to study visual-reasoning education.',
    participantProcedures: 'Review one case, interact with the tutor, and complete the configured task.',
    participantRisks: 'The AI can be inaccurate and the activity may feel educationally challenging.',
    participantBenefits: 'You may receive no direct benefit.',
    participantPrivacy: 'A pseudonymous code and structured events are stored in this browser.',
    participantVoluntaryParticipation: 'Participation is voluntary. Use Exit study at any time.',
    participantCompensation: 'There is no compensation.',
    contactName: 'Research Office',
    contactRole: 'Study contact',
    contactEmail: 'research@example.edu',
    browserDeleteAfter: '2027-08-09T12:00',
    exportedCopiesDeleteAfter: '2027-09-09T12:00',
    deletionProcedure: 'Delete browser records and separately tracked exports by the recorded deadlines.',
    accessRoles: 'research-team',
    ...overrides,
  };
}

function frozen(draft: ResearchSetupDraft): FrozenResearchSetup {
  return {
    id: draft.id,
    version: draft.version,
    sha256: MANIFEST_HASH,
    frozenAt: '2026-08-09T18:00:00.000Z',
    draft,
    bundle: {
      researchManifest: {
        arms: [{ caseSteps: [{ casePackageRef: { sha256: CASE_HASH } }] }],
      },
    } as unknown as ResearchStudyBundleV1,
    launchErrors: [],
  };
}

function props(overrides: Partial<ResearchSetupWizardProps> = {}): ResearchSetupWizardProps {
  return {
    materials: [material],
    storageStatus: {
      persistent: true,
      launchAllowed: true,
      message: 'Research data is stored only in this browser.',
    },
    onExit: vi.fn(),
    onSaveDraft: vi.fn(async () => undefined),
    onExportSupportPacket: vi.fn(async () => undefined),
    onFreeze: vi.fn(async (draft) => frozen(draft)),
    onLaunchParticipant: vi.fn(),
    ...overrides,
  };
}

function advanceToReview() {
  for (const next of ['materials', 'design', 'model and tasks', 'data', 'review']) {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Next: ${next}`, 'i') }));
  }
}

describe('ResearchSetupWizard', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('explains VLM without treating it as a synonym for frontier model and focuses validation errors', () => {
    render(<ResearchSetupWizard {...props()} />);

    expect(screen.getByText(/A vision-language model, or VLM/)).toBeTruthy();
    expect(screen.getByText(/the terms are not synonyms/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Next: materials/i }));

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Enter a stable study ID.');
    expect(document.activeElement).toBe(alert);
    expect(screen.queryByText(/CaseAttend approved|automatically de-identified/i)).toBeNull();
  });

  it('blocks an incomplete support packet and exports a validated oversight draft before researcher review', async () => {
    const onExportSupportPacket = vi.fn<ResearchSetupWizardProps['onExportSupportPacket']>(async () => undefined);
    render(<ResearchSetupWizard {...props({ onExportSupportPacket })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Export packet' }));
    expect(screen.getByRole('alert').textContent).toContain('Enter a stable study ID.');
    expect(onExportSupportPacket).not.toHaveBeenCalled();

    cleanup();
    render(<ResearchSetupWizard {...props({ initialDraft: completeDraft(), onExportSupportPacket })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export packet' }));
    await waitFor(() => expect(onExportSupportPacket).toHaveBeenCalledTimes(1));
    expect(onExportSupportPacket.mock.calls[0]?.[0].oversight.status).toBe('draft');
    expect(screen.getByText(/Support packet exported/)).toBeTruthy();
  });

  it('pins the exact case and lesson and requires provider and deployed data-flow review before freeze', async () => {
    const initialDraft = completeDraft();
    const onFreeze = vi.fn(async (draft: ResearchSetupDraft) => frozen(draft));
    render(<ResearchSetupWizard {...props({ initialDraft, onFreeze })} />);
    advanceToReview();

    expect(screen.getByText((_, element) => element?.tagName === 'DD' && element.textContent?.includes(CASE_HASH) === true)).toBeTruthy();
    expect(screen.getByText((_, element) => element?.tagName === 'DD' && element.textContent?.includes(LESSON_HASH) === true)).toBeTruthy();
    expect(screen.getByText('Disabled')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Freeze configuration' }));
    expect(screen.getByRole('alert').textContent).toContain('provider terms and data-practices review');
    expect(screen.getByRole('alert').textContent).toContain('deployed data-flow review');
    expect(onFreeze).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText(/I reviewed each configured provider's current terms/));
    fireEvent.click(screen.getByLabelText(/I reviewed the actual deployed browser-to-provider data flow/));
    fireEvent.click(screen.getByRole('button', { name: 'Freeze configuration' }));

    expect(await screen.findByText('Frozen configuration ready')).toBeTruthy();
    expect(onFreeze).toHaveBeenCalledTimes(1);
    expect(onFreeze.mock.calls[0][0].materialKey).toBe(material.key);
    expect(screen.getByRole('button', { name: 'Open Participant Mode' }).getAttribute('aria-describedby')).toBe('research-launch-blocker');
    expect(screen.getAllByText(/required determination outside CaseAttend/).length).toBeGreaterThan(0);
  });

  it('keeps raw chat off by default and marks an enabled policy as export-only for this browser mode', () => {
    render(<ResearchSetupWizard {...props({ initialDraft: completeDraft() })} />);
    for (const next of ['materials', 'design', 'model and tasks', 'data']) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`Next: ${next}`, 'i') }));
    }

    const rawChat = screen.getByLabelText(/Describe raw participant or model messages/);
    expect((rawChat as HTMLInputElement).checked).toBe(false);
    fireEvent.click(rawChat);
    expect(screen.getByText(/Browser-local Participant Mode refuses to collect raw chat/)).toBeTruthy();
    expect(screen.getByLabelText(/Raw-chat necessity/)).toBeTruthy();
    expect(screen.getByLabelText(/Exact participant disclosure for raw chat/)).toBeTruthy();
  });

  it('migrates legacy instruction lines and authors keyboard-operable pre/post response instruments', () => {
    render(<ResearchSetupWizard {...props({ initialDraft: completeDraft() })} />);
    for (const next of ['materials', 'design', 'model and tasks']) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`Next: ${next}`, 'i') }));
    }

    expect((screen.getByLabelText(/Task ID/) as HTMLInputElement).value).toBe('pre-task-1');
    expect(screen.getAllByDisplayValue('Review the case and describe the visible features.').length).toBe(2);
    fireEvent.change(screen.getByLabelText(/Response type/), { target: { value: 'single-choice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add choice' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add choice' }));
    fireEvent.change(screen.getByLabelText(/Choice 1 ID/), { target: { value: 'describe-first' } });
    fireEvent.change(screen.getByLabelText(/Choice 1 label/), { target: { value: 'Describe first' } });
    fireEvent.change(screen.getByLabelText(/Choice 2 ID/), { target: { value: 'diagnose-first' } });
    fireEvent.change(screen.getByLabelText(/Choice 2 label/), { target: { value: 'Diagnose first' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add post task' }));
    expect(screen.getByRole('button', { name: 'Move task 1 down' }).className).toContain('research-icon-button');
    expect(screen.getByRole('button', { name: 'Move task 2 up' }).className).toContain('research-icon-button');
    expect(screen.getAllByLabelText(/When shown/).map((field) => (field as HTMLSelectElement).value)).toEqual(['pre', 'post']);
    fireEvent.change(screen.getAllByLabelText(/Participant-facing title/)[1], { target: { value: 'Post confidence' } });
    fireEvent.change(screen.getAllByLabelText(/Participant instructions/)[1], { target: { value: 'Rate confidence after the activity.' } });
    fireEvent.change(screen.getAllByLabelText(/Response type/)[1], { target: { value: 'integer-scale' } });
    fireEvent.change(document.getElementById('research-task-1-min') as HTMLInputElement, { target: { value: '0' } });
    fireEvent.change(document.getElementById('research-task-1-max') as HTMLInputElement, { target: { value: '101' } });
    fireEvent.click(screen.getByRole('button', { name: /Next: data/i }));
    expect(screen.getByRole('alert').textContent).toContain('cannot span more than 100 integer response values');
  });

  it('requires persistent storage and the external determination before participant launch', async () => {
    const determined = completeDraft({
      providerReviewConfirmed: true,
      dataFlowReviewConfirmed: true,
      oversight: {
        status: 'institution-determined',
        determination: 'exempt',
        institutionName: 'Example University',
        protocolReference: 'IRB-EXAMPLE-42',
        determinedAt: '2026-08-09T12:00',
      },
    });
    const onLaunchParticipant = vi.fn();
    const configured = props({
      initialDraft: determined,
      storageStatus: {
        persistent: false,
        launchAllowed: false,
        message: 'Research collection is blocked because persistent browser storage is unavailable.',
      },
      onLaunchParticipant,
    });
    const rendered = render(<ResearchSetupWizard {...configured} />);
    advanceToReview();
    fireEvent.click(screen.getByRole('button', { name: 'Freeze configuration' }));
    await screen.findByText('Frozen configuration ready');
    expect((screen.getByRole('button', { name: 'Open Participant Mode' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/requires persistent browser storage/)).toBeTruthy();

    rendered.rerender(<ResearchSetupWizard {...configured} storageStatus={{ persistent: true, launchAllowed: true, message: 'Research data is stored only in this browser.' }} />);
    const launch = screen.getByRole('button', { name: 'Open Participant Mode' });
    expect((launch as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(launch);
    expect(onLaunchParticipant).toHaveBeenCalledTimes(1);
  });

  it('keeps unsaved work when the researcher cancels exit and registers a page-close guard', () => {
    const onExit = vi.fn();
    vi.stubGlobal('confirm', vi.fn(() => false));
    render(<ResearchSetupWizard {...props({ onExit })} />);
    fireEvent.change(screen.getByLabelText('Study title *'), { target: { value: 'Unsaved protocol' } });

    const beforeUnload = new Event('beforeunload', { cancelable: true });
    act(() => { window.dispatchEvent(beforeUnload); });
    expect(beforeUnload.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Back to cases' }));

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Unsaved protocol changes'));
    expect(onExit).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Study title *') as HTMLInputElement).value).toBe('Unsaved protocol');
  });
});
