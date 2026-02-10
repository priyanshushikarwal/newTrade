
import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';

/**
 * Hook to prevent navigation (back button, refresh) when a modal is open.
 * @param isOpen - Boolean indicating if the modal is currently open.
 */
export const usePreventNavigation = (isOpen: boolean) => {
  const pushedStateRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;

    // Prevent closing/refreshing
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };

    // Prevent going back
    const handlePopState = () => {
      // If modal is open, prevent navigating back by pushing state back
      try {
        window.history.pushState({ modal: true }, document.title);
        pushedStateRef.current = true;
        
        // Show warning
        toast.error('Actions are restricted while the dialog is open.', {
            id: 'nav-locked', // prevent duplicates
            duration: 3000,
            style: {
              background: '#ef4444',
              color: '#fff',
            }
        });
      } catch (err) {
        // ignore
      }
    };

    // Push an entry so Back will trigger popstate which we intercept
    try {
      window.history.pushState({ modal: true }, document.title);
      pushedStateRef.current = true;
    } catch (err) {
      // ignore
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);

      // Try to remove the extra history entry we added when the modal opened
      if (pushedStateRef.current) {
        try {
          window.history.back();
        } catch (err) {
          // ignore
        }
        pushedStateRef.current = false;
      }
    };
  }, [isOpen]);
};
