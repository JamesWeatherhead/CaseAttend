import React, { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import type { CasePackageV1 } from '../core/casePackage';
import { LIBRARY_THUMBNAILS } from '../data/libraryThumbnails.generated';
import { casePackageStore } from '../services/casePackageStore';

type Preview = CasePackageV1['preview'];

export function libraryThumbnail(preview: Preview) {
  const candidate = LIBRARY_THUMBNAILS[preview.src as keyof typeof LIBRARY_THUMBNAILS];
  return candidate?.sourceSha256 === preview.sha256 ? candidate : undefined;
}

function ResolvedPreview({ preview }: { preview: Preview }) {
  const thumbnail = libraryThumbnail(preview);
  const isLocal = preview.src.startsWith('case://assets/');
  const [localSrc, setLocalSrc] = useState('');
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!isLocal) return;
    let active = true;
    void casePackageStore.resolveAssetUri(preview.src).then(src => {
      if (active) setLocalSrc(src);
    }).catch(() => {
      if (active) setUnavailable(true);
    });
    return () => { active = false; };
  }, [isLocal, preview.src]);

  if (unavailable) return (
    <div role="img" aria-label={preview.alt} className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-slate-400">
      <ImageOff size={24} aria-hidden="true" />
      <span>Preview unavailable</span>
    </div>
  );

  return (
    <img
      src={isLocal ? localSrc || undefined : !thumbnailFailed && thumbnail ? thumbnail.src : preview.src}
      alt={preview.alt}
      width={thumbnail?.width}
      height={thumbnail?.height}
      loading="lazy"
      decoding="async"
      className="absolute inset-0 h-full w-full object-contain"
      onError={() => {
        if (thumbnail && !thumbnailFailed) setThumbnailFailed(true);
        else setUnavailable(true);
      }}
    />
  );
}

export default function CaseLibraryPreview({ preview }: { preview: Preview }) {
  // A changed source gets a fresh resolver and one fallback attempt.
  return <ResolvedPreview key={`${preview.src}:${preview.sha256}`} preview={preview} />;
}
