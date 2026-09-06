// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DeferredFeature, { deferFeature } from '../components/DeferredFeature';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('deferred case tools', () => {
  it('isolates a failed download without resetting its successful sibling or reporting readiness', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const viewer = deferred<{ default: React.FC }>();
    const loadViewer = deferFeature(() => viewer.promise);
    const ready = vi.fn();
    const unmountTutor = vi.fn();
    const loadTutor = deferFeature(async () => ({ default: function Tutor() {
      React.useEffect(() => () => unmountTutor(), []);
      return <input aria-label="Tutor answer" defaultValue="" />;
    } }));
    const { rerender } = render(<>
      <DeferredFeature label="image viewer" component={loadViewer} onReadyChange={ready}>{Viewer => <Viewer />}</DeferredFeature>
      <DeferredFeature label="tutor" component={loadTutor}>{Tutor => <Tutor />}</DeferredFeature>
    </>);
    fireEvent.change(await screen.findByLabelText('Tutor answer'), { target: { value: 'Keep this answer' } });
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
    await act(async () => { viewer.reject(new Error('offline')); });
    expect(await screen.findByRole('button', { name: 'Reload case to open the image viewer' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('current workspace will restart');
    expect(ready).not.toHaveBeenCalledWith(true);
    expect((screen.getByLabelText('Tutor answer') as HTMLInputElement).value).toBe('Keep this answer');
    expect(unmountTutor).not.toHaveBeenCalled();
    rerender(<>
      <DeferredFeature label="image viewer" component={loadViewer} onReadyChange={ready}>{Viewer => <Viewer />}</DeferredFeature>
      <DeferredFeature label="tutor" component={loadTutor}>{Tutor => <Tutor />}</DeferredFeature>
    </>);
    expect((screen.getByLabelText('Tutor answer') as HTMLInputElement).value).toBe('Keep this answer');
    expect(unmountTutor).not.toHaveBeenCalled();
  });

  it('uses the latest case after a pending download and preserves the forwarded viewer handle', async () => {
    const loaded = deferred<{ default: React.ForwardRefExoticComponent<{ title: string } & React.RefAttributes<{ capture: () => string }>> }>();
    const load = deferFeature(() => loaded.promise);
    const ready = vi.fn();
    const handle = React.createRef<{ capture: () => string }>();
    const view = (title: string) => <DeferredFeature label="image viewer" component={load} onReadyChange={ready}>
      {Viewer => <Viewer title={title} ref={handle} />}
    </DeferredFeature>;
    const { rerender } = render(view('Case A'));
    rerender(view('Case B'));
    await act(async () => loaded.resolve({ default: React.forwardRef(({ title }, ref) => {
      React.useImperativeHandle(ref, () => ({ capture: () => title }), [title]);
      return <div>{title}</div>;
    }) }));
    expect(await screen.findByText('Case B')).toBeTruthy();
    expect(screen.queryByText('Case A')).toBeNull();
    expect(handle.current?.capture()).toBe('Case B');
    await waitFor(() => expect(ready).toHaveBeenCalledWith(true));
  });

  it('does not mount a late download after leaving the workspace', async () => {
    const loaded = deferred<{ default: React.FC }>();
    const load = deferFeature(() => loaded.promise);
    const ready = vi.fn();
    const mounted = vi.fn();
    const { unmount } = render(<DeferredFeature label="tutor" component={load} onReadyChange={ready}>
      {Tutor => <Tutor />}
    </DeferredFeature>);
    unmount();
    await act(async () => loaded.resolve({ default: () => { mounted(); return <div>Late tutor</div>; } }));
    expect(mounted).not.toHaveBeenCalled();
    expect(ready).not.toHaveBeenCalledWith(true);
  });
});
