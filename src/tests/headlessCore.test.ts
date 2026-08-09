import { describe, expect, it, vi } from 'vitest';
import {
  assertCoreEventV1,
  CaseAttendCoreError,
  CORE_MAX_ARTIFACT_BYTES,
  createCaseAttendEngine,
  type CaseMaterial,
  type CoreEventV1,
} from '../../packages/core/src';

const HASH = 'a'.repeat(64);
const caseMaterial: CaseMaterial = {
  id: 'demo-case',
  title: 'Safe teaching case',
  domainId: 'custom-domain',
  casePackage: { synthetic: true },
};

function turnInput(overrides: Record<string, unknown> = {}) {
  return {
    caseId: 'demo-case',
    learnerMessage: 'Try.',
    learnerLevel: 'undergrad' as const,
    mode: 'chat' as const,
    hasImage: false,
    historyWindowMessages: [],
    ...overrides,
  };
}

function createEngine(overrides: Partial<Parameters<typeof createCaseAttendEngine>[0]> = {}) {
  const events: CoreEventV1[] = [];
  const engine = createCaseAttendEngine({
    caseRegistry: {
      async listCases() { return [caseMaterial]; },
      async getCase(id) { return id === caseMaterial.id ? caseMaterial : undefined; },
    },
    artifactLoader: {
      async loadArtifact() { return { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png' }; },
    },
    domains: [{ id: 'custom-domain', displayName: 'A custom domain', supports: () => true }],
    promptComposer: {
      async compose({ learnerMessage }) { return { prompt: `Teach safely: ${learnerMessage}`, sha256: HASH }; },
    },
    inference: async () => ({ text: 'Observe the evidence.', modelId: 'local-model', finishReason: 'stop' }),
    destination: { kind: 'teaching', sessionStore: { append(event) { events.push(event); } } },
    platform: { now: () => 100, randomId: () => 'test-id', async sha256() { return HASH; } },
    ...overrides,
  });
  return { engine, events };
}

describe('headless CaseAttend core', () => {
  it('runs an open-domain turn while events remain raw-free and versioned', async () => {
    const { engine, events } = createEngine();

    const result = await engine.runTurn(turnInput({ learnerMessage: 'What can I observe?' }));

    expect(result.text).toBe('Observe the evidence.');
    expect(events.map((event) => event.type)).toEqual(['turn_started', 'turn_succeeded']);
    expect(JSON.stringify(events)).not.toContain('What can I observe?');
    expect(JSON.stringify(events)).not.toContain('Observe the evidence.');
    expect(events.every((event) => event.schema === 'caseattend.core.event' && event.version === '1.0')).toBe(true);
    expect(JSON.stringify(engine)).toEqual('{"contractVersion":"1.0"}');
  });

  it('clones artifact bytes before hashing or inference can await', async () => {
    const source = new Uint8Array([1, 2, 3]);
    let inferredArtifact: Uint8Array | undefined;
    const { engine } = createEngine({
      artifactLoader: { async loadArtifact() { return { bytes: source, mimeType: 'image/png' }; } },
      platform: {
        now: () => 100,
        randomId: () => 'test-id',
        async sha256(bytes) {
          if (bytes.length === 3) {
            source[0] = 99;
            expect(bytes[0]).toBe(1);
          }
          return HASH;
        },
      },
      inference: async (request) => {
        inferredArtifact = request.artifact?.bytes;
        return { text: 'ok' };
      },
    });

    await engine.runTurn(turnInput({ learnerMessage: 'Show me.', hasImage: true, artifact: { id: 'frame-1' } }));

    expect(inferredArtifact?.[0]).toBe(1);
  });

  it('verifies artifact reference digest and MIME claims before inference', async () => {
    const { engine } = createEngine();
    await expect(engine.loadArtifact('demo-case', { id: 'frame-1', sha256: HASH, mimeType: 'image/png' })).resolves.toMatchObject({ sha256: HASH, mimeType: 'image/png' });
    await expect(engine.loadArtifact('demo-case', { id: 'frame-1', sha256: 'b'.repeat(64) })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(engine.loadArtifact('demo-case', { id: 'frame-1', mimeType: 'image/jpeg' })).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('fails closed before inference when research start persistence fails but preserves instruction when teaching telemetry fails', async () => {
    const inference = vi.fn(async () => ({ text: 'must not run' }));
    const research = createEngine({
      destination: { kind: 'research', researchSink: { async record() { throw new Error('database secret body'); } } },
      inference,
    });
    await expect(research.engine.runTurn(turnInput())).rejects.toMatchObject({
      code: 'persistence_failed',
      message: 'The research record could not be saved.',
    });
    expect(inference).not.toHaveBeenCalled();

    const teaching = createEngine({
      destination: { kind: 'teaching', sessionStore: { append() { throw new Error('offline'); } } },
    });
    await expect(teaching.engine.runTurn(turnInput())).resolves.toMatchObject({ text: 'Observe the evidence.' });
  });

  it('curates adapter failures and emits exactly one terminal event', async () => {
    const { engine, events } = createEngine({
      inference: async () => { throw new Error('Bearer super-secret-provider-response'); },
    });

    await expect(engine.runTurn(turnInput())).rejects.toEqual(
      new CaseAttendCoreError('inference_failed'),
    );
    expect(events.map((event) => event.type)).toEqual(['turn_started', 'turn_failed']);
    expect(events.filter((event) => event.type === 'turn_failed' || event.type === 'turn_succeeded')).toHaveLength(1);
  });

  it('rejects credential-shaped case data before it can reach an adapter or sink', async () => {
    const { engine } = createEngine({
      caseRegistry: {
        async listCases() { return []; },
        async getCase() { return { ...caseMaterial, unexpected: 'not-allowed' } as CaseMaterial; },
      },
    });

    await expect(engine.runTurn(turnInput())).rejects.toMatchObject({ code: 'configuration' });
  });

  it('snapshots context, closes late deltas, and requires image context to match an artifact', async () => {
    let lateDelta: ((delta: string) => void) | undefined;
    let composedHistory = '';
    const received: string[] = [];
    const { engine } = createEngine({
      promptComposer: {
        async compose({ historyWindowMessages }) {
          composedHistory = historyWindowMessages[0]?.text ?? '';
          return { prompt: 'stable prompt', sha256: HASH };
        },
      },
      inference: async (request) => {
        lateDelta = request.onTextDelta;
        request.onTextDelta('first');
        return { text: 'done' };
      },
    });
    const history = [{ role: 'learner' as const, text: 'original' }];
    const pending = engine.runTurn(turnInput({ historyWindowMessages: history, onTextDelta: (text: string) => received.push(text) }));
    history[0].text = 'mutated';
    await pending;
    lateDelta?.('late');
    expect(composedHistory).toBe('original');
    expect(received).toEqual(['first']);
    await expect(engine.runTurn(turnInput({ hasImage: true }))).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('rejects hostile adapter metadata without invoking accessors or persisting it', async () => {
    const events: CoreEventV1[] = [];
    const { engine } = createEngine({
      destination: { kind: 'teaching', sessionStore: { append(event) { events.push(event); } } },
      inference: async () => {
        const hostile: Record<string, unknown> = { text: 'never used' };
        Object.defineProperty(hostile, 'modelId', { enumerable: true, get() { throw new Error('getter ran'); } });
        return hostile as never;
      },
    });
    await expect(engine.runTurn(turnInput())).rejects.toMatchObject({ code: 'inference_failed' });
    expect(JSON.stringify(events)).not.toContain('getter ran');
  });

  it('supports stateful class adapters while never inspecting their private state', async () => {
    class StatefulRegistry {
      readonly privateState = { databaseHandle: 'opaque' };
      async listCases() { return [caseMaterial]; }
      async getCase(id: string) { return id === caseMaterial.id ? caseMaterial : undefined; }
    }
    class StatefulArtifactLoader {
      readonly cache = new Map<string, Uint8Array>();
      async loadArtifact() { return { bytes: new Uint8Array([1]), mimeType: 'image/png' }; }
    }
    class StatefulComposer {
      readonly templateState = { revision: 1 };
      async compose() { return { prompt: 'Class adapter prompt', sha256: HASH }; }
    }
    class StatefulStore {
      readonly events: CoreEventV1[] = [];
      append(event: CoreEventV1) { this.events.push(event); }
    }
    class StatefulPlatform {
      readonly clockState = { now: 100 };
      now() { return this.clockState.now; }
      randomId() { return 'class-adapter-id'; }
      async sha256() { return HASH; }
    }
    class StatefulDomain {
      readonly id = 'custom-domain';
      readonly displayName = 'Stateful domain';
      readonly privateConfiguration = { arbitrary: true };
      supports(material: CaseMaterial) { return material.domainId === this.id; }
    }
    const store = new StatefulStore();
    const engine = createCaseAttendEngine({
      caseRegistry: new StatefulRegistry(),
      artifactLoader: new StatefulArtifactLoader(),
      domains: [new StatefulDomain()],
      promptComposer: new StatefulComposer(),
      inference: async () => ({ text: 'Class adapters work.' }),
      destination: { kind: 'teaching', sessionStore: store },
      platform: new StatefulPlatform(),
    });

    await expect(engine.runTurn(turnInput())).resolves.toMatchObject({ text: 'Class adapters work.' });
    expect(store.events.map((event) => event.type)).toEqual(['turn_started', 'turn_succeeded']);
  });

  it('rejects accessor-backed adapter methods without evaluating the accessor', () => {
    let getterRan = false;
    const registry = { async listCases() { return [caseMaterial]; } } as Record<string, unknown>;
    Object.defineProperty(registry, 'getCase', {
      enumerable: true,
      get() { getterRan = true; throw new Error('credential from getter'); },
    });

    expect(() => createEngine({ caseRegistry: registry as never })).toThrow(
      new CaseAttendCoreError('configuration'),
    );
    expect(getterRan).toBe(false);
  });

  it('normalizes revoked and hostile proxies at every public or adapter boundary', async () => {
    const revokedOptions = Proxy.revocable({}, {});
    revokedOptions.revoke();
    expect(() => createCaseAttendEngine(revokedOptions.proxy as never)).toThrow(
      new CaseAttendCoreError('configuration'),
    );

    const { engine } = createEngine();
    const revokedInput = Proxy.revocable(turnInput(), {});
    revokedInput.revoke();
    await expect(engine.runTurn(revokedInput.proxy as never)).rejects.toEqual(
      new CaseAttendCoreError('invalid_input'),
    );

    const revokedArtifact = Proxy.revocable({ id: 'frame' }, {});
    revokedArtifact.revoke();
    await expect(engine.loadArtifact('demo-case', revokedArtifact.proxy as never)).rejects.toEqual(
      new CaseAttendCoreError('invalid_input'),
    );

    const revokedEvent = Proxy.revocable({}, {});
    revokedEvent.revoke();
    expect(() => assertCoreEventV1(revokedEvent.proxy)).toThrow(
      new CaseAttendCoreError('invalid_input'),
    );

    const hostileResult = new Proxy({ text: 'secret adapter result' }, {
      getPrototypeOf() { throw new Error('Bearer raw proxy failure'); },
    });
    const hostile = createEngine({ inference: async () => hostileResult });
    await expect(hostile.engine.runTurn(turnInput())).rejects.toEqual(
      new CaseAttendCoreError('inference_failed'),
    );
    expect(JSON.stringify(hostile.events)).not.toContain('Bearer raw proxy failure');
  });

  it('curates hostile domain execution and does not inspect inference-function properties', async () => {
    const inference = vi.fn(async () => ({ text: 'safe' }));
    let inferencePropertyRead = false;
    Object.defineProperty(inference, 'credential', {
      get() { inferencePropertyRead = true; throw new Error('sk-proj-hostile'); },
    });
    const safe = createEngine({ inference });
    await safe.engine.runTurn(turnInput());
    expect(inferencePropertyRead).toBe(false);

    const hostile = createEngine({
      domains: [{ id: 'custom-domain', displayName: 'Hostile domain', supports() { throw new Error('Bearer provider body'); } }],
    });
    expect(() => hostile.engine.getDomain(caseMaterial)).toThrow(
      new CaseAttendCoreError('configuration'),
    );
  });

  it('buffers research deltas until terminal persistence succeeds', async () => {
    const delivered: string[] = [];
    const attempted: CoreEventV1[] = [];
    const { engine } = createEngine({
      destination: {
        kind: 'research',
        researchSink: {
          async record(event) {
            attempted.push(event);
            if (event.type === 'turn_succeeded') throw new Error('research database unavailable');
          },
        },
      },
      inference: async (request) => {
        request.onTextDelta('must remain hidden');
        return { text: 'must remain hidden' };
      },
    });

    await expect(engine.runTurn(turnInput({ onTextDelta: (delta: string) => delivered.push(delta) }))).rejects.toEqual(
      new CaseAttendCoreError('persistence_failed'),
    );
    expect(delivered).toEqual([]);
    expect(attempted.map((event) => event.type)).toEqual(['turn_started', 'turn_succeeded']);
    expect(JSON.stringify(attempted)).not.toContain('must remain hidden');
  });

  it('delivers buffered research deltas only after the succeeded event is durable', async () => {
    const order: string[] = [];
    const { engine } = createEngine({
      destination: {
        kind: 'research',
        researchSink: { async record(event) { order.push(`persist:${event.type}`); } },
      },
      inference: async (request) => {
        request.onTextDelta('one');
        request.onTextDelta('two');
        return { text: 'onetwo' };
      },
    });

    await engine.runTurn(turnInput({ onTextDelta: (delta: string) => order.push(`delta:${delta}`) }));
    expect(order).toEqual(['persist:turn_started', 'persist:turn_succeeded', 'delta:one', 'delta:two']);
  });

  it('fails research closed when inference does not honor the declared model', async () => {
    const delivered: string[] = [];
    const events: CoreEventV1[] = [];
    const { engine } = createEngine({
      destination: { kind: 'research', researchSink: { async record(event) { events.push(event); } } },
      promptComposer: { async compose() { return { prompt: 'Locked research prompt', sha256: HASH, requestedModel: 'locked-model' }; } },
      inference: async (request) => {
        request.onTextDelta('unlocked output');
        return { text: 'unlocked output', modelId: 'different-model' };
      },
    });

    await expect(engine.runTurn(turnInput({ onTextDelta: (delta: string) => delivered.push(delta) }))).rejects.toEqual(
      new CaseAttendCoreError('inference_failed'),
    );
    expect(delivered).toEqual([]);
    expect(events.map((event) => event.type)).toEqual(['turn_started', 'turn_failed']);
    expect(JSON.stringify(events)).not.toContain('unlocked output');
  });

  it('gives sinks deeply frozen metadata-only events and snapshots usage', async () => {
    const usage = { promptTokens: 4, completionTokens: 2, totalTokens: 6 };
    const frozen: boolean[] = [];
    const saved: CoreEventV1[] = [];
    const { engine } = createEngine({
      destination: {
        kind: 'research',
        researchSink: {
          async record(event) {
            frozen.push(Object.isFrozen(event));
            if (event.type === 'turn_succeeded' && event.usage) frozen.push(Object.isFrozen(event.usage));
            try { (event as { caseId: string }).caseId = 'mutated'; } catch { /* expected in strict mode */ }
            saved.push(event);
          },
        },
      },
      inference: async () => ({ text: 'safe output', usage }),
    });

    const result = await engine.runTurn(turnInput());
    usage.totalTokens = 999;
    expect(frozen.every(Boolean)).toBe(true);
    expect(saved.every((event) => event.caseId === 'demo-case')).toBe(true);
    expect(result.usage?.totalTokens).toBe(6);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.usage)).toBe(true);
    expect(saved.find((event) => event.type === 'turn_succeeded')).toMatchObject({ usage: { totalTokens: 6 } });
  });

  it('closes event enums and rejects credential-shaped metadata before serialization', () => {
    const common = {
      schema: 'caseattend.core.event',
      version: '1.0',
      eventId: 'turn-safe:1',
      turnId: 'turn-safe',
      occurredAtMs: 100,
      caseId: 'demo-case',
      domainId: 'custom-domain',
    };
    expect(() => assertCoreEventV1({ ...common, type: 'turn_failed', errorCode: 'Bearer-secret', latencyMs: 1 })).toThrow(
      new CaseAttendCoreError('invalid_input'),
    );
    expect(() => assertCoreEventV1({ ...common, type: 'turn_succeeded', promptSha256: HASH, finishReason: 'sk-proj-secret', latencyMs: 1 })).toThrow(
      new CaseAttendCoreError('invalid_input'),
    );
    expect(() => assertCoreEventV1({
      ...common,
      type: 'turn_started',
      promptSha256: HASH,
      learnerLevel: 'general',
      mode: 'chat',
      hasImage: true,
      historyMessageCount: 0,
      artifact: { id: 'frame', sha256: HASH, mimeType: 'image/sk-proj-secret' },
    })).toThrow(new CaseAttendCoreError('invalid_input'));
  });

  it('rejects oversized artifacts and excessive streaming before output escapes', async () => {
    const hash = vi.fn(async () => HASH);
    const infer = vi.fn(async () => ({ text: 'must not run' }));
    const oversized = createEngine({
      artifactLoader: { async loadArtifact() { return { bytes: new Uint8Array(CORE_MAX_ARTIFACT_BYTES + 1), mimeType: 'image/png' }; } },
      platform: { now: () => 100, randomId: () => 'oversized', sha256: hash },
      inference: infer,
    });
    await expect(oversized.engine.runTurn(turnInput({ hasImage: true, artifact: { id: 'frame' } }))).rejects.toEqual(
      new CaseAttendCoreError('configuration'),
    );
    expect(hash).not.toHaveBeenCalled();
    expect(infer).not.toHaveBeenCalled();

    const delivered: string[] = [];
    const excessive = createEngine({
      inference: async (request) => {
        request.onTextDelta('x'.repeat(512_001));
        return { text: 'ignored' };
      },
    });
    await expect(excessive.engine.runTurn(turnInput({ onTextDelta: (delta: string) => delivered.push(delta) }))).rejects.toEqual(
      new CaseAttendCoreError('inference_failed'),
    );
    expect(delivered).toEqual([]);
  });

  it('uses one case snapshot across artifact loading and prompt composition during study changes', async () => {
    let getCaseCalls = 0;
    let loadedTitle = '';
    const switchedMaterial: CaseMaterial = { ...caseMaterial, title: 'Wrong switched study' };
    const { engine } = createEngine({
      caseRegistry: {
        async listCases() { return [caseMaterial]; },
        async getCase() { getCaseCalls += 1; return getCaseCalls === 1 ? caseMaterial : switchedMaterial; },
      },
      artifactLoader: {
        async loadArtifact({ caseMaterial: loadedMaterial }) {
          loadedTitle = loadedMaterial.title;
          return { bytes: new Uint8Array([1]), mimeType: 'image/png' };
        },
      },
    });

    await engine.runTurn(turnInput({ hasImage: true, artifact: { id: 'current-view' } }));
    expect(getCaseCalls).toBe(1);
    expect(loadedTitle).toBe(caseMaterial.title);
  });

  it('uses injected random identity to avoid same-millisecond cross-engine collisions', async () => {
    const first = createEngine({ platform: { now: () => 100, randomId: () => 'engine-alpha', async sha256() { return HASH; } } });
    const second = createEngine({ platform: { now: () => 100, randomId: () => 'engine-beta', async sha256() { return HASH; } } });

    const [firstTurn, secondTurn] = await Promise.all([
      first.engine.runTurn(turnInput()),
      second.engine.runTurn(turnInput()),
    ]);
    expect(firstTurn.turnId).not.toBe(secondTurn.turnId);
    expect(new Set([...first.events, ...second.events].map((event) => event.eventId)).size).toBe(4);

    const invalid = createEngine({ platform: { now: () => 100, randomId: () => 'sk-proj-secret', async sha256() { return HASH; } } });
    await expect(invalid.engine.runTurn(turnInput())).rejects.toEqual(new CaseAttendCoreError('configuration'));
    expect(invalid.events).toEqual([]);
  });
});
