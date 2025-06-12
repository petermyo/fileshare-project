// src/components/AdScreen.js
import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom'; // Assuming React Router v6
import useCountdown from '../hooks/useCountdown'; // Import the custom hook

const AdScreen = () => {
    const navigate = useNavigate();
    const location = useLocation(); // To get query parameters

    // Extract the actual download URL from query parameters
    const downloadUrl = new URLSearchParams(location.search).get('downloadUrl');

    // Callback for when the countdown finishes
    const handleCountdownComplete = () => {
        if (downloadUrl) {
            window.location.href = downloadUrl; // Redirect to the actual file
        } else {
            // Fallback: If downloadUrl is missing, redirect to home or an error page
            console.error("Download URL missing from AdScreen parameters.");
            navigate('/');
        }
    };

    // Use the custom countdown hook
    const { countdown } = useCountdown(5, handleCountdownComplete); // 5 seconds wait

    // Immediate check and redirect if downloadUrl is not present
    useEffect(() => {
        if (!downloadUrl) {
            console.warn("No downloadUrl found in AdScreen. Redirecting to home.");
            navigate('/');
        }
    }, [downloadUrl, navigate]); // This effect runs once on mount, or if downloadUrl/navigate changes

    // Optional: Render a loading/redirecting message if downloadUrl is not yet available
    if (!downloadUrl) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '100vh',
                backgroundColor: '#f0f0f0'
            }}>
                <p>Preparing download, please wait...</p>
            </div>
        );
    }

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
            backgroundColor: '#f0f0f0',
            fontFamily: 'Arial, sans-serif',
            textAlign: 'center',
            padding: '20px'
        }}>
            <h2 style={{ color: '#333', marginBottom: '10px' }}>Your file is almost ready!</h2>
            <p style={{ color: '#555', marginBottom: '30px', fontSize: '1.1em' }}>
                Please wait {countdown} seconds while we prepare your download.
            </p>

            {/* Ad Container */}
            <div style={{
                width: '350px',
                height: '350px',
                backgroundColor: '#fff',
                border: '1px solid #ddd',
                borderRadius: '8px',
                boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                overflow: 'hidden', // Ensure ad content fits
                marginBottom: '30px'
            }}>
                {/*
                    Place your ad code here.
                    This could be an <img> tag, an <iframe>, or a script from an ad network.
                    Remember to replace the placeholder image.
                */}
                <img
                    src="https://via.placeholder.com/350x350?text=Your+Ad+Here" // !! REPLACE THIS WITH YOUR ACTUAL AD IMAGE/CONTENT URL !!
                    alt="Advertisement"
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                />
                {/* If using an ad network script, uncomment and place it here.
                    Make sure to wrap it in a div or use a component that inserts raw HTML.
                    For Google AdSense, you usually put the script tags in public/index.html or use a library.
                    For a simple ad block:
                <div id="your-ad-slot" style={{ width: '350px', height: '350px' }}>
                    // Ad network specific JS will populate this div
                </div>
                <script type="text/javascript" src="https://your-ad-network.com/ad-script.js"></script>
                <script type="text/javascript">
                    // Any initialization code for your ad network
                </script>
                */}
            </div>
            <p style={{ color: '#777', fontSize: '0.9em' }}>
                Thank you for supporting our service.
            </p>
        </div>
    );
};

export default AdScreen;
