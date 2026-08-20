import { createCanvas } from 'canvas';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';
import path from 'path';

// Set up PDF.js worker to avoid runtime warnings
const workerSrc = path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs');
pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

/**
 * Convert the first page of a PDF to a PNG image
 * @param pdfPath - Path to the PDF file
 * @param outputPath - Path where the PNG should be saved
 * @param scale - Scale factor for rendering (default: 2 for good quality)
 * @returns Promise<string> - Path to the generated PNG file
 */
export async function convertPdfToPng(
  pdfPath: string,
  outputPath: string,
  scale: number = 2
): Promise<string> {
  try {
    console.log(`📄 Converting PDF to PNG: ${pdfPath}`);
    
    // Read the PDF file
    const pdfData = new Uint8Array(fs.readFileSync(pdfPath));
    
    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({
      data: pdfData,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    });
    
    const pdfDocument = await loadingTask.promise;
    console.log(`📖 PDF loaded with ${pdfDocument.numPages} page(s)`);
    
    // Get the first page
    const page = await pdfDocument.getPage(1);
    
    // Get viewport (A4 dimensions at 72 DPI)
    const viewport = page.getViewport({ scale });
    
    console.log(`📐 Viewport: ${viewport.width}x${viewport.height}`);
    
    // Create canvas
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');
    
    // Fill canvas with white background to ensure visibility
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, viewport.width, viewport.height);
    console.log('🎨 Canvas filled with white background');
    
    // Render PDF page to canvas with all rendering options enabled
    const renderContext = {
      canvasContext: context as any,
      viewport: viewport,
      intent: 'print', // Use print intent for better quality
      renderInteractiveForms: false,
      enableWebGL: false,
    };
    
    const renderTask = page.render(renderContext);
    
    // Wait for render to complete
    try {
      await renderTask.promise;
      console.log('✅ PDF page rendered to canvas');
      
      // Check if canvas has any non-white pixels
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      let hasContent = false;
      for (let i = 0; i < imageData.data.length; i += 4) {
        if (imageData.data[i] !== 255 || imageData.data[i+1] !== 255 || imageData.data[i+2] !== 255) {
          hasContent = true;
          break;
        }
      }
      
      if (!hasContent) {
        console.warn('⚠️ Canvas appears to be blank - PDF might not have renderable content');
      } else {
        console.log('✅ Canvas contains visible content');
      }
    } catch (renderError) {
      console.warn('⚠️ PDF rendering encountered issues:', renderError);
      throw renderError; // Re-throw to indicate conversion failed
    }
    
    // Save canvas as PNG
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);
    
    console.log(`💾 PNG saved to: ${outputPath} (${buffer.length} bytes)`);
    
    // Cleanup
    await pdfDocument.destroy();
    
    return outputPath;
  } catch (error) {
    console.error('❌ Error converting PDF to PNG:', error);
    throw new Error(`Failed to convert PDF to PNG: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if a file is a PDF based on its extension
 */
export function isPdf(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === '.pdf';
}

/**
 * Generate preview image path from background path
 */
export function getPreviewPath(backgroundPath: string): string {
  const ext = path.extname(backgroundPath);
  return backgroundPath.replace(ext, '_preview.png');
}
