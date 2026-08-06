import { describe, it, expect } from 'vitest';

// Simulator for the new ID recovery logic in ViewerCanvas
// Logic: If alpha > 250, ID = Red channel. Else, ignored.
const simulateVisualRebuild = (maskPixel: number[], visibleSegments: number[], colors: Record<number, number[]>) => {
    const src = maskPixel;
    const dst = [0, 0, 0, 0];
    
    const r = src[0];
    const a = src[3];
    
    // NEW LOGIC: Strict Alpha Threshold
    // We only recover ID if alpha > 250 to avoid aliasing artifacts
    if (a > 250) {
        // Direct ID recovery (ImageData is un-premultiplied)
        const id = r;
        
        if (visibleSegments.includes(id)) {
            const color = colors[id];
            if (color) {
                dst[0] = color[0];
                dst[1] = color[1];
                dst[2] = color[2];
                dst[3] = 255;
            }
        }
    }
    return dst;
};

describe('Segmentation Visibility Logic', () => {
  it('correctly recovers ID from fully opaque pixel', () => {
      // ID=5, Fully Opaque
      const maskPixel = [5, 0, 0, 255]; 
      
      const visibleSegments = [5];
      const colors = { 5: [100, 200, 50] };
      
      const visual = simulateVisualRebuild(maskPixel, visibleSegments, colors);
      
      expect(visual[0]).toBe(100);
      expect(visual[3]).toBe(255);
  });

  it('hides segment when not in visible list', () => {
      const maskPixel = [5, 0, 0, 255]; 
      
      const visibleSegments = [1, 2]; // 5 is missing
      const colors = { 5: [100, 200, 50] };
      
      const visual = simulateVisualRebuild(maskPixel, visibleSegments, colors);
      
      // Should remain transparent
      expect(visual[3]).toBe(0);
  });

  it('ignores anti-aliased edge pixels (low alpha) to prevent ID shifting', () => {
      // Scenario: ID=1. 
      // Anti-aliased edge might result in Alpha=128.
      // With old logic (r * 255 / a), if r=1 and a=128, result was 2 (Ghost ID).
      // With new logic, we strictly ignore it.
      
      const maskPixel = [1, 0, 0, 128]; // Semi-transparent edge
      
      // Both 1 and 2 are visible. We want to ensure we don't accidentally show ID 1 (or shifted ID).
      const visibleSegments = [1, 2];
      const colors = { 1: [10, 10, 10], 2: [20, 20, 20] };
      
      const visual = simulateVisualRebuild(maskPixel, visibleSegments, colors);
      
      // Should be ignored because alpha 128 < 250
      expect(visual[3]).toBe(0);
  });

  it('ignores quantization noise on edges', () => {
      // Even if ID shifts due to browser quantization (e.g. r=2 instead of 1)
      // The strict alpha threshold ensures we don't render it.
      const maskPixel = [2, 0, 0, 128]; 
      
      const visibleSegments = [1, 2];
      const colors = { 1: [10, 10, 10], 2: [20, 20, 20] };
      
      const visual = simulateVisualRebuild(maskPixel, visibleSegments, colors);
      
      expect(visual[3]).toBe(0);
  });
});