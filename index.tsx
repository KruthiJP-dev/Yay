import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Modality } from "@google/genai";

/**
 * Applies a specified visual filter to an image on a canvas.
 * @param ctx The 2D rendering context of the canvas.
 * @param img The source HTMLImageElement.
 * @param filter The name of the filter to apply.
 */
const applyFilterToCanvas = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, filter: string) => {
    const { width, height } = img;
    // Reset canvas state
    ctx.clearRect(0, 0, width, height);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';

    // Apply simple CSS filters
    let cssFilter = 'none';
    switch(filter) {
        case 'grayscale': cssFilter = 'grayscale(100%)'; break;
        case 'sepia': cssFilter = 'sepia(100%)'; break;
        case 'vintage': cssFilter = 'sepia(70%) contrast(110%) brightness(90%)'; break;
        case 'invert': cssFilter = 'invert(100%)'; break;
        case 'glow': cssFilter = 'brightness(1.2) saturate(1.3) contrast(1.05)'; break;
        case 'sketch': cssFilter = 'grayscale(1) contrast(150%) brightness(110%)'; break;
        case 'blur': cssFilter = 'blur(4px)'; break;
        case 'sharpen': cssFilter = 'contrast(140%) saturate(110%)'; break;
        default: break;
    }
    ctx.filter = cssFilter;
    ctx.drawImage(img, 0, 0);
    ctx.filter = 'none'; // Reset filter for subsequent manual drawing operations

    // Apply complex filters that require manual canvas operations
    if (filter === 'vignette') {
        const gradient = ctx.createRadialGradient(width / 2, height / 2, width / 4, width / 2, height / 2, width / 2);
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(1, 'rgba(0,0,0,0.6)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    } else if (filter === 'posterize') {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        const levels = 4; // Number of color levels
        const step = 255 / (levels - 1);
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.round(data[i] / step) * step;     // Red
            data[i + 1] = Math.round(data[i + 1] / step) * step; // Green
            data[i + 2] = Math.round(data[i + 2] / step) * step; // Blue
        }
        ctx.putImageData(imageData, 0, 0);
    }
};

type HistoryState = {
    imageUrl: string;
    filter: string;
};

const ZoomControls = ({ onZoom, onReset, scale, onScaleChange }: { 
    onZoom: (delta: number) => void, 
    onReset: () => void,
    scale: number,
    onScaleChange: (newScale: number) => void 
}) => (
    <div className="zoom-controls">
        <button className="zoom-button" onClick={() => onZoom(-0.2)} aria-label="Zoom Out">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
        <input
            type="range"
            min="1"
            max="10"
            step="0.1"
            value={scale}
            onChange={(e) => onScaleChange(parseFloat(e.target.value))}
            className="zoom-slider"
            aria-label="Zoom slider"
        />
        <button className="zoom-button" onClick={() => onZoom(0.2)} aria-label="Zoom In">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
        <span className="zoom-percentage">{Math.round(scale * 100)}%</span>
        <button className="zoom-button" onClick={onReset} aria-label="Reset Zoom">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
        </button>
    </div>
);

