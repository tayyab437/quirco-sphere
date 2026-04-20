import React, { useEffect, useState } from 'react';
import { Moon, Sun, ShieldCheck, BellRing, LockKeyhole, Globe, ChevronLeft, ChevronRight, Facebook, Instagram, Linkedin, Trash2, Loader2, AlertCircle, CheckCircle, Share2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { supabase, isSupabaseConfigured } from '@/src/lib/supabase';
import { useTheme } from '@/src/lib/ThemeContext';
import { useToast } from '@/src/lib/ToastContext';
import { SocialAccount } from '@/src/types';
import { cn } from '@/src/lib/utils';

export function Settings() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useToast();
  const isDark = theme === 'dark';
  const [pushEnabled, setPushEnabled] = React.useState(true);
  const [isChangingPassword, setIsChangingPassword] = React.useState(false);
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');

  useEffect(() => {
    async function fetchAccounts() {
      if (!isSupabaseConfigured) {
        setLoadingAccounts(false);
        return;
      }
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from('social_accounts')
            .select('*')
            .eq('user_id', user.id);
          setAccounts(data || []);
        }
      } catch (e) {
        console.error('Error fetching accounts:', e);
      } finally {
        setLoadingAccounts(false);
      }
    }
    fetchAccounts();
  }, []);

  const handleDisconnect = async () => {
    if (!showDisconnectConfirm || !isSupabaseConfigured) return;
    setDisconnectingId(showDisconnectConfirm);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('social_accounts')
        .delete()
        .eq('id', showDisconnectConfirm)
        .eq('user_id', user.id);
        
      if (error) throw error;
      
      setAccounts(prev => prev.filter(p => p.id !== showDisconnectConfirm));
      setShowDisconnectConfirm(null);
      showToast('Account disconnected successfully', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setDisconnectingId(null);
    }
  };

  const platforms = [
    { id: 'facebook', name: 'Facebook', icon: Facebook, color: 'text-blue-600' },
    { id: 'instagram', name: 'Instagram', icon: Instagram, color: 'text-pink-600' },
    { id: 'linkedin', name: 'LinkedIn', icon: Linkedin, color: 'text-blue-800' },
  ];

  const handleChangePassword = async () => {
    try {
      setIsChangingPassword(true);
      setPasswordError(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('User email not found');

      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/settings?reset=true`
      });

      if (error) throw error;
      showToast('Password reset link sent to your email!', 'success');
    } catch (err: any) {
      setPasswordError(err.message);
      showToast(err.message, 'error');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmationText !== 'DELETE') return;
    
    try {
      setIsDeleting(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const response = await fetch('/api/user/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to delete account');

      // Sign out locally
      await supabase.auth.signOut();
      showToast('Account deleted successfully', 'info');
      navigate('/');
    } catch (err: any) {
      showToast('Error deleting account: ' + err.message, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto space-y-8 pr-2 no-scrollbar">
      <header className="flex items-center gap-4">
        <button 
          onClick={() => navigate(-1)}
          className="p-2 bg-white rounded-xl border border-gray-100 text-gray-400"
        >
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-2xl font-bold">Settings</h2>
      </header>

      <section className="space-y-4">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2">Appearance</h3>
        <div className="bg-white rounded-3xl shadow-sm border border-gray-50 overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-gray-50">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-xl bg-gray-50 text-gray-400">
                {isDark ? <Moon size={20} /> : <Sun size={20} />}
              </div>
              <span className="text-sm font-medium">Dark Mode</span>
            </div>
            <button 
              onClick={toggleTheme}
              className={`w-12 h-6 rounded-full transition-colors relative ${isDark ? 'bg-orange-600' : 'bg-gray-200'}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${isDark ? 'left-7' : 'left-1'}`} />
            </button>
          </div>
          <div className="flex items-center justify-between p-5">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-xl bg-gray-50 text-gray-400">
                <Globe size={20} />
              </div>
              <span className="text-sm font-medium">Language</span>
            </div>
            <span className="text-xs font-bold text-orange-600">English</span>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2">Connected Accounts</h3>
        <div className="bg-white rounded-3xl shadow-sm border border-gray-50 overflow-hidden">
          {loadingAccounts ? (
            <div className="p-8 flex justify-center">
              <Loader2 className="animate-spin text-orange-600" size={24} />
            </div>
          ) : accounts.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <div className="w-12 h-12 bg-gray-50 text-gray-300 rounded-2xl flex items-center justify-center mx-auto">
                <Share2 size={24} />
              </div>
              <p className="text-sm text-gray-400 font-medium">No social accounts connected</p>
              <button 
                onClick={() => navigate('/profile')}
                className="text-xs font-bold text-orange-600 uppercase tracking-widest hover:underline"
              >
                Connect in Profile
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {accounts.map((account) => {
                const platform = platforms.find(p => p.id === account.platform);
                const Icon = platform?.icon || Share2;
                return (
                  <div key={account.id} className="flex items-center justify-between p-5">
                    <div className="flex items-center gap-4">
                      <div className={cn("p-2 rounded-xl bg-gray-50", platform?.color || "text-gray-400")}>
                        <Icon size={20} />
                      </div>
                      <div>
                        <span className="text-sm font-medium block">{platform?.name || account.platform}</span>
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{account.account_name}</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => setShowDisconnectConfirm(account.id)}
                      className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                      title="Disconnect Account"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2">Security</h3>
        <div className="bg-white rounded-3xl shadow-sm border border-gray-50 overflow-hidden">
          <button 
            onClick={handleChangePassword}
            disabled={isChangingPassword}
            className="w-full flex items-center justify-between p-5 transition-colors active:bg-gray-50 border-b border-gray-50"
          >
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-xl bg-gray-50 text-gray-400">
                <LockKeyhole size={20} />
              </div>
              <span className="text-sm font-medium">
                {isChangingPassword ? 'Sending link...' : 'Change Password'}
              </span>
            </div>
            <ChevronRight size={16} className="text-gray-400" />
          </button>
          
          <div className="flex items-center justify-between p-5 border-b border-gray-50">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-xl bg-gray-50 text-gray-400">
                <ShieldCheck size={20} />
              </div>
              <span className="text-sm font-medium">Two-Factor Auth</span>
            </div>
            <span className="text-xs font-bold text-gray-400">Coming Soon</span>
          </div>

          <div className="flex items-center justify-between p-5">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-xl bg-gray-50 text-gray-400">
                <BellRing size={20} />
              </div>
              <span className="text-sm font-medium">Push Notifications</span>
            </div>
            <button 
              onClick={() => setPushEnabled(!pushEnabled)}
              className={`w-12 h-6 rounded-full transition-colors relative ${pushEnabled ? 'bg-orange-600' : 'bg-gray-200'}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${pushEnabled ? 'left-7' : 'left-1'}`} />
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2">Danger Zone</h3>
        <div className="bg-white rounded-3xl shadow-sm border border-red-100 overflow-hidden">
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-xl bg-red-50 text-red-500 shrink-0">
                <AlertCircle size={20} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-gray-900">Delete Account</h4>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  Permanently delete your account and all associated data, including posts, analytics, and connected social accounts. This action cannot be undone.
                </p>
              </div>
            </div>
            <button 
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full py-3 bg-red-50 text-red-600 rounded-2xl text-xs font-bold uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all border border-red-100"
            >
              Delete My Account
            </button>
          </div>
        </div>
      </section>

      {/* Disconnect Confirm Modal */}
      <AnimatePresence>
        {showDisconnectConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-xs rounded-[2.5rem] p-8 text-center space-y-6 shadow-2xl"
            >
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
                <Trash2 size={32} />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold">Disconnect Account?</h3>
                <p className="text-sm text-gray-500">You'll need to reconnect later to manage content for this platform.</p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowDisconnectConfirm(null)}
                  className="flex-1 bg-gray-50 text-gray-500 py-3 rounded-xl font-bold text-sm"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDisconnect}
                  disabled={disconnectingId !== null}
                  className="flex-1 bg-red-500 text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-red-100 flex items-center justify-center"
                >
                  {disconnectingId ? <Loader2 size={18} className="animate-spin" /> : 'Disconnect'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Account Confirm Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] p-8 space-y-6 shadow-2xl"
            >
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
                <Trash2 size={32} />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-xl font-bold text-gray-900">Are you absolutely sure?</h3>
                <p className="text-sm text-gray-500">
                  This will permanently delete your account and all your data. This action is irreversible.
                </p>
              </div>
              
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">
                  Type <span className="text-red-500">DELETE</span> to confirm
                </p>
                <input 
                  type="text"
                  value={deleteConfirmationText}
                  onChange={(e) => setDeleteConfirmationText(e.target.value)}
                  placeholder="DELETE"
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-3 text-center font-bold text-red-600 focus:ring-2 focus:ring-red-100 outline-none transition-all"
                />
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmationText('');
                  }}
                  className="flex-1 bg-gray-50 text-gray-500 py-4 rounded-2xl font-bold text-sm hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDeleteAccount}
                  disabled={isDeleting || deleteConfirmationText !== 'DELETE'}
                  className="flex-1 bg-red-500 text-white py-4 rounded-2xl font-bold text-sm shadow-lg shadow-red-100 disabled:opacity-50 disabled:shadow-none hover:bg-red-600 transition-all flex items-center justify-center gap-2"
                >
                  {isDeleting ? <Loader2 size={18} className="animate-spin" /> : 'Delete Permanently'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
