// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CaseStudio, {
  type CaseStudioProps,
  type CaseStudioSubmission,
  type StudioAsset,
  type StudioImportResult,
  type StudioPrivacyResult,
} from '../components/CaseStudio/CaseStudio';
import type { CasePackageV1 } from '../core/casePackage';
import type { DomainKey } from '../lib/domains/types';
import { authoredIntroDraft } from './fixtures/authoredIntroCache';
import type { IntroCacheV1 } from '../core/introCache';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const LESSON_HASH = 'c'.repeat(64);
const CASE_HASH = 'd'.repeat(64);

function asset(id: string, sha256: string, previewUrl = `blob:${id}`): StudioAsset {
  return {
    id,
    src: `case://assets/${sha256}.png`,
    mimeType: 'image/png',
    sha256,
    width: 640,
    height: 480,
    previewUrl,
  };
}

function savedCase(overrides: Partial<CasePackageV1> = {}): CasePackageV1 {
  return {
    schemaVersion: '1.0',
    id: 'local-teaching-case',
    title: 'Local teaching case',
    vignette: 'A synthetic learner-facing vignette.',
    domain: 'radiology',
    difficulty: 'intermediate',
    artifact: {
      kind: 'image',
      modality: 'OT',
      seriesId: 'teaching-images',
      seriesLabel: 'Teaching images',
      src: `case://assets/${HASH_A}.png`,
      mimeType: 'image/png',
      sha256: HASH_A,
      alt: 'Neutral teaching image.',
      width: 640,
      height: 480,
    },
    preview: {
      src: `case://assets/${HASH_A}.png`,
      mimeType: 'image/png',
      sha256: HASH_A,
      alt: 'Neutral teaching image.',
      width: 640,
      height: 480,
    },
    artifactHints: {
      showWindowLevel: false,
      showSeriesSelector: false,
      showSegmentation: false,
    },
    provenance: {
      sourceName: 'Synthetic teaching collection',
      sourceUrl: 'https://example.edu/source',
      license: { name: 'CC BY 4.0', spdxId: 'CC-BY-4.0' },
      attribution: 'Example educator',
      clinicianReview: { reviewed: false },
    },
    deidentification: { status: 'synthetic' },
    contentWarnings: ['Medical image'],
    neutralDescription: 'A neutral teaching image.',
    teachingNotes: ['Educator-only answer note.'],
    lessonPlanRef: { id: 'local-teaching-case-lesson', version: '1.0.0', sha256: LESSON_HASH },
    presentation: {
      subtitle: 'Teaching image',
      category: 'custom',
      accentColor: 'rgba(59,130,246,1)',
      accentGlow: 'rgba(59,130,246,0.15)',
      accentBorder: 'rgba(59,130,246,0.3)',
      textClass: 'text-blue-400',
    },
    manifest: { algorithm: 'SHA-256', sha256: CASE_HASH },
    ...overrides,
  };
}

