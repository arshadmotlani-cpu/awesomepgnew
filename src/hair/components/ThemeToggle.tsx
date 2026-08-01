'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useHairTheme } from '@/src/hair/components/HairProviders';
import { Button } from '@/src/hair/components/ui/button';

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useHairTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={toggleTheme}
      className={className}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {!mounted ? (
        <Sun className="h-4 w-4" aria-hidden />
      ) : theme === 'dark' ? (
        <Sun className="h-4 w-4" aria-hidden />
      ) : (
        <Moon className="h-4 w-4" aria-hidden />
      )}
    </Button>
  );
}
