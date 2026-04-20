import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { motion, AnimatePresence } from 'motion/react';
import { User, LogOut, Settings, UserCircle, ChevronDown, Orbit, Sun, Moon } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/src/lib/supabase';
import { cn } from '@/src/lib/utils';
import { useTheme } from '@/src/lib/ThemeContext';

export function Layout() {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    
    let channel: any;

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch initial profile
      try {
        const { data, error } = await supabase.from('profiles').select('avatar_url, name').eq('id', user.id).single();
        
        const name = data?.name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Creator';
        setUserName(name);
        
        if (data?.avatar_url) {
          setAvatarUrl(data.avatar_url);
        } else {
          setAvatarUrl(`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`);
        }

        if (error && error.code === 'PGRST116') {
          // Profile doesn't exist, create it
          await supabase.from('profiles').upsert({ id: user.id, name, email: user.email });
        }
      } catch (err) {
        console.error('[Layout] Profile fetch error:', err);
      }

      // Listen for profile updates
      const channelName = `profile-layout-${Math.random().toString(36).substring(7)}`;
      channel = supabase
        .channel(channelName)
        .on('postgres_changes', { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'profiles',
          filter: `id=eq.${user.id}`
        }, (payload) => {
          if (payload.new) {
            if ((payload.new as any).avatar_url) setAvatarUrl((payload.new as any).avatar_url);
            if ((payload.new as any).name) setUserName((payload.new as any).name);
          }
        })
        .subscribe();
    }
    
    init();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  return (
    <div className="flex flex-col h-screen bg-[var(--background)] font-sans text-gray-900 overflow-hidden">
      <header className="bg-white/80 backdrop-blur-md z-40 px-6 py-4 flex justify-between items-center border-b border-gray-50 shrink-0">
        <Link to="/" className="flex items-center gap-2 text-xl font-bold tracking-tight text-orange-600 hover:opacity-80 transition-opacity">
          <div className="w-8 h-8 bg-orange-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-orange-100">
            <Orbit size={20} />
          </div>
          <span>QuirkoSphere</span>
        </Link>
        
        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl bg-gray-50 text-gray-400 hover:bg-orange-50 hover:text-orange-600 transition-all active:scale-90 shadow-sm border border-gray-100"
            aria-label="Toggle theme"
          >
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>

          <div className="relative">
            <button 
              onClick={() => setShowMenu(!showMenu)}
              className={cn(
                "flex items-center gap-2 p-1 pr-3 rounded-full transition-all active:scale-95 shadow-sm overflow-hidden border border-gray-100",
                location.pathname === '/profile' ? "ring-2 ring-orange-600 ring-offset-2 bg-white" : "bg-white hover:bg-orange-50"
              )}
            >
            <div className="w-8 h-8 rounded-full overflow-hidden bg-orange-100 flex items-center justify-center border border-gray-100">
              {avatarUrl ? (
                <img 
                  src={avatarUrl} 
                  alt="Avatar" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarUrl(`https://api.dicebear.com/7.x/avataaars/svg?seed=${userName || 'default'}`)}
                />
              ) : (
                <UserCircle size={20} className="text-orange-600" />
              )}
            </div>
            <span className="text-xs font-bold text-gray-700 hidden sm:block truncate max-w-[80px]">
              {userName || 'Profile'}
            </span>
            <ChevronDown size={14} className={cn("text-gray-400 transition-transform", showMenu ? "rotate-180" : "")} />
          </button>

          <AnimatePresence>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50 overflow-hidden"
                >
                  <Link 
                    to="/profile" 
                    onClick={() => setShowMenu(false)}
                    className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                  >
                    <User size={18} />
                    My Profile
                  </Link>
                  <Link 
                    to="/settings" 
                    onClick={() => setShowMenu(false)}
                    className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                  >
                    <Settings size={18} />
                    Settings
                  </Link>
                  <div className="h-px bg-gray-50 my-1" />
                  <button 
                    onClick={() => {
                      setShowMenu(false);
                      handleLogout();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut size={18} />
                    Log Out
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>

      <main className="flex-1 flex flex-col px-4 sm:px-5 py-4 sm:py-6 max-w-6xl mx-auto w-full min-h-0 pb-28">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col min-h-0"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <BottomNav />
    </div>
  );
}
