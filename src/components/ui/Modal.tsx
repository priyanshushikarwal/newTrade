import React, { useEffect, useState, useRef } from 'react';
import { HiX } from 'react-icons/hi';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showCloseButton = true,
  closeOnOverlayClick = true,
}) => {
  const [navWarning, setNavWarning] = useState(false);
  const navWarningTimerRef = useRef<number | null>(null);
  const pushedStateRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);
  
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent refresh / back navigation while modal is open and show a short warning
  useEffect(() => {
    if (!isOpen) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Modern browsers will show a generic message; setting returnValue triggers the confirmation
      e.preventDefault();
      e.returnValue = '';
      return '';
    };

    const handlePopState = (e: PopStateEvent) => {
      // If modal is open, prevent navigating back by pushing state back and showing a warning
      try {
        window.history.pushState({ modal: true }, document.title);
        pushedStateRef.current = true;
      } catch (err) {
        // ignore
      }

      setNavWarning(true);
      if (navWarningTimerRef.current) {
        clearTimeout(navWarningTimerRef.current);
      }
      navWarningTimerRef.current = window.setTimeout(() => setNavWarning(false), 3000);
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
      if (navWarningTimerRef.current) {
        clearTimeout(navWarningTimerRef.current);
        navWarningTimerRef.current = null;
      }

      // Try to remove the extra history entry we added when the modal opened
      if (pushedStateRef.current) {
        try {
          // Go back one step to remove the pushed state without navigating away if possible
          window.history.back();
        } catch (err) {
          // ignore
        }
        pushedStateRef.current = false;
      }
    };
  }, [isOpen]);
  
  if (!isOpen) return null;
  
  const sizeStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    full: 'max-w-4xl',
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={closeOnOverlayClick ? onClose : undefined}
      />
      
      {/* Modal */}
      <div
        className={`
          relative w-full ${sizeStyles[size]}
          bg-[#1A2332] rounded-2xl shadow-2xl
          border border-white/10
          transform transition-all duration-300
          animate-in fade-in zoom-in-95
          max-h-[90vh] overflow-hidden flex flex-col
        `}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between p-4 md:p-5 border-b border-white/10">
            <div className="flex-1">
              {title && (
                <h3 className="text-lg font-semibold text-white">{title}</h3>
              )}
            </div>
            {showCloseButton && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <HiX className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Warning about back/refresh - visible while modal is open or when user attempts navigation */}
        <div className="p-3 md:p-4 border-b border-white/6 bg-yellow-900/10">
          <p className="text-sm text-yellow-300/90">
            ⚠️ <span className="font-medium">Please do not press Back or Refresh.</span> &nbsp; <span className="text-xs text-yellow-200">कृपया बैक या रिफ्रेश न दबाएं।</span>
          </p>
        </div>

        {/* Content */}
        <div className="p-4 md:p-5 overflow-y-auto">
          {children}
        </div>

        {/* Inline non-intrusive nav warning (appears when user tries to navigate back) */}
        {navWarning && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-yellow-700 text-black px-4 py-2 rounded-lg text-sm shadow-lg" role="status" aria-live="polite">
            कृपया बैक या रिफ्रेश न दबाएं — Please do not press Back or Refresh
          </div>
        )}
      </div>
    </div>
  );
};

export default Modal;
