import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'next-themes';
import { AdminDashboard } from '../components/admin/AdminDashboard';
import { Toaster } from '../components/ui/sonner';
import 'sonner/dist/styles.css';
import '../styles/globals.css';

// Minimal global declarations to satisfy typecheck in a Workers-focused tsconfig
declare const window: any;
declare const document: any;

/**
 * Progressive enhancement entry point
 * Hydrates React components on top of SSR HTML
 */
function init() {
  const root = document.getElementById('root');
  if (!root) {
    return;
  }

  const pathname = window.location.pathname;

  // Route to appropriate component based on path
  try {
    if (pathname.startsWith('/admin')) {
      // Mount Admin dashboard (replace SSR shell)
      createRoot(root).render(
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange={false}
          storageKey="admin-theme"
        >
          <>
            <AdminDashboard />
            <Toaster position="top-center" richColors closeButton expand={true} />
          </>
        </ThemeProvider>
      );
      console.log('Admin dashboard mounted');
    } else {
      console.log('No hydration needed for path:', pathname);
    }
  } catch (error) {
    console.error('Hydration error:', error);
    // Site still works without hydration due to SSR
  }
}

// Wait for DOM to be ready
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // DOM is already ready
    init();
  }
}

// Export for testing
export { init };
/// <reference lib="dom" />
