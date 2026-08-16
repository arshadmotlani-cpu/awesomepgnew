import { Car, FileBarChart, LayoutDashboard, Settings } from 'lucide-react';

export const capitalNavItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/assets', label: 'Vehicles', icon: Car },
  { href: '/reports', label: 'Reports', icon: FileBarChart },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;
