
import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Modality } from "@google/genai";

const App = () => {
  const [originalImage, setOriginalImage] = useState<File | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [editedImageUrl, setEditedImageUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setOriginalImage(file);
      setOriginalImageUrl(URL.createObjectURL(file));
      setEditedImageUrl(null);
      setError(null);
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
      const imagePart = await fileToGenerativePart(originalImage);
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
      // The response may contain the original image as well, so find the generated one.
      // Often the last image part is the generated image.
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

  return (
    <>
      <style>{`
        :root {
          --primary-color: #4f46e5;
          --primary-hover: #4338ca;
          --background-color: #f8fafc;
          --card-background: #ffffff;
          --text-color: #1e293b;
          --subtle-text: #64748b;
          --border-color: #e2e8f0;
          --error-color: #ef4444;
          --font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }

        body {
          margin: 0;
          font-family: var(--font-family);
          background-color: var(--background-color);
          color: var(--text-color);
        }

        .app-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem 1.5rem;
        }

        header {
          text-align: center;
          margin-bottom: 3rem;
        }

        h1 {
          font-size: 2.5rem;
          font-weight: 700;
          margin: 0 0 0.5rem 0;
        }

        .subtitle {
          font-size: 1.125rem;
          color: var(--subtle-text);
        }

        .main-content {
          display: grid;
          grid-template-columns: 350px 1fr;
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
          padding: 1.5rem;
          border-radius: 0.75rem;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
          border: 1px solid var(--border-color);
        }

        .control-section > label {
          display: block;
          font-weight: 600;
          margin-bottom: 0.5rem;
          font-size: 1rem;
        }

        .file-input-hidden {
          display: none;
        }

        .upload-button {
          display: inline-block;
          width: 100%;
          box-sizing: border-box;
          padding: 0.75rem 1rem;
          background-color: #fff;
          color: var(--subtle-text);
          border: 1px solid var(--border-color);
          border-radius: 0.5rem;
          cursor: pointer;
          text-align: center;
          transition: background-color 0.2s, border-color 0.2s;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .upload-button:hover {
          background-color: #f9fafb;
          border-color: #cbd5e1;
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
          min-height: 80px;
        }

        .prompt-textarea:focus {
          outline: 2px solid var(--primary-color);
          border-color: transparent;
        }

        .generate-button {
          padding: 0.875rem 1rem;
          font-size: 1.1rem;
          font-weight: 600;
          color: #fff;
          background-color: var(--primary-color);
          border: none;
          border-radius: 0.5rem;
          cursor: pointer;
          transition: background-color 0.2s, transform 0.1s;
        }

        .generate-button:hover:not(:disabled) {
            background-color: var(--primary-hover);
            transform: translateY(-1px);
        }

        .generate-button:disabled {
          background-color: #94a3b8;
          cursor: not-allowed;
        }

        .error-text {
          color: var(--error-color);
          font-weight: 500;
        }

        .images-container {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
        }

        .image-box {
          background-color: var(--card-background);
          padding: 1rem;
          border-radius: 0.75rem;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
          border: 1px solid var(--border-color);
          text-align: center;
        }

        .image-box h2 {
          font-size: 1.2rem;
          font-weight: 600;
          margin: 0 0 1rem 0;
        }

        .image-display, .image-placeholder, .loader-container {
          width: 100%;
          aspect-ratio: 1 / 1;
          border-radius: 0.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .image-display {
          object-fit: cover;
        }

        .image-placeholder {
          background-color: #f1f5f9;
          color: var(--subtle-text);
          border: 2px dashed var(--border-color);
        }
        
        .loader-container {
          flex-direction: column;
          gap: 1rem;
          color: var(--subtle-text);
        }

        .spinner {
          border: 4px solid #f3f3f3;
          border-top: 4px solid var(--primary-color);
          border-radius: 50%;
          width: 40px;
          height: 40px;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @media (max-width: 900px) {
          .main-content {
            grid-template-columns: 1fr;
          }
          .controls-container {
            position: static;
            top: auto;
          }
        }
        
        @media (max-width: 600px) {
          .images-container {
            grid-template-columns: 1fr;
          }
          h1 {
            font-size: 2rem;
          }
          .app-container {
            padding: 1.5rem 1rem;
          }
        }
      `}</style>
      <div className="app-container">
        <header>
          <h1>AI Image Editor</h1>
          <p className="subtitle">Edit your images with the power of Gemini 2.5 Flash Image.</p>
        </header>

        <main className="main-content">
          <div className="controls-container">
            <div className="control-section">
              <label htmlFor="image-upload">Upload Image</label>
              <input
                id="image-upload"
                type="file"
                accept="image/*"
                className="file-input-hidden"
                onChange={handleImageChange}
                aria-hidden="true"
              />
              <label htmlFor="image-upload" className="upload-button" role="button" aria-controls="image-upload" tabIndex={0}>
                {originalImage ? originalImage.name : 'Choose a file...'}
              </label>
            </div>

            <div className="control-section">
              <label htmlFor="prompt-input">Edit Instruction</label>
              <textarea
                id="prompt-input"
                className="prompt-textarea"
                placeholder="e.g., Add a retro filter, make it black and white..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>
            
            <button
              className="generate-button"
              onClick={handleGenerateClick}
              disabled={isLoading || !originalImage || !prompt.trim()}
              aria-live="polite"
            >
              {isLoading ? 'Generating...' : 'Generate'}
            </button>
            
            {error && <p className="error-text" role="alert">{error}</p>}
          </div>

          <div className="images-container">
            <div className="image-box">
              <h2>Original</h2>
              {originalImageUrl ? (
                <img src={originalImageUrl} alt="Original" className="image-display" />
              ) : (
                <div className="image-placeholder">
                  <span>Upload an image to start</span>
                </div>
              )}
            </div>
            <div className="image-box">
              <h2>Edited</h2>
              {isLoading ? (
                <div className="loader-container" aria-label="Loading edited image">
                  <div className="spinner"></div>
                  <span>Editing your image...</span>
                </div>
              ) : editedImageUrl ? (
                <img src={editedImageUrl} alt="Edited" className="image-display" />
              ) : (
                <div className="image-placeholder">
                  <span>Your edited image will appear here</span>
                </div>
              )}
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
