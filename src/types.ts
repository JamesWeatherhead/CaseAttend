

// Viewer adapter model. Portable case metadata lives in core/casePackage.ts.
import type { LessonPlanRef } from './core/lessonPlan';

export interface Series {
  id: string;
  studyId: string;
  description: string;
  modality: string;
  instanceCount: number;
  instances: string[]; 
}

// App State Types

export type ConnectionType = 'DEMO' | 'DICOMWEB' | null;

export interface DicomWebConfig {
  url: string;
  name: string;
}

// Diagnostics
export interface DiagnosticStep {
  id: string;
  name: string;
  status: 'PENDING' | 'RUNNING' | 'PASS' | 'FAIL';
  message?: string;
}

// Tooling Types

export enum ToolMode {
  POINTER = 'POINTER',
  WINDOW_LEVEL = 'WINDOW_LEVEL',
  PAN = 'PAN',
  ZOOM = 'ZOOM',
  SCROLL = 'SCROLL',
  MEASURE = 'MEASURE',
  BRUSH = 'BRUSH',
  ERASER = 'ERASER'
}

export interface Point {
  x: number;
  y: number;
}

export interface Measurement {
  id: string;
  start: Point;
  end: Point;
  value: number; // pixel distance
  sliceIndex: number; // Which slice this belongs to
  label?: string; // e.g. "Tumor 1"
  text?: string; // Optional description
  color?: string; // Custom color
  createdAt: number;
}

export interface ViewportState {
  scale: number;
  pan: Point;
  windowWidth: number;
  windowCenter: number;
}

// Viewer Capability Interface
export interface ViewerHandle {
  captureScreenshot: () => string | null;
  removeSegment: (id: number) => void;
}

// Cursor Context for AI
export interface CursorContext {
  seriesInstanceUID: string;
  frameIndex: number;
  activeMeasurementId: string | null;
}

// Segmentation Types

export interface Segment {
  id: number;
  label: string;
  color: [number, number, number]; // RGB
  isVisible: boolean;
}

export interface SegmentedSlice {
  sliceIndex: number;
  labelCount: number;
}

export interface SegmentationLayer {
  opacity: number;
  isVisible: boolean;
  activeSegmentId: number | null; // The segment currently being drawn
  segments: Segment[];
  brushSize: number;
  segmentedSlices: SegmentedSlice[];
}

// AI Types
export interface ChatMessage {
  id: string;
  role: 'user' | 'model' | 'error';
  text: string;
  isThinking?: boolean;
  sources?: Array<{ uri: string; title: string }>;
  hasAttachment?: boolean;
  suggestions?: string[]; // Dynamic follow-up suggestions
  followUps?: string[]; // Parsed educational follow-ups
  /** Exact educational content revision used for this turn. */
  lessonPlanRef?: LessonPlanRef;
  
  // Image Context Metadata (for UI thumbnails)
  attachedSliceIndex?: number;
  attachedSequenceLabel?: string;
  attachedSliceThumbnailDataUrl?: string;

  // Error Handling
  originalPrompt?: string; // For retry logic
}

export interface AiPointer {
  x: number;  // 0-100 percentage of image width
  y: number;  // 0-100 percentage of image height
  label?: string;
}
