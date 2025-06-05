import React, { useState } from 'react';

// API_UPLOAD_PATH remains /api/upload
const API_UPLOAD_PATH = '/api/upload';
// DOWNLOAD_BASE_PATH is now /f
const DOWNLOAD_BASE_PATH = '/f';

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [passcode, setPasscode] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [expiryDays, setExpiryDays] = useState('');
  const [uploadResult, setUploadResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [downloadSlug, setDownloadSlug] = useState('');
  const [downloadPasscode, setDownloadPasscode] = useState('');
  const [downloadResult, setDownloadResult] = useState('');

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
    setErrorMessage('');
  };

  const handleUpload = async () => {
    setUploadResult(null);
    setErrorMessage('');
    if (!selectedFile) {
      setErrorMessage('Please select a file to upload.');
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);
    if (passcode) {
      formData.append('passcode', passcode);
    }
    formData.append('isPrivate', isPrivate.toString());
    if (expiryDays) {
      formData.append('expiryDays', expiryDays);
    }

    try {
      const response = await fetch(API_UPLOAD_PATH, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setUploadResult({
          // Construct the full short URL using window.location.origin and the NEW DOWNLOAD_BASE_PATH
          shortUrl: `${window.location.origin}${DOWNLOAD_BASE_PATH}/${data.shortUrlSlug}`,
          originalFilename: data.originalFilename,
          isPrivate: data.isPrivate,
          expiryTimestamp: data.expiryTimestamp,
        });
        setDownloadSlug(data.shortUrlSlug); // Pre-fill for easy testing
      } else {
        setErrorMessage(data.error || 'Upload failed. Please check the console for details.');
      }
    } catch (error) {
      console.error('Upload error:', error);
      setErrorMessage('An unexpected error occurred during upload.');
    }
  };

  const handleDownload = async () => {
    setDownloadResult('');
    setErrorMessage('');
    if (!downloadSlug) {
      setErrorMessage('Please enter a short URL slug for download.');
      return;
    }

    // Construct download URL using the NEW DOWNLOAD_BASE_PATH
    let downloadUrl = `${DOWNLOAD_BASE_PATH}/${downloadSlug}`;
    if (downloadPasscode) {
      downloadUrl += `?passcode=${downloadPasscode}`;
    }

    try {
      // Use a regular fetch to get the file. The browser will handle the download
      const response = await fetch(downloadUrl);

      if (response.ok) {
        // Create a blob from the response and trigger download
        const blob = await response.blob();
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = 'downloaded-file';
        if (contentDisposition && contentDisposition.indexOf('filename=') !== -1) {
            filename = contentDisposition.split('filename=')[1].replace(/"/g, '');
        } else {
            // Fallback: try to guess extension or use slug if no filename in header
            const mimeType = response.headers.get('Content-Type');
            if (mimeType) {
                const parts = mimeType.split('/');
                if (parts.length > 1) {
                    filename = `${downloadSlug}.${parts[1]}`;
                }
            }
        }

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        setDownloadResult('File download initiated successfully.');
      } else {
        const errorData = await response.json(); // Pages Function returns JSON error
        setErrorMessage(errorData.error || `Download failed: HTTP ${response.status}`);
      }
    } catch (error) {
      console.error('Download error:', error);
      setErrorMessage('An unexpected error occurred during download.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <script src="https://cdn.tailwindcss.com"></script>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet" />

      <style>{`
        body {
          font-family: 'Inter', sans-serif;
        }
      `}</style>

      <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md">
        <h1 className="text-3xl font-bold text-gray-800 mb-6 text-center">File Share Service</h1>

        {errorMessage && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
            <strong className="font-bold">Error! </strong>
            <span className="block sm:inline">{errorMessage}</span>
          </div>
        )}

        {/* Upload Section */}
        <div className="mb-8 p-4 border border-gray-200 rounded-md">
          <h2 className="text-2xl font-semibold text-gray-700 mb-4">Upload File</h2>
          <input
            type="file"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-full file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100 mb-4"
          />
          <input
            type="password"
            placeholder="Optional: Passcode for private files"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
          />
          <div className="flex items-center mb-4">
            <input
              type="checkbox"
              id="isPrivate"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="isPrivate" className="ml-2 text-gray-700">Make file private (requires passcode)</label>
          </div>
          <input
            type="number"
            placeholder="Optional: Expire in days (e.g., 7)"
            value={expiryDays}
            onChange={(e) => setExpiryDays(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
          />
          <button
            onClick={handleUpload}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition duration-300 ease-in-out shadow-md"
          >
            Upload File
          </button>

          {uploadResult && (
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 text-blue-800 rounded-md">
              <p className="font-semibold text-lg mb-2">Upload Successful!</p>
              <p><strong>Original File:</strong> {uploadResult.originalFilename}</p>
              <p><strong>Short URL:</strong> <a href={uploadResult.shortUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800">{uploadResult.shortUrl}</a></p>
              {uploadResult.isPrivate && <p className="text-orange-700">This file is private. Passcode is required for download.</p>}
              {uploadResult.expiryTimestamp && (
                <p><strong>Expires:</strong> {new Date(uploadResult.expiryTimestamp).toLocaleString()}</p>
              )}
            </div>
          )}
        </div>

        {/* Download Section */}
        <div className="p-4 border border-gray-200 rounded-md">
          <h2 className="text-2xl font-semibold text-gray-700 mb-4">Download File</h2>
          <input
            type="text"
            placeholder="Enter Short URL Slug (e.g., abcde1)"
            value={downloadSlug}
            onChange={(e) => setDownloadSlug(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
          />
          <input
            type="password"
            placeholder="Passcode (if required)"
            value={downloadPasscode}
            onChange={(e) => setDownloadPasscode(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
          />
          <button
            onClick={handleDownload}
            className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 transition duration-300 ease-in-out shadow-md"
          >
            Download File
          </button>

          {downloadResult && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 text-green-800 rounded-md">
              <p className="font-semibold text-lg">{downloadResult}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
