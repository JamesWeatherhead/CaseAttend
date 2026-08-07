import type { Domain, DomainKey } from './types';
import { radiology } from './radiology';
import { pathology } from './pathology';

export type { Domain, DomainKey, ArtifactHints } from './types';

const DOMAINS: Record<DomainKey, Domain> = {
  radiology,
  pathology,
};

export function getDomain(key: DomainKey): Domain {
  return DOMAINS[key];
}
