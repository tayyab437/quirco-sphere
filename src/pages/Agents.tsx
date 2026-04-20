import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Bot, User, Sparkles, Loader2, Trash2, FileEdit, Share2, CalendarClock, BarChart3, TrendingUp, ChevronRight, MessageSquare, Plus, Copy, Check, ChevronLeft, Image as ImageIcon, Video, Search, ExternalLink, Globe, Instagram, Clock, Hash, AlertCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Papa from 'papaparse';
import { generateAIResponse } from '@/src/lib/gemini';
import { cn } from '@/src/lib/utils';
import { supabase, isSupabaseConfigured } from '@/src/lib/supabase';
import { useToast } from '@/src/lib/ToastContext';

type AgentType = 'image_architect' | 'video_visionary' | 'competitor_content';

export function Agents() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [activeAgent, setActiveAgent] = useState<AgentType | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'bot', text: string, created_at?: string }[]>([]);
  const [allHistory, setAllHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingHistory, setIsFetchingHistory] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [historySearch, setHistorySearch] = useState('');
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [videoTemplates, setVideoTemplates] = useState<any[]>([]);
  const [competitorData, setCompetitorData] = useState<any[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [competitorUrls, setCompetitorUrls] = useState<{
    id: string, 
    url: string, 
    username?: string,
    latest_video_url?: string,
    latest_video_caption?: string,
    latest_video_created_at?: string
  }[]>([]);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [newCompetitorUrl, setNewCompetitorUrl] = useState('');
  const [generatedVideoUrls, setGeneratedVideoUrls] = useState<string[]>([]);
  const [generatedImageUrls, setGeneratedImageUrls] = useState<string[]>([]);
  const [pendingGenerations, setPendingGenerations] = useState<Array<{ id: string, prompt: string, type: AgentType, status: 'loading' | 'saving' | 'error', timestamp: number }>>(() => {
    const saved = localStorage.getItem('pending_generations');
    return saved ? JSON.parse(saved) : [];
  });

  // Sync with other tabs
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'pending_generations' && e.newValue) {
        setPendingGenerations(JSON.parse(e.newValue));
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    localStorage.setItem('pending_generations', JSON.stringify(pendingGenerations));
  }, [pendingGenerations]);

  // Reconcile pending generations with actual history
  useEffect(() => {
    if (allHistory.length > 0 && pendingGenerations.some(p => p.status === 'loading' || p.status === 'saving')) {
      setPendingGenerations(prev => {
        const next = prev.filter(p => {
          // If the prompt exists in history for this agent, it's likely completed
          const isCompleted = allHistory.some(h => 
            h.agent_type === p.type && 
            h.prompt === p.prompt && 
            (Date.now() - new Date(h.created_at).getTime()) < 10 * 60 * 1000 // Within last 10 mins
          );
          return !isCompleted;
        });
        return next.length !== prev.length ? next : prev;
      });
    }
  }, [allHistory]);

  // Handle timeouts and cleanup for pending generations
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const timeoutLimit = 8 * 60 * 1000; // 8 minutes

      setPendingGenerations(prev => {
        let changed = false;
        const next = prev.map(p => {
          if ((p.status === 'loading' || p.status === 'saving') && (now - p.timestamp) > timeoutLimit) {
            changed = true;
            return { ...p, status: 'error' as const };
          }
          return p;
        });
        return changed ? next : prev;
      });
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [pendingGenerations]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [isFetchingSheets, setIsFetchingSheets] = useState(false);

  // Fetch Data with better error reporting
  const safeFetch = async (url: string, options?: RequestInit) => {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }
      return response;
    } catch (err: any) {
      console.error(`[Fetch Error] URL: ${url}`, err);
      if (err.name === 'AbortError') {
        throw new Error('Request timed out. The service might be taking too long to respond.');
      }
      if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
        throw new Error('Connection failed. The service might be offline or blocked by your browser. Please ensure the URL is correct and the service is active.');
      }
      throw err;
    }
  };

  const fetchSheetData = async (sheetId: string) => {
    setIsFetchingSheets(true);
    try {
      const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
      const response = await safeFetch(url);
      const csvText = await response.text();
      return new Promise<any[]>((resolve) => {
        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            setIsFetchingSheets(false);
            resolve(results.data);
          },
        });
      });
    } catch (error: any) {
      console.error('Error fetching sheet data:', error);
      setIsFetchingSheets(false);
      showToast(`Sheet Error: ${error.message}`, 'error');
      return [];
    }
  };

  useEffect(() => {
    if (activeAgent === 'video_visionary') {
      fetchSheetData('1i9KBHq8l6q4zWE9lR9TUHhCF8WYnMcghgB1xnIQzHh0').then(setVideoTemplates);
    } else if (activeAgent === 'competitor_content') {
      fetchSheetData('154p3qrP7iJkHIRob60GLUNWNxxIhQSgkp0GBcdN17UE').then(setCompetitorData);
      fetchCompetitorUrls();
    }
  }, [activeAgent]);

  const fetchCompetitorUrls = async () => {
    if (!isSupabaseConfigured) return;
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      
      const user = session?.user;
      if (!user) return;

      const { data, error } = await supabase
        .from('competitor_urls')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Silent database error during background fetch:', error.message);
        return;
      }
      setCompetitorUrls(data || []);
    } catch (error: any) {
      // Keep background fetches silent unless they are fatal
      console.warn('Background fetch for competitor URLs failed:', error.message);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newFiles = Array.from(files);
      const newImages = newFiles.map((file: File) => URL.createObjectURL(file));
      setUploadedImages(prev => [...prev, ...newImages]);
      setUploadedFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const addCompetitorUrl = async () => {
    if (!newCompetitorUrl.trim() || isLoading) return;
    
    let urlToAdd = newCompetitorUrl.trim();
    
    // Remove query params and trailing slashes
    urlToAdd = urlToAdd.split('?')[0].replace(/\/$/, '');

    // Instagram URL Validation & Trimming
    // Matches: https://www.instagram.com/username/post/abc -> https://www.instagram.com/username
    const instagramRegex = /^(https?:\/\/)?(www\.)?instagram\.com\/([a-zA-Z0-9._]+)(\/.*)?$/;
    const match = urlToAdd.match(instagramRegex);
    
    // Check for reserved Instagram paths that aren't usernames
    const reservedPaths = ['reels', 'p', 'stories', 'explore', 'direct', 'tv'];
    
    if (!match || reservedPaths.includes(match[3].toLowerCase())) {
      const errorMsg = 'Please enter a valid Instagram profile URL (e.g., instagram.com/name)';
      setUrlError(errorMsg);
      showToast(errorMsg, 'error');
      setTimeout(() => setUrlError(null), 5000);
      return;
    }

    const username = match[3];
    // Reconstruct clean profile URL
    urlToAdd = `https://www.instagram.com/${username}/`;

    // Duplicate Check
    const isDuplicate = competitorUrls.some(c => 
      c.url.toLowerCase().replace(/\/$/, '') === urlToAdd.toLowerCase().replace(/\/$/, '') ||
      c.username?.toLowerCase() === username.toLowerCase()
    );

    if (isDuplicate) {
      const errorMsg = `You are already tracking @${username}`;
      setUrlError(errorMsg);
      showToast(errorMsg, 'info');
      setTimeout(() => setUrlError(null), 5000);
      return;
    }

    setUrlError(null);
    setIsLoading(true);

    try {
      if (!window.navigator.onLine) {
        throw new Error('You seem to be offline. Please check your internet connection.');
      }

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw new Error(`Auth Error: ${sessionError.message}`);
      
      const user = session?.user;
      if (!user) throw new Error('User not authenticated - please sign in again');

      // Save to database
      const { data, error } = await supabase
        .from('competitor_urls')
        .insert({
          user_id: user.id,
          url: urlToAdd,
          username: username
        })
        .select()
        .single();

      if (error) {
        console.error('Database insertion error:', error);
        throw new Error(`Database error: ${error.message}. Please verify the 'competitor_urls' table exists in Supabase.`);
      }

      // Trigger webhook (non-blocking, handle failure gracefully)
      try {
        fetch('https://unlicentiated-earline-accordingly.ngrok-free.dev/webhook/add-competitors', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: urlToAdd,
            userId: user.id,
            timestamp: new Date().toISOString()
          }),
        }).catch(err => {
          console.warn('[Webhook] Background trigger failed (likely tunnel offline or invalid URL):', err.message);
        });
      } catch (webhookErr) {
        console.warn('[Webhook] Sync trigger error:', webhookErr);
      }

      setCompetitorUrls(prev => [data, ...prev]);
      setNewCompetitorUrl('');
      
      // Inline success for the form
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      
      // Global toast for confirmation
      showToast('Competitor added to monitoring', 'success');
    } catch (error: any) {
      const isNetworkError = 
        error.message?.toLowerCase().includes('fetch') || 
        error.name === 'TypeError' || 
        error.message?.toLowerCase().includes('network') ||
        error.message?.toLowerCase().includes('connection');

      const errorMsg = isNetworkError 
        ? 'Network error: Could not reach the server. Please check your internet connection and verify your Supabase project is active.' 
        : (error.message || 'An unexpected error occurred. Please try again.');

      if (isNetworkError) {
        console.error('[AddCompetitor] Network failure prevented saving to Supabase. Check connectivity.');
      } else {
        console.error('Error adding competitor:', error);
      }

      setUrlError(errorMsg);
      setTimeout(() => setUrlError(null), 8000);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteCompetitorUrl = async (id: string) => {
    try {
      const { error } = await supabase
        .from('competitor_urls')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setCompetitorUrls(prev => prev.filter(item => item.id !== id));
      showToast('Competitor removed from monitoring', 'info');
    } catch (error) {
      console.error('Error deleting competitor URL:', error);
      showToast('Failed to remove competitor', 'error');
    }
  };

  const agents = [
    { id: 'image_architect', name: 'Image Architect', desc: 'Generate & refine visual content', icon: ImageIcon, color: 'text-blue-500', bg: 'bg-blue-50' },
    { id: 'video_visionary', name: 'Video Visionary', desc: 'Video templates & creation', icon: Video, color: 'text-amber-500', bg: 'bg-amber-50' },
    { id: 'competitor_content', name: 'Competitor Content', desc: 'Track & analyze competitor posts', icon: Search, color: 'text-emerald-500', bg: 'bg-emerald-50' },
  ];

  const currentAgent = activeAgent ? agents.find(a => a.id === activeAgent)! : null;

  useEffect(() => {
    async function fetchHistory() {
      if (!isSupabaseConfigured || !activeAgent) {
        setIsFetchingHistory(false);
        return;
      }
      setIsFetchingHistory(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return;

        const { data, error } = await supabase
          .from('ai_chats')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;

        setAllHistory(data || []);
        
        if (activeSessionId) {
          const sessionHistory = data
            .filter(chat => chat.session_id === activeSessionId)
            .reverse()
            .flatMap(chat => [
              { role: 'user' as const, text: chat.prompt, created_at: chat.created_at },
              { role: 'bot' as const, text: chat.response, created_at: chat.created_at }
            ]);
          setMessages(sessionHistory);
        } else {
          // If no active session, maybe show the latest session for this agent?
          // For now, let's just clear messages if no session is active
          setMessages([]);
        }
      } catch (e) {
        console.error('Error fetching history:', e);
      } finally {
        setIsFetchingHistory(false);
      }
    }

    fetchHistory();
  }, [activeAgent, activeSessionId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || !activeAgent) return;
    
    const userMsg = input;
    const currentFiles = [...uploadedFiles];
    const currentAgent = activeAgent;
    const currentSessionId = activeSessionId;
    const now = new Date().toISOString();
    
    // Reset inputs immediately for next generation
    setInput('');
    setUploadedImages([]);
    setUploadedFiles([]);
    setSelectedTemplate(null);
    setMessages(prev => [...prev, { role: 'user', text: userMsg, created_at: now }]);
    
    const generationId = Math.random().toString(36).substring(2, 15);
    setPendingGenerations(prev => [...prev, { id: generationId, prompt: userMsg, type: currentAgent, status: 'loading', timestamp: Date.now() }]);

    // Background generation
    const performGeneration = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) throw new Error('User not authenticated');

        // Pre-upload images if any
        const imageUrls: string[] = [];
        if (currentFiles.length > 0) {
          setPendingGenerations(prev => prev.map(p => p.id === generationId ? { ...p, status: 'saving' } : p));
          for (const file of currentFiles) {
            const fileName = `${user.id}/temp/${Date.now()}-${file.name}`;
            const { error: uploadError } = await supabase.storage
              .from('posts')
              .upload(fileName, file);
            
            if (!uploadError) {
              const { data: { publicUrl } } = supabase.storage.from('posts').getPublicUrl(fileName);
              imageUrls.push(publicUrl);
            }
          }
          setPendingGenerations(prev => prev.map(p => p.id === generationId ? { ...p, status: 'loading' } : p));
        }

        if (currentAgent === 'video_visionary') {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8 * 60 * 1000); // 8 minutes

          try {
            const response = await safeFetch('https://unlicentiated-earline-accordingly.ngrok-free.dev/webhook/video', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                prompt: userMsg,
                userId: user.id,
                images: imageUrls,
                timestamp: new Date().toISOString()
              }),
              signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) throw new Error('Failed to generate video');

            setPendingGenerations(prev => prev.map(p => p.id === generationId ? { ...p, status: 'saving' } : p));
            const blob = await response.blob();
            
            // Upload to Supabase Storage for persistence
            const fileName = `${user.id}/generated/${Date.now()}-video.mp4`;
            const { error: uploadError } = await supabase.storage
              .from('posts')
              .upload(fileName, blob);
            
            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage.from('posts').getPublicUrl(fileName);
            
            // Save to ai_chats for history persistence
            const { data: newChat, error: chatError } = await supabase.from('ai_chats').insert({
              user_id: user.id,
              agent_type: 'video_visionary',
              session_id: currentSessionId || crypto.randomUUID(),
              prompt: userMsg,
              response: publicUrl
            }).select().single();

            if (chatError) throw chatError;
            if (newChat) setAllHistory(prev => [newChat, ...prev]);

            setPendingGenerations(prev => prev.filter(p => p.id !== generationId));
            
            const botNow = new Date().toISOString();
            setMessages(prev => [...prev, { role: 'bot', text: 'Video generated successfully! You can now preview it below.', created_at: botNow }]);
          } catch (fetchError: any) {
            setPendingGenerations(prev => prev.map(p => p.id === generationId ? { ...p, status: 'error' } : p));
            if (fetchError.name === 'AbortError') {
              throw new Error('Video generation timed out after 8 minutes. Please try again with a simpler prompt.');
            }
            throw fetchError;
          }
        } else if (currentAgent === 'image_architect') {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8 * 60 * 1000); // 8 minutes

          try {
            const response = await safeFetch('https://unlicentiated-earline-accordingly.ngrok-free.dev/webhook/image', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                prompt: userMsg,
                userId: user.id,
                images: imageUrls,
                timestamp: new Date().toISOString()
              }),
              signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) throw new Error('Failed to generate image');

            setPendingGenerations(prev => prev.map(p => p.id === generationId ? { ...p, status: 'saving' } : p));
            const blob = await response.blob();
            
            // Upload to Supabase Storage
            const fileName = `${user.id}/generated/${Date.now()}-image.jpg`;
            const { error: uploadError } = await supabase.storage
              .from('posts')
              .upload(fileName, blob);
            
            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage.from('posts').getPublicUrl(fileName);

            // Save to ai_chats
            const { data: newChat, error: chatError } = await supabase.from('ai_chats').insert({
              user_id: user.id,
              agent_type: 'image_architect',
              session_id: currentSessionId || crypto.randomUUID(),
              prompt: userMsg,
              response: publicUrl
            }).select().single();

            if (chatError) throw chatError;
            if (newChat) setAllHistory(prev => [newChat, ...prev]);

            setPendingGenerations(prev => prev.filter(p => p.id !== generationId));
            
            const botNow = new Date().toISOString();
            setMessages(prev => [...prev, { role: 'bot', text: 'Image generated successfully! You can now preview it below.', created_at: botNow }]);
          } catch (fetchError: any) {
            setPendingGenerations(prev => prev.map(p => p.id === generationId ? { ...p, status: 'error' } : p));
            if (fetchError.name === 'AbortError') {
              throw new Error('Image generation timed out after 8 minutes. Please try again with a simpler prompt.');
            }
            throw fetchError;
          }
        } else {
          setIsLoading(true);
          try {
            // Use history for context
            const historyContext = messages.map(m => ({ role: m.role, text: m.text }));
            const res = await generateAIResponse(currentAgent, userMsg, historyContext);
            const botMsg = res || 'I am sorry, I could not generate a response.';
            
            const botNow = new Date().toISOString();
            setMessages(prev => [...prev, { role: 'bot', text: botMsg, created_at: botNow }]);

            // Save to Supabase
            const sessionId = currentSessionId || crypto.randomUUID();
            if (!currentSessionId) setActiveSessionId(sessionId);

            const { data: newChat, error } = await supabase.from('ai_chats').insert({
              user_id: user.id,
              agent_type: currentAgent,
              session_id: sessionId,
              prompt: userMsg,
              response: botMsg
            }).select().single();

            if (!error && newChat) {
              setAllHistory(prev => [newChat, ...prev]);
            }
            setPendingGenerations(prev => prev.filter(p => p.id !== generationId));
          } finally {
            setIsLoading(false);
          }
        }
      } catch (e: any) {
        console.error(e);
        setMessages(prev => [...prev, { role: 'bot', text: e.message || 'Error connecting to AI. Please try again.' }]);
        setPendingGenerations(prev => prev.map(p => p.id === generationId ? { ...p, status: 'error' } : p));
      }
    };

    performGeneration();
  };

  const startNewChat = () => {
    setActiveSessionId(null);
    setMessages([]);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    showToast('Copied to clipboard', 'success');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const deleteHistoryItem = async (id: string) => {
    if (!confirm('Are you sure you want to delete this conversation?')) return;
    try {
      const { error } = await supabase.from('ai_chats').delete().eq('id', id);
      if (error) throw error;
      
      setAllHistory(prev => prev.filter(chat => chat.id !== id));
      showToast('Conversation deleted', 'info');
    } catch (e) {
      console.error('Error deleting history item:', e);
      showToast('Failed to delete conversation', 'error');
    }
  };

  const clearHistory = async () => {
    if (!confirm('Are you sure you want to clear chat history for this agent?') || !activeAgent) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from('ai_chats').delete().eq('user_id', user.id).eq('agent_type', activeAgent);
      setMessages([]);
      showToast('Chat history cleared', 'success');
    } catch (e) {
      console.error(e);
      showToast('Failed to clear history', 'error');
    }
  };

  const renderImageArchitect = () => {
    const history = allHistory.filter(h => h.agent_type === 'image_architect');
    const pending = pendingGenerations.filter(p => p.type === 'image_architect');

    return (
      <div className="flex-1 flex flex-col p-8 overflow-y-auto max-w-4xl mx-auto w-full space-y-8 min-h-0">
        <div className="space-y-2">
          <h3 className="text-2xl font-bold text-gray-900">Image Architect</h3>
          <p className="text-gray-500">Upload images and provide a prompt to generate or refine your visuals.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <label className="block text-sm font-bold text-gray-700 uppercase tracking-widest">Upload Images</label>
            <div className="relative border-2 border-dashed border-gray-200 rounded-[2rem] p-8 flex flex-col items-center justify-center gap-4 bg-gray-50/50 hover:bg-gray-50 transition-all group">
              <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-gray-400 group-hover:text-blue-500 shadow-sm transition-all">
                <ImageIcon size={24} />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-gray-900">Click to upload or drag and drop</p>
                <p className="text-xs text-gray-400 mt-1">PNG, JPG, WEBP up to 10MB</p>
              </div>
              <input type="file" multiple onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
            </div>

            {uploadedImages.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                {uploadedImages.map((img, i) => (
                  <div key={i} className="relative group aspect-square rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
                    <img src={img} alt="Uploaded" className="w-full h-full object-cover" />
                    <button 
                      onClick={() => removeImage(i)}
                      className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <label className="block text-sm font-bold text-gray-700 uppercase tracking-widest">Prompt</label>
            <textarea 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe what you want to create or change..."
              className="w-full h-48 bg-gray-50 border border-gray-100 rounded-[2rem] p-6 text-sm focus:ring-4 focus:ring-blue-50 focus:border-blue-200 outline-none transition-all resize-none shadow-inner"
            />
            <button 
              onClick={handleSend}
              className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold uppercase tracking-widest shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
            >
              <Sparkles size={20} />
              Generate Visuals
            </button>
          </div>
        </div>

        {(history.length > 0 || pending.length > 0) && (
          <div className="space-y-6 pt-8 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-bold text-gray-900">Generation History</h4>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{history.length + pending.length} Items</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {pending.map((p) => (
                <div key={p.id} className={cn(
                  "p-6 rounded-[2rem] border shadow-sm flex flex-col items-center justify-center gap-4 aspect-square transition-all",
                  p.status === 'error' ? "bg-red-50 border-red-100" : "bg-gray-50 border-gray-100"
                )}>
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm",
                    p.status === 'error' ? "bg-white text-red-500" : "bg-white text-blue-600"
                  )}>
                    {p.status === 'error' ? <AlertCircle size={24} /> : <Loader2 className="animate-spin" size={24} />}
                  </div>
                  <div className="text-center space-y-1">
                    <p className={cn(
                      "text-xs font-bold uppercase tracking-widest",
                      p.status === 'error' ? "text-red-900" : "text-gray-900"
                    )}>
                      {p.status === 'error' ? 'Generation Failed' : p.status === 'saving' ? 'Saving to Cloud...' : 'Generating...'}
                    </p>
                    <p className="text-[10px] text-gray-400 line-clamp-2 px-4">{p.prompt}</p>
                    {p.status === 'error' && (
                      <button 
                        onClick={() => setPendingGenerations(prev => prev.filter(pg => pg.id !== p.id))}
                        className="mt-2 text-[8px] font-bold uppercase tracking-widest text-red-500 hover:underline"
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {history.map((chat) => (
                <motion.div 
                  key={chat.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-4 bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      {new Date(chat.created_at).toLocaleDateString()}
                    </span>
                    <button 
                      onClick={() => deleteHistoryItem(chat.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="aspect-square rounded-xl overflow-hidden bg-gray-100 shadow-inner relative">
                    <img src={chat.response} alt="Generated" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-4">
                      <p className="text-white text-[10px] font-medium text-center line-clamp-4">{chat.prompt}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] text-gray-500 line-clamp-2 italic">"{chat.prompt}"</p>
                    <button 
                      onClick={() => navigate(`/create?image=${encodeURIComponent(chat.response)}`)}
                      className="w-full py-2.5 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all flex items-center justify-center gap-2"
                    >
                      <Share2 size={12} />
                      Post
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderVideoVisionary = () => {
    const history = allHistory.filter(h => h.agent_type === 'video_visionary');
    const pending = pendingGenerations.filter(p => p.type === 'video_visionary');

    return (
      <div className="flex-1 flex flex-col p-8 overflow-y-auto max-w-4xl mx-auto w-full space-y-8 min-h-0">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h3 className="text-2xl font-bold text-gray-900">Video Visionary</h3>
            <p className="text-gray-500">Create stunning videos from images and templates.</p>
          </div>
          <button 
            onClick={() => setShowTemplates(!showTemplates)}
            className="px-6 py-3 bg-white border border-gray-100 rounded-xl text-xs font-bold uppercase tracking-widest text-gray-600 hover:bg-orange-50 hover:text-orange-600 transition-all shadow-sm flex items-center gap-2"
          >
            <Globe size={16} />
            {showTemplates ? 'Back to Editor' : 'Browse Templates'}
          </button>
        </div>

        {showTemplates ? (
          isFetchingSheets ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <Loader2 className="animate-spin text-orange-600" size={32} />
              <p className="text-gray-400 font-medium">Loading templates...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {videoTemplates.map((template, i) => (
                <div key={i} className="bg-white rounded-[2rem] border border-gray-100 overflow-hidden shadow-sm hover:shadow-xl transition-all group">
                  <div className="aspect-video bg-gray-900 relative flex items-center justify-center overflow-hidden">
                    {template.url ? (
                      <video src={template.url} className="w-full h-full object-cover" controls />
                    ) : (
                      <div className="text-gray-500 flex flex-col items-center gap-2">
                        <Video size={48} />
                        <span className="text-xs font-bold uppercase tracking-widest">No Preview</span>
                      </div>
                    )}
                  </div>
                  <div className="p-6">
                    <h4 className="font-bold text-gray-900">{template.name || 'Untitled Template'}</h4>
                    <p className="text-xs text-gray-400 mt-1 truncate">{template.url}</p>
                    <button 
                      onClick={() => {
                        setSelectedTemplate(template.name);
                        setInput(template.name);
                        setShowTemplates(false);
                      }}
                      className="w-full mt-4 py-3 bg-gray-50 text-gray-600 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-orange-600 hover:text-white transition-all"
                    >
                      Use Template
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="space-y-4">
                  <label className="block text-sm font-bold text-gray-700 uppercase tracking-widest">Reference Image</label>
                  <div className="relative border-2 border-dashed border-gray-200 rounded-[2rem] p-8 flex flex-col items-center justify-center gap-4 bg-gray-50/50 hover:bg-gray-50 transition-all group">
                    <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-gray-400 group-hover:text-amber-500 shadow-sm transition-all">
                      <ImageIcon size={24} />
                    </div>
                    <p className="text-sm font-bold text-gray-900">Upload keyframe image</p>
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                  </div>
                  {uploadedImages.length > 0 && (
                    <div className="relative aspect-video rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
                      <img src={uploadedImages[0]} alt="Keyframe" className="w-full h-full object-cover" />
                      <button 
                        onClick={() => removeImage(0)}
                        className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-bold text-gray-700 uppercase tracking-widest">Video Prompt</label>
                  {selectedTemplate && (
                    <button 
                      onClick={() => {
                        setSelectedTemplate(null);
                        setInput('');
                      }}
                      className="text-[10px] font-bold uppercase tracking-widest text-red-500 hover:underline"
                    >
                      Clear Template
                    </button>
                  )}
                </div>
                <textarea 
                  value={input}
                  onChange={(e) => !selectedTemplate && setInput(e.target.value)}
                  readOnly={!!selectedTemplate}
                  placeholder={selectedTemplate ? "" : "Describe the motion and style..."}
                  className={cn(
                    "w-full h-48 border border-gray-100 rounded-[2rem] p-6 text-sm focus:ring-4 outline-none transition-all resize-none shadow-inner",
                    selectedTemplate ? "bg-amber-50/50 border-amber-200 text-amber-900 font-medium" : "bg-gray-50 focus:ring-amber-50 focus:border-amber-200"
                  )}
                />
                <button 
                  onClick={handleSend}
                  className="w-full py-4 bg-[#fc5215] text-white rounded-2xl font-bold uppercase tracking-widest shadow-lg shadow-orange-100 hover:opacity-90 transition-all flex items-center justify-center gap-2"
                >
                  <Video size={20} />
                  Generate Video
                </button>
              </div>
            </div>
          </div>
        )}

        {(history.length > 0 || pending.length > 0) && (
          <div className="space-y-6 pt-8 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-bold text-gray-900">Generation History</h4>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{history.length + pending.length} Items</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {pending.map((p) => (
                <div key={p.id} className={cn(
                  "p-6 rounded-[2rem] border shadow-sm flex flex-col items-center justify-center gap-4 aspect-video transition-all",
                  p.status === 'error' ? "bg-red-50 border-red-100" : "bg-gray-50 border-gray-100"
                )}>
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm",
                    p.status === 'error' ? "bg-white text-red-500" : "bg-white text-amber-600"
                  )}>
                    {p.status === 'error' ? <AlertCircle size={24} /> : <Loader2 className="animate-spin" size={24} />}
                  </div>
                  <div className="text-center space-y-1">
                    <p className={cn(
                      "text-xs font-bold uppercase tracking-widest",
                      p.status === 'error' ? "text-red-900" : "text-gray-900"
                    )}>
                      {p.status === 'error' ? 'Generation Failed' : p.status === 'saving' ? 'Saving to Cloud...' : 'Creating Magic...'}
                    </p>
                    <p className="text-[10px] text-gray-400 line-clamp-2 px-4">{p.prompt}</p>
                    {p.status === 'error' && (
                      <button 
                        onClick={() => setPendingGenerations(prev => prev.filter(pg => pg.id !== p.id))}
                        className="mt-2 text-[8px] font-bold uppercase tracking-widest text-red-500 hover:underline"
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {history.map((chat) => (
                <motion.div 
                  key={chat.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-4 bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      {new Date(chat.created_at).toLocaleDateString()}
                    </span>
                    <button 
                      onClick={() => deleteHistoryItem(chat.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="aspect-video rounded-xl overflow-hidden bg-gray-900 shadow-inner relative">
                    <video src={chat.response} className="w-full h-full object-contain" controls />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-4 pointer-events-none">
                      <p className="text-white text-[10px] font-medium text-center line-clamp-4">{chat.prompt}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] text-gray-500 line-clamp-2 italic">"{chat.prompt}"</p>
                    <button 
                      onClick={() => navigate(`/create?video=${encodeURIComponent(chat.response)}`)}
                      className="w-full py-2.5 bg-orange-50 text-orange-600 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-orange-600 hover:text-white transition-all flex items-center justify-center gap-2"
                    >
                      <Share2 size={12} />
                      Post
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderCompetitorContent = () => (
    <div className="flex-1 flex flex-col p-8 overflow-y-auto max-w-6xl mx-auto w-full space-y-8 min-h-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <h3 className="text-2xl font-bold text-gray-900">Competitor Content</h3>
          <p className="text-gray-500">Monitor and analyze your competitors' latest activity.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <input 
              type="text"
              value={newCompetitorUrl}
              onChange={(e) => {
                setNewCompetitorUrl(e.target.value);
                if (urlError) setUrlError(null);
                if (showSuccess) setShowSuccess(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addCompetitorUrl();
              }}
              placeholder="Add Instagram profile URL..."
              className={cn(
                "w-full px-4 py-3 bg-gray-50 border rounded-xl text-sm outline-none transition-all",
                urlError ? "border-red-300 focus:ring-red-100" : 
                showSuccess ? "border-emerald-300 focus:ring-emerald-100 placeholder:text-emerald-300" :
                "border-gray-100 focus:ring-emerald-100"
              )}
            />
            <AnimatePresence>
              {urlError && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute -bottom-10 left-0 right-0 bg-red-600 text-white p-2 rounded-lg text-[10px] font-bold z-10 flex items-center gap-2 shadow-lg"
                >
                  <AlertCircle size={12} />
                  {urlError}
                </motion.div>
              )}
              {showSuccess && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute -bottom-10 left-0 right-0 bg-emerald-600 text-white p-2 rounded-lg text-[10px] font-bold z-10 flex items-center gap-2 shadow-lg"
                >
                  <Check size={12} />
                  Profile added successfully!
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={addCompetitorUrl}
            disabled={isLoading || !newCompetitorUrl.trim()}
            className={cn(
              "p-3 rounded-xl transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed",
              showSuccess ? "bg-emerald-500 text-white shadow-emerald-100" : "bg-emerald-600 text-white shadow-emerald-100 hover:bg-emerald-700"
            )}
          >
            {isLoading ? <Loader2 className="animate-spin" size={20} /> : showSuccess ? <Check size={20} /> : <Plus size={20} />}
          </motion.button>
        </div>
      </div>

      {competitorUrls.length > 0 && (
        <div className="space-y-6">
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1">Tracked Competitors</h4>
            <div className="flex flex-wrap gap-2">
              <AnimatePresence mode="popLayout">
                {competitorUrls.map((item) => (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    key={item.id}
                    className="flex items-center gap-2 bg-white border border-gray-100 px-4 py-2 rounded-xl shadow-sm group hover:border-emerald-200 hover:shadow-md transition-all cursor-default"
                  >
                    <Instagram size={14} className="text-emerald-500" />
                    <span className="text-xs font-bold text-gray-700 truncate max-w-[200px]">
                      @{item.username || item.url.replace(/^(https?:\/\/)?(www\.)?instagram\.com\//, '').replace(/\/$/, '')}
                    </span>
                    <button 
                      onClick={() => deleteCompetitorUrl(item.id)}
                      className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                      title="Remove monitoring"
                    >
                      <X size={14} />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {competitorUrls.filter(u => u.latest_video_url).map((item) => (
              <div key={item.id} className="bg-white rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-sm hover:shadow-2xl transition-all group flex flex-col">
                <div className="aspect-[4/5] bg-gray-900 relative overflow-hidden group-hover:scale-[1.02] transition-transform duration-500">
                  <video 
                    src={item.latest_video_url} 
                    className="w-full h-full object-cover" 
                    controls 
                    poster="https://picsum.photos/seed/placeholder/800/1000"
                  />
                  <div className="absolute top-4 left-4 flex items-center gap-2 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full shadow-lg border border-white/20">
                    <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 flex items-center justify-center">
                      <Instagram size={10} className="text-white" />
                    </div>
                    <span className="text-[10px] font-bold text-gray-900 truncate">
                      @{item.username || item.url.replace(/^(https?:\/\/)?(www\.)?instagram\.com\//, '').replace(/\/$/, '')}
                    </span>
                  </div>
                  <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-lg text-[8px] font-bold text-white uppercase tracking-widest border border-white/10">
                    Latest Activity
                  </div>
                </div>
                
                <div className="p-6 flex-1 flex flex-col gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2 text-gray-400">
                      <Clock size={12} strokeWidth={2.5} />
                      <span className="text-[10px] font-bold uppercase tracking-widest">
                        {item.latest_video_created_at 
                          ? new Date(item.latest_video_created_at).toLocaleDateString(undefined, { 
                              month: 'short', 
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            }) 
                          : 'Recent'}
                      </span>
                    </div>
                    {item.latest_video_caption ? (
                      <p className="text-sm text-gray-700 leading-relaxed line-clamp-3 font-medium">
                        {item.latest_video_caption}
                      </p>
                    ) : (
                      <p className="text-sm text-gray-300 italic font-medium">No caption available</p>
                    )}
                  </div>
                  
                  <div className="pt-4 border-t border-gray-50 flex items-center justify-between">
                    <div className="flex -space-x-2">
                       {/* Simplified social proof indicators */}
                       <div className="w-6 h-6 rounded-full border-2 border-white bg-blue-50 flex items-center justify-center">
                         <TrendingUp size={10} className="text-blue-600" />
                       </div>
                       <div className="w-6 h-6 rounded-full border-2 border-white bg-emerald-50 flex items-center justify-center">
                         <BarChart3 size={10} className="text-emerald-600" />
                       </div>
                    </div>
                    <a 
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-bold text-orange-600 uppercase tracking-widest hover:translate-x-1 transition-transform flex items-center gap-1"
                    >
                      View Profile
                      <ChevronRight size={14} />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isFetchingSheets ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <Loader2 className="animate-spin text-emerald-600" size={32} />
          <p className="text-gray-400 font-medium">Fetching competitor data...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {competitorData.map((item, i) => (
            <div key={i} className="bg-white rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-sm hover:shadow-xl transition-all group flex flex-col">
              <div className="aspect-square bg-gray-900 relative overflow-hidden">
                {item['latest post link'] ? (
                  <video src={item['latest post link']} className="w-full h-full object-cover" controls />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-300">
                    <Video size={64} />
                  </div>
                )}
                <div className="absolute top-4 left-4 flex items-center gap-2 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm">
                  <Instagram size={14} className="text-pink-600" />
                  <span className="text-[10px] font-bold text-gray-900">@{item.username || 'unknown'}</span>
                </div>
              </div>
              
              <div className="p-6 flex-1 flex flex-col gap-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-bold text-gray-900 text-lg">{item.Name || 'Competitor'}</h4>
                    <div className="flex items-center gap-2 text-gray-400 mt-1">
                      <Clock size={12} />
                      <span className="text-[10px] font-medium">{item['created time'] || 'Recently'}</span>
                    </div>
                  </div>
                  <a 
                    href={item['instagram link']} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="p-2 bg-gray-50 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                  >
                    <ExternalLink size={18} />
                  </a>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-auto">
                  <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100">
                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Row</p>
                    <p className="text-sm font-bold text-gray-900">#{item.row_number || '-'}</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100">
                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Platform</p>
                    <p className="text-sm font-bold text-gray-900">Instagram</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Group history by session_id for the sidebar
  const sessions = allHistory.reduce((acc: any[], chat) => {
    if (!acc.find(s => s.session_id === chat.session_id)) {
      acc.push(chat);
    }
    return acc;
  }, []).slice(0, 10);

  return (
    <div className="flex-1 flex bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden min-h-0 relative">
      {/* Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="absolute inset-0 bg-black/5 backdrop-blur-[2px] z-20"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ x: sidebarOpen ? 0 : -280 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className={cn(
          "absolute inset-y-0 left-0 z-30 w-[280px] border-r border-gray-100 bg-white flex flex-col min-h-0 shadow-2xl transition-shadow duration-300",
          !sidebarOpen && "shadow-none"
        )}
      >
        <div className="p-6 flex flex-col gap-6 h-full">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm uppercase tracking-widest text-gray-400">AI Assistants</h2>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2">Specialists</p>
            <div className="space-y-1">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => {
                    setActiveAgent(agent.id as AgentType);
                    setActiveSessionId(null);
                    setMessages([]);
                    setSidebarOpen(false);
                  }}
                  className={cn(
                    "w-full p-3 rounded-2xl text-left transition-all flex items-center gap-3 group",
                    activeAgent === agent.id && !activeSessionId
                      ? "bg-white border-orange-100 shadow-sm ring-1 ring-orange-100/50" 
                      : "hover:bg-white/50 border border-transparent"
                  )}
                >
                  <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0", agent.bg)}>
                    <agent.icon className={agent.color} size={16} />
                  </div>
                  <span className={cn(
                    "text-xs font-bold transition-colors",
                    activeAgent === agent.id && !activeSessionId ? "text-gray-900" : "text-gray-500 group-hover:text-gray-700"
                  )}>
                    {agent.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0 space-y-2">
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-1">
              {isFetchingHistory ? (
                <div className="p-4 flex justify-center">
                  <Loader2 className="animate-spin text-gray-300" size={16} />
                </div>
              ) : sessions.length === 0 ? (
                null
              ) : (
                sessions.map((session) => {
                  const agent = agents.find(a => a.id === session.agent_type);
                  return (
                    <button
                      key={session.session_id}
                      onClick={() => {
                        setActiveAgent(session.agent_type);
                        setActiveSessionId(session.session_id);
                        setSidebarOpen(false);
                      }}
                      className={cn(
                        "w-full p-3 rounded-2xl text-left transition-all flex flex-col gap-1 group border",
                        activeSessionId === session.session_id
                          ? "bg-white border-orange-100 shadow-sm ring-1 ring-orange-100/50" 
                          : "bg-transparent border-transparent hover:bg-white/50"
                      )}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2 min-w-0">
                          {agent && <agent.icon className={cn("shrink-0", agent.color)} size={12} />}
                          <span className="text-[10px] font-bold text-gray-900 truncate">
                            {session.prompt}
                          </span>
                        </div>
                      </div>
                      <span className="text-[8px] text-gray-400 font-medium px-5">
                        {new Date(session.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0 bg-white relative">
        {/* Sidebar Toggle (Floating) */}
        <button 
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className={cn(
            "absolute left-4 top-4 z-40 p-2 bg-white rounded-xl shadow-md border border-gray-100 text-gray-400 hover:text-orange-600 transition-all",
            sidebarOpen ? "left-[296px]" : "left-4"
          )}
        >
          <ChevronRight size={18} className={cn("transition-transform duration-300", sidebarOpen ? "rotate-180" : "")} />
        </button>

        {!activeAgent ? (
          <div className="flex-1 flex flex-col p-8 sm:p-12 overflow-y-auto no-scrollbar">
            <header className="max-w-2xl mb-12">
              <h2 className="text-4xl font-bold tracking-tight text-gray-900 mb-4">Choose your expert</h2>
              <p className="text-gray-500 text-lg leading-relaxed">
                Our specialized AI agents are trained on millions of social media interactions to help you grow your brand with precision.
              </p>
            </header>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {agents.map((agent) => (
                <motion.button
                  key={agent.id}
                  whileHover={{ y: -8, shadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)" }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setActiveAgent(agent.id as AgentType)}
                  className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm transition-all text-left flex flex-col gap-6 group relative overflow-hidden"
                >
                  <div className={cn("w-16 h-16 rounded-[1.5rem] flex items-center justify-center shadow-inner relative z-10 transition-transform group-hover:scale-110", agent.bg)}>
                    <agent.icon className={agent.color} size={32} />
                  </div>
                  
                  <div className="space-y-2 relative z-10">
                    <h3 className="font-bold text-xl text-gray-900">{agent.name}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{agent.desc}</p>
                  </div>

                  <div className="flex items-center justify-between mt-auto relative z-10">
                    <div className="flex items-center gap-2">
                      <span className="flex h-2 w-2 rounded-full bg-green-500" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Ready</span>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-orange-600 group-hover:text-white transition-all">
                      <ChevronRight size={20} />
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>

            <section className="mt-12 bg-gray-900 rounded-[3rem] p-10 flex flex-col sm:flex-row items-center gap-10 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-orange-600/20 rounded-full -mr-32 -mt-32 blur-3xl" />
              <div className="w-24 h-24 rounded-[2rem] bg-white/10 backdrop-blur-md flex items-center justify-center text-orange-500 shadow-xl shrink-0 border border-white/10">
                <Sparkles size={48} />
              </div>
              <div className="space-y-3 text-center sm:text-left relative z-10">
                <h3 className="font-bold text-2xl text-white">Advanced Intelligence</h3>
                <p className="text-gray-400 text-base leading-relaxed max-w-xl">
                  QuirkoSphere agents leverage the latest Gemini models to provide deep insights, creative copy, and data-driven strategies tailored to your unique audience.
                </p>
              </div>
            </section>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Agent Header */}
            <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4 ml-12 sm:ml-0">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shadow-sm shrink-0", currentAgent.bg)}>
                  <currentAgent.icon className={currentAgent.color} size={20} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">{currentAgent.name}</h2>
                  <div className="flex items-center gap-2">
                    <span className="flex h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Active Session</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Custom Agent Content */}
            {activeAgent === 'image_architect' && renderImageArchitect()}
            {activeAgent === 'video_visionary' && renderVideoVisionary()}
            {activeAgent === 'competitor_content' && renderCompetitorContent()}
          </div>
        )}
      </div>
    </div>
  );
}
