import { BrandedClerkProvider } from './lib/clerkBranding';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

document.documentElement.classList.remove('light');
document.documentElement.classList.add('dark');

// Each deploy renames the lazy-loaded files, so a tab opened before a deploy asks for files that no
// longer exist (e.g. opening Admin). Reload once to pick up the new version instead of showing an
// error - but not again within a minute, so a genuinely missing file can't cause a reload loop.
window.addEventListener('vite:preloadError', (event) => {
  const key = 'peppal-reloaded-for-new-version';
  try {
    const last = Number(sessionStorage.getItem(key) || 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    return; // no storage to guard against a loop, so leave it to the error screen
  }
  event.preventDefault();
  window.location.reload();
});

const clerkAppearance = {
  variables: {
    colorPrimary: '#c2911f',
    colorBackground: '#18181b',
    colorInputBackground: '#09090b',
    colorInputText: '#e2e8f0',
    colorText: '#e2e8f0',
    colorTextSecondary: '#a1a1aa',
    colorNeutral: '#3f3f46',
    colorDanger: '#f87171',
    borderRadius: '0.9rem',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  },
  elements: {
    // No logo in the sign-in/register windows: the page behind already shows the right one (PepBiz or the shop's).
    // A style object, because Clerk's own styles override Tailwind classes here.
    logoBox: { display: 'none' },
    modalBackdrop: 'bg-zinc-950/80 backdrop-blur-sm',
    modalContent: 'bg-transparent shadow-none border-0 p-4 sm:p-6 min-h-[100dvh] flex items-center justify-center',
    cardBox: 'w-[min(92vw,28rem)] max-h-[88dvh] overflow-y-auto bg-transparent shadow-none my-auto',
    card: 'rounded-[1.6rem] border border-zinc-800 bg-zinc-900/95 text-zinc-100 shadow-2xl',
    headerTitle: 'text-white text-xl sm:text-2xl font-black tracking-tight',
    headerSubtitle: 'text-zinc-400',
    formFieldLabel: 'text-zinc-300 font-semibold',
    formFieldInput: 'bg-zinc-950 border border-zinc-800 text-zinc-100 rounded-xl focus:border-gold-500',
    formButtonPrimary: 'bg-gold-500/15 border border-gold-400/70 text-gold-300 hover:bg-gold-500/20 hover:border-gold-300 rounded-xl font-bold',
    footerActionText: 'text-zinc-400',
    footerActionLink: 'text-gold-400 hover:text-gold-300',
    dividerLine: 'bg-zinc-800',
    dividerText: 'text-zinc-500',
    socialButtonsBlockButton: 'bg-zinc-950 border border-zinc-800 text-zinc-200 hover:bg-zinc-900 rounded-xl',
    formResendCodeLink: 'text-gold-400 hover:text-gold-300',
    identityPreviewText: 'text-zinc-300',
    identityPreviewEditButton: 'text-gold-400 hover:text-gold-300',
    alertText: 'text-amber-300',
    alert: 'border border-amber-800/40 bg-amber-950/20 rounded-xl',
  },
} as const;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrandedClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY} appearance={clerkAppearance}>
      <App />
    </BrandedClerkProvider>
  </StrictMode>,
);