/**
 * ToastContext - Global toast notification system
 * Provides success, error, warning, and info toasts throughout the app
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import type {
  ToastType,
  ToastData,
  ToastContextValue,
  ToastContainerProps,
  ToastProps,
} from '../types';

const ToastContext = createContext<ToastContextValue | null>(null);

// Toast types with their icons and CSS classes
const TOAST_CONFIG: Record<ToastType, { icon: string; className: string }> = {
  success: { icon: 'fa-check-circle', className: 'toast-success' },
  error: { icon: 'fa-times-circle', className: 'toast-urgent' },
  warning: { icon: 'fa-exclamation-triangle', className: 'toast-warning' },
  info: { icon: 'fa-info-circle', className: 'toast-info' },
};

const DEFAULT_DURATION = 4000;

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps): React.JSX.Element {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const toastIdRef = useRef<number>(0);

  const removeToast = useCallback((id: number): void => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, type: ToastType = 'info', duration: number = DEFAULT_DURATION): number => {
      const id = ++toastIdRef.current;
      const toast: ToastData = { id, message, type, duration };

      setToasts(prev => [...prev, toast]);

      // Auto-remove after duration
      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }

      return id;
    },
    [removeToast]
  );

  // Convenience methods
  const success = useCallback(
    (message: string, duration?: number): number => addToast(message, 'success', duration),
    [addToast]
  );
  const error = useCallback(
    (message: string, duration?: number): number => addToast(message, 'error', duration),
    [addToast]
  );
  const warning = useCallback(
    (message: string, duration?: number): number => addToast(message, 'warning', duration),
    [addToast]
  );
  const info = useCallback(
    (message: string, duration?: number): number => addToast(message, 'info', duration),
    [addToast]
  );

  const value: ToastContextValue = {
    toasts,
    addToast,
    removeToast,
    success,
    error,
    warning,
    info,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

// Toast container component
function ToastContainer({ toasts, onRemove }: ToastContainerProps): React.JSX.Element | null {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}

// Individual toast component
function Toast({ toast, onRemove }: ToastProps): React.JSX.Element {
  const config = TOAST_CONFIG[toast.type] || TOAST_CONFIG.info;

  return (
    <div className={`toast-notification ${config.className}`}>
      <div className="toast-icon">
        <i className={`fas ${config.icon}`}></i>
      </div>
      <div className="toast-content">
        <p>{toast.message}</p>
      </div>
      <button
        className="toast-close"
        onClick={() => onRemove(toast.id)}
        aria-label="Close notification"
      >
        <i className="fas fa-times"></i>
      </button>
    </div>
  );
}

// Custom hook to use toast
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export default ToastContext;
