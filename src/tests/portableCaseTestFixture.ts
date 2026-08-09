import {
  finalizeCasePackageV1,
  type CasePackageV1Draft,
} from '../core/casePackage';
import {
  createPortableCaseAssetV1,
  createPortableCasePackageV1,
  type PortableCasePackageV1,
} from '../core/portableCasePackage';
import { listCasePackages } from '../data/caseRegistry';
import { requireLessonPlanForCase } from '../data/lessonRegistry';

const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlN4p8AAAAASUVORK5CYII=';

function base64Bytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

export async function makePortableCasePackage(): Promise<PortableCasePackageV1> {
  const baseCase = (await listCasePackages())[0];
  const lessonPlan = await requireLessonPlanForCase(baseCase);
  const asset = await createPortableCaseAssetV1(base64Bytes(ONE_PIXEL_PNG_BASE64));
  const { manifest: _manifest, ...baseDraft } = baseCase;
  const imageSource = {
    src: asset.uri,
    mimeType: asset.mimeType,
    sha256: asset.sha256,
    alt: 'A neutral one-pixel test teaching image.',
    width: asset.width,
    height: asset.height,
  };
  const casePackage = await finalizeCasePackageV1({
    ...baseDraft,
    artifact: {
      kind: 'image',
      modality: 'OT',
      seriesId: 'test-image',
      seriesLabel: 'Test image',
      ...imageSource,
    },
    preview: imageSource,
    artifactHints: {
      showWindowLevel: false,
      showSeriesSelector: false,
      showSegmentation: false,
    },
  } satisfies CasePackageV1Draft);
  return createPortableCasePackageV1(casePackage, lessonPlan, [asset]);
}
