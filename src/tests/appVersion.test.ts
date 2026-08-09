import { describe, expect, it } from 'vitest';
import {
  APP_VERSION,
  BUILD_REVISION,
  HAS_REPRODUCIBLE_BUILD_REVISION,
  SOURCE_TREE_URL,
} from '../appVersion';

describe('reproducible application build identity', () => {
  it('keeps the version, source revision, and source tree link internally consistent', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
    expect(BUILD_REVISION).toMatch(/^(?:development|[a-f0-9]{7,64})$/);
    expect(SOURCE_TREE_URL).toMatch(/^https:\/\/github\.com\/JamesWeatherhead\/CaseAttend\/tree\//);
    expect(HAS_REPRODUCIBLE_BUILD_REVISION).toBe(BUILD_REVISION !== 'development');
    if (HAS_REPRODUCIBLE_BUILD_REVISION) expect(SOURCE_TREE_URL).toContain(BUILD_REVISION);
  });
});
