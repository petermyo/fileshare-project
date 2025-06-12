// App.jsx - Updated with Ad Screen and Pages Function Redirection
import React, { useState, useRef, useEffect } from 'react';

const API_BASE_PATH = '/api'; // All backend API calls will start with /api
const LOCAL_STORAGE_KEY = 'uploadedFiles'; // Key for local storage

function App() {
    // --- Existing States ---
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

    // --- NEW STATES FOR AD SCREEN ---
    const [showAdScreen, setShowAdScreen] = useState(false);
    const [adScreenDownloadUrl, setAdScreenDownloadUrl] = useState('');
    const [adScreenCountdown, setAdScreenCountdown] = useState(5); // Initial countdown for ad screen


    // --- Existing useEffect: Load files and check URL params ---
    useEffect(() => {
        // Load uploaded files from local storage
        const storedFiles = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (storedFiles) {
            setUploadedFiles(JSON.parse(storedFiles));
        }

        const searchParams = new URLSearchParams(window.location.search);
        const slugFromUrl = searchParams.get('slug');
        const promptDownloadFromUrl = searchParams.get('promptDownload') === 'true';
        const messageFromUrl = searchParams.get('message');
        const errorFromUrl = searchParams.get('error');

        // Check for ad screen redirect from Cloudflare Pages Function
        const showAdFromUrl = searchParams.get('showAd') === 'true';
        const downloadUrlFromAd = searchParams.get('downloadUrl'); // This is the original file.myozarniaung.com URL

        if (showAdFromUrl && downloadUrlFromAd) {
            // If ad screen is requested from URL, set state to show it
            setShowAdScreen(true);
            setAdScreenDownloadUrl(downloadUrlFromAd);
            setAdScreenCountdown(5); // Reset countdown every time
            // Clean URL params to prevent re-showing ad screen on refresh
            const cleanUrl = new URL(window.location.href);
            cleanUrl.searchParams.delete('showAd');
            cleanUrl.searchParams.delete('downloadUrl');
            window.history.replaceState({}, document.title, cleanUrl.toString());
        } else if (errorFromUrl) {
            // Existing error handling
            setErrorMessage(decodeURIComponent(errorFromUrl));
            window.history.replaceState({}, document.title, window.location.pathname);
        } else if (slugFromUrl && promptDownloadFromUrl) {
            // Existing download prompt logic
            setDownloadSlug(slugFromUrl);
            setPromptMessage(decodeURIComponent(messageFromUrl || ''));
            setShowDownloadPrompt(true);
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, []); // Run only once on component mount


    // --- NEW useEffect for Ad Screen Countdown ---
    useEffect(() => {
        let timer;
        if (showAdScreen && adScreenCountdown > 0) {
            timer = setInterval(() => {
                setAdScreenCountdown(prevCount => prevCount - 1);
            }, 1000);
        } else if (showAdScreen && adScreenCountdown === 0) {
            // Countdown finished, redirect to actual download URL with 'ad=seen' flag
            if (adScreenDownloadUrl) {
                // Append 'ad=seen' to the original download URL
                const finalDownloadUrl = new URL(adScreenDownloadUrl);
                finalDownloadUrl.searchParams.set('ad', 'seen');
                window.location.href = finalDownloadUrl.toString();
            } else {
                // Fallback if download URL is missing (should not happen if Pages Function works)
                console.error("Ad screen: Final download URL is missing!");
                setShowAdScreen(false); // Go back to main app
            }
        }
        // Cleanup timer on component unmount or if ad screen is hidden
        return () => clearInterval(timer);
    }, [showAdScreen, adScreenCountdown, adScreenDownloadUrl]);


    // --- Existing useEffect: Focus passcode input ---
    useEffect(() => {
        if (showDownloadPrompt && passcodeRef.current) {
            passcodeRef.current.focus();
        }
    }, [showDownloadPrompt]);


    // --- Existing Handlers ---
    const handleFileChange = (event) => {
        setSelectedFile(event.target.files[0]);
        setErrorMessage('');
    };

    const handleIsPrivateChange = (event) => {
        const checked = event.target.checked;
        setIsPrivate(checked);
        if (!checked) {
            setPasscode('');
        }
    };

    const handleUpload = async () => {
        setUploadResult(null);
        setErrorMessage('');
        setUploadProgress(0);
        setIsUploading(true);

        if (!selectedFile) {
            setErrorMessage('Please select a file to upload.');
            setIsUploading(false);
            return;
        }

        if (isPrivate && !passcode) {
            setErrorMessage('Passcode is required for private files.');
            setIsUploading(false);
            return;
        }

        const formData = new FormData();
        formData.append('file', selectedFile);
        if (isPrivate && passcode) {
            formData.append('passcode', passcode);
        }
        formData.append('isPrivate', isPrivate.toString());
        if (expiryDays) {
            formData.append('expiryDays', expiryDays);
        }

        try {
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
                            fileId: data.shortUrlSlug,
                            fileName: data.originalFilename,
                            // *** IMPORTANT: The downloadUrl should be the actual file.myozarniaung.com URL ***
                            downloadUrl: `https://file.myozarniaung.com/s/${data.shortUrlSlug}`,
                            uploadedDate: new Date().toLocaleString(),
                            isPrivate: data.isPrivate,
                            expiryTimestamp: data.expiryTimestamp,
                        };
                        setUploadResult(newUpload);
                        setDownloadSlug(data.shortUrlSlug);
                        setUploadProgress(100);

                        setUploadedFiles(prevFiles => {
                            const updated = [...prevFiles, newUpload];
                            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
                            return updated;
                        });

                    } else {
                        setErrorMessage(data.error || 'Upload failed. Please check the console for details.');
                        setUploadProgress(0);
                    }
                } else {
                    try {
                        const errorData = JSON.parse(xhr.responseText);
                        setErrorMessage(errorData.error || `Upload failed: HTTP ${xhr.status}`);
                    } catch (e) {
                        setErrorMessage(`Upload failed: HTTP ${xhr.status}`);
                    }
                    setUploadProgress(0);
                }
            };

            xhr.onerror = () => {
                setIsUploading(false);
                setErrorMessage('An unexpected network error occurred during upload.');
                setUploadProgress(0);
            };

            xhr.send(formData);

        } catch (error) {
            console.error('Upload error:', error);
            setErrorMessage('An unexpected error occurred during upload.');
            setUploadProgress(0);
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

        // *** IMPORTANT: The download link now points directly to the original file.myozarniaung.com URL ***
        // The s/[[slug]].ts Pages Function will handle the ad redirection.
        let originalDownloadUrl = `https://file.myozarniaung.com/s/${downloadSlug}`;
        if (downloadPasscode) {
            // If the passcode is entered in the form, append it here
            // The s/[[slug]].ts function will check this on the second pass
            originalDownloadUrl += `?passcode=${encodeURIComponent(downloadPasscode)}`;
        }

        window.location.href = originalDownloadUrl; // Redirect to the original URL
        setDownloadResult('Redirecting for download...');
    };

    // --- CONDITIONAL RENDERING OF AD SCREEN OR MAIN APP ---
    if (showAdScreen) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 flex flex-col items-center justify-center p-4">
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet" />

                <style>{`
                    body {
                        font-family: 'Inter', sans-serif;
                    }
                `}</style>

                {/* Ad Screen UI */}
                <div className="flex flex-col items-center justify-center min-h-[80vh] text-center">
                    <h2 className="text-3xl font-bold text-gray-800 mb-4">Your file is almost ready!</h2>
                    <p className="text-xl text-gray-700 mb-8">
                        Please wait {adScreenCountdown} seconds while we prepare your download.
                    </p>

                    {/* Ad Container (350x350) */}
                    <div className="w-[350px] h-[350px] bg-white border border-gray-300 rounded-lg shadow-xl flex items-center justify-center overflow-hidden mb-8">
                        {/* Replace with your actual ad image or ad network code */}
                        <img
                            src="https://via.placeholder.com/350x350?text=Your+Ad+Here"
                            alt="Advertisement"
                            className="max-w-full max-h-full object-contain rounded-lg"
                        />
                    </div>
                    <p className="text-gray-600 text-sm">
                        Thank you for supporting our service.
                    </p>
                </div>
            </div>
        );
    }

    // --- Main App UI (Existing content) ---
    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 flex flex-col items-center justify-center p-4">
            <script src="https://cdn.tailwindcss.com"></script>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet" />

            <style>{`
                body {
                    font-family: 'Inter', sans-serif;
                }
            `}</style>

            {/* Top Center Home Link (as a button) */}
            <div className="w-full max-w-4xl text-center mb-6">
                <a
                    href="https://www.myozarniaung.com/the-office"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block bg-blue-600 text-white py-2 px-6 rounded-full shadow-lg hover:bg-blue-700 transition duration-300 ease-in-out transform hover:scale-105"
                >
                    Home
                </a>
            </div>

            <div className="flex flex-col md:flex-row gap-8 w-full max-w-4xl">
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
                            disabled={isUploading}
                        />
                        <input
                            type="password"
                            placeholder="Optional: Passcode for private files"
                            value={passcode}
                            onChange={(e) => setPasscode(e.target.value)}
                            className={`w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4 ${isPrivate ? '' : 'opacity-50'}`}
                            required={isPrivate}
                            disabled={!isPrivate || isUploading}
                        />
                        <div className="flex items-center mb-4">
                            <input
                                type="checkbox"
                                id="isPrivate"
                                checked={isPrivate}
                                onChange={handleIsPrivateChange}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                disabled={isUploading}
                            />
                            <label htmlFor="isPrivate" className="ml-2 text-gray-700">Make file private (requires passcode)</label>
                        </div>
                        <input
                            type="number"
                            placeholder="Optional: Expire in days (e.g., 7)"
                            value={expiryDays}
                            onChange={(e) => setExpiryDays(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
                            disabled={isUploading}
                        />
                        <button
                            onClick={handleUpload}
                            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition duration-300 ease-in-out shadow-md"
                            disabled={isUploading}
                        >
                            {isUploading ? 'Uploading...' : 'Upload File'}
                        </button>

                        {/* Upload Progress Bar */}
                        {isUploading && (
                            <div className="w-full bg-gray-200 rounded-full h-2.5 mt-4 mb-4">
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
                                {/* Display URL is the actual file.myozarniaung.com URL */}
                                <p><strong>Short URL:</strong> <a href={uploadResult.downloadUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800">{uploadResult.downloadUrl}</a></p>
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
                            disabled={showDownloadPrompt}
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
                                        <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">Download Link</th>
                                        <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider rounded-tr-md">Upload Date</th>
                                        <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider rounded-tl-md">File Name</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {uploadedFiles.map((file, index) => (
                                        <tr key={index} className="hover:bg-gray-50">
                                            <td className="py-3 px-4 text-sm">
                                                {/* Link points directly to the original file.myozarniaung.com URL */}
                                                <a
                                                    href={file.downloadUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-600 hover:text-blue-800 underline break-all"
                                                >
                                                    {file.fileName} {/* Show full file name for clarity */}
                                                </a>
                                            </td>
                                            <td className="py-3 px-4 text-sm text-gray-800">{file.uploadedDate}</td>
                                            <td className="py-3 px-4 text-sm text-gray-800 truncate overflow-hidden whitespace-nowrap max-w-xs">{file.fileName}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer with Copyright */}
            <footer className="w-full max-w-4xl text-center mt-8 text-gray-600 text-sm">
                &copy; {new Date().getFullYear()} Myo ZarNi Aung
            </footer>
        </div>
    );
}

export default App;
