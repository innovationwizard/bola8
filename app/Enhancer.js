"use client";

import React, { useState, useCallback, useRef } from 'react';
import { Upload, Download, Loader2 } from 'lucide-react';

// ============================================================================
// MAIN COMPONENT: Proposal Image Enhancer
// ============================================================================

// File validation constants (easily extensible)
const ALLOWED_FORMATS = ['image/jpeg', 'image/png'];
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB in bytes

// TODO: Add more formats here as needed
// Example: const ALLOWED_FORMATS = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff'];

export default function Enhancer() {
  // State management
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [enhancedImage, setEnhancedImage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const enhanceTimerRef = useRef(null);
  const mode = 'surfaces';

  // ============================================================================
  // FILE HANDLING
  // ============================================================================

  const handleFile = useCallback((selectedFile) => {
    const validateFile = (file) => {
      if (!ALLOWED_FORMATS.includes(file.type)) {
        throw new Error('Only JPG and PNG files are supported');
      }
      if (file.size > MAX_FILE_SIZE) {
        throw new Error('File size must be less than 100MB');
      }
      return true;
    };

    try {
      setError(null);
      setEnhancedImage(null);
      
      validateFile(selectedFile);
      
      setFile(selectedFile);
      
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result);
      };
      reader.readAsDataURL(selectedFile);
    } catch (err) {
      setError(err.message);
      setFile(null);
      setPreview(null);
    }
  }, []);

  // Drag and drop handlers
  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, [handleFile]);

  const handleChange = useCallback((e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  }, [handleFile]);

  // ============================================================================
  // IMAGE ENHANCEMENT PROCESS
  // ============================================================================

  const enhanceImage = async () => {
    if (!file) return;
    
    setIsProcessing(true);
    enhanceTimerRef.current = Date.now();
    setError(null);

    try {
      // Create FormData for file upload
      const formData = new FormData();
      formData.append('image', file);
      formData.append('mode', mode);

      // Call our API route
      const response = await fetch('/api/enhance', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Enhancement failed');
      }

      setEnhancedImage(data.enhancedUrl);
      if (enhanceTimerRef.current) {
        const elapsedSeconds = ((Date.now() - enhanceTimerRef.current) / 1000).toFixed(2);
        console.log(`Enhancement completed in ${elapsedSeconds} seconds.`);
        enhanceTimerRef.current = null;
      }
    } catch (err) {
      setError(err.message);
      enhanceTimerRef.current = null;
    } finally {
      setIsProcessing(false);
    }
  };

  // ============================================================================
  // DOWNLOAD HANDLER
  // ============================================================================

  const downloadImage = async () => {
    if (!enhancedImage) return;

    try {
      const response = await fetch(enhancedImage);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `enhanced-${file.name}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      setError('Failed to download image');
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="w-full">
      {/* Step 1: Upload */}
      {!enhancedImage && (
        <div className="space-y-6">
              <div
                className={`
                  relative border-2 border-dashed rounded-lg p-12 text-center
                  transition-all duration-200 ease-in-out
                  ${dragActive 
                    ? 'border-gray-400 bg-gray-50' 
                    : 'border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50'
                  }
                `}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  id="file-upload"
                  className="hidden"
                  accept=".jpg,.jpeg,.png"
                  onChange={handleChange}
                  disabled={isProcessing}
                />
                
                {!preview ? (
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                    <p className="text-lg text-gray-600 mb-2">
                      Arrastra tu imagen aquí
                    </p>
                    <p className="text-sm text-gray-400 mb-4">o</p>
                    <span className="inline-block px-6 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-700 transition-colors">
                      Explorar para subir
                    </span>
                    <p className="text-xs text-gray-400 mt-4">
                      JPG o PNG
                    </p>
                  </label>
                ) : (
                  <div className="space-y-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={preview} 
                      alt="Vista previa" 
                      className="max-h-64 mx-auto rounded-lg shadow-sm"
                    />
                    <button
                      onClick={() => {
                        setFile(null);
                        setPreview(null);
                        setError(null);
                      }}
                      className="text-sm text-gray-500 hover:text-gray-700"
                      disabled={isProcessing}
                    >
                      Cambiar imagen
                    </button>
                  </div>
                )}
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                  {error}
                </div>
              )}

              {/* Enhance Button */}
              {preview && !isProcessing && (
                <button
                  onClick={enhanceImage}
                  className="w-full py-3 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors text-sm font-light"
                >
                  Mejorar Imagen
                </button>
              )}

              {/* Loading State */}
              {isProcessing && (
                <div className="text-center space-y-4 py-8">
                  {/* Simple loading animation - easily replaceable */}
                  <div className="relative w-16 h-16 mx-auto">
                    <Loader2 className="w-16 h-16 text-gray-400 animate-spin" />
                  </div>
                  <p className="text-gray-600 font-light">
                    Creando magia...
                  </p>
                  <p className="text-sm text-gray-400">
                    Esto puede tomar varios segundos...
                  </p>
                </div>
              )}
            </div>
          )}

      {/* Step 2: Result */}
      {enhancedImage && (
        <div className="space-y-6">
          <h2 className="text-lg font-light text-gray-900">
            Imagen Mejorada
          </h2>

          <div className="bg-white rounded-lg p-4 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src={enhancedImage} 
              alt="Mejorada" 
              className="w-full rounded-lg"
            />
          </div>

          {/* Download Button */}
          <button
            onClick={downloadImage}
            className="w-full py-3 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors text-sm font-light flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            Descargar
          </button>

          {/* Start Over */}
          <button
            onClick={() => {
              setFile(null);
              setPreview(null);
              setEnhancedImage(null);
              setError(null);
            }}
            className="w-full py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md transition-colors"
          >
            Mejorar Otra Imagen
          </button>
        </div>
      )}
    </div>
  );
}