import type { ContentPackDefinition } from './contentPack';
import { chestRadiographOpenPack } from './packs/chestRadiographOpenPack';
import { ecgSignalsPack } from './packs/ecgSignalsPack';
import { mriNeuroOpenPack } from './packs/mriNeuroOpenPack';
import { ophthalmologyFundusPack } from './packs/ophthalmologyFundusPack';
import { pathologyMicroOpenPack } from './packs/pathologyMicroOpenPack';
import { ultrasoundPocusPack } from './packs/ultrasoundPocusPack';

/**
 * Import reviewed pack definition files here. Registry and lesson bindings are
 * derived automatically, so a pack never needs a second case-ID objective map.
 */
export const BUILTIN_CONTENT_PACKS: readonly ContentPackDefinition[] = [
  ultrasoundPocusPack,
  ecgSignalsPack,
  chestRadiographOpenPack,
  ophthalmologyFundusPack,
  mriNeuroOpenPack,
  pathologyMicroOpenPack,
];
