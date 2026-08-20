import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';

/**
 * ScrollToTop is a component that scrolls the window to the top
 * whenever the location (route) changes. It should be placed high
 * in the component tree, typically right inside your router.
 * 
 * This enhanced version also handles history navigation (back/forward)
 * to ensure consistent behavior.
 */
export function ScrollToTop() {
  const [location] = useLocation();
  const prevLocationRef = useRef<string | null>(null);
  
  // Scroll to top when the location changes
  useEffect(() => {
    // Check if this is a new navigation (not just a component re-render)
    if (prevLocationRef.current !== location) {
      // Save the current location for future reference
      prevLocationRef.current = location;
      
      // Use a short delay to ensure DOM updates have completed
      // This helps with more complex page transitions
      setTimeout(() => {
        // Scroll to top with smooth behavior
        window.scrollTo({
          top: 0,
          left: 0,
          behavior: 'smooth'
        });
      }, 0);
    }
  }, [location]);
  
  // Also handle the popstate event for browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      // After navigation, scroll to top
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: 'smooth'
      });
    };
    
    // Listen for navigation events
    window.addEventListener('popstate', handlePopState);
    
    return () => {
      // Clean up listener on unmount
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // This component doesn't render anything
  return null;
}