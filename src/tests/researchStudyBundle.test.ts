import { beforeAll, describe, expect, it } from 'vitest';
import { finalizeCasePackageV1, type CasePackageV1Draft } from '../core/casePackage';
import {
  createPortableCasePackageV1,
  type PortableCasePackageV1,
} from '../core/portableCasePackage';
import { createResearchManifestV1 } from '../core/researchManifest';
import {
  checkResearchStudyLaunchReadiness,
  createResearchStudyBundleV1,
  resolveResearchStudyCase,
  validateResearchStudyBundleV1,
} from '../core/researchStudyBundle';
import { makePortableCasePackage } from './portableCaseTestFixture';
import {
  makeResearchManifestInput,
  populateResearchSystemPromptHashes,
} from './researchTestFixtures';

async function revisePortable(
  base: PortableCasePackageV1,
  updates: Partial<CasePackageV1Draft>,
): Promise<PortableCasePackageV1> {
  const { manifest: _manifest, ...draft } = base.casePackage;
  const casePackage = await finalizeCasePackageV1({ ...draft, ...updates });
  return createPortableCasePackageV1(casePackage, base.lessonPlan, base.assets);
}

describe('Research Study Bundle v1', () => {
  let portable: PortableCasePackageV1;

  beforeAll(async () => {
    portable = await makePortableCasePackage();
  });

  it('retains and resolves the exact Portable Case Package and Lesson Plan snapshots', async () => {
    const input = await populateResearchSystemPromptHashes(
      makeResearchManifestInput({ portable }),
      [portable],
    );
    const manifest = await createResearchManifestV1(input);
    const bundle = await createResearchStudyBundleV1(manifest, [portable]);
    const step = manifest.arms[0].caseSteps[0];

    expect(bundle.portableCases[0]).toBe(portable);
    expect(await validateResearchStudyBundleV1(bundle)).toEqual({ valid: true, errors: [] });
    expect(resolveResearchStudyCase(bundle, step.casePackageRef, step.lessonPlanRef)).toBe(portable);
  });

  it('fails closed when either exact digest reference is changed', async () => {
    const input = await populateResearchSystemPromptHashes(
      makeResearchManifestInput({ portable }),
      [portable],
    );
    input.arms[0].caseSteps[0].lessonPlanRef.sha256 = 'f'.repeat(64);
    const manifest = await createResearchManifestV1(input);

    const result = await validateResearchStudyBundleV1({
      schema: 'caseattend.research-study-bundle',
      schemaVersion: '1.0',
      researchManifest: manifest,
      portableCases: [portable],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'researchStudyBundle.researchManifest.arms[0].caseSteps[0].lessonPlanRef does not exactly match the lesson snapshot paired with its Case Package.',
    );
  });

  it('rejects a system prompt digest that was not composed from the exact frozen step', async () => {
    const input = await populateResearchSystemPromptHashes(
      makeResearchManifestInput({ portable }),
      [portable],
    );
    input.arms[0].caseSteps[0].systemPromptSha256 = 'f'.repeat(64);
    const manifest = await createResearchManifestV1(input);
    const result = await validateResearchStudyBundleV1({
      schema: 'caseattend.research-study-bundle',
      schemaVersion: '1.0',
      researchManifest: manifest,
      portableCases: [portable],
    });

    expect(result.errors).toContain(
      'researchStudyBundle.researchManifest.arms[0].caseSteps[0] does not match its frozen systemPromptSha256 computed from the exact Case Package, Lesson Plan, learner level, and mode.',
    );
  });

  it('rejects missing, duplicate, and unreferenced snapshots', async () => {
    const input = await populateResearchSystemPromptHashes(
      makeResearchManifestInput({ portable }),
      [portable],
    );
    const manifest = await createResearchManifestV1(input);
    const missing = await validateResearchStudyBundleV1({
      schema: 'caseattend.research-study-bundle',
      schemaVersion: '1.0',
      researchManifest: manifest,
      portableCases: [],
    });
    expect(missing.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('must contain 1-256'),
      expect.stringContaining('has no exact Portable Case Package snapshot'),
    ]));

    const duplicate = await validateResearchStudyBundleV1({
      schema: 'caseattend.research-study-bundle',
      schemaVersion: '1.0',
      researchManifest: manifest,
      portableCases: [portable, portable],
    });
    expect(duplicate.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('duplicates an exact Case Package snapshot'),
    ]));

    const extra = await revisePortable(portable, { id: 'unreferenced-case' });
    const unreferenced = await validateResearchStudyBundleV1({
      schema: 'caseattend.research-study-bundle',
      schemaVersion: '1.0',
      researchManifest: manifest,
      portableCases: [portable, extra],
    });
    expect(unreferenced.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('snapshot that no research arm references'),
    ]));
  });

  it('deduplicates identical content-addressed assets across referenced case snapshots', async () => {
    const second = await revisePortable(portable, { id: 'second-case' });
    const input = makeResearchManifestInput({ portable });
    const firstStep = input.arms[0].caseSteps[0];
    input.arms[0].caseSteps = [
      firstStep,
      {
        ...firstStep,
        id: 'step-2',
        casePackageRef: {
          id: second.casePackage.id,
          schemaVersion: second.casePackage.schemaVersion,
          sha256: second.casePackage.manifest.sha256,
        },
      },
    ];
    const promptCorrectInput = await populateResearchSystemPromptHashes(input, [portable, second]);
    const manifest = await createResearchManifestV1(promptCorrectInput);

    await expect(createResearchStudyBundleV1(manifest, [portable, second])).resolves.toMatchObject({
      portableCases: [portable, second],
    });
  });

  it('keeps draft packet export separate from participant launch readiness', async () => {
    const input = await populateResearchSystemPromptHashes(
      makeResearchManifestInput({ portable }),
      [portable],
    );
    const manifest = await createResearchManifestV1(input);
    const bundle = await createResearchStudyBundleV1(manifest, [portable]);
    const readiness = await checkResearchStudyLaunchReadiness(bundle);

    expect(readiness.valid).toBe(false);
    expect(readiness.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('institution-determined'),
      expect.stringContaining('synthetic or attested'),
    ]));
    expect((await validateResearchStudyBundleV1(bundle)).valid).toBe(true);
  });

  it('allows launch only when oversight is institution-determined and cases are synthetic or attested', async () => {
    const synthetic = await revisePortable(portable, {
      deidentification: { status: 'synthetic', notes: 'Created solely for this teaching fixture.' },
    });
    const oversight = {
      status: 'institution-determined' as const,
      determination: 'approved' as const,
      institutionName: 'Example University',
      protocolReference: 'IRB-2026-001',
      determinedAt: '2026-08-01T00:00:00Z',
    };
    const input = await populateResearchSystemPromptHashes(makeResearchManifestInput({
      portable: synthetic,
      oversight,
    }), [synthetic]);
    const manifest = await createResearchManifestV1(input);
    const bundle = await createResearchStudyBundleV1(manifest, [synthetic]);

    expect(await checkResearchStudyLaunchReadiness(bundle)).toEqual({ valid: true, errors: [] });
  });

  it('keeps raw chat opt-in packet-configurable but blocks it at the browser-local launch boundary', async () => {
    const synthetic = await revisePortable(portable, { deidentification: { status: 'synthetic' } });
    const input = makeResearchManifestInput({
      portable: synthetic,
      oversight: {
        status: 'institution-determined',
        determination: 'exempt',
        institutionName: 'Example University',
        protocolReference: 'IRB-2026-002',
        determinedAt: '2026-08-01T00:00:00Z',
      },
    });
    input.collection.rawChat = {
      enabled: true,
      purpose: 'Analyze teaching dialogue.',
      includes: ['learner-text', 'model-text'],
      participantDisclosure: 'The research export includes the words entered and returned in the lesson.',
      accessRoles: ['research-team'],
    };
    input.dataManagement.accessRoles = [...input.dataManagement.accessRoles, 'research-team'];
    const promptCorrectInput = await populateResearchSystemPromptHashes(input, [synthetic]);
    const manifest = await createResearchManifestV1(promptCorrectInput);
    const bundle = await createResearchStudyBundleV1(manifest, [synthetic]);

    expect((await validateResearchStudyBundleV1(bundle)).valid).toBe(true);
    expect((await checkResearchStudyLaunchReadiness(bundle)).errors).toContain(
      'Browser-local participant launch requires raw chat collection to remain disabled.',
    );
  });

  it('allows a minors-inclusive packet for review but blocks browser-local Participant Mode v1', async () => {
    const synthetic = await revisePortable(portable, { deidentification: { status: 'synthetic' } });
    const input = makeResearchManifestInput({
      portable: synthetic,
      oversight: {
        status: 'institution-determined',
        determination: 'approved',
        institutionName: 'Example University',
        protocolReference: 'IRB-2026-CHILD',
        determinedAt: '2026-08-01T00:00:00Z',
      },
    });
    input.protocol.population.includesMinors = true;
    const promptCorrectInput = await populateResearchSystemPromptHashes(input, [synthetic]);
    const manifest = await createResearchManifestV1(promptCorrectInput);
    const bundle = await createResearchStudyBundleV1(manifest, [synthetic]);

    expect((await validateResearchStudyBundleV1(bundle)).valid).toBe(true);
    expect((await checkResearchStudyLaunchReadiness(bundle)).errors).toContain(
      'Browser-local Participant Mode v1 does not enroll minors. Keep this packet in draft/review or use a separately reviewed child-protection workflow.',
    );
  });

  it('recursively rejects bundle envelope extensions and modified manifest hashes', async () => {
    const input = await populateResearchSystemPromptHashes(
      makeResearchManifestInput({ portable }),
      [portable],
    );
    const manifest = await createResearchManifestV1(input);
    const changed = structuredClone(manifest);
    changed.title = 'Changed after finalization';
    const result = await validateResearchStudyBundleV1({
      schema: 'caseattend.research-study-bundle',
      schemaVersion: '1.0',
      researchManifest: changed,
      portableCases: [portable],
      networkCollector: 'https://unexpected.example',
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('networkCollector'),
      expect.stringContaining('hash-verified'),
    ]));
  });
});