const App = () => {
  const [baseImage, setBaseImage] = useState<File | null>(null);
  const [editedImageUrl, setEditedImageUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>('none');
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [zoom, setZoom] = useState({ scale: 1, x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });


  const currentImageState = history[historyIndex];
  const originalImageUrl = currentImageState?.imageUrl;
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const fileToGenerativePart = async (file: File) => {
    const base64EncodedDataPromise = new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(file);
    });
    return {
      inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
    };
  };
  
  const dataUrlToFile = async (dataUrl: string, filename: string): Promise<File> => {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return new File([blob], filename, { type: blob.type });
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setBaseImage(file);
      setEditedImageUrl(null);
      setError(null);
      setZoom({ scale: 1, x: 0, y: 0 });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL(file.type);
        setHistory([{ imageUrl: dataUrl, filter: 'none' }]);
        setHistoryIndex(0);
        setActiveFilter('none');
        URL.revokeObjectURL(img.src);
      };
    }
  };
  
  const handleFilterClick = (filter: string) => {
    if (!baseImage || activeFilter === filter) return;

    setActiveFilter(filter);
    setZoom({ scale: 1, x: 0, y: 0 });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.src = URL.createObjectURL(baseImage);
    img.onload = () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        
        applyFilterToCanvas(ctx, img, filter);
        
        const dataUrl = canvas.toDataURL(baseImage.type);
        
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push({ imageUrl: dataUrl, filter: filter });
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);

        URL.revokeObjectURL(img.src);
    };
  };

  const handleUndo = () => {
    if (canUndo) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setActiveFilter(history[newIndex].filter);
        setZoom({ scale: 1, x: 0, y: 0 });
    }
  };

  const handleRedo = () => {
    if (canRedo) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setActiveFilter(history[newIndex].filter);
        setZoom({ scale: 1, x: 0, y: 0 });
    }
  };

  const handleGenerateClick = async () => {
    if (!baseImage || !currentImageState || !prompt.trim()) {
      setError('Please upload an image and enter a prompt.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setEditedImageUrl(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const imageToProcess = await dataUrlToFile(currentImageState.imageUrl, baseImage.name);
      const imagePart = await fileToGenerativePart(imageToProcess);
      const textPart = { text: prompt };

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [imagePart, textPart],
        },
        config: {
          responseModalities: [Modality.IMAGE],
        },
      });
      
      let generatedImageFound = false;
      const parts = response.candidates[0].content.parts;
      for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i];
        if (part.inlineData) {
          const base64ImageBytes: string = part.inlineData.data;
          const imageUrl = `data:${part.inlineData.mimeType};base64,${base64ImageBytes}`;
          setEditedImageUrl(imageUrl);
          setZoom({ scale: 1, x: 0, y: 0 });
          generatedImageFound = true;
          break;
        }
      }

      if (!generatedImageFound) {
          setError("No image was generated. Please try a different prompt.");
      }

    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(`Failed to generate image. ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setBaseImage(null);
    setEditedImageUrl(null);
    setPrompt('');
    setError(null);
    setActiveFilter('none');
    setHistory([]);
    setHistoryIndex(-1);
    setZoom({ scale: 1, x: 0, y: 0 });
    if(fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };

  const handleDownload = () => {
    if (!editedImageUrl) return;
    const link = document.createElement('a');
    link.href = editedImageUrl;
    link.download = `edited-${baseImage?.name || 'image.png'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const setZoomLevel = (newScale: number) => {
    const clampedScale = Math.max(1, Math.min(newScale, 10));
    setZoom(prev => {
      if (clampedScale === 1) {
        return { scale: 1, x: 0, y: 0 };
      }
      return { ...prev, scale: clampedScale };
    });
  };

  const handleZoomButtons = (delta: number) => {
    setZoomLevel(zoom.scale + delta);
  };
  
  const handleScaleChange = (newScale: number) => {
    setZoomLevel(newScale);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const zoomAmount = -e.deltaY * 0.002;
    setZoomLevel(zoom.scale + zoomAmount);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (zoom.scale <= 1 || !(e.target instanceof HTMLImageElement)) return;
    e.preventDefault();

    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    setIsPanning(true);

    const handleMouseMove = (me: MouseEvent) => {
        const dx = me.clientX - lastMousePosRef.current.x;
        const dy = me.clientY - lastMousePosRef.current.y;
        lastMousePosRef.current = { x: me.clientX, y: me.clientY };
        setZoom(prev => ({
            ...prev,
            x: prev.x + dx / prev.scale,
            y: prev.y + dy / prev.scale,
        }));
    };

    const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        setIsPanning(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const filters = ['none', 'grayscale', 'sepia', 'vintage', 'invert', 'glow', 'sketch', 'blur', 'sharpen', 'vignette', 'posterize'];
  const examplePrompts = [
    'Make the sky a vibrant sunset',
    'Add a cat wearing sunglasses',
    'Turn into a watercolor painting',
    'Apply a vintage film look',
    'Add a magical, sparkling effect',
  ];

  const imageStyle: React.CSSProperties = {
      transform: `scale(${zoom.scale}) translate(${zoom.x}px, ${zoom.y}px)`,
      cursor: isPanning ? 'grabbing' : (zoom.scale > 1 ? 'grab' : 'default'),
  };

  return (
    <>
      <style>{`
        :root {
          --primary-color-start: #6d28d9;
          --primary-color-end: #4f46e5;
          --primary-hover: #4338ca;
          --background-color: #f0f2f5;
          --card-background: #ffffff;
          --text-color: #111827;
          --subtle-text: #6b7280;
          --border-color: #e5e7eb;
          --error-color: #ef4444;
          --font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }

        body {
          margin: 0;
          font-family: var(--font-family);
          background-color: var(--background-color);
          background-image: linear-gradient(135deg, #f0f2f5 0%, #e6e9ee 100%);
          color: var(--text-color);
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        .app-container {
          max-width: 1280px;
          margin: 0 auto;
          padding: 2rem 1.5rem;
        }

        header {
          text-align: center;
          margin-bottom: 3.5rem;
        }
        
        header .logo {
            background: linear-gradient(90deg, var(--primary-color-start), var(--primary-color-end));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            display: inline-block;
            font-size: 2.75rem;
            font-weight: 800;
        }

        .subtitle {
          font-size: 1.25rem;
          color: var(--subtle-text);
          margin-top: 0.5rem;
          max-width: 600px;
          margin-left: auto;
          margin-right: auto;
        }

        .main-content {
          display: grid;
          grid-template-columns: 380px 1fr;
          gap: 2.5rem;
          align-items: start;
        }

        .controls-container {
          position: sticky;
          top: 2.5rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          background-color: var(--card-background);
          padding: 2rem;
          border-radius: 1rem;
          box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.07), 0 4px 6px -4px rgb(0 0 0 / 0.1);
          border: 1px solid var(--border-color);
        }

        .control-section > label {
          display: block;
          font-weight: 600;
          margin-bottom: 0.75rem;
          font-size: 1rem;
        }

        .file-input-hidden {
          display: none;
        }

        .upload-button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          width: 100%;
          box-sizing: border-box;
          padding: 0.75rem 1rem;
          background-color: #fff;
          color: var(--subtle-text);
          border: 1px solid var(--border-color);
          border-radius: 0.5rem;
          cursor: pointer;
          text-align: center;
          transition: all 0.2s ease;
          font-weight: 500;
        }

        .upload-button:hover {
          background-color: #f9fafb;
          border-color: #d1d5db;
          color: var(--text-color);
        }
        
        .upload-button-text {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .filter-buttons {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
            gap: 0.5rem;
        }

        .filter-button {
            padding: 0.5rem;
            font-size: 0.875rem;
            font-weight: 500;
            border: 1px solid var(--border-color);
            background-color: #fff;
            color: var(--subtle-text);
            border-radius: 0.375rem;
            cursor: pointer;
            transition: all 0.2s ease;
            text-transform: capitalize;
        }
        
        .filter-button:hover {
            background-color: #f9fafb;
            border-color: #d1d5db;
        }
        
        .filter-button.active {
            background-color: var(--primary-color-end);
            color: #fff;
            border-color: var(--primary-color-end);
        }

        .prompt-textarea {
          width: 100%;
          padding: 0.75rem;
          font-size: 1rem;
          font-family: var(--font-family);
          border: 1px solid var(--border-color);
          border-radius: 0.5rem;
          resize: vertical;
          box-sizing: border-box;
          min-height: 100px;
          transition: box-shadow 0.2s, border-color 0.2s;
        }

        .prompt-textarea:focus {
          outline: none;
          border-color: var(--primary-color-end);
          box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.2);
        }
        
        .example-prompts {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-top: 0.75rem;
        }

        .example-prompt-button {
          padding: 0.375rem 0.75rem;
          font-size: 0.875rem;
          font-weight: 500;
          border: 1px solid var(--border-color);
          background-color: #f9fafb;
          color: var(--subtle-text);
          border-radius: 9999px; /* pill shape */
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .example-prompt-button:hover {
          background-color: #f3f4f6;
          border-color: #d1d5db;
          color: var(--text-color);
        }
        
        .history-controls {
            display: flex;
            justify-content: flex-end;
            gap: 0.75rem;
            margin-bottom: 0.75rem;
        }
        
        .history-button {
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: #fff;
            border: 1px solid var(--border-color);
            color: var(--text-color);
            border-radius: 0.375rem;
            width: 40px;
            height: 40px;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .history-button:hover:not(:disabled) {
            background-color: #f9fafb;
            border-color: #d1d5db;
        }
        
        .history-button:disabled {
            color: #d1d5db;
            cursor: not-allowed;
        }

        .button-group {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0.75rem;
        }

        .icon-button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.875rem 1rem;
          font-size: 1rem;
          font-weight: 600;
          border: none;
          border-radius: 0.5rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .icon-button:active:not(:disabled) {
            transform: scale(0.98);
        }

        .generate-button {
          color: #fff;
          background: linear-gradient(90deg, var(--primary-color-start), var(--primary-color-end));
        }

        .generate-button:hover:not(:disabled) {
            box-shadow: 0 4px 15px -3px rgba(79, 70, 229, 0.4);
        }
        
        .reset-button {
            background-color: #f3f4f6;
            color: var(--text-color);
            border: 1px solid var(--border-color);
        }
        
        .reset-button:hover:not(:disabled) {
            background-color: #e5e7eb;
        }

        .icon-button:disabled {
          background: #d1d5db;
          color: #9ca3af;
          cursor: not-allowed;
        }

        .error-text {
          color: var(--error-color);
          font-weight: 500;
          text-align: center;
        }

        .images-container {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2rem;
        }

        .image-box {
          position: relative;
          background-color: var(--card-background);
          padding: 1rem;
          border-radius: 1rem;
          box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.07), 0 4px 6px -4px rgb(0 0 0 / 0.1);
          border: 1px solid var(--border-color);
          text-align: center;
          display: flex;
          flex-direction: column;
        }

        .image-box h2 {
          font-size: 1.25rem;
          font-weight: 600;
          margin: 0 0 1rem 0;
        }

        .image-content {
            flex-grow: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            overflow: hidden;
        }

        .image-display, .image-placeholder, .loader-container {
          width: 100%;
          aspect-ratio: 1 / 1;
          border-radius: 0.75rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: scale(0.98); }
            to { opacity: 1; transform: scale(1); }
        }
        
        .image-display {
          object-fit: cover;
          animation: fadeIn 0.5s ease-out;
          transition: transform 0.1s ease-out;
          max-width: 100%;
          max-height: 100%;
          user-select: none;
        }

        .image-placeholder {
          background-color: #f9fafb;
          color: var(--subtle-text);
          border: 2px dashed var(--border-color);
          flex-direction: column;
          gap: 0.75rem;
        }
        
        .loader-container {
          flex-direction: column;
          gap: 1rem;
          color: var(--subtle-text);
        }

        .zoom-controls {
            position: absolute;
            bottom: 1rem;
            left: 50%;
            transform: translateX(-50%);
            background-color: rgba(17, 24, 39, 0.75);
            border-radius: 9999px;
            padding: 0.25rem 0.5rem;
            display: flex;
            gap: 0.25rem;
            align-items: center;
            opacity: 0;
            transition: opacity 0.3s ease;
            z-index: 10;
            pointer-events: none;
        }

        .image-content:hover .zoom-controls {
            opacity: 1;
            pointer-events: all;
        }
        
        .zoom-button {
            background-color: transparent;
            border: none;
            color: white;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: background-color 0.2s ease;
        }

        .zoom-button:hover {
            background-color: rgba(255, 255, 255, 0.2);
        }

        .zoom-slider {
            -webkit-appearance: none;
            appearance: none;
            width: 120px;
            height: 4px;
            background: rgba(255, 255, 255, 0.4);
            border-radius: 2px;
            outline: none;
            transition: opacity .2s;
            margin: 0 0.5rem;
        }

        .zoom-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 16px;
            height: 16px;
            background: #fff;
            cursor: pointer;
            border-radius: 50%;
        }

        .zoom-slider::-moz-range-thumb {
            width: 16px;
            height: 16px;
            background: #fff;
            cursor: pointer;
            border-radius: 50%;
            border: none;
        }

        .zoom-percentage {
            color: white;
            font-size: 0.8rem;
            font-weight: 500;
            margin: 0 0.5rem;
            min-width: 40px;
            text-align: center;
            user-select: none;
        }
        
        .download-button {
            position: absolute;
            top: 1.5rem;
            right: 1.5rem;
            background-color: rgba(0,0,0,0.6);
            color: white;
            border: none;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s ease;
            box-shadow: 0 4px 6px rgba(0,0,0,0.2);
            z-index: 5;
        }
        
        .download-button:hover {
            background-color: rgba(0,0,0,0.8);
            transform: scale(1.1);
        }

        .spinner {
          border: 4px solid #e5e7eb;
          border-top: 4px solid var(--primary-color-end);
          border-radius: 50%;
          width: 40px;
          height: 40px;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @media (max-width: 1024px) {
          .main-content {
            grid-template-columns: 1fr;
          }
          .controls-container {
            position: static;
            top: auto;
          }
        }
        
        @media (max-width: 640px) {
          .images-container {
            grid-template-columns: 1fr;
          }
           header .logo {
            font-size: 2.25rem;
          }
          .subtitle {
            font-size: 1.1rem;
          }
          .app-container {
            padding: 1.5rem 1rem;
          }
          .button-group {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
      <div className="app-container">
        <header>
          <h1 className="logo">AI Image Editor</h1>
          <p className="subtitle">Transform your images with a simple instruction using Gemini AI.</p>
        </header>

        <main className="main-content">
          <div className="controls-container">
            <div className="control-section">
              <label htmlFor="image-upload">1. Upload Image</label>
              <input
                id="image-upload"
                type="file"
                accept="image/*"
                className="file-input-hidden"
                onChange={handleImageChange}
                ref={fileInputRef}
                aria-hidden="true"
              />
              <label htmlFor="image-upload" className="upload-button" role="button" aria-controls="image-upload" tabIndex={0}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                <span className="upload-button-text">{baseImage ? baseImage.name : 'Choose a file...'}</span>
              </label>
            </div>
            
            <div className="control-section">
              <label>2. Apply a Filter</label>
              <div className="filter-buttons">
                {filters.map(filter => (
                  <button
                    key={filter}
                    className={`filter-button ${activeFilter === filter ? 'active' : ''}`}
                    onClick={() => handleFilterClick(filter)}
                    disabled={!baseImage}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            <div className="control-section">
              <label htmlFor="prompt-input">3. Edit Instruction</label>
              <textarea
                id="prompt-input"
                className="prompt-textarea"
                placeholder="Describe the edit you want to see..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
              <div className="example-prompts">
                {examplePrompts.map(p => (
                  <button 
                    key={p} 
                    className="example-prompt-button" 
                    onClick={() => setPrompt(p)}
                    disabled={!baseImage}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="history-controls">
                <button
                    className="history-button"
                    onClick={handleUndo}
                    disabled={!canUndo}
                    aria-label="Undo"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10v6c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-6H3z"></path><path d="M12 15v-3M10 10l2-2 2 2"></path></svg>
                </button>
                 <button
                    className="history-button"
                    onClick={handleRedo}
                    disabled={!canRedo}
                    aria-label="Redo"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" transform="rotate(180)"><path d="M3 10v6c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-6H3z"></path><path d="M12 15v-3M10 10l2-2 2 2"></path></svg>
                </button>
            </div>
            
            <div className="button-group">
                <button
                  className="icon-button reset-button"
                  onClick={handleReset}
                  disabled={!baseImage && !prompt}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                  Reset
                </button>
                <button
                  className="icon-button generate-button"
                  onClick={handleGenerateClick}
                  disabled={isLoading || !baseImage || !prompt.trim()}
                  aria-live="polite"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path></svg>
                  {isLoading ? 'Generating...' : 'Generate'}
                </button>
            </div>
            
            {error && <p className="error-text" role="alert">{error}</p>}
          </div>

          <div className="images-container">
            <div className="image-box">
              <h2>Original</h2>
              <div className="image-content" onWheel={handleWheel} onMouseDown={handleMouseDown}>
                {originalImageUrl ? (
                    <>
                        <img src={originalImageUrl} alt="Original with filter" className="image-display" style={imageStyle} draggable="false" />
                        <ZoomControls 
                          onZoom={handleZoomButtons} 
                          onReset={() => setZoom({ scale: 1, x: 0, y: 0 })} 
                          scale={zoom.scale} 
                          onScaleChange={handleScaleChange} 
                        />
                    </>
                ) : (
                    <div className="image-placeholder">
                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                        <span>Upload an image to start</span>
                    </div>
                )}
              </div>
            </div>
            <div className="image-box">
              <h2>Edited</h2>
              <div className="image-content" onWheel={handleWheel} onMouseDown={handleMouseDown}>
                {isLoading ? (
                    <div className="loader-container" aria-label="Loading edited image">
                    <div className="spinner"></div>
                    <span>Applying AI magic...</span>
                    </div>
                ) : editedImageUrl ? (
                    <>
                        <img src={editedImageUrl} alt="Edited" className="image-display" style={imageStyle} draggable="false" />
                        <ZoomControls 
                           onZoom={handleZoomButtons} 
                           onReset={() => setZoom({ scale: 1, x: 0, y: 0 })} 
                           scale={zoom.scale} 
                           onScaleChange={handleScaleChange}
                        />
                        <button className="download-button" onClick={handleDownload} aria-label="Download edited image">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        </button>
                    </>
                ) : (
                    <div className="image-placeholder">
                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path></svg>
                        <span>Your edited image will appear here</span>
                    </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);