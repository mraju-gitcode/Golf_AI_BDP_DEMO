import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import type { ToastMessage } from '../types/golfpm';

interface ToastStackProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-md w-[calc(100vw-2.5rem)] sm:w-auto pointer-events-none"
    >
      {toasts.map((toast) => {
        const isError = toast.variant === 'error';
        return (
          <div
            key={toast.id}
            role={isError ? 'alert' : 'status'}
            className={`pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-[10px] shadow-lg text-white text-sm font-medium border ${
              isError
                ? 'bg-[#B42318] border-[#912018]'
                : 'bg-[#004A2D] border-[#006A40]'
            }`}
          >
            {isError ? (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#FECACA]" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#6EE09F]" />
            )}
            <span className="flex-1 leading-snug">{toast.message}</span>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="p-0.5 rounded hover:bg-white/15 transition-colors shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
