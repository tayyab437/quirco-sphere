import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Activity, Loader2, AlertCircle, Calendar, PlusCircle, Trash2, Edit2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '@/src/lib/supabase';
import { useToast } from '@/src/lib/ToastContext';
import { cn, formatDate } from '@/src/lib/utils';
import { Post } from '@/src/types';
import { AnimatePresence } from 'motion/react';

export function History() {
  const { showToast } = useToast();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'drafts' | 'scheduled' | 'published'>('all');
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
      
      setPosts(prev => prev.filter(p => p.id !== showDeleteConfirm));
      showToast('Post deleted successfully', 'info');
      setShowDeleteConfirm(null);
    } catch (err: any) {
      showToast('Failed to delete post: ' + err.message, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    async function fetchAllHistory() {
      if (!isSupabaseConfigured) {
        setLoading(false);
        return;
      }
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from('posts')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setPosts(data || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchAllHistory();
  }, []);

  const filteredPosts = posts.filter(p => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'drafts') return p.status === 'draft';
    if (activeFilter === 'scheduled') return p.status === 'scheduled';
    if (activeFilter === 'published') return p.status === 'published';
    return true;
  });

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 space-y-4">
        <Loader2 className="animate-spin text-orange-600" size={32} />
        <p className="text-gray-400 text-sm font-medium">Loading history...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col justify-center">
        <div className="bg-red-50 p-6 rounded-3xl border border-red-100 text-center space-y-3">
          <AlertCircle className="text-red-500 mx-auto" size={32} />
          <h3 className="font-bold text-red-900">Failed to load history</h3>
          <p className="text-red-600 text-sm">{error}</p>
          <button onClick={() => window.location.reload()} className="bg-red-600 text-white px-4 py-2 rounded-xl text-xs font-bold">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-8 pr-2 no-scrollbar">
      <header className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Link to="/" className="p-2 bg-white rounded-xl shadow-sm border border-gray-50 text-gray-400 hover:text-orange-600 transition-colors">
            <PlusCircle size={20} className="rotate-45" />
          </Link>
          <h2 className="text-2xl font-bold">Post History</h2>
        </div>
        
        <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100 self-start">
          {(['all', 'drafts', 'scheduled', 'published'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={cn(
                "text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-lg transition-all",
                activeFilter === filter 
                  ? "bg-white text-orange-600 shadow-sm border border-gray-100" 
                  : "text-gray-400 hover:text-gray-600"
              )}
            >
              {filter}
            </button>
          ))}
        </div>
      </header>

      <section className="space-y-4">
        {filteredPosts.length === 0 ? (
          <div className="bg-white p-12 rounded-[2.5rem] border border-dashed border-gray-200 text-center flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-300">
              <Activity size={24} />
            </div>
            <p className="text-gray-400 text-sm font-medium">No {activeFilter === 'all' ? '' : activeFilter} activity yet.</p>
            <Link to="/create" className="text-orange-600 text-xs font-bold uppercase tracking-widest mt-2 hover:underline">Create your first post</Link>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredPosts.map((post) => (
              <div key={post.id} className="bg-white p-5 rounded-[2rem] shadow-sm border border-gray-50 flex gap-5 items-center group hover:border-orange-100 transition-all">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gray-50 overflow-hidden flex-shrink-0 relative">
                  {post.media_url?.match(/\.(mp4|webm|ogg|mov)$|video/i) ? (
                    <video src={post.media_url} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                  ) : (
                    <img 
                      src={post.media_url || `https://picsum.photos/seed/${post.id}/200/200`} 
                      alt="Post" 
                      className="w-full h-full object-cover transition-transform group-hover:scale-110" 
                      referrerPolicy="no-referrer" 
                    />
                  )}
                  <div className={cn(
                    "absolute top-2 right-2 w-3 h-3 border-2 border-white rounded-full shadow-sm",
                    post.status === 'published' ? "bg-green-500" : 
                    post.status === 'error' ? "bg-red-500" : 
                    post.status === 'draft' ? "bg-gray-400" : "bg-orange-500"
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={cn(
                      "text-[9px] font-bold uppercase px-2.5 py-1 rounded-lg",
                      post.status === 'published' ? "bg-green-50 text-green-600" : 
                      post.status === 'error' ? "bg-red-50 text-red-600" : 
                      post.status === 'draft' ? "bg-gray-50 text-gray-600" : "bg-orange-50 text-orange-600"
                    )}>
                      {post.status}
                    </span>
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                      {post.status === 'published' ? 'Posted' : 
                       post.status === 'error' ? (post.error_message || 'Failed') : 
                       post.status === 'draft' ? 'Draft' : 'Scheduled'}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-gray-900 truncate mb-1">{post.content}</p>
                  <div className="flex items-center gap-2">
                    <Calendar size={12} className="text-gray-400" />
                    <span className="text-[10px] text-gray-400 font-medium">
                      {post.status === 'published' 
                        ? formatDate(post.created_at) 
                        : (post.scheduled_time ? formatDate(post.scheduled_time) : formatDate(post.created_at))}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex -space-x-2 flex-shrink-0 mb-1">
                    {post.platforms.map(p => (
                      <div key={p} className={cn(
                        "w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[7px] text-white font-bold uppercase shadow-sm",
                        p === 'facebook' ? "bg-blue-600" : p === 'instagram' ? "bg-pink-600" : "bg-blue-900"
                      )}>
                        {p[0]}
                      </div>
                    ))}
                  </div>
                  {(post.status === 'scheduled' || post.status === 'draft' || post.status === 'error') && (
                    <div className="flex gap-1">
                      <Link to={`/create?edit=${post.id}`} className="p-1.5 bg-gray-50 text-gray-400 rounded-lg hover:text-orange-600 transition-colors">
                        <Edit2 size={14} />
                      </Link>
                      <button 
                        onClick={() => setShowDeleteConfirm(post.id)} 
                        className="p-1.5 bg-red-50 text-red-400 rounded-lg hover:text-red-600 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

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
