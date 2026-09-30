import type { UploadedImage } from '../types';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

interface SampleProps {
  name: string;
  width: number;
  height: number;
  /** Pass skipBg=true to skip the background fill (draw the product only). */
  drawFn: (ctx: CanvasRenderingContext2D, w: number, h: number, skipBg?: boolean) => void;
}

const SAMPLES: SampleProps[] = [
  {
    name: 'Yellow_Lounge_Chair.png',
    width: 600,
    height: 400, // Wide
    drawFn: (ctx, w, h, skipBg = false) => {
      if (!skipBg) {
        ctx.fillStyle = '#f5f5f4';
        ctx.fillRect(0, 0, w, h);
      }

      // Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.76, 120, 16, 0, 0, 2 * Math.PI);
      ctx.fill();

      // Draw modern lounge chair
      ctx.fillStyle = '#eab308'; // retro golden yellow
      
      // Chair base/back cushion
      ctx.beginPath();
      ctx.roundRect(w / 2 - 90, h * 0.35, 180, 100, [40, 40, 10, 10]);
      ctx.fill();

      // Seat cushion
      ctx.fillStyle = '#ca8a04'; // darker yellow
      ctx.beginPath();
      ctx.roundRect(w / 2 - 100, h * 0.55, 200, 45, [10, 10, 20, 20]);
      ctx.fill();

      // Armrests
      ctx.fillStyle = '#ca8a04';
      ctx.beginPath();
      ctx.roundRect(w / 2 - 110, h * 0.45, 25, 60, [15, 15, 10, 10]);
      ctx.roundRect(w / 2 + 85,  h * 0.45, 25, 60, [15, 15, 10, 10]);
      ctx.fill();

      // Wooden Legs
      ctx.strokeStyle = '#78350f'; // rich mahogany wood
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      
      // Front Left Leg
      ctx.beginPath();
      ctx.moveTo(w / 2 - 70, h * 0.68);
      ctx.lineTo(w / 2 - 90, h * 0.82);
      ctx.stroke();

      // Front Right Leg
      ctx.beginPath();
      ctx.moveTo(w / 2 + 70, h * 0.68);
      ctx.lineTo(w / 2 + 90, h * 0.82);
      ctx.stroke();

      // Back legs shadows
      ctx.strokeStyle = '#451a03';
      ctx.beginPath();
      ctx.moveTo(w / 2 - 50, h * 0.68);
      ctx.lineTo(w / 2 - 60, h * 0.81);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(w / 2 + 50, h * 0.68);
      ctx.lineTo(w / 2 + 60, h * 0.81);
      ctx.stroke();

      // Accent pillow
      ctx.fillStyle = '#374151'; // dark grey pillow
      ctx.beginPath();
      ctx.roundRect(w / 2 - 40, h * 0.48, 80, 35, [8]);
      ctx.fill();
    }
  },
  {
    name: 'Tall_Acoustic_Guitar.png',
    width: 300,
    height: 700, // Very Tall portrait
    drawFn: (ctx, w, h, skipBg = false) => {
      if (!skipBg) {
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(0, 0, w, h);
      }

      // Stand shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.88, 55, 10, 0, 0, 2 * Math.PI);
      ctx.fill();

      // Guitar Base body
      const bodyY = h * 0.65;
      ctx.fillStyle = '#b45309'; // warm amber wood
      
      // Lower lobe
      ctx.beginPath();
      ctx.arc(w / 2, bodyY + 40, 52, 0, 2 * Math.PI);
      ctx.fill();
      
      // Upper lobe
      ctx.beginPath();
      ctx.arc(w / 2, bodyY - 35, 40, 0, 2 * Math.PI);
      ctx.fill();

      // Waist connector block
      ctx.beginPath();
      ctx.ellipse(w / 2, bodyY, 35, 55, 0, 0, 2 * Math.PI);
      ctx.fill();

      // Sunburst inner glow
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.ellipse(w / 2, bodyY + 10, 32, 55, 0, 0, 2 * Math.PI);
      ctx.fill();

      // Sound Hole
      ctx.fillStyle = '#1e1b4b'; // blackish depth
      ctx.beginPath();
      ctx.arc(w / 2, bodyY - 15, 16, 0, 2 * Math.PI);
      ctx.fill();

      // Soundhole gold trim ring
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(w / 2, bodyY - 15, 19, 0, 2 * Math.PI);
      ctx.stroke();

      // Wooden Bridge
      ctx.fillStyle = '#451a03';
      ctx.beginPath();
      ctx.roundRect(w / 2 - 25, bodyY + 50, 50, 10, [2]);
      ctx.fill();

      // Guitar Neck (Fretboard)
      ctx.fillStyle = '#292524'; // Ebony fretboard
      ctx.fillRect(w / 2 - 7, h * 0.22, 14, h * 0.35);

      // Fret markers (silver lines)
      ctx.strokeStyle = '#78716c';
      ctx.lineWidth = 1.5;
      for (let f = 0.25; f < 0.55; f += 0.04) {
        ctx.beginPath();
        ctx.moveTo(w / 2 - 7, h * f);
        ctx.lineTo(w / 2 + 7, h * f);
        ctx.stroke();
      }

      // Guitar Headstock
      ctx.fillStyle = '#451a03';
      ctx.beginPath();
      ctx.moveTo(w / 2 - 10, h * 0.22);
      ctx.lineTo(w / 2 - 12, h * 0.14);
      ctx.lineTo(w / 2 + 12, h * 0.14);
      ctx.lineTo(w / 2 + 10, h * 0.22);
      ctx.closePath();
      ctx.fill();

      // Tuning pegs
      ctx.fillStyle = '#cbd5e1';
      for (let pY = 0.15; pY < 0.21; pY += 0.02) {
        ctx.beginPath();
        ctx.arc(w / 2 - 17, h * pY, 4, 0, 2 * Math.PI);
        ctx.arc(w / 2 + 17, h * pY, 4, 0, 2 * Math.PI);
        ctx.fill();
      }

      // Guitar Strings (6 thin silver lines)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.lineWidth = 0.8;
      for (let s = -5; s <= 5; s += 2.0) {
        ctx.beginPath();
        ctx.moveTo(w / 2 + s, h * 0.15);
        ctx.lineTo(w / 2 + s * 0.9, bodyY + 52);
        ctx.stroke();
      }
    }
  },
  {
    name: 'Denim_TShirt.png',
    width: 450,
    height: 550, // Standard product fashion
    drawFn: (ctx, w, h, skipBg = false) => {
      if (!skipBg) {
        ctx.fillStyle = '#fafaf9';
        ctx.fillRect(0, 0, w, h);
      }

      // Drop shadow
      ctx.fillStyle = 'rgba(59, 130, 246, 0.04)';
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.85, 110, 15, 0, 0, 2 * Math.PI);
      ctx.fill();

      // Indigo T-shirt polygon
      ctx.fillStyle = '#3b82f6'; // Indigo/blue
      
      ctx.beginPath();
      // Collar start left
      ctx.moveTo(w / 2 - 40, h * 0.22);
      // Left shoulder line sloping down
      ctx.lineTo(w * 0.2, h * 0.28);
      // Left sleeve opening edge
      ctx.lineTo(w * 0.15, h * 0.44);
      // Under arm left corner
      ctx.lineTo(w * 0.27, h * 0.45);
      // Bodice trunk down left
      ctx.lineTo(w * 0.27, h * 0.78);
      // Hemline along bottom
      ctx.lineTo(w * 0.73, h * 0.78);
      // Bodice trunk up right
      ctx.lineTo(w * 0.73, h * 0.45);
      // Under arm right corner
      ctx.lineTo(w * 0.85, h * 0.44);
      // Right sleeve opening edge
      ctx.lineTo(w * 0.8, h * 0.28);
      // Collar right
      ctx.lineTo(w / 2 + 40, h * 0.22);
      // Beautiful scoop neck collar curves
      ctx.quadraticCurveTo(w / 2, h * 0.29, w / 2 - 40, h * 0.22);
      ctx.closePath();
      ctx.fill();

      // Stitching details on sleeves
      ctx.strokeStyle = '#1d4ed8';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      
      ctx.beginPath();
      ctx.moveTo(w * 0.17, h * 0.41);
      ctx.lineTo(w * 0.25, h * 0.41);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(w * 0.83, h * 0.41);
      ctx.lineTo(w * 0.75, h * 0.41);
      ctx.stroke();

      // Bottom stitching hemline
      ctx.beginPath();
      ctx.moveTo(w * 0.29, h * 0.75);
      ctx.lineTo(w * 0.71, h * 0.75);
      ctx.stroke();

      // Reset dashed lines
      ctx.setLineDash([]);

      // Draw active brand label on the neck inner section
      ctx.fillStyle = '#1d4ed8';
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.23, 7, 0, 2 * Math.PI);
      ctx.fill();
    }
  },
  {
    name: 'Explorer_Boots.png',
    width: 650,
    height: 380, // Landscape boot layout
    drawFn: (ctx, w, h, skipBg = false) => {
      if (!skipBg) {
        ctx.fillStyle = '#f5f5f4';
        ctx.fillRect(0, 0, w, h);
      }

      // Cast Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      ctx.beginPath();
      ctx.ellipse(w / 2 + 20, h * 0.78, 160, 18, 0, 0, 2 * Math.PI);
      ctx.fill();

      // Draw Rugged leather Boot product
      ctx.fillStyle = '#7c2d12'; // Deep rust orange/brown leather
      
      const bX = w / 2 - 120;
      const bY = h * 0.35;

      // Heel/ankles back curve
      ctx.beginPath();
      ctx.moveTo(bX, bY);
      ctx.bezierCurveTo(bX - 45, bY + 10, bX - 35, bY + 120, bX - 10, bY + 140);
      
      // Sole/bottom heel
      ctx.lineTo(bX - 25, bY + 140);
      ctx.lineTo(bX - 25, bY + 155); // Heel block
      ctx.lineTo(bX + 30, bY + 155);
      ctx.lineTo(bX + 45, bY + 145); // Arch
      ctx.lineTo(bX + 180, bY + 145); // Toe bottom sole
      ctx.bezierCurveTo(bX + 220, bY + 145, bX + 235, bY + 115, bX + 200, bY + 95); // Rounded Toe box upper
      
      // Instep ridge upward
      ctx.lineTo(bX + 70, bY + 45); // Shoelace tongue slope
      ctx.lineTo(bX + 50, bY + 0); // Front shaft high collar
      ctx.lineTo(bX, bY); // Back shift high collar
      ctx.closePath();
      ctx.fill();

      // Rubber Sole black layer
      ctx.fillStyle = '#1c1917'; // coal black
      ctx.beginPath();
      ctx.roundRect(bX - 28, bY + 148, 240, 12, [3]);
      ctx.fill();

      // Shoelace stitching
      ctx.strokeStyle = '#ca8a04'; // yellow-brown boot laces
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      
      // Draw 4 lace patterns
      const lStartY = bY + 45;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(bX + 60 - i * 12, lStartY + i * 15);
        ctx.lineTo(bX + 80 - i * 12, lStartY + i * 15 + 6);
        ctx.stroke();
      }

      // Suede Accent overlay
      ctx.fillStyle = '#9a3412';
      ctx.beginPath();
      ctx.ellipse(bX + 160, bY + 115, 30, 25, Math.PI / 4, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
];

/**
 * Generates all sample data URLs statically on demand
 */
export function getSampleProducts(): { name: string; url: string; width: number; height: number }[] {
  return SAMPLES.map(sample => {
    const canvas = document.createElement('canvas');
    canvas.width = sample.width;
    canvas.height = sample.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      sample.drawFn(ctx, sample.width, sample.height);
    }
    return {
      name: sample.name,
      width: sample.width,
      height: sample.height,
      url: canvas.toDataURL('image/png')
    };
  });
}

/** Sample products as ready-to-queue images (used by the queue and the empty-state dropzone). */
export function getSampleImages(): UploadedImage[] {
  return getSampleProducts().map((s, idx) => ({
    id: `sample-${idx}`,
    name: s.name, type: 'image/png', size: 15420,
    originalUrl: s.url, processedUrl: s.url,
    width: s.width, height: s.height, aspectRatio: s.width / s.height,
  }));
}
