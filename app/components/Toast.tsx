'use client';

import React, { useEffect, useRef, useState } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

function Toast({ toast, onDismiss }: ToastProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(toast.id), 3000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [toast.id, onDismiss]);

  const colors: Record<ToastType, string> = {
    success: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
    error: 'border-rose-500/40 bg-rose-500/10 text-rose-400',
    info: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400',
  };

  const icons: Record<ToastType, string> = {
    success: '✓',
    error: '✕',
    info: '◆',
  };

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${colors[toast.type]} animate-toast-in`}>
      <span className="text-sm font-bold">{icons[toast.type]}</span>
      <span className="text-xs font-mono">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="ml-2 text-white/30 hover:text-white/60 transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
        aria-label="Dismiss notification"
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map(t => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (type: ToastType, message: string) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    setToasts(prev => [{ id, type, message }, ...prev.slice(0, 4)]);
  };

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return {
    toasts,
    addToast,
    dismissToast,
    success: (msg: string) => addToast('success', msg),
    error: (msg: string) => addToast('error', msg),
    info: (msg: string) => addToast('info', msg),
  };
}
