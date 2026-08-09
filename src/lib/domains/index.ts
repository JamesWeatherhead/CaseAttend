import type { Domain, DomainKey } from './types';
import { radiology } from './radiology';
import { pathology } from './pathology';
import { dermatology } from './dermatology';
import { ecg } from './ecg';
import { ophthalmology } from './ophthalmology';
import { ultrasound } from './ultrasound';

export type { Domain, DomainKey, ArtifactHints } from './types';

const DOMAINS: Record<DomainKey, Domain> = {
  radiology,
  pathology,
  dermatology,
  ecg,
  ultrasound,
  ophthalmology,
};

export function getDomain(key: DomainKey): Domain {
  return DOMAINS[key];
}
