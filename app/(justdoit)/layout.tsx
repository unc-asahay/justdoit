'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import { GitHubProvider } from '@/lib/hooks/useGitHub';
import { SettingsProvider } from '@/lib/ai/settings-store';
import { StatusBarProvider, StatusBar } from '@/scaffolds/status-bar/StatusBar';
import { StatusBarBridge } from '@/scaffolds/status-bar/StatusBarBridge';
import { ThemeProvider, useTheme } from '@/lib/theme/ThemeProvider';
import { ActiveProjectProvider, useActiveProject } from '@/lib/hooks/useActiveProject';
import { BrainsProvider } from '@/lib/brains/provider';

const TABS = [
  { href: '/home', label: 'Home', icon: '🏠' },
  { href: '/canvas', label: 'Canvas', icon: '📋' },
  { href: '/brains', label: 'Brains', icon: '🧠' },
  { href: '/knowledge', label: 'Knowledge', icon: '📚' },
  { href: '/plugins', label: 'Plugins', icon: '🔌' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
];

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="ml-auto px-2 py-1 rounded-md text-sm transition-colors duration-150"
      style={{
        color: 'var(--text-secondary)',
        backgroundColor: 'transparent',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  );
}

function LayoutInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === '/login';
  const { projectId: activeProjectId } = useActiveProject();

  return (
    <div className="flex flex-col h-screen w-screen" style={{ backgroundColor: 'var(--bg-app)' }}>
      {/* Tab Bar */}
      {!isLogin && (
        <header className="flex-shrink-0 backdrop-blur-sm" style={{
          backgroundColor: 'var(--bg-nav)',
          borderBottom: '1px solid var(--border-color)',
        }}>
          <nav className="flex items-center gap-1 px-4 py-2">
            <span className="font-bold text-sm mr-4" style={{ color: 'var(--text-primary)' }}>⚡ JUSTDOIT</span>
            {TABS.map((tab) => {
              const isActive = pathname?.startsWith(tab.href);
              // Canvas link should include the active project
              const href = tab.href === '/canvas' && activeProjectId
                ? `/canvas?project=${activeProjectId}`
                : tab.href;
              return (
                <Link key={tab.href} href={href}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-150"
                  style={{
                    backgroundColor: isActive ? '#2563eb' : 'transparent',
                    color: isActive ? '#ffffff' : 'var(--text-secondary)',
                  }}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </Link>
              );
            })}
            <ThemeToggle />
          </nav>
        </header>
      )}

      {/* Main Content */}
      <main className={`${isLogin ? 'flex-1' : 'flex-1 overflow-hidden'}`}>
        {children}
      </main>

      {/* Status Bar — bridge keeps it in sync with live Brain/MemPalace state */}
      {!isLogin && <StatusBarBridge />}
      {!isLogin && <StatusBar />}
    </div>
  );
}

export default function JustDoItLayout({ children }: { children: ReactNode }) {
  return (
    <GitHubProvider>
      <SettingsProvider>
        <ThemeProvider>
          <StatusBarProvider>
            <ActiveProjectProvider>
              <BrainsProvider>
                <LayoutInner>{children}</LayoutInner>
              </BrainsProvider>
            </ActiveProjectProvider>
          </StatusBarProvider>
        </ThemeProvider>
      </SettingsProvider>
    </GitHubProvider>
  );
}
