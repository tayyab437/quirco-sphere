import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '@/src/lib/supabase';
import { User } from '@supabase/supabase-js';
import { LogIn, Mail, Lock, Loader2, Facebook, AlertCircle } from 'lucide-react';
import { useToast } from '@/src/lib/ToastContext';

export function Auth() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        if (!username.trim()) throw new Error('Username is required');
        const { data, error } = await supabase.auth.signUp({ 
          email, 
          password,
          options: {
            data: {
              full_name: username
            }
          }
        });
        if (error) throw error;
        
        // If sign up is successful and we have a user (some configs auto-login)
        if (data.user) {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            name: username,
            email: email
          });
        }
        
        showToast('Check your email for the confirmation link!', 'success');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        showToast('Welcome back!', 'success');
      }
    } catch (err: any) {
      setError(err.message);
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleFacebookLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: {
          redirectTo: window.location.origin
        }
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-6">
      <div className="w-full max-w-md space-y-8 bg-white p-8 rounded-[2.5rem] shadow-xl shadow-orange-100/50 border border-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 bg-orange-600 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-orange-200">
            <LogIn className="text-white" size={32} />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">QuirkoSphere</h2>
          <p className="mt-2 text-sm text-gray-500">
            {isSignUp ? 'Create your account' : 'Welcome back, creator'}
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleAuth}>
          <div className="space-y-4">
            {isSignUp && (
              <div className="relative">
                <LogIn className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-gray-50 border-none rounded-2xl py-4 pl-12 pr-4 text-sm focus:ring-2 focus:ring-orange-500 transition-all outline-none"
                  placeholder="Username"
                />
              </div>
            )}
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-gray-50 border-none rounded-2xl py-4 pl-12 pr-4 text-sm focus:ring-2 focus:ring-orange-500 transition-all outline-none"
                placeholder="Email address"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-50 border-none rounded-2xl py-4 pl-12 pr-4 text-sm focus:ring-2 focus:ring-orange-500 transition-all outline-none"
                placeholder="Password"
              />
            </div>
          </div>

          {error && (
            <div className="text-red-500 text-xs font-medium bg-red-50 p-3 rounded-xl border border-red-100 flex items-center gap-2">
              <AlertCircle size={14} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!isSupabaseConfigured && (
            <div className="text-orange-600 text-xs font-medium bg-orange-50 p-3 rounded-xl border border-orange-100 flex items-center gap-2">
              <AlertCircle size={14} className="shrink-0" />
              <span>Supabase is not fully configured. Some features may not work.</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-4 px-4 border border-transparent rounded-2xl shadow-lg text-sm font-bold text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 transition-all disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : (isSignUp ? 'Sign Up' : 'Sign In')}
          </button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-100"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-4 text-gray-400 font-bold tracking-widest">Or continue with</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleFacebookLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-4 px-4 rounded-2xl shadow-lg text-sm font-bold text-white bg-[#1877F2] hover:bg-[#166fe5] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1877F2] transition-all disabled:opacity-50"
          >
            <Facebook className="text-white fill-white" size={20} />
            <span>Connect with Facebook</span>
          </button>
        </form>

        <div className="text-center">
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-sm font-bold text-orange-600 hover:text-orange-500 transition-colors"
          >
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </button>
        </div>
      </div>
    </div>
  );
}
