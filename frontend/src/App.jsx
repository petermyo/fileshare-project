import React, { useState, useRef, useEffect } from 'react';

const API_BASE_PATH = '/api'; // All backend API calls will start with /api

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [passcode, setPasscode] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [expiryDays, setExpiryDays] = useState('');
  const [uploadResult, setUploadResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // State for download section
  const [downloadSlug, setDownloadSlug] = useState('');
  const [downloadPasscode, setDownloadPasscode] = useState('');
  const [downloadResult, setDownloadResult] = useState('');
  const [showDownloadPrompt, setShowDownloadPrompt] = useState(false); // Controls visibility of download box
  const [promptMessage, setPromptMessage] = useState(''); // Message shown when prompting for passcode

  const passcodeRef = useRef(null); // Ref to focus the passcode input

  // Effect to handle URL-based redirects from /s/SLUG
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const slugFromUrl = searchParams.get('slug');
    const promptDownloadFromUrl = searchParams.get('promptDownload') === 'true';
    const messageFromUrl = searchParams.get('message');
    const errorFromUrl = searchParams.get('error');

    if (errorFromUrl) {
      setErrorMessage(decodeURIComponent(errorFromUrl));
      // Clear error from URL to prevent infinite loop on refresh
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (slugFromUrl && promptDownloadFromUrl) {
      setDownloadSlug(slugFromUrl);
      setPromptMessage(decodeURIComponent(messageFromUrl || ''));
      setShowDownloadPrompt(true); // Force show download prompt
      // Clear URL parameters after initial processing
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []); // Run only once on component mount

  // Effect to focus passcode input when download prompt shows
  useEffect(() => {
    if (showDownloadPrompt && passcodeRef.current) {
      passcodeRef.current.focus();
    }
  }, [showDownloadPrompt]);


  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
    setErrorMessage('');
  };

  // Toggle private status and clear/manage passcode field accordingly
  const handleIsPrivateChange = (event) => {
    const checked = event.target.checked;
    setIsPrivate(checked);
    if (!checked) {
      setPasscode(''); // Clear passcode if no longer private
    }
  };

  const handleUpload = async () => {
    setUploadResult(null);
    setErrorMessage('');
    if (!selectedFile) {
      setErrorMessage('Please select a file to upload.');
      return;
    }

    // Passcode validation on upload
    if (isPrivate && !passcode) {
      setErrorMessage('Passcode is required for private files.');
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);
    if (isPrivate && passcode) { // Only append if private and provided
      formData.append('passcode', passcode);
    }
    formData.append('isPrivate', isPrivate.toString());
    if (expiryDays) {
      formData.append('expiryDays', expiryDays);
    }

    try {
      const response = await fetch(`${API_BASE_PATH}/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setUploadResult({
          shortUrl: `${window.location.origin}/s/${data.shortUrlSlug}`, // Short URL for display
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

    // For manual download from the UI, directly call the /s/ route
    let downloadUrl = `${window.location.origin}/s/${downloadSlug}`;
    if (downloadPasscode) {
      downloadUrl += `?passcode=${downloadPasscode}`;
    }

    // Direct navigation to trigger download (or redirect from server)
    window.location.href = downloadUrl;

    // We expect the server to handle the download or redirect.
    // The previous error handling for 401/403 will be handled by the server redirecting back
    // to the main page with parameters, so this block is adjusted.
    setDownloadResult('Attempting to download...'); // Provide immediate feedback
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

        {/* Upload Section (opacity controlled) */}
        <div className={`mb-8 p-4 border border-gray-200 rounded-md transition-opacity duration-300 ${showDownloadPrompt ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
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
            className={`w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4 ${isPrivate ? '' : 'opacity-50'}`}
            required={isPrivate} // Make required based on checkbox
            disabled={!isPrivate} // Disable if not private
          />
          <div className="flex items-center mb-4">
            <input
              type="checkbox"
              id="isPrivate"
              checked={isPrivate}
              onChange={handleIsPrivateChange} // Use custom handler
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
              <p><strong>Short URL:</strong> <a href={uploadResult.shortUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800">{uploadResult.shortUrl}</a></p>
              {uploadResult.isPrivate && <p className="text-orange-700">This file is private. Passcode is required for download.</p>}
              {uploadResult.expiryTimestamp && (
                <p><strong>Expires:</strong> {new Date(uploadResult.expiryTimestamp).toLocaleString()}</p>
              )}
            </div>
          )}
        </div>

        {/* Download Section - Main container for opacity control */}
        <div className={`p-4 border border-gray-200 rounded-md transition-opacity duration-300 
          ${showDownloadPrompt ? 'opacity-100' : 'opacity-50'}`}>
          
          <h2 className="text-2xl font-semibold text-gray-700 mb-4">Download File</h2>
          {promptMessage && <p className="text-red-500 mb-2">{promptMessage}</p>}
          <input
            type="text"
            placeholder="Enter Short URL Slug (e.g., abcde1)"
            value={downloadSlug}
            onChange={(e) => setDownloadSlug(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            disabled={showDownloadPrompt} // Disable if auto-prompt is active
          />
          <input
            type="password"
            placeholder="Passcode (if required)"
            value={downloadPasscode}
            onChange={(e) => setDownloadPasscode(e.target.value)}
            ref={passcodeRef}
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
