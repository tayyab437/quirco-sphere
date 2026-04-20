import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Calendar, CheckCircle, CalendarClock, Activity, PlusCircle, Bot, Loader2, AlertCircle, BarChart2, Instagram, Linkedin, Facebook, ExternalLink, X, ShieldCheck, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '@/src/lib/supabase';
import { cn, formatDate } from '@/src/lib/utils';
import { Post, SocialAccount } from '@/src/types';
import { AnimatePresence } from 'motion/react';
import { Onboarding } from '@/src/components/Onboarding';
import { useToast } from '@/src/lib/ToastContext';

export function Home() {
  const { showToast } = useToast();
  const [stats, setStats] = useState({ connected: 0, scheduled: 0, published: 0 });
  const [recentActivity, setRecentActivity] = useState<Post[]>([]);
  const [scheduledPosts, setScheduledPosts] = useState<Post[]>([]);
  const [drafts, setDrafts] = useState<Post[]>([]);
  const [socialAccounts, setSocialAccounts] = useState<SocialAccount[]>([]);
  const [viewingPlatform, setViewingPlatform] = useState<SocialAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState('Creator');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showAllDrafts, setShowAllDrafts] = useState(false);
  const [showAllScheduled, setShowAllScheduled] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeletePost = async () => {
    if (!showDeleteConfirm) return;
    try {
      setIsDeleting(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', showDeleteConfirm)
        .eq('user_id', user.id);
        
      if (error) throw error;
      
      setScheduledPosts(prev => prev.filter(p => p.id !== showDeleteConfirm));
      setDrafts(prev => prev.filter(p => p.id !== showDeleteConfirm));
      setRecentActivity(prev => prev.filter(p => p.id !== showDeleteConfirm));
      
      // Realtime subscription should handle stats update, but local update is faster
      setStats(prev => ({ 
        ...prev, 
        scheduled: Math.max(0, prev.scheduled - 1) 
      }));
      
      showToast('Post removed successfully', 'info');
      setShowDeleteConfirm(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to delete post', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    let postsSubscription: any;
    let profileSubscription: any;

    const fetchStatsFromDB = async (userId: string) => {
      const [totalRes, scheduledRes, publishedRes] = await Promise.all([
        supabase.from('posts').select('*', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('posts').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'scheduled'),
        supabase.from('posts').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'published')
      ]);
      return {
        total: totalRes.count || 0,
        scheduled: scheduledRes.count || 0,
        published: publishedRes.count || 0
      };
    };

    const fetchAllData = async (userId: string) => {
      const [dbStats, activityRes, scheduledListRes, draftsRes, profileRes, socialRes] = await Promise.all([
        fetchStatsFromDB(userId),
        supabase.from('posts')
          .select('*')
          .eq('user_id', userId)
          .in('status', ['scheduled', 'published', 'error', 'draft'])
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.from('posts')
          .select('*')
          .eq('user_id', userId)
          .eq('status', 'scheduled')
          .order('scheduled_time', { ascending: true }),
        supabase.from('posts')
          .select('*')
          .eq('user_id', userId)
          .eq('status', 'draft')
          .order('created_at', { ascending: false }),
        supabase.from('profiles').select('name, has_seen_onboarding').eq('id', userId).single(),
        supabase.from('social_accounts').select('*').eq('user_id', userId)
      ]);

      if (!isMounted) return;

      if (profileRes.data) {
        setUserName(profileRes.data.name || 'Creator');
        if (!profileRes.data.has_seen_onboarding) {
          setShowOnboarding(true);
        }
      }

      setSocialAccounts(socialRes.data || []);
      setStats({
        connected: dbStats.total,
        scheduled: dbStats.scheduled,
        published: dbStats.published
      });
      setRecentActivity(activityRes.data || []);
      setScheduledPosts(scheduledListRes.data || []);
      setDrafts(draftsRes.data || []);
      
      const name = profileRes.data?.name || 'Creator';
      setUserName(name);

      if (!profileRes.data) {
        await supabase.from('profiles').upsert({
          id: userId,
          name: name,
        });
      }
    };

    async function setupRealtime() {
      if (!isSupabaseConfigured) {
        if (isMounted) setLoading(false);
        return;
      }
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !isMounted) return;

        // Initial fetch
        await fetchAllData(user.id);

        // Profile subscription
        profileSubscription = supabase
          .channel('profile-realtime')
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${user.id}`
          }, (payload) => {
            if (isMounted && payload.new && (payload.new as any).name) {
              setUserName((payload.new as any).name);
            }
          })
          .subscribe();

        // Real-time subscription - Use a unique channel name to avoid conflicts
        const channelName = `posts-realtime-${user.id}-${Math.random().toString(36).substring(7)}`;
        postsSubscription = supabase
          .channel(channelName)
          .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'posts',
            filter: `user_id=eq.${user.id}`
          }, async () => {
            if (!isMounted) return;
            console.log(`[Home] Real-time update detected for user ${user.id}`);
            
            // Re-fetch only what's likely to change to improve performance
            const [newDbStats, newActivity, newScheduled, newDrafts] = await Promise.all([
              fetchStatsFromDB(user.id),
              supabase.from('posts').select('*').eq('user_id', user.id).in('status', ['scheduled', 'published', 'error', 'draft']).order('created_at', { ascending: false }).limit(50),
              supabase.from('posts').select('*').eq('user_id', user.id).eq('status', 'scheduled').order('scheduled_time', { ascending: true }),
              supabase.from('posts').select('*').eq('user_id', user.id).eq('status', 'draft').order('created_at', { ascending: false })
            ]);

            if (!isMounted) return;
            
            setStats({
              connected: newDbStats.total,
              scheduled: newDbStats.scheduled,
              published: newDbStats.published
            });
            setRecentActivity(newActivity.data || []);
            setScheduledPosts(newScheduled.data || []);
            setDrafts(newDrafts.data || []);
            
            console.log(`[Home] Stats updated: Total=${newDbStats.total}, Scheduled=${newDbStats.scheduled}, Published=${newDbStats.published}`);
          })
          .subscribe();

      } catch (err: any) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    setupRealtime();

    return () => {
      isMounted = false;
      if (postsSubscription) {
        supabase.removeChannel(postsSubscription);
      }
      if (profileSubscription) {
        supabase.removeChannel(profileSubscription);
      }
    };
  }, []);

  const handleOnboardingComplete = async () => {
    setShowOnboarding(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await fetch('/api/profile/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            hasSeenOnboarding: true
          })
        });
      }
    } catch (err) {
      console.error("Failed to update onboarding status:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 space-y-4">
        <Loader2 className="animate-spin text-orange-600" size={32} />
        <p className="text-gray-400 text-sm font-medium">Loading your dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col justify-center">
        <div className="bg-red-50 p-6 rounded-3xl border border-red-100 text-center space-y-3">
          <AlertCircle className="text-red-500 mx-auto" size={32} />
          <h3 className="font-bold text-red-900">Failed to load data</h3>
          <p className="text-red-600 text-sm">{error}</p>
          <button onClick={() => window.location.reload()} className="bg-red-600 text-white px-4 py-2 rounded-xl text-xs font-bold">Retry</button>
        </div>
      </div>
    );
  }

  const statCards = [
    { label: 'Total Posts', value: stats.connected.toString(), icon: Activity, color: 'text-blue-500', bg: 'bg-blue-50' },
    { label: 'Scheduled', value: stats.scheduled.toString(), icon: CalendarClock, color: 'text-orange-500', bg: 'bg-orange-50' },
    { label: 'Published', value: stats.published.toString(), icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50' },
  ];

  return (
    <div className="flex-1 overflow-y-auto space-y-8 pr-2 no-scrollbar">
      {showOnboarding && (
        <Onboarding 
          userName={userName} 
          onComplete={handleOnboardingComplete} 
        />
      )}
      <header className="flex justify-between items-start">
        <section>
          <h2 className="text-2xl font-bold mb-1">Hello, {userName}!</h2>
          <p className="text-gray-500 text-sm">You have {stats.scheduled} posts scheduled for this week.</p>
        </section>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {statCards.map((stat, idx) => (
          <motion.div 
            key={stat.label} 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col items-center text-center gap-2 group hover:shadow-md transition-all"
          >
            <div className={cn("p-3 rounded-2xl transition-transform group-hover:scale-110", stat.bg)}>
              <stat.icon size={24} className={stat.color} />
            </div>
            <div className="flex flex-col items-center">
              <motion.span 
                key={stat.value}
                initial={{ scale: 1.2, color: '#f97316' }}
                animate={{ scale: 1, color: '#111827' }}
                className="text-2xl font-bold tracking-tight text-gray-900"
              >
                {stat.value}
              </motion.span>
              <span className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mt-1">{stat.label}</span>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content Column */}
        <div className="lg:col-span-2 space-y-8">
          <section className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-xl tracking-tight text-gray-900">Quick Actions</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <Link to="/create" className="relative overflow-hidden bg-orange-600 text-white p-8 rounded-[2.5rem] shadow-xl shadow-orange-100 flex flex-col items-start gap-4 group hover:scale-[1.02] transition-all">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform" />
                <div className="p-4 bg-white/20 rounded-2xl group-hover:bg-white/30 transition-colors">
                  <PlusCircle size={28} />
                </div>
                <div className="space-y-1">
                  <span className="font-bold text-2xl block">Create Post</span>
                  <p className="text-orange-100 text-sm">Design and schedule your next viral hit</p>
                </div>
              </Link>
              <Link to="/agents" className="relative overflow-hidden bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col items-start gap-4 group hover:border-orange-200 hover:shadow-md transition-all">
                <div className="absolute top-0 right-0 w-32 h-32 bg-orange-50 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform" />
                <div className="p-4 bg-orange-50 rounded-2xl group-hover:bg-orange-100 transition-colors">
                  <Bot size={28} className="text-orange-600" />
                </div>
                <div className="space-y-1">
                  <span className="font-bold text-2xl block text-gray-900">AI Agents</span>
                  <p className="text-gray-500 text-sm">Get expert help from specialized AI assistants</p>
                </div>
              </Link>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <h3 className="font-bold text-lg">Saved Drafts</h3>
                <span className="text-[10px] font-bold text-gray-500 bg-gray-50 px-2 py-1 rounded-lg">
                  {drafts.length} Drafts
                </span>
              </div>
              {drafts.length > 3 && (
                <button 
                  onClick={() => setShowAllDrafts(!showAllDrafts)}
                  className="text-[10px] font-bold text-orange-600 hover:underline uppercase tracking-widest"
                >
                  {showAllDrafts ? 'Show Less' : 'View All'}
                </button>
              )}
            </div>
            
            {drafts.length === 0 ? (
              <div className="bg-white p-6 rounded-3xl border border-dashed border-gray-200 text-center">
                <p className="text-gray-400 text-xs">No drafts saved yet.</p>
              </div>
            ) : (
              <div className={cn(
                "flex gap-4 snap-x no-scrollbar",
                showAllDrafts ? "flex-wrap" : "overflow-x-auto pb-4"
              )}>
                {drafts.slice(0, showAllDrafts ? undefined : 3).map(post => (
                  <div key={post.id} className={cn(
                    "bg-white p-4 rounded-3xl shadow-sm border border-gray-50 snap-start flex flex-col gap-3",
                    showAllDrafts ? "w-full sm:w-[calc(50%-8px)]" : "min-w-[240px]"
                  )}>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gray-100 overflow-hidden flex-shrink-0">
                        {post.media_url?.match(/\.(mp4|webm|ogg|mov)$|video/i) ? (
                          <video src={post.media_url} className="w-full h-full object-cover" />
                        ) : (
                          <img src={post.media_url || `https://picsum.photos/seed/${post.id}/100/100`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate">{post.content || 'No content'}</p>
                        <p className="text-[10px] text-gray-400 font-medium">
                          Last edited {formatDate(post.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-auto">
                      <Link to={`/create?edit=${post.id}`} className="flex-1 py-2 bg-orange-50 text-orange-600 rounded-xl text-xs font-bold text-center hover:bg-orange-100 transition-colors">
                        Resume
                      </Link>
                      <button onClick={() => setShowDeleteConfirm(post.id)} className="p-2 bg-red-50 text-red-400 rounded-xl hover:text-red-600 transition-colors">
                        <CalendarClock size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <h3 className="font-bold text-lg">Scheduled Posts</h3>
                <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded-lg">
                  {scheduledPosts.length} Pending
                </span>
              </div>
              {scheduledPosts.length > 3 && (
                <button 
                  onClick={() => setShowAllScheduled(!showAllScheduled)}
                  className="text-[10px] font-bold text-orange-600 hover:underline uppercase tracking-widest"
                >
                  {showAllScheduled ? 'Show Less' : 'View All'}
                </button>
              )}
            </div>
            
            {scheduledPosts.length === 0 ? (
              <div className="bg-white p-6 rounded-3xl border border-dashed border-gray-200 text-center">
                <p className="text-gray-400 text-xs">No posts scheduled yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {scheduledPosts.slice(0, showAllScheduled ? undefined : 3).map(post => (
                  <div key={post.id} className="bg-white p-4 rounded-3xl shadow-sm border border-gray-50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gray-100 overflow-hidden">
                        {post.media_url?.match(/\.(mp4|webm|ogg|mov)$|video/i) ? (
                          <video src={post.media_url} className="w-full h-full object-cover" />
                        ) : (
                          <img src={post.media_url || `https://picsum.photos/seed/${post.id}/100/100`} className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-bold truncate w-32">{post.content}</p>
                        <p className="text-[10px] text-orange-600 font-medium">
                          {new Date(post.scheduled_time!).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Link to={`/create?edit=${post.id}`} className="p-2 bg-gray-50 text-gray-400 rounded-lg hover:text-orange-600">
                        <PlusCircle size={16} />
                      </Link>
                      <button onClick={() => setShowDeleteConfirm(post.id)} className="p-2 bg-red-50 text-red-400 rounded-lg hover:text-red-600">
                        <CalendarClock size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Sidebar Column */}
        <div className="space-y-8">
          <section className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg">Channels</h3>
              <Link to="/profile" className="text-[10px] font-bold text-orange-600 hover:underline uppercase tracking-widest">Manage</Link>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'instagram', icon: Instagram, color: 'text-pink-600', bg: 'bg-pink-50', label: 'Instagram' },
                { id: 'linkedin', icon: Linkedin, color: 'text-blue-900', bg: 'bg-blue-50', label: 'LinkedIn' },
                { id: 'facebook', icon: Facebook, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Facebook' },
              ].map((platform) => {
                const account = socialAccounts.find(a => a.platform === platform.id);
                return (
                  <motion.div 
                    key={platform.id}
                    whileHover={{ y: -2 }}
                    onClick={() => account && setViewingPlatform(account)}
                    className={cn(
                      "relative group cursor-pointer",
                      !account && "opacity-40 grayscale pointer-events-none"
                    )}
                  >
                    <div className={cn(
                      "w-full aspect-square rounded-2xl flex items-center justify-center shadow-sm border border-gray-50 transition-all",
                      account ? platform.bg : "bg-gray-50"
                    )}>
                      <platform.icon size={24} className={account ? platform.color : "text-gray-400"} />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg">Post History</h3>
              <Link 
                to="/history" 
                className="text-[10px] font-bold text-orange-600 hover:underline uppercase tracking-widest"
              >
                View All
              </Link>
            </div>
            
            {recentActivity.length === 0 ? (
              <div className="bg-white p-6 rounded-3xl border border-dashed border-gray-200 text-center">
                <p className="text-gray-400 text-xs">No activity yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentActivity.slice(0, 3).map((post) => (
                  <div key={post.id} className="bg-white p-4 rounded-3xl shadow-sm border border-gray-50 flex items-center justify-between group hover:border-orange-100 transition-all">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-gray-100 overflow-hidden flex-shrink-0">
                        {post.media_url?.match(/\.(mp4|webm|ogg|mov)$|video/i) ? (
                          <video src={post.media_url} className="w-full h-full object-cover" />
                        ) : (
                          <img 
                            src={post.media_url || `https://picsum.photos/seed/${post.id}/100/100`} 
                            alt="Post" 
                            className="w-full h-full object-cover" 
                            referrerPolicy="no-referrer" 
                          />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate">{post.content || 'No content'}</p>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-md",
                            post.status === 'published' ? "bg-green-50 text-green-600" : 
                            post.status === 'error' ? "bg-red-50 text-red-600" : 
                            post.status === 'draft' ? "bg-gray-50 text-gray-600" : "bg-orange-50 text-orange-600"
                          )}>
                            {post.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <AnimatePresence>
        {viewingPlatform && (
          <SocialPlatformModal 
            account={viewingPlatform} 
            onClose={() => setViewingPlatform(null)} 
          />
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
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
                <h3 className="text-lg font-bold">Delete Post?</h3>
                <p className="text-sm text-gray-500">This will permanently remove this post and its media. This action cannot be undone.</p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowDeleteConfirm(null)}
                  className="flex-1 bg-gray-50 text-gray-500 py-3 rounded-xl font-bold text-sm"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDeletePost}
                  disabled={isDeleting}
                  className="flex-1 bg-red-500 text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-red-100 flex items-center justify-center"
                >
                  {isDeleting ? <Loader2 size={18} className="animate-spin" /> : 'Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SocialPlatformModal({ account, onClose }: { account: SocialAccount, onClose: () => void }) {
  const platformConfig = {
    instagram: {
      name: 'Instagram',
      icon: Instagram,
      color: 'text-pink-600',
      bg: 'bg-pink-50',
      url: `https://www.instagram.com/${account.account_name}/`,
      description: 'View your profile, media, and engage with your audience.'
    },
    facebook: {
      name: 'Facebook',
      icon: Facebook,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      url: `https://www.facebook.com/${account.account_id}/`,
      description: 'Manage your pages, groups, and connect with your community.'
    },
    linkedin: {
      name: 'LinkedIn',
      icon: Linkedin,
      color: 'text-blue-900',
      bg: 'bg-blue-50',
      url: `https://www.linkedin.com/in/${account.account_name}/`, // Note: LinkedIn URLs vary
      description: 'Build your professional network and share industry insights.'
    }
  }[account.platform];

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="bg-white w-full max-w-2xl rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-white sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <div className={cn("p-3 rounded-2xl", platformConfig.bg)}>
              <platformConfig.icon size={24} className={platformConfig.color} />
            </div>
            <div>
              <h3 className="font-bold text-xl">{platformConfig.name} Dashboard</h3>
              <p className="text-xs text-gray-400 font-medium">Connected as @{account.account_name}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-50 rounded-xl text-gray-400 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          <div className="bg-orange-50/50 p-6 rounded-3xl border border-orange-100 flex gap-4 items-start">
            <div className="p-2 bg-white rounded-xl text-orange-600 shadow-sm">
              <ShieldCheck size={20} />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-orange-900">Security & Integration Notice</p>
              <p className="text-xs text-orange-700 leading-relaxed">
                To protect your privacy and security, {platformConfig.name} restricts direct embedding of their full platform interface within other applications. 
                To access your full account with your active login session, please use the secure link below.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-6 bg-gray-50 rounded-3xl space-y-3">
              <h4 className="font-bold text-sm">Account Details</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] uppercase tracking-wider font-bold text-gray-400">
                  <span>Platform ID</span>
                  <span className="text-gray-900">{account.account_id}</span>
                </div>
                <div className="flex justify-between text-[10px] uppercase tracking-wider font-bold text-gray-400">
                  <span>Status</span>
                  <span className="text-green-600">Active</span>
                </div>
              </div>
            </div>
            <div className="p-6 bg-gray-50 rounded-3xl space-y-3">
              <h4 className="font-bold text-sm">Platform Info</h4>
              <p className="text-xs text-gray-500 leading-relaxed">
                {platformConfig.description}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center py-10 space-y-6 text-center">
            <div className="relative">
              <div className={cn("w-24 h-24 rounded-[2rem] flex items-center justify-center shadow-lg", platformConfig.bg)}>
                <platformConfig.icon size={48} className={platformConfig.color} />
              </div>
              <div className="absolute -bottom-2 -right-2 bg-green-500 w-6 h-6 rounded-full border-4 border-white shadow-sm" />
            </div>
            
            <div className="space-y-2">
              <h4 className="font-bold text-lg">Ready to engage?</h4>
              <p className="text-sm text-gray-400 max-w-xs mx-auto">
                Open {platformConfig.name} in a new secure tab to manage your content and interactions directly.
              </p>
            </div>

            <a 
              href={platformConfig.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className={cn(
                "flex items-center gap-2 px-8 py-4 rounded-2xl font-bold text-white shadow-lg transition-all hover:scale-105 active:scale-95",
                account.platform === 'instagram' ? "bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600" :
                account.platform === 'facebook' ? "bg-[#1877F2]" : "bg-[#0A66C2]"
              )}
            >
              <ExternalLink size={20} />
              Open {platformConfig.name}
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-gray-50 text-center">
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
            Connected via QuirkoSphere Secure OAuth 2.0
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}


