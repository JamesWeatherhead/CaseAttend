
import { ToolMode, Segment } from "./types";
import { 
  MousePointer2, 
  Sun, 
  Move, 
  Search, 
  Ruler, 
  Layers,
  Brush
} from "lucide-react";

export const TOOLS = [
  { id: ToolMode.POINTER, label: 'Select', icon: MousePointer2 },
  { id: ToolMode.SCROLL, label: 'Scroll', icon: Layers },
  { id: ToolMode.WINDOW_LEVEL, label: 'Contrast', icon: Sun },
  { id: ToolMode.PAN, label: 'Pan', icon: Move },
  { id: ToolMode.ZOOM, label: 'Zoom', icon: Search },
  { id: ToolMode.BRUSH, label: 'Paint', icon: Brush },
];

export const DEFAULT_VIEWPORT_STATE = {
  scale: 1,
  pan: { x: 0, y: 0 },
  windowWidth: 400, // CT Soft Tissue default approximation
  windowCenter: 40,
  // sliceIndex removed from constant as it is dynamic
};

// Simulated DICOM Modality presets
export const WL_PRESETS = [
  { label: 'Default', ww: 400, wc: 40 },
  { label: 'Lung', ww: 1500, wc: -600 },
  { label: 'Bone', ww: 2000, wc: 300 },
  { label: 'Brain', ww: 80, wc: 40 },
];

// Default annotation labels
export const MOCK_SEGMENTATION_DATA: Segment[] = [
  { id: 1, label: 'Finding 1', color: [239, 68, 68], isVisible: true },
];

export const SERIES_DESCRIPTIONS: Record<string, string> = {
  "T1 Weighted": "Basic anatomy view. Fluid is dark, fat is bright.",
  "FLAIR": "Suppresses fluid signal. Great for seeing swelling/edema.",
  "ADC Map": "Apparent Diffusion Coefficient. Shows true restricted diffusion.",
  "DWI Trace": "Diffusion Weighted Imaging. Highlights acute stroke/ischemia.",
  "ST2W/FLAIR": "Good at showing brain swelling and old scars.",
  "sT2W/FLAIR": "Good at showing brain swelling and old scars.",
  "T2W/FE-EPI": "Helps pick up small or hidden areas of bleeding.",
  "ST2/TSE/T": "Water sensitive scan. Fluid and swelling look bright.",
  "sT2/TSE/T": "Water sensitive scan. Fluid and swelling look bright.",
  "T1/SE/extrp": "Basic anatomy view of the brain structures.",
  "SOUS": "Special scan that makes blood or metal changes stand out.",
  "T1/3D/FFE/C": "3D scan after contrast dye. Tumors and vessels stand out.",
};

export const SUGGESTED_FOLLOWUPS = [
  "Walk me through the anatomy on this slice.",
  "What is this MRI sequence good for?",
  "Help me describe what I see in simple terms.",
  "Quiz me on this region and then explain the answers.",
];

export type LearnerLevel = "highschool" | "undergrad" | "ms_preclinical" | "ms_clinical" | "resident";

export const LEARNER_LEVELS: { id: LearnerLevel; label: string }[] = [
  { id: 'highschool', label: 'HS' },
  { id: 'undergrad', label: 'Undergrad' },
  { id: 'ms_preclinical', label: 'Pre-Step 1' },
  { id: 'ms_clinical', label: 'Post-Step 1' },
  { id: 'resident', label: 'Resident' },
];

/**
 * When true, a subtle "X of Y exchanges left" chip is rendered next to the
 * composer. The silent tutor-facing pacing steer is the primary mechanism for
 * driving lessons to closure; the chip is off by default because a visible
 * counter can add pressure. Flip locally to preview it or wire it to an
 * educator setting when ready.
 */
export const SHOW_TURN_BUDGET_CHIP = false;

export const FOLLOWUPS_BY_LEVEL: Record<LearnerLevel, { label: string; prompt: string }[]> = {
  highschool: [
    {
      label: "Explain simply",
      prompt: "Explain what is on this MRI slice in very simple terms for a curious high school student. Avoid jargon."
    },
    {
      label: "What is this for?",
      prompt: "Describe what type of MRI sequence this is and why doctors might order it, in simple language."
    },
  ],
  undergrad: [
    {
      label: "Anatomy walkthrough",
      prompt: "Walk me through the key anatomy on this slice as if I am a biology undergrad who knows basic anatomy but not radiology."
    },
    {
      label: "MRI Physics Intro",
      prompt: "Briefly connect what we see on this sequence to basic MRI physics, at an undergraduate level, without heavy math."
    },
  ],
  ms_preclinical: [
    {
      label: "Anatomy Check",
      prompt: "Walk me through the key anatomical structures I should be able to identify on this image."
    },
    {
      label: "Pathophysiology",
      prompt: "Explain the pathophysiology behind what we see here. What is happening at the cellular or tissue level?"
    },
  ],
  ms_clinical: [
    {
      label: "Clinical Reasoning",
      prompt: "Given the clinical history and imaging, walk me through the differential diagnosis and what findings narrow it."
    },
    {
      label: "Management",
      prompt: "What is the next step in management for this patient? Walk me through the relevant guidelines."
    },
  ],
  resident: [
    {
      label: "Systematic Read",
      prompt: "Describe how a radiology resident should systematically read this slice, focusing on pattern recognition and pitfalls, without giving a formal report."
    },
    {
      label: "Compare Sequences",
      prompt: "Compare this slice with the typical appearance of the same region on T1 and T2, at a resident teaching level. Do not diagnose."
    },
  ],
};
