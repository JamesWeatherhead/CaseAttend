

import React, { useState, useEffect, useRef } from 'react';
import { Series, DicomWebConfig } from '../types';
import { Layers, Loader2 } from 'lucide-react';
import { fetchDicomImageBlob } from '../services/dicomService';
import { SERIES_DESCRIPTIONS } from '../constants';

interface SeriesSelectorProps {
  seriesList: Series[];
  activeSeriesId?: string;
  onSelectSeries: (series: Series) => void;
  dicomConfig: DicomWebConfig;
}

interface SeriesThumbnailProps {
  series: Series;
  isActive: boolean;
  onClick: (s: Series) => void;
  dicomConfig: DicomWebConfig;
  onHover: (desc: string | null) => void;
}

const SeriesThumbnail: React.FC<SeriesThumbnailProps> = ({ series, isActive, onClick, dicomConfig, onHover }) => {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  
  // Use a ref to track if component is mounted to prevent state updates after unmount
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    
    // Cleanup previous object URL to avoid memory leaks
    return () => {
      isMounted.current = false;
      if (thumbUrl) URL.revokeObjectURL(thumbUrl);
    };
  }, []); // Run once on mount to setup cleanup, URL management handles the rest

  useEffect(() => {
    // Reset state when series changes
    setHasError(false);
    setIsLoading(true);
    if (thumbUrl) URL.revokeObjectURL(thumbUrl);
    setThumbUrl(null);
    
    if (series.instances && series.instances.length > 0) {
      loadRobustThumbnail();
    } else {
      setIsLoading(false);
      setThumbUrl(null);
    }
  }, [series.id, series.instances, dicomConfig]);

  const loadRobustThumbnail = async () => {
    if (!series.instances || series.instances.length === 0) return;

    // DETERMINE DEFAULT SLICE INDEX
    // Logic must match App.tsx useEffect for default slice selection
    let targetIndex = Math.floor(series.instanceCount / 2);
    // Safety clamp
    targetIndex = Math.max(0, Math.min(series.instanceCount - 1, targetIndex));

    const indicesToTry = [targetIndex];
    // Add fallback indices if the default fails (e.g. neighboring slices)
    if (targetIndex + 1 < series.instanceCount) indicesToTry.push(targetIndex + 1);
    if (targetIndex - 1 >= 0) indicesToTry.push(targetIndex - 1);

    let success = false;

    for (const idx of indicesToTry) {
       try {
          const url = series.instances[idx];
          // Use the robust fetch service that handles headers/proxies/fallbacks
          const blob = await fetchDicomImageBlob(dicomConfig, url);
          
          if (isMounted.current && blob) {
             const objectUrl = URL.createObjectURL(blob);
             setThumbUrl(objectUrl);
             setIsLoading(false);
             success = true;
             return; // Stop after first success
          }
       } catch (e) {
          // Continue to next index
       }
    }

    if (!success && isMounted.current) {
        setHasError(true);
        setIsLoading(false);
    }
  };

  const tooltip = SERIES_DESCRIPTIONS[series.description] || series.description;

  return (
    <button
      type="button"
      onClick={() => onClick(series)}
      aria-pressed={isActive}
      aria-label={`${series.description}, ${series.instanceCount} image${series.instanceCount === 1 ? '' : 's'}`}
      title={tooltip}
      className={`flex-shrink-0 w-24 h-24 bg-gray-950 border rounded-lg cursor-pointer relative group overflow-hidden transition-all ${
        isActive
          ? 'border-blue-500 ring-1 ring-blue-500/50 shadow-lg shadow-blue-900/20'
          : 'border-gray-800 hover:border-gray-600'
      } focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-black`}
    >

        {thumbUrl && !hasError ? (
            <img
              src={thumbUrl}
              alt={series.description}
              className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-500 rounded-lg"
            />
        ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center opacity-30 group-hover:opacity-50 transition-opacity bg-slate-900 rounded-lg">
                {isLoading ? (
                    <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                ) : (
                    <Layers className="w-8 h-8 text-blue-300" />
                )}
            </div>
        )}

        {/* Gradient for text legibility */}
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/90 to-transparent pointer-events-none rounded-b-lg" />

        <div className="absolute bottom-1 left-2 right-2 z-10">
            <div className="text-[10px] font-bold text-gray-200 truncate leading-tight">
                {series.description}
            </div>
        </div>

        <div className="absolute top-1 right-1 text-[9px] bg-blue-900/80 backdrop-blur-sm text-blue-100 px-1.5 py-0.5 rounded border border-blue-500/30 z-10 font-mono">
            {series.instanceCount} img
        </div>
        
        {isActive && (
           <div className="absolute top-0 right-0 w-2 h-2 bg-blue-500 rounded-bl shadow-lg shadow-blue-500/50 z-20" />
        )}
    </button>
  );
}

const SeriesSelector: React.FC<SeriesSelectorProps> = ({ seriesList, activeSeriesId, onSelectSeries, dicomConfig }) => {
  if (seriesList.length === 0) return null;

  return (
    <div
      className="bg-black border-t border-gray-800 flex flex-col"
      id="tour-series-rail"
      data-tour-id="series-rail"
      aria-label="Series selection rail"
    >
       <div className="h-28 flex overflow-x-auto no-scrollbar items-center px-2 gap-2 bg-black/50">
          {seriesList.map((series) => (
            <SeriesThumbnail
               key={series.id}
               series={series}
               isActive={activeSeriesId === series.id}
               onClick={onSelectSeries}
               dicomConfig={dicomConfig}
               onHover={() => {}}
            />
          ))}
       </div>
    </div>
  );
};

export default SeriesSelector;
