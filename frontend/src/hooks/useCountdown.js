// src/hooks/useCountdown.js
import { useState, useEffect } from 'react';

const useCountdown = (initialSeconds, onComplete) => {
    const [countdown, setCountdown] = useState(initialSeconds);
    const [isActive, setIsActive] = useState(true);

    useEffect(() => {
        if (!isActive || countdown <= 0) {
            if (countdown <= 0 && onComplete) {
                onComplete();
            }
            return;
        }

        const timer = setInterval(() => {
            setCountdown((prev) => prev - 1);
        }, 1000);

        return () => clearInterval(timer);
    }, [countdown, isActive, onComplete]); // Ensure all dependencies are here

    const reset = () => {
        setCountdown(initialSeconds);
        setIsActive(true);
    };

    const stop = () => setIsActive(false);

    return { countdown, reset, stop };
};

export default useCountdown;
