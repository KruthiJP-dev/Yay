
import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Modality } from "@google/genai";

const App = () => {
  const [originalImage, setOriginalImage] = useState<File | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [editedImageUrl, setEditedImageUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>('none');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (!originalImage) {
        setOriginalImageUrl(null);
        return;
    };

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = URL.createObjectURL(originalImage);

    img.onload = () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        
        let filterString = 'none';
        switch(activeFilter) {
            case 'grayscale': filterString = 'grayscale(100%)'; break;
            case 'sepia': filterString = 'sepia(100%)'; break;
            case 'vintage': filterString = 'sepia(70%) contrast(110%) brightness(90%)'; break;
            case 'invert': filterString = 'invert(100%)'; break;
            case 'glow': filterString = 'brightness(1.2) saturate(1.3) contrast(1.05)'; break;
            case 'sketch': filterString = 'grayscale(1) contrast(150%) brightness(110%)'; break;
        }

        ctx.filter = filterString;
        ctx.drawImage(img, 0, 0);
        
        setOriginalImageUrl(canvas.toDataURL(originalImage.type));
        URL.revokeObjectURL(img.src); // Clean up blob URL
    };

  }, [originalImage, activeFilter]);


  const getFilteredImageFile = (): Promise<File> => {
    return new Promise((resolve, reject) => {
        if (activeFilter === 'none' && originalImage) {
            resolve(originalImage);
            return;
        }
        if (!originalImage) {
            reject(new Error("No image to filter"));
            return;
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            reject(new Error("Could not get canvas context"));
            return;
        }

        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = URL.createObjectURL(originalImage);

        img.onload = () => {
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;

            let filterString = 'none';
            switch(activeFilter) {
                case 'grayscale': filterString = 'grayscale(100%)'; break;
                case 'sepia': filterString = 'sepia(100%)'; break;
                case 'vintage': filterString = 'sepia(70%) contrast(110%) brightness(90%)'; break;
                case 'invert': filterString = 'invert(100%)'; break;
                case 'glow': filterString = 'brightness(1.2) saturate(1.3) contrast(1.05)'; break;
                case 'sketch': filterString = 'grayscale(1) contrast(150%) brightness(110%)'; break;
            }
            
            ctx.filter = filterString;
            ctx.drawImage(img, 0, 0);

            canvas.toBlob((blob) => {
                if (blob) {
                    const filteredFile = new File([blob], originalImage.name, { type: originalImage.type });
                    resolve(filteredFile);
                } else {
                    reject(new Error("Canvas toBlob failed"));
                }
            }, originalImage.type);
            URL.revokeObjectURL(img.src);
        };
        img.onerror = reject;
    });
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setOriginalImage(file);
      setEditedImageUrl(null);
      setError(null);
      setActiveFilter('none');
    }
  };

  const handleGenerateClick = async () => {
    if (!originalImage || !prompt.trim()) {
      setError('Please upload an image and enter a prompt.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setEditedImageUrl(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const imageToProcess = await getFilteredImageFile();
      const imagePart = await fileToGenerativePart(imageToProcess);
      const textPart = { text: prompt };

      const response = await ai.models.generateContent({
        model: 'gemini-flash-lite-latest',
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
    setOriginalImage(null);
    setOriginalImageUrl(null);
    setEditedImageUrl(null);
    setPrompt('');
    setError(null);
    setActiveFilter('none');
    if(fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };

  const handleDownload = () => {
    if (!editedImageUrl) return;
    const link = document.createElement('a');
    link.href = editedImageUrl;
    link.download = `edited-${originalImage?.name || 'image.png'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filters = ['none', 'grayscale', 'sepia', 'vintage', 'invert', 'glow', 'sketch'];

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
        
        .download-button {
            position: absolute;
            bottom: 1.5rem;
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
                <span className="upload-button-text">{originalImage ? originalImage.name : 'Choose a file...'}</span>
              </label>
            </div>
            
            <div className="control-section">
              <label>2. Apply a Filter</label>
              <div className="filter-buttons">
                {filters.map(filter => (
                  <button
                    key={filter}
                    className={`filter-button ${activeFilter === filter ? 'active' : ''}`}
                    onClick={() => setActiveFilter(filter)}
                    disabled={!originalImage}
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
                placeholder="e.g., Add a retro filter, make it black and white..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>
            
            <div className="button-group">
                <button
                  className="icon-button reset-button"
                  onClick={handleReset}
                  disabled={!originalImage && !prompt}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                  Reset
                </button>
                <button
                  className="icon-button generate-button"
                  onClick={handleGenerateClick}
                  disabled={isLoading || !originalImage || !prompt.trim()}
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
              <div className="image-content">
                {originalImageUrl ? (
                    <img src={originalImageUrl} alt="Original with filter" className="image-display" />
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
              <div className="image-content">
                {isLoading ? (
                    <div className="loader-container" aria-label="Loading edited image">
                    <div className="spinner"></div>
                    <span>Applying AI magic...</span>
                    </div>
                ) : editedImageUrl ? (
                    <>
                        <img src={editedImageUrl} alt="Edited" className="image-display" />
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
