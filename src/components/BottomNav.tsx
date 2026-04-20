import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutGrid, PlusCircle, Bot, UserCircle } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export function BottomNav() {
  const navItems = [
    { icon: LayoutGrid, label: 'Home', path: '/' },
    { icon: PlusCircle, label: 'Create', path: '/create' },
    { icon: Bot, label: 'Agents', path: '/agents' },
    { icon: UserCircle, label: 'Profile', path: '/profile' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-6 py-3 flex justify-between items-center z-50 pb-safe">
      {navItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) =>
            cn(
              "flex flex-col items-center gap-1 transition-colors",
              isActive ? "text-orange-600" : "text-gray-400"
            )
          }
        >
          <item.icon size={24} />
          <span className="text-[10px] font-medium uppercase tracking-wider">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
