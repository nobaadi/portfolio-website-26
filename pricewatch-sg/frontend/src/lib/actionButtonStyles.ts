const ACTION_BUTTON_BASE = 'h-10 px-4 rounded-full inline-flex items-center justify-center text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-55';

export const primaryActionButtonClass = `${ACTION_BUTTON_BASE} bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-[0_6px_20px_rgba(99,102,241,0.35)] hover:from-indigo-500 hover:to-violet-500 hover:shadow-[0_10px_28px_rgba(99,102,241,0.45)] active:scale-[0.98]`;

export const secondaryActionButtonClass = `${ACTION_BUTTON_BASE} border border-neutral-200 bg-[#f7f7f8] text-neutral-700 shadow-[0_4px_12px_rgba(15,23,42,0.04)] hover:border-neutral-300 hover:bg-white hover:shadow-[0_8px_18px_rgba(15,23,42,0.08)]`;