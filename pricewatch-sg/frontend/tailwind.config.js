/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      keyframes: {
        fadeIn:   { from: { opacity: '0' },                                      to: { opacity: '1' } },
        slideUp:  { from: { opacity: '0', transform: 'translateY(14px)' },       to: { opacity: '1', transform: 'translateY(0)' } },
        scaleIn:  { from: { opacity: '0', transform: 'scale(0.97)' },            to: { opacity: '1', transform: 'scale(1)' } },
        float:    { '0%, 100%': { transform: 'translateY(0)' },                  '50%': { transform: 'translateY(-9px)' } },
        pulseGlow:{ '0%, 100%': { boxShadow: '0 0 0 0 rgba(99,102,241,0)' },    '50%': { boxShadow: '0 0 22px 6px rgba(99,102,241,0.10)' } },
        popIn:    { '0%': { opacity: '0', transform: 'scale(0.82)' },            '65%': { transform: 'scale(1.06)' },  '100%': { opacity: '1', transform: 'scale(1)' } },
        shimmer:  { '0%': { backgroundPosition: '-200% 0' },                    '100%': { backgroundPosition: '200% 0' } },
        marquee:  { '0%': { transform: 'translateX(0)' },                       '100%': { transform: 'translateX(-50%)' } },
      },
      animation: {
        'fade-in':    'fadeIn   0.4s ease both',
        'slide-up':   'slideUp  0.35s ease both',
        'scale-in':   'scaleIn  0.3s ease both',
        'float':      'float    4s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 2.5s ease-in-out infinite',
        'pop-in':     'popIn    0.45s cubic-bezier(0.34,1.56,0.64,1) both',
        'shimmer':    'shimmer  2.5s linear infinite',
        'marquee':    'marquee  16s linear infinite',
      },
      fontFamily: {
        sans:    ['Inter', 'sans-serif'],
        serif:   ['Bodoni Moda', 'Georgia', 'serif'],
        display: ['Inter', 'sans-serif'],
        mono:    ['DM Mono', 'monospace'],
      },
      letterSpacing: {
        'display': '-0.02em',
      },
    },
  },
  plugins: [],
};
