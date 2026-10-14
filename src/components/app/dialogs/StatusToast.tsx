import React from 'react';
import { AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import type { AppDialogsModel } from './buildAppDialogsModel';
import { usePlayerOverlayObstacle } from '../../../hooks/usePlayerOverlayLayout';
import { useGlass } from '@/shinoinject/useGlass';

// src/components/app/dialogs/StatusToast.tsx
// Each keyed toast retains its own obstacle until AnimatePresence finishes its exit.

const StatusToast: React.FC<{ statusToast: NonNullable<AppDialogsModel['statusToast']> }> = ({ statusToast }) => {
    const { ref: toastLayoutRef, invalidate: invalidateLayout } = usePlayerOverlayObstacle('status-toast', 'notification');
    useGlass();
    return (
        <motion.div
            data-glass
            ref={toastLayoutRef}
            onUpdate={invalidateLayout}
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 30, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            style={{
                backgroundColor: statusToast.isDaylight ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
                borderTop: statusToast.isDaylight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.12)',
                borderBottom: statusToast.isDaylight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.12)',
                outline: '1px solid rgba(40,40,40,0.2)',
                boxShadow: '2px 2px 8px 2px rgba(40,40,40,0.4)',
            }}
            className={`fixed top-0 left-1/2 z-[210] px-6 py-3 rounded-full font-medium text-sm shadow-xl flex items-center gap-3 ${statusToast.onAction || statusToast.onCancel ? 'pointer-events-auto' : 'pointer-events-none'} ${statusToast.isDaylight ? 'bg-white/70 text-zinc-800 border border-black/5' : 'bg-white/10 text-white'}`}
        >
            {statusToast.type === 'error'
                ? <AlertCircle size={18} className={statusToast.isDaylight ? 'text-red-500' : 'text-red-400'} />
                : statusToast.type === 'success'
                    ? <CheckCircle2 size={18} className={statusToast.isDaylight ? 'text-green-600' : 'text-green-400'} />
                    : <Sparkles size={18} className={statusToast.isDaylight ? 'text-blue-600' : 'text-blue-400'} />}
            <span>{statusToast.text}</span>
            {statusToast.onCancel && statusToast.cancelLabel && (
                <button
                    type="button"
                    onClick={statusToast.onCancel}
                    className={`px-2.5 py-1 rounded-full text-xs transition-colors ${statusToast.isDaylight ? 'text-zinc-500 hover:bg-black/5 hover:text-zinc-800' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                >
                    {statusToast.cancelLabel}
                </button>
            )}
            {statusToast.onAction && statusToast.actionLabel && (
                <button
                    type="button"
                    onClick={statusToast.onAction}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 ${statusToast.isDaylight ? 'bg-zinc-900 text-white hover:bg-zinc-700' : 'bg-white text-zinc-950 hover:bg-white/85'}`}
                >
                    {statusToast.actionIcon && <statusToast.actionIcon size={14} className={statusToast.isDaylight ? 'text-amber-300' : 'text-amber-500'} />}
                    {statusToast.actionLabel}
                </button>
            )}
        </motion.div>
    );
};
export default StatusToast;
