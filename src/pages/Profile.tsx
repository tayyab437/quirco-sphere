import React, { useEffect, useState, useRef } from 'react';
import { Settings as SettingsIcon, Shield, Bell, LogOut, ChevronRight, Facebook, Instagram, Linkedin, ExternalLink, Loader2, X, CheckCircle, Mail, MessageSquare, User as UserIcon, Camera, Trash2, AlertCircle } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/src/lib/supabase';
import { cn } from '@/src/lib/utils';
import { SocialAccount } from '@/src/types';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, Link } from 'react-router-dom';
import { useToast } from '@/src/lib/ToastContext';

export function Profile() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [accountName, setAccountName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showContactUs, setShowContactUs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Edit Profile State
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatar, setEditAvatar] = useState('');

  const presetAvatars = [
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Milo',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Luna',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Oliver',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Zoe',
  ];

  // Contact Us State
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');

  useEffect(() => {
    async function fetchProfile() {
      if (!isSupabaseConfigured) {
        setLoading(false);
        return;
      }
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);

        if (user) {
          const accountsResPromise = supabase.from('social_accounts').select('*').eq('user_id', user.id);
          
          // Try to fetch profile with all fields
          let profileRes = await supabase.from('profiles').select('id, name, email, bio, avatar_url').eq('id', user.id).single();
          
          // If it fails, retry with just name and email
          if (profileRes.error) {
            console.warn('[Profile] Profile fetch error (retrying with minimal fields):', profileRes.error.message);
            profileRes = await supabase.from('profiles').select('id, name, email').eq('id', user.id).single();
          }

          const accountsRes = await accountsResPromise;
          setAccounts(accountsRes.data || []);
          
          const profileData = {
            id: user.id,
            name: profileRes.data?.name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Creator',
            email: profileRes.data?.email || user.email,
            bio: profileRes.data?.bio || '',
            avatar_url: profileRes.data?.avatar_url || `https://picsum.photos/seed/${user.id}/200/200`
          };
          
          setProfile(profileData);
          setEditName(profileData.name || '');
          setEditBio(profileData.bio || '');
          setEditAvatar(profileData.avatar_url || '');

          // If profile doesn't exist, create it
          if (!profileRes.data) {
            console.log('[Profile] Creating new profile record...');
            try {
              await supabase.from('profiles').upsert({
                id: user.id,
                name: profileData.name,
                email: user.email,
                avatar_url: profileData.avatar_url
              });
            } catch (upsertErr) {
              console.error('[Profile] Upsert error:', upsertErr);
            }
          }
        }
      } catch (e) {
        console.error('Error fetching profile:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();

    // Listen for profile updates
    const channelName = `profile-page-${user?.id || Math.random().toString(36).substring(7)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'profiles',
        filter: user?.id ? `id=eq.${user.id}` : undefined
      }, (payload) => {
        if (payload.new) {
          console.log('[Profile] Real-time update received:', payload.new);
          setProfile(payload.new);
          if (!isEditing) {
            setEditName((payload.new as any).name || '');
            setEditBio((payload.new as any).bio || '');
            setEditAvatar((payload.new as any).avatar_url || '');
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, isEditing]);

  useEffect(() => {
    if (!isSupabaseConfigured || !user) return;

    const handleMessage = (event: MessageEvent) => {
      // Validate origin
      if (!event.origin.endsWith('.run.app') && !event.origin.includes('localhost')) {
        return;
      }
      
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        // Refresh accounts
        if (user) {
          supabase.from('social_accounts').select('*').eq('user_id', user.id)
            .then(({ data }) => {
              setAccounts(data || []);
              setConnectingPlatform(null);
            });
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [user]);

  useEffect(() => {
    if (connectingPlatform === 'Facebook' || connectingPlatform === 'LinkedIn' || connectingPlatform === 'Instagram') {
      handleConnect();
    }
  }, [connectingPlatform]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleDisconnect = async () => {
    if (!showDisconnectConfirm || !isSupabaseConfigured || !user) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('social_accounts')
        .delete()
        .eq('id', showDisconnectConfirm)
        .eq('user_id', user.id);
        
      if (error) throw error;
      
      setAccounts(prev => prev.filter(p => p.id !== showDisconnectConfirm));
      showToast('Account disconnected successfully', 'info');
      setShowDisconnectConfirm(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to disconnect account', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConnect = async () => {
    if (!connectingPlatform) return;

    if (connectingPlatform === 'Facebook') {
      try {
        setIsSubmitting(true);
        const response = await fetch(`/api/auth/facebook/url?userId=${user.id}`);
        if (!response.ok) throw new Error('Failed to get auth URL');
        const { url } = await response.json();
        
        const authWindow = window.open(url, 'facebook_oauth', 'width=600,height=700');
        if (!authWindow) {
          showToast('Please allow popups to connect your Facebook account.', 'error');
        }
      } catch (e: any) {
        showToast('Connection error: ' + e.message, 'error');
      } finally {
        setIsSubmitting(false);
        setConnectingPlatform(null);
      }
      return;
    }

    if (connectingPlatform === 'Instagram') {
      try {
        setIsSubmitting(true);
        const response = await fetch(`/api/auth/instagram/url?userId=${user.id}`);
        if (!response.ok) throw new Error('Failed to get auth URL');
        const { url } = await response.json();
        
        const authWindow = window.open(url, 'instagram_oauth', 'width=600,height=700');
        if (!authWindow) {
          showToast('Please allow popups to connect your Instagram account.', 'error');
        }
      } catch (e: any) {
        showToast('Connection error: ' + e.message, 'error');
      } finally {
        setIsSubmitting(false);
        setConnectingPlatform(null);
      }
      return;
    }

    if (connectingPlatform === 'LinkedIn') {
      try {
        setIsSubmitting(true);
        const response = await fetch(`/api/auth/linkedin/url?userId=${user.id}`);
        if (!response.ok) throw new Error('Failed to get auth URL');
        const { url } = await response.json();
        
        const authWindow = window.open(url, 'linkedin_oauth', 'width=600,height=700');
        if (!authWindow) {
          showToast('Please allow popups to connect your LinkedIn account.', 'error');
        }
      } catch (e: any) {
        showToast('Connection error: ' + e.message, 'error');
      } finally {
        setIsSubmitting(false);
        setConnectingPlatform(null);
      }
      return;
    }

    if (!accountName.trim()) return;
    
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('social_accounts').insert({
        user_id: user.id,
        platform: connectingPlatform.toLowerCase(),
        account_name: accountName,
        account_id: Math.random().toString(36).substring(7),
        access_token: 'dummy_token_' + Date.now()
      });

      if (error) throw error;

      // Refresh accounts
      const { data } = await supabase.from('social_accounts').select('*').eq('user_id', user.id);
      setAccounts(data || []);
      showToast('Account connected successfully!', 'success');
      setConnectingPlatform(null);
      setAccountName('');
    } catch (e: any) {
      showToast('Error connecting account: ' + e.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!user?.id) {
      console.error('[Profile] No user ID found');
      return;
    }
    if (!editName.trim()) {
      showToast('Name cannot be empty', 'error');
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    setSuccess(false);
    
    console.log('[Profile] handleUpdateProfile called. Payload:', {
      id: user.id,
      name: editName,
      bio: editBio,
      avatar_url: editAvatar,
    });
    
    try {
      const response = await fetch('/api/profile/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          name: editName,
          bio: editBio,
          profileImage: editAvatar
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.message || 'Failed to update profile');
      }
      
      const responseData = await response.json();
      const { data: updatedData, warning, hint } = responseData;
      const finalData = Array.isArray(updatedData) ? updatedData[0] : updatedData;
      
      console.log('[Profile] Update successful via API. New data:', finalData);
      if (warning) console.warn('[Profile] API Warning:', warning, hint);
      
      // Update local state immediately
      if (finalData) {
        setProfile((prev: any) => ({
          ...prev,
          ...finalData
        }));
      }
      
      if (warning) {
        setError(`${warning} ${hint || ''}`);
        showToast(`Profile updated with warning: ${warning}`, 'info');
        // Don't close editing mode if there's a warning, so user can see it
        setSuccess(true); 
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setSuccess(true);
        showToast('Profile updated successfully!', 'success');
        // Auto-dismiss after a short delay to show success state
        setTimeout(() => {
          setIsEditing(false);
          setSuccess(false);
        }, 1500);
      }
    } catch (e: any) {
      console.error('[Profile] Update failed:', e);
      const message = (e.message === 'Failed to fetch' || e.name === 'TypeError')
        ? 'Network error: Could not connect to the profile update server. Please check your connection or refresh the page.'
        : e.message || 'Unknown error updating profile';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      setError(null);
      if (!user?.id) {
        throw new Error('You must be logged in to upload an avatar.');
      }
      if (!event.target.files || event.target.files.length === 0) {
        throw new Error('You must select an image to upload.');
      }

      const file = event.target.files[0];
      
      // Validate file type
      if (!file.type.startsWith('image/')) {
        throw new Error('Please select an image file.');
      }

      // Validate file size (e.g., 2MB)
      if (file.size > 2 * 1024 * 1024) {
        throw new Error('Image size must be less than 2MB.');
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      console.log('[Profile] Uploading file:', filePath);

      // Upload the file to Supabase Storage
      const { error: uploadError, data } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        console.error('[Profile] Upload error details:', uploadError);
        if (uploadError.message?.toLowerCase().includes('bucket not found')) {
          throw new Error('Storage bucket "avatars" not found. Please ensure you have run the SQL schema in your Supabase editor.');
        }
        if (uploadError.message?.toLowerCase().includes('row-level security')) {
          throw new Error('Permission denied. Please ensure your Supabase storage policies are correctly configured.');
        }
        throw uploadError;
      }

      console.log('[Profile] Upload successful:', data);

      // Get the public URL
      const { data: publicUrlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData.publicUrl;
      console.log('[Profile] Public URL generated:', publicUrl);
      
      // Update state
      setEditAvatar(publicUrl);
      
      // Optional: Automatically save the profile if the user just uploaded a photo
      // to prevent "vanishing on refresh" if they forget to click save changes
      // But we'll leave it to the user to click "Save Changes" for consistency with other fields
      
    } catch (error: any) {
      console.error('[Profile] Avatar upload failed:', error);
      setError('Upload failed: ' + error.message);
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveAvatar = () => {
    setEditAvatar('');
  };

  const handleContactSubmit = async () => {
    setIsSubmitting(true);
    try {
      console.log('[Profile] Submitting contact form for user:', user.id);
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          name: contactName,
          email: contactEmail,
          message: contactMessage
        })
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.error(`[Profile] Contact API error ${res.status}:`, errorText);
        throw new Error('Failed to submit');
      }
      
      console.log('[Profile] Contact form submitted successfully');
      showToast('Thank you! We will get back to you soon.', 'success');
      setShowContactUs(false);
      setContactMessage('');
    } catch (e: any) {
      console.error('[Profile] Contact fetch failed:', e);
      const msg = (e.message === 'Failed to fetch' || e.name === 'TypeError')
        ? 'Network error: Could not reach the server. Please check your connection.'
        : e.message || 'Failed to submit contact form';
      showToast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-orange-600" size={32} />
      </div>
    );
  }

  const platforms = [
    { id: 'facebook', name: 'Facebook', icon: Facebook, color: 'text-blue-600' },
    { id: 'instagram', name: 'Instagram', icon: Instagram, color: 'text-pink-600' },
    { id: 'linkedin', name: 'LinkedIn', icon: Linkedin, color: 'text-blue-800' },
  ];

  return (
    <div className="flex-1 overflow-y-auto space-y-8 pr-2 no-scrollbar">
      <div className="bg-white p-8 rounded-[2.5rem] border border-gray-50 shadow-sm">
        {!isEditing ? (
          <div className="flex flex-col items-center text-center">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative group"
            >
              <div className="w-32 h-32 rounded-[48px] bg-orange-100 flex items-center justify-center mb-6 border-4 border-white shadow-2xl shadow-orange-100 overflow-hidden relative">
                {profile?.avatar_url ? (
                  <img 
                    src={profile.avatar_url} 
                    alt="Avatar" 
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
                    referrerPolicy="no-referrer" 
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-orange-50 text-orange-600">
                    <UserIcon size={48} />
                  </div>
                )}
                <button 
                  onClick={() => setIsEditing(true)}
                  className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white gap-2"
                >
                  <Camera size={24} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Edit Profile</span>
                </button>
              </div>
              <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-orange-600 text-white rounded-2xl flex items-center justify-center shadow-lg border-4 border-white">
                <CheckCircle size={16} />
              </div>
            </motion.div>
            
            <h2 className="text-3xl font-bold tracking-tight text-gray-900">{profile?.name || user?.user_metadata?.full_name || user?.email?.split('@')[0]}</h2>
            <p className="text-gray-400 text-sm font-medium mt-1">{user?.email}</p>
            
            {profile?.bio && (
              <p className="text-gray-500 text-sm max-w-sm mt-4 leading-relaxed italic">
                "{profile.bio}"
              </p>
            )}
            
            <button 
              onClick={() => setIsEditing(true)}
              className="mt-6 px-8 py-3 bg-white border border-gray-100 rounded-2xl text-xs font-bold uppercase tracking-widest shadow-sm hover:shadow-md transition-all active:scale-95 text-gray-600"
            >
              Edit Profile
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold">Edit Profile</h3>
              <button 
                onClick={() => {
                  setIsEditing(false);
                  setError(null);
                  setSuccess(false);
                }} 
                className="p-2 bg-gray-50 rounded-full text-gray-400 hover:bg-gray-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-32 h-32 rounded-[48px] bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden relative group shadow-inner">
                    {uploading ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 size={24} className="animate-spin text-orange-600" />
                        <span className="text-[8px] font-bold uppercase text-orange-600">Uploading...</span>
                      </div>
                    ) : editAvatar ? (
                      <>
                        <img src={editAvatar} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="p-2 bg-white/20 hover:bg-white/40 rounded-xl text-white transition-colors"
                            title="Change Photo"
                          >
                            <Camera size={18} />
                          </button>
                          <button 
                            onClick={handleRemoveAvatar}
                            className="p-2 bg-red-500/80 hover:bg-red-500 rounded-xl text-white transition-colors"
                            title="Remove Photo"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </>
                    ) : (
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full h-full flex flex-col items-center justify-center gap-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 transition-all"
                      >
                        <Camera size={32} />
                        <span className="text-[10px] font-bold uppercase">Upload Photo</span>
                      </button>
                    )}
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    className="hidden"
                  />
                  
                  <div className="space-y-3 w-full">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest text-center">Or select a preset</p>
                    <div className="flex flex-wrap justify-center gap-3">
                      {presetAvatars.map((url, i) => (
                        <button
                          key={i}
                          onClick={() => setEditAvatar(url)}
                          className={cn(
                            "w-12 h-12 rounded-2xl overflow-hidden border-2 transition-all active:scale-90",
                            editAvatar === url ? "border-orange-600 scale-110 shadow-md" : "border-transparent hover:border-gray-200"
                          )}
                        >
                          <img src={url} alt="Preset" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-2 tracking-widest">Full Name</label>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Your Name"
                    className="w-full bg-gray-50 border-none rounded-2xl py-4 px-5 text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-2 tracking-widest">Bio</label>
                  <textarea
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    placeholder="Tell us about yourself"
                    className="w-full bg-gray-50 border-none rounded-2xl py-4 px-5 text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-all h-32 resize-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-2 tracking-widest">Avatar URL</label>
                  <input
                    value={editAvatar}
                    onChange={(e) => setEditAvatar(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-gray-50 border-none rounded-2xl py-4 px-5 text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                  />
                </div>
              </div>
            </div>

            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-medium flex items-center gap-2 border border-red-100"
              >
                <AlertCircle size={14} className="shrink-0" />
                <p>{error}</p>
              </motion.div>
            )}

            {success && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-green-50 text-green-600 rounded-2xl text-xs font-medium flex items-center gap-2 border border-green-100"
              >
                <CheckCircle size={14} className="shrink-0" />
                <p>Profile updated successfully!</p>
              </motion.div>
            )}

            <div className="flex gap-4 pt-4">
              <button
                onClick={() => setIsEditing(false)}
                className="flex-1 py-4 bg-gray-50 text-gray-600 rounded-2xl font-bold text-sm hover:bg-gray-100 transition-all active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateProfile}
                disabled={isSubmitting || uploading || success}
                className={cn(
                  "flex-[2] py-4 rounded-2xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50",
                  success 
                    ? "bg-green-600 text-white shadow-green-100" 
                    : "bg-orange-600 text-white shadow-orange-100 hover:bg-orange-700"
                )}
              >
                {isSubmitting ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : success ? (
                  <>
                    <CheckCircle size={20} />
                    <span>Saved!</span>
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <section className="space-y-4">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Shield size={20} className="text-orange-600" />
            Social Accounts
          </h3>
          <div className="space-y-3">
            {platforms.map((p) => {
              const connected = accounts.find(a => a.platform === p.id);
              return (
                <div key={p.id} className="bg-white p-5 rounded-[2rem] shadow-sm border border-gray-50 flex items-center justify-between group hover:border-orange-100 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={cn("p-3 rounded-2xl bg-gray-50 transition-colors", p.color, "group-hover:bg-white")}>
                      <p.icon size={24} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{p.name}</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                        {connected ? connected.account_name : 'Not connected'}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => connected ? setShowDisconnectConfirm(connected.id) : setConnectingPlatform(p.name)}
                    className={cn(
                      "text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-xl transition-all active:scale-95",
                      connected ? "text-gray-400 bg-gray-50 hover:bg-red-50 hover:text-red-500" : "text-orange-600 bg-orange-50 hover:bg-orange-600 hover:text-white"
                    )}
                  >
                    {connected ? 'Disconnect' : 'Connect'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <div className="space-y-8">
          <section className="bg-white rounded-[2rem] shadow-sm border border-gray-50 overflow-hidden">
            <Link to="/settings" className="w-full flex items-center justify-between p-6 transition-colors hover:bg-gray-50 border-b border-gray-50 group">
              <div className="flex items-center gap-4">
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <SettingsIcon size={20} />
                </div>
                <span className="text-sm font-bold text-gray-700">App Settings</span>
              </div>
              <ChevronRight size={18} className="text-gray-300 group-hover:text-orange-600 transition-colors" />
            </Link>
            <button 
              onClick={() => setShowContactUs(true)}
              className="w-full flex items-center justify-between p-6 transition-colors hover:bg-gray-50 group"
            >
              <div className="flex items-center gap-4">
                <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl group-hover:bg-purple-600 group-hover:text-white transition-colors">
                  <Mail size={20} />
                </div>
                <span className="text-sm font-bold text-gray-700">Contact Us</span>
              </div>
              <ChevronRight size={18} className="text-gray-300 group-hover:text-orange-600 transition-colors" />
            </button>
          </section>

          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-3 p-6 text-red-500 font-bold text-sm bg-red-50/50 hover:bg-red-50 transition-all rounded-[2rem] border border-red-100/50 active:scale-[0.98]"
          >
            <LogOut size={20} />
            <span>Log Out</span>
          </button>
        </div>
      </div>

      {/* Connect Account Modal */}
      <AnimatePresence>
        {connectingPlatform && connectingPlatform !== 'Facebook' && connectingPlatform !== 'LinkedIn' && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm px-4 pb-4 sm:pb-0">
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 space-y-6 shadow-2xl"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold">Connect {connectingPlatform}</h3>
                <button onClick={() => setConnectingPlatform(null)} className="p-2 bg-gray-50 rounded-full text-gray-400">
                  <X size={20} />
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Account Name / Handle</label>
                  <input
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="@username"
                    className="w-full bg-gray-50 border-none rounded-2xl py-4 px-5 text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                  />
                </div>
              </div>

              <button
                onClick={handleConnect}
                disabled={isSubmitting || !accountName.trim()}
                className="w-full bg-orange-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-orange-100 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 size={20} className="animate-spin" /> : `Connect ${connectingPlatform}`}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Contact Us Modal */}
      <AnimatePresence>
        {showContactUs && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm px-4 pb-4 sm:pb-0">
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 space-y-6 shadow-2xl"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold">Contact Us</h3>
                <button onClick={() => setShowContactUs(false)} className="p-2 bg-gray-50 rounded-full text-gray-400">
                  <X size={20} />
                </button>
              </div>
              
              <div className="space-y-4">
                <input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Your Name"
                  className="w-full bg-gray-50 border-none rounded-2xl py-4 px-5 text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                />
                <input
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="Email Address"
                  className="w-full bg-gray-50 border-none rounded-2xl py-4 px-5 text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                />
                <textarea
                  value={contactMessage}
                  onChange={(e) => setContactMessage(e.target.value)}
                  placeholder="How can we help?"
                  className="w-full bg-gray-50 border-none rounded-2xl py-4 px-5 text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-all h-32 resize-none"
                />
              </div>

              <button
                onClick={handleContactSubmit}
                disabled={isSubmitting || !contactMessage.trim()}
                className="w-full bg-orange-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-orange-100 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 size={20} className="animate-spin" /> : 'Send Message'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
                <X size={32} />
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
                  disabled={isSubmitting}
                  className="flex-1 bg-red-500 text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-red-100 flex items-center justify-center"
                >
                  {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : 'Disconnect'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
