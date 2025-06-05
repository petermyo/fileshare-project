import React, { useState, useRef, useEffect } from 'react';

const API_BASE_PATH = '/api'; // All backend API calls will start with /api
const LOCAL_STORAGE_KEY = 'uploadedFiles'; // Key for local storage

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [passcode, setPasscode] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [expiryDays, setExpiryDays] = useState('');
  const [uploadResult, setUploadResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  // State for download section
  const [downloadSlug, setDownloadSlug] = useState('');
  const [downloadPasscode, setDownloadPasscode] = useState('');
  const [downloadResult, setDownloadResult] = useState('');
  const [showDownloadPrompt, setShowDownloadPrompt] = useState(false);
  const [promptMessage, setPromptMessage] = useState('');

  // New state for uploaded file list
  const [uploadedFiles, setUploadedFiles] = useState([]);

  const passcodeRef = useRef(null); // Ref to focus the passcode input

  // Load uploaded files from local storage on component mount
  useEffect(() => {
    const storedFiles = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (storedFiles) {
      setUploadedFiles(JSON.parse(storedFiles));
    }

    const searchParams = new URLSearchParams(window.location.search);
    const slugFromUrl = searchParams.get('slug');
    const promptDownloadFromUrl = searchParams.get('promptDownload') === 'true';
    const messageFromUrl = searchParams.get('message');
    const errorFromUrl = searchParams.get('error');

    if (errorFromUrl) {
      setErrorMessage(decodeURIComponent(errorFromUrl));
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (slugFromUrl && promptDownloadFromUrl) {
      setDownloadSlug(slugFromUrl);
      setPromptMessage(decodeURIComponent(messageFromUrl || ''));
      setShowDownloadPrompt(true);
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
    setUploadProgress(0); // Reset progress
    setIsUploading(true); // Indicate upload started

    if (!selectedFile) {
      setErrorMessage('Please select a file to upload.');
      setIsUploading(false);
      return;
    }

    // Passcode validation on upload
    if (isPrivate && !passcode) {
      setErrorMessage('Passcode is required for private files.');
      setIsUploading(false);
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
      // Using XMLHttpRequest for better progress tracking
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE_PATH}/upload`, true);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentCompleted = Math.round((event.loaded * 100) / event.total);
          setUploadProgress(percentCompleted);
        }
      };

      xhr.onload = () => {
        setIsUploading(false);
        if (xhr.status >= 200 && xhr.status < 300) {
          const data = JSON.parse(xhr.responseText);
          if (data.success) {
            const newUpload = {
              fileId: data.shortUrlSlug, // Using slug as ID for list
              fileName: data.originalFilename,
              downloadUrl: `${window.location.origin}/s/${data.shortUrlSlug}`,
              uploadedDate: new Date().toLocaleString(),
            };
            setUploadResult(newUpload);
            setDownloadSlug(data.shortUrlSlug);
            setUploadProgress(100); // Ensure it shows 100% on success

            // Update local storage and state with the new file
            const updatedFiles = [...uploadedFiles, newUpload];
            setUploadedFiles(updatedFiles);
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedFiles));

          } else {
            setErrorMessage(data.error || 'Upload failed. Please check the console for details.');
            setUploadProgress(0); // Reset on error
          }
        } else {
          try {
            const errorData = JSON.parse(xhr.responseText);
            setErrorMessage(errorData.error || `Upload failed: HTTP ${xhr.status}`);
          } catch (e) {
            setErrorMessage(`Upload failed: HTTP ${xhr.status}`);
          }
          setUploadProgress(0); // Reset on error
        }
      };

      xhr.onerror = () => {
        setIsUploading(false);
        setErrorMessage('An unexpected network error occurred during upload.');
        setUploadProgress(0); // Reset on error
      };

      xhr.send(formData);

    } catch (error) {
      console.error('Upload error:', error);
      setErrorMessage('An unexpected error occurred during upload.');
      setUploadProgress(0); // Reset on error
      setIsUploading(false);
    }
  };

  const handleDownload = async () => {
    setDownloadResult('');
    setErrorMessage('');
    if (!downloadSlug) {
      setErrorMessage('Please enter a short URL slug for download.');
      return;
    }

    let downloadUrl = `${window.location.origin}/s/${downloadSlug}`;
    if (downloadPasscode) {
      downloadUrl += `?passcode=${downloadPasscode}`;
    }

    window.location.href = downloadUrl;
    setDownloadResult('Attempting to download...');
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

      <div className="flex flex-col md:flex-row gap-8 w-full max-w-4xl"> {/* Flex container for two columns */}
        {/* Left Column: Upload and Download Sections */}
        <div className="flex-1 bg-white p-8 rounded-lg shadow-xl min-w-[320px]">
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
              disabled={isUploading} // Disable during upload
            />
            <input
              type="password"
              placeholder="Optional: Passcode for private files"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              className={`w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4 ${isPrivate ? '' : 'opacity-50'}`}
              required={isPrivate} // Make required based on checkbox
              disabled={!isPrivate || isUploading} // Disable if not private or during upload
            />
            <div className="flex items-center mb-4">
              <input
                type="checkbox"
                id="isPrivate"
                checked={isPrivate}
                onChange={handleIsPrivateChange} // Use custom handler
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                disabled={isUploading} // Disable during upload
              />
              <label htmlFor="isPrivate" className="ml-2 text-gray-700">Make file private (requires passcode)</label>
            </div>
            <input
              type="number"
              placeholder="Optional: Expire in days (e.g., 7)"
              value={expiryDays}
              onChange={(e) => setExpiryDays(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
              disabled={isUploading} // Disable during upload
            />
            <button
              onClick={handleUpload}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition duration-300 ease-in-out shadow-md"
              disabled={isUploading} // Disable button during upload
            >
              {isUploading ? 'Uploading...' : 'Upload File'}
            </button>

            {/* Upload Progress Bar */}
            {isUploading && (
              <div className="w-full bg-gray-200 rounded-full h-2.5 mt-4">
                <div
                  className="bg-blue-600 h-2.5 rounded-full"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
                <p className="text-sm text-gray-600 mt-1">{uploadProgress}%</p>
              </div>
            )}

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

        {/* Right Column: Uploaded File List */}
        <div className="flex-1 bg-white p-8 rounded-lg shadow-xl min-w-[320px]">
          <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">Your Uploaded Files</h2>
          {uploadedFiles.length === 0 ? (
            <p className="text-gray-500 text-center">No files uploaded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white rounded-md overflow-hidden">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider rounded-tl-md">File Name</th>
                    <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">Download Link</th>
                    <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider rounded-tr-md">Upload Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {uploadedFiles.map((file, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="py-3 px-4 text-sm text-gray-800">{file.fileName}</td>
                      <td className="py-3 px-4 text-sm">
                        <a 
                          href={file.downloadUrl} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-blue-600 hover:text-blue-800 underline break-all"
                        >
                          {file.downloadUrl.split('/').pop()} {/* Show just the slug for brevity */}
                        </a>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-800">{file.uploadedDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
