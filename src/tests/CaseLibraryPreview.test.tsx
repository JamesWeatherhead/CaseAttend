// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CaseLibraryPreview, { libraryThumbnail } from '../components/CaseLibraryPreview';
import { LIBRARY_THUMBNAILS } from '../data/libraryThumbnails.generated';

const { resolveAssetUri } = vi.hoisted(() => ({ resolveAssetUri: vi.fn() }));
vi.mock('../services/casePackageStore', () => ({ casePackageStore: { resolveAssetUri } }));

const [source, thumbnail] = Object.entries(LIBRARY_THUMBNAILS)[0];
const preview = { src: source, sha256: thumbnail.sourceSha256, mimeType: 'image/png', alt: 'Teaching image preview' };
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('library thumbnail selection and recovery', () => {
  it('uses the derivative only for the exact canonical source and digest', () => {
    expect(libraryThumbnail(preview)).toBe(thumbnail);
    expect(libraryThumbnail({ ...preview, sha256: '0'.repeat(64) })).toBeUndefined();
    expect(libraryThumbnail({ ...preview, src: '/images/unregistered.png' })).toBeUndefined();
    expect(libraryThumbnail({ ...preview, src: `case://assets/${preview.sha256}.png` })).toBeUndefined();
  });

  it('falls back once to the canonical image, then a readable placeholder, and resets for a changed source', () => {
    const view = render(<CaseLibraryPreview preview={preview} />);
    const image = screen.getByRole('img', { name: preview.alt });
    expect(image.getAttribute('src')).toBe(thumbnail.src);
    fireEvent.error(image);
    expect(image.getAttribute('src')).toBe(source);
    fireEvent.error(image);
    expect(screen.getByText('Preview unavailable')).toBeTruthy();
    expect(screen.getByRole('img', { name: preview.alt }).tagName).toBe('DIV');
    view.rerender(<CaseLibraryPreview preview={{ ...preview, src: '/images/another.jpg' }} />);
    expect(screen.getByRole('img', { name: preview.alt }).getAttribute('src')).toBe('/images/another.jpg');
    view.rerender(<CaseLibraryPreview preview={preview} />);
    expect(screen.getByRole('img', { name: preview.alt }).getAttribute('src')).toBe(thumbnail.src);
    fireEvent.error(screen.getByRole('img', { name: preview.alt }));
    fireEvent.error(screen.getByRole('img', { name: preview.alt }));
    view.rerender(<CaseLibraryPreview preview={{ ...preview, sha256: '0'.repeat(64) }} />);
    expect(screen.getByRole('img', { name: preview.alt }).getAttribute('src')).toBe(source);
    view.rerender(<CaseLibraryPreview preview={preview} />);
    expect(screen.getByRole('img', { name: preview.alt }).getAttribute('src')).toBe(thumbnail.src);
  });

  it('resolves local images through the local store without choosing a built-in thumbnail', async () => {
    let resolve!: (src: string) => void;
    resolveAssetUri.mockReturnValue(new Promise<string>(done => { resolve = done; }));
    const local = { ...preview, src: `case://assets/${preview.sha256}.webp` };
    render(<CaseLibraryPreview preview={local} />);
    expect(screen.getByRole('img').getAttribute('src')).toBeNull();
    expect(resolveAssetUri).toHaveBeenCalledWith(local.src);
    await act(async () => resolve('blob:verified-local-image'));
    expect(screen.getByRole('img').getAttribute('src')).toBe('blob:verified-local-image');
  });

  it('shows an unavailable local preview and ignores a stale local resolution after switching cases', async () => {
    const local = { ...preview, src: `case://assets/${preview.sha256}.webp` };
    resolveAssetUri.mockRejectedValueOnce(new Error('Missing local asset'));
    const view = render(<CaseLibraryPreview preview={local} />);
    expect(await screen.findByText('Preview unavailable')).toBeTruthy();
    let resolve!: (src: string) => void;
    resolveAssetUri.mockReturnValueOnce(new Promise<string>(done => { resolve = done; }));
    view.rerender(<CaseLibraryPreview preview={{ ...local, src: `case://assets/${'0'.repeat(64)}.webp` }} />);
    view.rerender(<CaseLibraryPreview preview={preview} />);
    await act(async () => resolve('blob:previous-case-image'));
    expect(screen.getByRole('img').getAttribute('src')).toBe(thumbnail.src);
  });
});
