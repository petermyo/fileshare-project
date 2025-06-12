// src/components/AdScreen.js
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom'; // Assuming React Router v6

const AdScreen = () => {
    const [countdown, setCountdown] = useState(5);
    const navigate = useNavigate();
    const location = useLocation(); // To get query parameters

    // Extract the actual download URL from query parameters
    const downloadUrl = new URLSearchParams(location.search).get('downloadUrl');

    useEffect(() => {
        if (!downloadUrl) {
            // Handle case where downloadUrl is missing, maybe redirect to home or an error page
            navigate('/');
            return;
        }

        const timer = setInterval(() => {
            setCountdown((prevCountdown) => {
                if (prevCountdown <= 1) {
                    clearInterval(timer);
                    // Redirect to the actual download URL after 5 seconds
                    window.location.href = downloadUrl; // Use window.location.href for external redirects
                    return 0;
                }
                return prevCountdown - 1;
            });
        }, 1000);

        // Cleanup the timer if the component unmounts
        return () => clearInterval(timer);
    }, [downloadUrl, navigate]); // Re-run effect if downloadUrl or navigate changes

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
            backgroundColor: '#f0f0f0',
            fontFamily: 'Arial, sans-serif'
        }}>
            <h2 style={{ color: '#333' }}>Your file is almost ready!</h2>
            <p style={{ color: '#555', marginBottom: '20px' }}>
                Please wait {countdown} seconds while we prepare your download.
            </p>

            {/* Ad Container */}
            <div style={{
                width: '350px',
                height: '350px',
                backgroundColor: '#fff',
                border: '1px solid #ddd',
                borderRadius: '8px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                overflow: 'hidden', // Ensure ad content fits
                marginBottom: '20px'
            }}>
                {/*
                    Place your ad code here.
                    This could be an <img> tag, an <iframe>, or a script from an ad network.
                */}
                <img
                    src="https://via.placeholder.com/350x350?text=Your+Ad+Here" // Replace with your actual ad image
                    alt="Advertisement"
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                />
                {/* Example of how you might embed an ad network script (consult your ad network for exact code) */}
                {/*
                <div id="your-ad-slot-id"></div>
                <script type="text/javascript">
                    // Your ad network's script to load an ad into the div
                    // e.g., google_ad_client = "ca-pub-XXXXXXXXXXXXXX";
                    // google_ad_slot = "YYYYYYYYYY";
                    // google_ad_width = 350;
                    // google_ad_height = 350;
                    // (adsbygoogle = window.adsbygoogle || []).push({});
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