function noWarning(sha256: string): StudioPrivacyResult {
  return {
    assetSha256: sha256,
    textStatus: 'no-warning-detected',
    faceStatus: 'unavailable',
    warnings: ['Face screening is unavailable in this browser. Review the complete image manually.'],
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function props(overrides: Partial<CaseStudioProps> = {}): CaseStudioProps {
  return {
    onExit: vi.fn(),
    processFiles: vi.fn(async (
      files: readonly File[],
      onProgress: (completed: number, total: number) => void,
    ) => {
      onProgress(files.length, files.length);
      return files.map((_, index) => asset(`asset-${index + 1}`, index === 0 ? HASH_A : HASH_B));
    }),
    scanAssets: vi.fn(async (
      assets: readonly StudioAsset[],
      _domain: DomainKey,
      onProgress: (completed: number, total: number) => void,
    ) => {
      onProgress(assets.length, assets.length);
      return assets.map((entry) => noWarning(entry.sha256));
    }),
    saveCase: vi.fn(async () => savedCase()),
    importCase: vi.fn(async () => ({ casePackage: savedCase(), assets: [asset('imported', HASH_A)] })),
    exportCase: vi.fn(async () => undefined),
    onPreview: vi.fn(),
    onOpenLessonBuilder: vi.fn(),
    now: () => new Date('2026-08-09T18:00:00.000Z'),
    ...overrides,
  };
}

function uploadImages(files: File[]) {
  fireEvent.change(screen.getByLabelText('Select images'), { target: { files } });
}

async function advanceToDescription() {
  uploadImages([new File(['safe pixels'], 'teaching.png', { type: 'image/png' })]);
  await screen.findByText('1 image prepared locally. Review the order before continuing.');
  fireEvent.click(screen.getByRole('button', { name: /Next: describe/i }));
}

async function fillDescriptionAndAdvance() {
  await advanceToDescription();
  fireEvent.change(screen.getByLabelText('Case ID *'), { target: { value: 'local-teaching-case' } });
  fireEvent.change(screen.getByLabelText('Case title *'), { target: { value: 'Local teaching case' } });
  fireEvent.change(screen.getByLabelText('Learner-facing vignette *'), { target: { value: 'A synthetic teaching vignette.' } });
  fireEvent.change(screen.getByLabelText('Neutral case description *'), { target: { value: 'A neutral teaching image.' } });
  fireEvent.change(screen.getByLabelText('Accessible image description *'), { target: { value: 'Neutral teaching image' } });
  fireEvent.change(screen.getByLabelText('Educator-only teaching note *'), { target: { value: 'Educator-only answer note.' } });
  fireEvent.click(screen.getByRole('button', { name: /Next: rights and privacy/i }));
}

async function fillRightsAndAdvance() {
  await fillDescriptionAndAdvance();
  fireEvent.change(screen.getByLabelText('Source name *'), { target: { value: 'Synthetic teaching collection' } });
  fireEvent.change(screen.getByLabelText('Source URL *'), { target: { value: 'https://example.edu/source' } });
  fireEvent.change(screen.getByLabelText('License or usage terms *'), { target: { value: 'CC BY 4.0' } });
  fireEvent.change(screen.getByLabelText('License URL *'), { target: { value: 'https://creativecommons.org/licenses/by/4.0/' } });
  fireEvent.change(screen.getByLabelText('Attribution *'), { target: { value: 'Example educator' } });
  fireEvent.click(screen.getByLabelText(/I verified that the recorded terms or separate authorization/));
  fireEvent.click(screen.getByRole('button', { name: 'Run screening' }));
  await screen.findByText(/Automated screening finished/);
  fireEvent.click(screen.getByLabelText(/I reviewed every image and all authored text/));
  fireEvent.click(screen.getByRole('button', { name: /Next: preview and save/i }));
}

describe('CaseStudio', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => {
      throw new Error('Case Studio must not call fetch.');
    }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('leads with image selection and focuses actionable validation errors', () => {
    render(<CaseStudio {...props()} />);

    expect(screen.getByRole('heading', { name: 'Create a teaching case' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Select images' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Next: describe/i }));

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Add at least one JPEG, PNG, or WebP image.');
    expect(document.activeElement).toBe(alert);
  });

  it('rejects raw DICOM before the image processor and gives a recovery path', async () => {
    const processFiles = vi.fn<CaseStudioProps['processFiles']>();
    render(<CaseStudio {...props({ processFiles })} />);

    uploadImages([new File(['dicom bytes'], 'source.dcm', { type: 'application/dicom' })]);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Raw DICOM is not accepted in Case Studio.');
    expect(alert.textContent).toContain('institution-managed clinical-data workflow');
    expect(processFiles).not.toHaveBeenCalled();
  });

  it('disables exit during image preparation and releases assets returned after unmount', async () => {
    const pending = deferred<readonly StudioAsset[]>();
    const lateAsset = asset('late-prepared', HASH_A, 'blob:late-prepared');
    const releaseAsset = vi.fn();
    const processFiles = vi.fn<CaseStudioProps['processFiles']>(() => pending.promise);
    const rendered = render(<CaseStudio {...props({ processFiles, releaseAsset })} />);

    uploadImages([new File(['pixels'], 'late.png', { type: 'image/png' })]);
    await waitFor(() => expect(processFiles).toHaveBeenCalledTimes(1));
    expect((screen.getByRole('button', { name: 'Back to cases' }) as HTMLButtonElement).disabled).toBe(true);

    rendered.unmount();
    await act(async () => {
      pending.resolve([lateAsset]);
      await pending.promise;
    });
    expect(releaseAsset).toHaveBeenCalledWith(lateAsset);
  });

  it('disables exit during import and releases imported previews returned after unmount', async () => {
    const pending = deferred<StudioImportResult>();
    const importedAsset = asset('late-imported', HASH_A, 'blob:late-imported');
    const releaseAsset = vi.fn();
    const importCase = vi.fn<CaseStudioProps['importCase']>(() => pending.promise);
    const rendered = render(<CaseStudio {...props({ importCase, releaseAsset })} />);

    fireEvent.change(screen.getByLabelText('Import case'), {
      target: { files: [new File(['archive'], 'late.caseattend', { type: 'application/vnd.caseattend.case+zip' })] },
    });
    await waitFor(() => expect(importCase).toHaveBeenCalledTimes(1));
    expect((screen.getByRole('button', { name: 'Back to cases' }) as HTMLButtonElement).disabled).toBe(true);

    rendered.unmount();
    await act(async () => {
      pending.resolve({ casePackage: savedCase(), assets: [importedAsset] });
      await pending.promise;
    });
    expect(releaseAsset).toHaveBeenCalledWith(importedAsset);
  });

  it('supports keyboard-operable frame ordering without persisting source filenames', async () => {
    render(<CaseStudio {...props()} />);
    uploadImages([
      new File(['first'], 'patient-name-first.png', { type: 'image/png' }),
      new File(['second'], 'patient-name-second.png', { type: 'image/png' }),
    ]);
    await screen.findByText('2 images prepared locally. Review the order before continuing.');

    expect(screen.queryByText(/patient-name/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Move frame 2 up' }));

    const rows = screen.getAllByRole('listitem').filter((row) => within(row).queryByText(/^Frame \d$/));
    expect((rows[0].querySelector('img') as HTMLImageElement).src).toContain('blob:asset-2');
    expect(screen.getAllByRole('button', { name: /Move frame/ }).every((button) => button.clientHeight >= 0)).toBe(true);
  });

  it('releases prepared duplicate assets while preserving the accepted stack', async () => {
    let call = 0;
    const duplicate = asset('second-browser-id', HASH_A, 'blob:duplicate');
    const processFiles = vi.fn<CaseStudioProps['processFiles']>(async (_files, onProgress) => {
      call += 1;
      onProgress(1, 1);
      return call === 1 ? [asset('accepted', HASH_A, 'blob:accepted')] : [duplicate];
    });
    const releaseAsset = vi.fn();
    render(<CaseStudio {...props({ processFiles, releaseAsset })} />);

    uploadImages([new File(['first'], 'first.png', { type: 'image/png' })]);
    await screen.findByText('1 image prepared locally. Review the order before continuing.');
    uploadImages([new File(['duplicate'], 'duplicate.png', { type: 'image/png' })]);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'The same image was added more than once. Remove the duplicate and try again.',
    );
    expect(releaseAsset).toHaveBeenCalledWith(duplicate);
    expect((document.querySelector('.case-studio-asset-preview img') as HTMLImageElement).src).toContain('blob:accepted');
  });

  it('keeps entered work after a failed import', async () => {
    const importCase = vi.fn(async () => { throw new Error('Archive digest does not match its image.'); });
    render(<CaseStudio {...props({ importCase })} />);
    await advanceToDescription();
    fireEvent.change(screen.getByLabelText('Case title *'), { target: { value: 'Work that must survive' } });
    fireEvent.click(screen.getByRole('button', { name: /^Back$/i }));

    fireEvent.change(screen.getByLabelText('Import case'), {
      target: { files: [new File(['bad archive'], 'bad.caseattend', { type: 'application/zip' })] },
    });
    await screen.findByText('Archive digest does not match its image.');
    fireEvent.click(screen.getByRole('button', { name: /Next: describe/i }));

    expect((screen.getByLabelText('Case title *') as HTMLInputElement).value).toBe('Work that must survive');
  });

  it('presents imported attestation as package metadata and requires a fresh local screen before re-saving', async () => {
    const importedCase = savedCase({
      deidentification: {
        status: 'attested',
        attestedBy: 'Institutional reviewer',
        attestedAt: '2026-08-01T12:00:00.000Z',
      },
      provenance: {
        sourceName: 'Synthetic teaching collection',
        sourceUrl: 'https://example.edu/source',
        license: {
          name: 'CC BY 4.0',
          spdxId: 'CC-BY-4.0',
          url: 'https://creativecommons.org/licenses/by/4.0/',
        },
        attribution: 'Example educator',
        clinicianReview: {
          reviewed: true,
          reviewer: 'Teaching clinician',
          credentials: 'MD',
          reviewedAt: '2026-08-01T12:00:00.000Z',
        },
      },
    });
    const importCase = vi.fn(async () => ({
      casePackage: importedCase,
      assets: [asset('imported', HASH_A)],
      privacyResults: [noWarning(HASH_A)],
    }));
    render(<CaseStudio {...props({ importCase })} />);

    fireEvent.change(screen.getByLabelText('Import case'), {
      target: { files: [new File(['archive'], 'case.caseattend', { type: 'application/vnd.caseattend.case+zip' })] },
    });

    expect(await screen.findByText('Imported package metadata')).toBeTruthy();
    expect(screen.getByText('De-identification attested (imported package metadata)')).toBeTruthy();
    expect(screen.getByText('Clinician reviewed (imported package metadata)')).toBeTruthy();
    expect(screen.getByText(/Portable case imported and saved/).textContent).toContain('browser-local screening has not run here');

    fireEvent.click(screen.getByRole('button', { name: /^Back$/i }));
    expect(screen.getByText(/metadata to review, not proof that this browser completed privacy screening/)).toBeTruthy();
    expect(screen.queryByText(/Text screening:/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Next: preview and save/i }));
    expect(screen.getByRole('alert').textContent).toContain('Run the browser-local privacy screening for every image.');
  });

  it('does not turn imported not-reviewed metadata into an attestation choice', async () => {
    const importedCase = savedCase({
      deidentification: {
        status: 'not-reviewed',
        notes: 'The archive does not carry a de-identification attestation.',
      },
    });
    const importCase = vi.fn(async () => ({
      casePackage: importedCase,
      assets: [asset('imported-not-reviewed', HASH_A)],
    }));
    render(<CaseStudio {...props({ importCase })} />);

    fireEvent.change(screen.getByLabelText('Import case'), {
      target: { files: [new File(['archive'], 'not-reviewed.caseattend', { type: 'application/vnd.caseattend.case+zip' })] },
    });

    expect(await screen.findByText('Not reviewed (imported package metadata)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Back$/i }));

    expect((screen.getByLabelText(/Synthetic case/) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText(/De-identification attested/) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Next: preview and save/i }));
    expect(screen.getByRole('alert').textContent).toContain(
      'Choose Synthetic case or De-identification attested before saving an imported case that was not reviewed.',
    );
  });

  it('requires a rights-use confirmation separate from privacy review', async () => {
    render(<CaseStudio {...props()} />);
    await fillDescriptionAndAdvance();
    fireEvent.change(screen.getByLabelText('Source name *'), { target: { value: 'Authorized teaching collection' } });
    fireEvent.change(screen.getByLabelText('Source URL *'), { target: { value: 'https://example.edu/source' } });
    fireEvent.change(screen.getByLabelText('License or usage terms *'), { target: { value: 'Institutional authorization' } });
    fireEvent.change(screen.getByLabelText('License URL *'), { target: { value: 'https://example.edu/terms' } });
    fireEvent.change(screen.getByLabelText('Attribution *'), { target: { value: 'Example educator' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run screening' }));
    await screen.findByText(/Automated screening finished/);
    fireEvent.click(screen.getByLabelText(/I reviewed every image and all authored text/));
    fireEvent.click(screen.getByRole('button', { name: /Next: preview and save/i }));

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain(
      'Confirm that the recorded terms or authorization permit storing, using, and exporting these images.',
    );
    expect((screen.getByLabelText(/I reviewed every image and all authored text/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/I verified that the recorded terms or separate authorization/) as HTMLInputElement).checked).toBe(false);
  });

  it('requires screening and human review, then saves exact ordered neutral alt text', async () => {
    let submission: CaseStudioSubmission | undefined;
    const saveCase = vi.fn(async (value: CaseStudioSubmission) => {
      submission = value;
      return savedCase();
    });
    const configured = props({ saveCase });
    render(<CaseStudio {...configured} />);

    await fillDescriptionAndAdvance();
    fireEvent.change(screen.getByLabelText('Source name *'), { target: { value: 'Synthetic teaching collection' } });
    fireEvent.change(screen.getByLabelText('Source URL *'), { target: { value: 'https://example.edu/source' } });
    fireEvent.change(screen.getByLabelText('License or usage terms *'), { target: { value: 'CC BY 4.0' } });
    fireEvent.change(screen.getByLabelText('License URL *'), { target: { value: 'https://creativecommons.org/licenses/by/4.0/' } });
    fireEvent.change(screen.getByLabelText('Attribution *'), { target: { value: 'Example educator' } });
    fireEvent.click(screen.getByLabelText(/I verified that the recorded terms or separate authorization/));
    fireEvent.click(screen.getByLabelText(/De-identification attested/));
    fireEvent.change(screen.getByLabelText('Attester name *'), { target: { value: 'Case author' } });
    fireEvent.click(screen.getByRole('button', { name: /Next: preview and save/i }));
    expect(screen.getByRole('alert').textContent).toContain('Run the browser-local privacy screening');

    fireEvent.click(screen.getByRole('button', { name: 'Run screening' }));
    await screen.findByText(/Automated screening finished/);
    fireEvent.click(screen.getByLabelText(/I reviewed every image and all authored text/));
    fireEvent.click(screen.getByRole('button', { name: /Next: preview and save/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Save case' }));

    await screen.findByText('Saved case ready to use');
    expect(submission?.assets[0].alt).toBe('Neutral teaching image');
    expect(submission?.privacyReview).toEqual({
      humanReviewed: true,
      reviewedBy: 'Case author',
      reviewedAt: '2026-08-09T18:00:00.000Z',
      explanationAcknowledged: true,
    });
    expect(submission?.rightsUseReview).toEqual({
      confirmed: true,
      confirmedAt: '2026-08-09T18:00:00.000Z',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('requires a new domain-aware privacy screen after the case domain changes', async () => {
    const configured = props();
    render(<CaseStudio {...configured} />);
    await fillDescriptionAndAdvance();
    fireEvent.change(screen.getByLabelText('Source name *'), { target: { value: 'Synthetic teaching collection' } });
    fireEvent.change(screen.getByLabelText('Source URL *'), { target: { value: 'https://example.edu/source' } });
    fireEvent.change(screen.getByLabelText('License or usage terms *'), { target: { value: 'CC BY 4.0' } });
    fireEvent.change(screen.getByLabelText('License URL *'), { target: { value: 'https://creativecommons.org/licenses/by/4.0/' } });
    fireEvent.change(screen.getByLabelText('Attribution *'), { target: { value: 'Example educator' } });
    fireEvent.click(screen.getByLabelText(/I verified that the recorded terms or separate authorization/));
    fireEvent.click(screen.getByRole('button', { name: 'Run screening' }));
    await screen.findByText(/Automated screening finished/);

    fireEvent.click(screen.getByRole('button', { name: /^Back$/i }));
    fireEvent.change(screen.getByLabelText('Specialty *'), { target: { value: 'dermatology' } });
    fireEvent.click(screen.getByRole('button', { name: /Next: rights and privacy/i }));
    expect(screen.getByText(/Domain changed. Run browser-local privacy screening again/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/I reviewed every image and all authored text/));
    fireEvent.click(screen.getByRole('button', { name: /Next: preview and save/i }));

    expect(screen.getByRole('alert').textContent).toContain('Run the browser-local privacy screening for every image.');
    fireEvent.click(screen.getByRole('button', { name: 'Run screening' }));
    await waitFor(() => expect(configured.scanAssets).toHaveBeenLastCalledWith(
      expect.any(Array),
      'dermatology',
      expect.any(Function),
    ));
  });

  it('locks step navigation during a delayed scan so its domain cannot change underneath it', async () => {
    const pending = deferred<readonly StudioPrivacyResult[]>();
    const scanAssets = vi.fn<CaseStudioProps['scanAssets']>((currentAssets, domain, onProgress) => {
      onProgress(currentAssets.length, currentAssets.length);
      expect(domain).toBe('radiology');
      return pending.promise;
    });
    render(<CaseStudio {...props({ scanAssets })} />);
    await fillDescriptionAndAdvance();

    fireEvent.click(screen.getByRole('button', { name: 'Run screening' }));
    await waitFor(() => expect(scanAssets).toHaveBeenCalledTimes(1));
    const describeStep = screen.getByRole('button', { name: /Describe/ });
    expect((describeStep as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByLabelText('Source name *').matches(':disabled')).toBe(true);
    fireEvent.click(describeStep);
    expect(screen.getByRole('heading', { name: 'Review rights and privacy' })).toBeTruthy();

    await act(async () => {
      pending.resolve([noWarning(HASH_A)]);
      await pending.promise;
    });
    await screen.findByText(/Automated screening finished/);
    expect((describeStep as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(describeStep);
    fireEvent.change(screen.getByLabelText('Specialty *'), { target: { value: 'dermatology' } });
    fireEvent.click(screen.getByRole('button', { name: /Next: rights and privacy/i }));
    expect(screen.getByText(/Domain changed. Run browser-local privacy screening again/)).toBeTruthy();
    expect(screen.queryByText(/Text screening:/)).toBeNull();
  });

  it('announces when durable browser storage cannot be verified', async () => {
    render(<CaseStudio {...props({
      getStorageStatus: vi.fn(async () => {
        throw new Error('IndexedDB unavailable');
      }),
    })} />);

    const storageCopy = await screen.findByText(/Storage status could not be verified/);
    expect(storageCopy.closest('[role="status"]')?.textContent).toContain('Export a portable copy before closing this page.');
  });

  it('announces a runtime switch to memory-only storage after IndexedDB initially succeeds', async () => {
    let onStorageStatus: ((status: { persistent: boolean; message: string }) => void) | undefined;
    const unsubscribe = vi.fn();
    render(<CaseStudio {...props({
      getStorageStatus: vi.fn(async () => ({
        persistent: true,
        message: 'Cases and drafts are stored only in this browser.',
      })),
      subscribeStorageStatus: vi.fn((listener) => {
        onStorageStatus = listener;
        return unsubscribe;
      }),
    })} />);

    await screen.findByText(/Export a copy to keep or share your case/);
    act(() => {
      onStorageStatus?.({
        persistent: false,
        message: 'Memory-only mode. Cases and drafts will be lost when this page closes.',
      });
    });
    expect(screen.getByText(/Memory-only mode/).closest('[role="status"]')?.textContent)
      .toContain('Export a portable copy before closing this page.');

    cleanup();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('keeps unsaved work when the author cancels exit and registers a page-close guard', async () => {
    const onExit = vi.fn();
    vi.stubGlobal('confirm', vi.fn(() => false));
    render(<CaseStudio {...props({ onExit })} />);
    await advanceToDescription();
    fireEvent.change(screen.getByLabelText('Case title *'), { target: { value: 'Unsaved work to preserve' } });

    const beforeUnload = new Event('beforeunload', { cancelable: true });
    act(() => { window.dispatchEvent(beforeUnload); });
    expect(beforeUnload.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Back to cases' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Unsaved images and authored text will be lost'));
    expect(onExit).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Case title *') as HTMLInputElement).value).toBe('Unsaved work to preserve');
  });

  it('allows exit without a prompt after a persistent exact save', async () => {
    const onExit = vi.fn();
    vi.stubGlobal('confirm', vi.fn(() => false));
    render(<CaseStudio {...props({
      onExit,
      getStorageStatus: vi.fn(async () => ({
        persistent: true,
        message: 'Cases and drafts are stored only in this browser.',
      })),
    })} />);
    await screen.findByText(/Export a copy to keep or share your case/);
    await fillRightsAndAdvance();
    fireEvent.click(screen.getByRole('button', { name: 'Save case' }));
    await screen.findByText('Saved case ready to use');

    fireEvent.click(screen.getByRole('button', { name: 'Back to cases' }));
    expect(confirm).not.toHaveBeenCalled();
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('warns that a saved memory-only case must be exported before exit', async () => {
    const onExit = vi.fn();
    vi.stubGlobal('confirm', vi.fn(() => false));
    render(<CaseStudio {...props({
      onExit,
      getStorageStatus: vi.fn(async () => ({
        persistent: false,
        message: 'Memory-only mode. Cases and drafts will be lost when this page closes.',
      })),
    })} />);
    await screen.findByText(/Memory-only mode/);
    await fillRightsAndAdvance();
    fireEvent.click(screen.getByRole('button', { name: 'Save case' }));
    await screen.findByText('Saved case ready to use');

    fireEvent.click(screen.getByRole('button', { name: 'Back to cases' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Export a portable copy first'));
    expect(onExit).not.toHaveBeenCalled();
  });

  it('offers viewer, lesson, and portable export actions after a browser-local save', async () => {
    const configured = props();
    render(<CaseStudio {...configured} />);
    await fillRightsAndAdvance();
    fireEvent.click(screen.getByRole('button', { name: 'Save case' }));
    await screen.findByText('Saved case ready to use');

    fireEvent.click(screen.getByRole('button', { name: 'Open case' }));
    fireEvent.click(screen.getByRole('button', { name: 'Build the lesson' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export a copy' }));

    await waitFor(() => expect(configured.exportCase).toHaveBeenCalledTimes(1));
    expect(configured.onPreview).toHaveBeenCalledWith(expect.objectContaining({ id: 'local-teaching-case' }));
    expect(configured.onOpenLessonBuilder).toHaveBeenCalledWith('local-teaching-case');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('creates the case identifier from a new title and preserves a custom identifier', async () => {
    render(<CaseStudio {...props()} />);
    await advanceToDescription();
    const title = screen.getByLabelText('Case title *');
    const identifier = screen.getByLabelText('Case ID *') as HTMLInputElement;
    expect(identifier.closest('details')?.open).toBe(false);
    fireEvent.change(title, { target: { value: 'Comparing Two Patterns' } });
    expect(identifier.value).toBe('comparing-two-patterns');
    fireEvent.change(title, { target: { value: 'Comparing Three Patterns' } });
    expect(identifier.value).toBe('comparing-three-patterns');
    fireEvent.click(screen.getByText('Case identifier and image settings'));
    fireEvent.change(identifier, { target: { value: 'my-stable-case' } });
    fireEvent.change(title, { target: { value: 'A revised title' } });
    expect(identifier.value).toBe('my-stable-case');
    fireEvent.change(identifier, { target: { value: 'Invalid Identifier' } });
    (identifier.closest('details') as HTMLDetailsElement).open = false;
    fireEvent.click(screen.getByRole('button', { name: /Next: rights and privacy/i }));
    expect(identifier.closest('details')?.open).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('Case ID must use lowercase');
  });

  it('saves locally with a connected account and generates only after the explicit action', async () => {
    const generate = vi.fn(async () => authoredIntroDraft());
    const getStatus = vi.fn(async () => ({ kind: 'idle' as const }));
    const configured = props({ getIntroCacheStatus: getStatus, generateIntroCache: generate,
      approveIntroCache: vi.fn(), saveIntroCacheDraft: vi.fn(), hasApiKey: () => true });
    render(<CaseStudio {...configured} />);
    await fillRightsAndAdvance();
    fireEvent.click(screen.getByRole('button', { name: 'Save case' }));
    await screen.findByText('Saved case ready to use');
    await waitFor(() => expect(getStatus).toHaveBeenCalled());
    expect(generate).not.toHaveBeenCalled();
    expect(screen.getByText(/Generating sends this case’s text and selected images/).textContent).toContain('Model charges may apply');
    fireEvent.click(screen.getByRole('button', { name: 'Generate draft answers' }));
    await screen.findByRole('button', { name: 'Approve starter answers' });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith('local-teaching-case', { signal: expect.any(AbortSignal) });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not generate on import, a stale status notification, or connecting an account', async () => {
    let refresh = () => {};
    let connected = false;
    const generate = vi.fn(async () => authoredIntroDraft());
    const configured = props({ getIntroCacheStatus: vi.fn(async () => ({ kind: 'stale' as const, cache: authoredIntroDraft() })),
      subscribeIntroCacheChanges: listener => { refresh = listener; return () => {}; },
      generateIntroCache: generate, approveIntroCache: vi.fn(), saveIntroCacheDraft: vi.fn(), hasApiKey: () => connected });
    const view = render(<CaseStudio {...configured} />);
    fireEvent.change(screen.getByLabelText('Import case'), { target: { files: [new File(['archive'], 'example.caseattend')] } });
    await screen.findByText(/The case or lesson has changed/);
    await act(async () => refresh());
    connected = true;
    view.rerender(<CaseStudio {...configured} />);
    expect(generate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Open case' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate draft answers' }));
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
  });

  it('keeps save and export available when explicitly requested generation fails', async () => {
    const configured = props({ getIntroCacheStatus: vi.fn(async () => ({ kind: 'idle' as const })),
      generateIntroCache: vi.fn(async () => { throw new Error('The model is unavailable.'); }),
      approveIntroCache: vi.fn(), saveIntroCacheDraft: vi.fn(), hasApiKey: () => true });
    render(<CaseStudio {...configured} />);
    fireEvent.change(screen.getByLabelText('Import case'), { target: { files: [new File(['archive'], 'example.caseattend')] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Generate draft answers' }));
    await screen.findByText('The model is unavailable.');
    fireEvent.click(screen.getByRole('button', { name: 'Export a copy' }));
    await waitFor(() => expect(configured.exportCase).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Open case' })).toBeTruthy();
  });

  it('keeps navigation locked across saving edits and approving the draft', async () => {
    const save = deferred<void>();
    const approval = deferred<IntroCacheV1>();
    const configured = props({ getIntroCacheStatus: vi.fn(async () => ({ kind: 'ready-for-review' as const, draft: authoredIntroDraft() })),
      generateIntroCache: vi.fn(), approveIntroCache: vi.fn(() => approval.promise), saveIntroCacheDraft: vi.fn(() => save.promise), hasApiKey: () => true });
    render(<CaseStudio {...configured} />);
    fireEvent.change(screen.getByLabelText('Import case'), { target: { files: [new File(['archive'], 'example.caseattend')] } });
    await screen.findByRole('button', { name: 'Approve starter answers' });
    fireEvent.change(screen.getAllByLabelText('Opening question')[0], { target: { value: 'Reviewed question' } });
    fireEvent.change(screen.getByLabelText('Reviewer name'), { target: { value: 'Alex Educator' } });
    fireEvent.change(screen.getByLabelText('Credentials'), { target: { value: 'MD' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve starter answers' }));
    const expectNavigationLocked = () => {
      for (const name of ['Back', 'Back to cases', 'Open case', 'Build the lesson', 'Done', /^Images/]) {
        const button = screen.getByRole('button', { name });
        expect(button.matches(':disabled')).toBe(true);
        fireEvent.click(button);
      }
      expect(screen.getByRole('button', { name: 'Regenerate draft answers' }).matches(':disabled')).toBe(true);
      expect(configured.onExit).not.toHaveBeenCalled();
      expect(configured.onPreview).not.toHaveBeenCalled();
    };
    expectNavigationLocked();
    await act(async () => save.resolve());
    expect(configured.approveIntroCache).toHaveBeenCalledTimes(1);
    expectNavigationLocked();
    const approved = authoredIntroDraft();
    approved.review = { status: 'approved', reviewer: 'Alex Educator', credentials: 'MD', reviewedAt: '2026-09-05T12:00:00.000Z' };
    await act(async () => approval.resolve(approved));
    expect(screen.getByRole('button', { name: 'Back' }).matches(':disabled')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Review rights and privacy' })).toBeTruthy();
  });

  it.each(['success', 'failure'] as const)('ignores an old generation %s after another case is imported and started', async outcome => {
    const first = deferred<IntroCacheV1>();
    const second = deferred<IntroCacheV1>();
    const generate = vi.fn<NonNullable<CaseStudioProps['generateIntroCache']>>()
      .mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const configured = props({ getIntroCacheStatus: vi.fn(async () => ({ kind: 'idle' as const })),
      generateIntroCache: generate, approveIntroCache: vi.fn(), saveIntroCacheDraft: vi.fn(), hasApiKey: () => true,
      importCase: vi.fn<CaseStudioProps['importCase']>().mockResolvedValueOnce({ casePackage: savedCase(), assets: [asset('first', HASH_A)] })
        .mockResolvedValueOnce({ casePackage: savedCase({ id: 'second-case', manifest: { algorithm: 'SHA-256', sha256: HASH_B } }), assets: [asset('second', HASH_B)] }),
    });
    render(<CaseStudio {...configured} />);
    const importFile = () => fireEvent.change(screen.getByLabelText('Import case'), { target: { files: [new File(['archive'], 'example.caseattend')] } });
    importFile();
    fireEvent.click(await screen.findByRole('button', { name: 'Generate draft answers' }));
    const firstSignal = generate.mock.calls[0][1]!.signal!;
    fireEvent.click(screen.getByRole('button', { name: /^Images/ }));
    importFile();
    fireEvent.click(await screen.findByRole('button', { name: 'Generate draft answers' }));
    expect(firstSignal.aborted).toBe(true);
    await act(async () => {
      if (outcome === 'success') first.resolve(authoredIntroDraft('local-teaching-case', 'Old draft'));
      else first.reject(new Error('Old request failed'));
    });
    expect(screen.getByText(/Creating draft questions and answers/)).toBeTruthy();
    expect(screen.queryByText('Old request failed')).toBeNull();
    await act(async () => second.resolve(authoredIntroDraft('second-case', 'New draft')));
    expect((screen.getAllByLabelText('Opening question')[0] as HTMLTextAreaElement).value).toBe('New draft');
  });
});
