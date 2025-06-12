// functions/download-proxy.js
// This Cloudflare Pages Function intercepts requests to initiate a download.
// It redirects the user to the React app's Ad Screen,
// passing the original download URL as a query parameter.

export async function onRequestGet({ request }) {
    const url = new URL(request.url);

    // Get the original download URL from the 'url' query parameter.
    // Example: https://your-frontend.com/download-proxy?url=https://file.myozarniaung.com/s/sbfxSjKD
    const originalDownloadUrl = url.searchParams.get('url');

    // Basic validation: Ensure the original download URL is provided.
    if (!originalDownloadUrl) {
        // If the URL is missing, redirect back to the home page or an error page.
        // Or you could return a 400 Bad Request response.
        return Response.redirect(`${url.origin}/?error=${encodeURIComponent('Download link is incomplete.')}`, 302);
    }

    // Construct the URL to your React app's Ad Screen.
    // This points to the main App.jsx (your application's root),
    // but with specific query parameters to tell it to show the ad.
    const adScreenRedirectUrl = new URL(url.origin); // Start with your app's base URL
    adScreenRedirectUrl.searchParams.set('showAd', 'true'); // Flag to show the ad screen
    adScreenRedirectUrl.searchParams.set('downloadUrl', originalDownloadUrl); // Pass the original download URL

    // Redirect the user's browser to the constructed Ad Screen URL.
    // A 302 (Found) or 307 (Temporary Redirect) is suitable for this temporary redirection.
    return Response.redirect(adScreenRedirectUrl.toString(), 302);
}
