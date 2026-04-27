'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    // Check for stored PAT
    const pat = localStorage.getItem('justdoit_github_pat');
    if (!pat) {
      router.replace('/login');
    } else {
      router.replace('/home');
    }
  }, [router]);

  return (
    <div className="flex items-center justify-center h-screen bg-gray-950">
      <div className="animate-pulse text-gray-400 text-sm">Loading...</div>
    </div>
  );
}
