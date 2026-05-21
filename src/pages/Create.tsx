import React, { useState, useRef, useEffect } from 'react';
import { ImagePlus, Send, Sparkles, X, Calendar as CalendarIcon, Loader2, CheckCircle, Hash, CalendarClock, Lightbulb, User, MoreHorizontal, Heart, MessageCircle, Share2, Bookmark, Facebook, Instagram, Linkedin, Globe, MapPin, Tag, AlertCircle, Camera, Video, Circle, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateEnhancedPost } from '@/src/lib/gemini';
import { supabase, isSupabaseConfigured } from '@/src/lib/supabase';
import { cn } from '@/src/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/src/lib/ToastContext';

interface AISuggestions {
  captions: { style: string; text: string }[];
  hashtags: string[];
  bestTime: { time: string; reason: string };
  improvements: string[];
}

interface MediaState {
  url: string;
  data: string;
  mimeType: string;
  file?: File;
  type: 'image' | 'video';
}

interface PlatformFields {
  location?: string;
  altText?: string;
  link?: string;
}

export function Create() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState('');
  const [media, setMedia] = useState<MediaState | null>(null);
  const [mediaUrlInput, setMediaUrlInput] = useState('');
  const [isAddingUrl, setIsAddingUrl] = useState(false);
  const [isProcessingUrl, setIsProcessingUrl] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [platforms, setPlatforms] = useState<string[]>(['linkedin']);
  const [scheduledTime, setScheduledTime] = useState<string>('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastStatus, setLastStatus] = useState<'draft' | 'scheduled' | 'published' | 'error'>('draft');
  const [suggestions, setSuggestions] = useState<AISuggestions | null>(null);
  const [platformFields, setPlatformFields] = useState<Record<string, PlatformFields>>({});
  const [activePreview, setActivePreview] = useState<string | null>('linkedin');
  const [connectedAccounts, setConnectedAccounts] = useState<string[]>([]);
  const [topError, setTopError] = useState<string | null>(null);
  const [isScheduled, setIsScheduled] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);

  // Camera & Capture State
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureMode, setCaptureMode] = useState<'image' | 'video'>('image');
  const [isRecording, setIsRecording] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user' }, 
        audio: captureMode === 'video' 
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCapturing(true);
    } catch (err: any) {
      console.error('Error accessing camera:', err);
      showToast('Camera access denied or not available.', 'error');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCapturing(false);
    setIsRecording(false);
  };

  const captureImage = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg');
      const base64String = dataUrl.split(',')[1];
      
      setMedia({
        url: dataUrl,
        data: base64String,
        mimeType: 'image/jpeg',
        type: 'image'
      });
      stopCamera();
      showToast('Photo captured!', 'success');
    }
  };

  const startRecording = () => {
    if (!streamRef.current) return;
    recordedChunksRef.current = [];
    const mediaRecorder = new MediaRecorder(streamRef.current);
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunksRef.current.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        setMedia({
          url,
          data: base64String,
          mimeType: 'video/mp4',
          type: 'video',
          file: new File([blob], 'captured-video.mp4', { type: 'video/mp4' })
        });
        stopCamera();
        showToast('Video recorded!', 'success');
      };
      reader.readAsDataURL(blob);
    };

    mediaRecorder.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  React.useEffect(() => {
    return () => stopCamera();
  }, []);

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
        throw new Error('Request timed out.');
      }
      if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
        throw new Error('Connection failed. The resource might be offline or blocked.');
      }
      throw err;
    }
  };

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editId = params.get('edit');
    const videoUrl = params.get('video');
    const imageUrl = params.get('image');

    if (editId) {
      setEditingPostId(editId);
      fetchPostToEdit(editId);
    } else if (videoUrl) {
      const decodedUrl = decodeURIComponent(videoUrl);
      setMedia({
        url: decodedUrl,
        data: '',
        mimeType: 'video/mp4',
        type: 'video'
      });
      
      // If it's a blob URL (from Agents page), fetch it and convert to a File for upload
      if (decodedUrl.startsWith('blob:') || decodedUrl.includes('ngrok')) {
        safeFetch(decodedUrl)
          .then(res => res.blob())
          .then(blob => {
            const file = new File([blob], 'generated-video.mp4', { type: 'video/mp4' });
            setMedia(prev => prev ? { ...prev, file } : null);
          })
          .catch(err => {
            console.error('Error fetching media content:', err);
            showToast('Failed to load media content from external source. Please try again.', 'error');
          });
      }
    } else if (imageUrl) {
      const decodedUrl = decodeURIComponent(imageUrl);
      setMedia({
        url: decodedUrl,
        data: '',
        mimeType: 'image/jpeg',
        type: 'image'
      });

      // If it's a blob URL, fetch it and convert to a File for upload
      if (decodedUrl.startsWith('blob:') || decodedUrl.includes('ngrok')) {
        safeFetch(decodedUrl)
          .then(res => res.blob())
          .then(blob => {
            const file = new File([blob], 'generated-image.jpg', { type: 'image/jpeg' });
            setMedia(prev => prev ? { ...prev, file } : null);
          })
          .catch(err => {
            console.error('Error fetching media content:', err);
            showToast('Failed to load media content from external source. Please try again.', 'error');
          });
      }
    }
  }, []);

  const fetchPostToEdit = async (id: string) => {
    if (!isSupabaseConfigured) return;
    try {
      const { data, error } = await supabase.from('posts').select('*').eq('id', id).single();
      if (error) throw error;
      if (data) {
        setCaption(data.content);
        if (data.platforms && data.platforms.length > 0) {
          setPlatforms(data.platforms);
          setActivePreview(data.platforms[0]);
        } else {
          setPlatforms(['linkedin']);
          setActivePreview('linkedin');
        }
        if (data.scheduled_time) {
          setIsScheduled(true);
          const date = new Date(data.scheduled_time);
          const offset = date.getTimezoneOffset() * 60000;
          const localISOTime = new Date(date.getTime() - offset).toISOString().slice(0, 16);
          setScheduledTime(localISOTime);
        }
        if (data.media_url) {
          const isVideo = data.media_url.match(/\.(mp4|webm|ogg|mov)$|video/i);
          setMedia({ 
            url: data.media_url, 
            data: '', 
            mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
            type: isVideo ? 'video' : 'image'
          });
        }
      }
    } catch (err: any) {
      console.error('[Create] Error fetching post:', err);
      showToast('Failed to load post for editing: ' + err.message, 'error');
    }
  };

  React.useEffect(() => {
    if (topError) {
      const timer = setTimeout(() => setTopError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [topError]);

  React.useEffect(() => {
    async function fetchAccounts() {
      if (!isSupabaseConfigured) return;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from('social_accounts')
          .select('platform')
          .eq('user_id', user.id);
        
        if (error) throw error;
        if (data) {
          setConnectedAccounts(data.map(a => a.platform.toLowerCase()));
        }
      } catch (err: any) {
        console.error('[Create] Error fetching accounts:', err);
      }
    }
    fetchAccounts();
  }, []);

  const togglePlatform = (p: string) => {
    const platformKey = p.toLowerCase();
    setPlatforms(prev => {
      const isSelected = prev.includes(platformKey);
      const newPlatforms = isSelected ? prev.filter(x => x !== platformKey) : [...prev, platformKey];
      
      // Initialize fields if not present
      if (!isSelected && !platformFields[platformKey]) {
        setPlatformFields(f => ({ ...f, [platformKey]: { altText: '' } }));
      }

      // Update active preview
      if (!isSelected) {
        setActivePreview(platformKey);
      } else if (activePreview === platformKey) {
        setActivePreview(newPlatforms[0] || null);
      }
      
      return newPlatforms;
    });
  };

  const addHashtagToCaption = (tag: string) => {
    const formattedTag = tag.startsWith('#') ? tag : `#${tag}`;
    if (!caption.includes(formattedTag)) {
      setCaption(prev => prev.trim() + ' ' + formattedTag);
      showToast(`Added ${formattedTag}`, 'success');
    } else {
      showToast('Hashtag already added', 'info');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
    let file: File | undefined;
    
    if ('files' in e.target && e.target.files) {
      file = e.target.files[0];
    } else if ('dataTransfer' in e && e.dataTransfer.files) {
      file = e.dataTransfer.files[0];
    }

    if (!file) return;

    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');

    if (!isVideo && !isImage) {
      showToast('Please upload an image or video file.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      setMedia({
        url: URL.createObjectURL(file!),
        data: base64String,
        mimeType: file!.type,
        file: file,
        type: isVideo ? 'video' : 'image'
      });
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileChange(e);
  };

  const handleEnhanceWithAI = async () => {
    if (!caption.trim() && !media) {
      showToast('Please enter some content or upload media first', 'info');
      return;
    }
    
    if (!window.navigator.onLine) {
      showToast('You are offline. Please check your internet connection and try again.', 'error');
      return;
    }

    setIsGenerating(true);
    try {
      const res = await generateEnhancedPost(caption, media ? { data: media.data, mimeType: media.mimeType } : undefined);
      setSuggestions(res);
      showToast('AI analysis complete!', 'success');
    } catch (e: any) {
      console.error('[Create] AI Enhancement error:', e);
      let errorMsg = 'Failed to generate suggestions. Please try again.';
      if (e.message?.includes('quota')) errorMsg = 'AI API quota exceeded. Please try again later.';
      showToast(errorMsg, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const updatePlatformField = (platform: string, field: keyof PlatformFields, value: string) => {
    setPlatformFields(prev => ({
      ...prev,
      [platform]: { ...prev[platform], [field]: value }
    }));
  };

  const applyCaption = (text: string) => {
    setCaption(text);
    showToast('Caption applied!', 'success');
  };

  const handleSave = async (status: 'draft' | 'scheduled' | 'published') => {
    if (!isSupabaseConfigured) {
      showToast('Supabase is not configured. Please add your credentials.', 'error');
      return;
    }
    if (!caption.trim()) {
      showToast('Please enter a caption', 'info');
      return;
    }
    if (platforms.length === 0) {
      showToast('Please select a platform before posting', 'info');
      return;
    }
    
    // Check if connected (only for non-drafts)
    const unconnected = platforms.filter(p => !connectedAccounts.includes(p));
    let finalStatus: 'draft' | 'scheduled' | 'published' | 'error' = status;
    let errorMessage = null;

    if (status !== 'draft' && unconnected.length > 0) {
      finalStatus = 'error';
      errorMessage = 'Account not connected';
    }

    if (finalStatus === 'scheduled') {
      if (!scheduledTime) {
        showToast('Please select a date and time for your scheduled post', 'info');
        return;
      }
      if (new Date(scheduledTime) <= new Date()) {
        showToast('Scheduled time must be in the future', 'info');
        return;
      }
    }
    
    if (!window.navigator.onLine) {
      showToast('You are offline. Please check your internet connection before saving.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated. Please log in again.');

      let mediaUrl = media?.url || null;

      // Upload media if it's a new file
      if (media?.file) {
        console.log('[Create] Starting media upload...');
        const fileExt = media.file.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
        
        try {
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('posts')
            .upload(fileName, media.file, {
              cacheControl: '3600',
              upsert: false
            });

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from('posts')
            .getPublicUrl(fileName);
          
          mediaUrl = publicUrl;
        } catch (uploadErr: any) {
          console.error('[Create] Supabase upload error:', uploadErr);
          throw new Error(`Media upload failed: ${uploadErr.message || 'Unknown network error'}`);
        }
      }

      // Safety check: Never save blob URLs to the database
      if (mediaUrl && mediaUrl.startsWith('blob:')) {
        console.error('[Create] Attempted to save blob URL to database:', mediaUrl);
        throw new Error('Media is still processing or failed to upload. Please try re-uploading.');
      }

      console.log('[Create] Saving post to database with mediaUrl:', mediaUrl);
      const postData = {
        user_id: user.id,
        content: caption,
        status: finalStatus,
        platforms,
        media_url: mediaUrl,
        scheduled_time: finalStatus === 'scheduled' ? (scheduledTime ? new Date(scheduledTime).toISOString() : new Date(Date.now() + 86400000).toISOString()) : null,
        error_message: errorMessage
      };

      let newPost;
      if (editingPostId) {
        const { data, error } = await supabase.from('posts').update(postData).eq('id', editingPostId).select().single();
        if (error) throw error;
        newPost = data;
      } else {
        const { data, error } = await supabase.from('posts').insert(postData).select().single();
        if (error) throw error;
        newPost = data;
      }

      // If it's a "published" post, trigger the backend publishing
      if (finalStatus === 'published' && newPost) {
        try {
          console.log('[Create] Triggering publish for post:', newPost.id);
          const publishRes = await fetch('/api/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ postId: newPost.id, userId: user.id })
          });
          
          if (!publishRes.ok) {
            const errorText = await publishRes.text();
            console.error(`[Create] Publish API error ${publishRes.status}:`, errorText);
            let errorMsg = 'Failed to publish to social media';
            try {
              const errorJson = JSON.parse(errorText);
              errorMsg = errorJson.error || errorMsg;
            } catch (e) {
              errorMsg = errorText || errorMsg;
            }
            throw new Error(errorMsg);
          }

          const publishData = await publishRes.json();
          console.log('[Create] Publish response:', publishData);
          if (publishData.errors && publishData.errors.length > 0) {
            setLastStatus('error');
            setTopError(publishData.errors.map((e: any) => e.error).join(', '));
            setIsSaving(false);
            return;
          }
        } catch (publishErr: any) {
          console.error("[Create] Publish fetch failed:", publishErr);
          setLastStatus('error');
          setTopError(publishErr.message || 'Internal Server Error during publishing');
          setIsSaving(false);
          return;
        }
      }

      setLastStatus(finalStatus);
      
      if (finalStatus === 'error') {
        const msg = errorMessage || 'Failed to publish post';
        setTopError(msg);
        showToast(msg, 'error');
        setIsSaving(false);
      } else {
        const successMsg = finalStatus === 'draft' ? 'Draft saved!' : finalStatus === 'scheduled' ? 'Post scheduled successfully!' : 'Post published successfully!';
        showToast(successMsg, 'success');
        setShowSuccess(true);
        setTimeout(() => navigate('/'), 2000);
      }
    } catch (e: any) {
      setTopError(e.message);
      showToast(e.message, 'error');
      setIsSaving(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddUrl = async () => {
    if (!mediaUrlInput.trim() || isProcessingUrl) return;
    
    let urlToAdd = mediaUrlInput.trim();
    // Remove query params and trailing slashes
    urlToAdd = urlToAdd.split('?')[0].replace(/\/$/, '');

    // Instagram URL Validation & Trimming
    // Matches: https://www.instagram.com/username/any/path -> https://www.instagram.com/username
    const instagramRegex = /^(https?:\/\/)?(www\.)?instagram\.com\/([a-zA-Z0-9._]+)(\/.*)?$/;
    const match = urlToAdd.match(instagramRegex);
    
    // Check for reserved Instagram paths that aren't usernames
    const reservedPaths = ['reels', 'p', 'stories', 'explore', 'direct', 'tv'];
    
    if (!match || reservedPaths.includes(match[3].toLowerCase())) {
      showToast('Please enter a valid Instagram profile URL (e.g., instagram.com/username)', 'error');
      return;
    }

    const username = match[3];
    const profileUrl = `https://www.instagram.com/${username}/`;

    if (!window.navigator.onLine) {
      showToast('You are offline. Please check your internet connection.', 'error');
      return;
    }

    setIsProcessingUrl(true);

    try {
      if (!isSupabaseConfigured) {
        throw new Error('Database is not configured correctly. Please check environment variables.');
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Please sign in to import content.');

      // Search for the competitor in our database
      const { data: competitor, error } = await supabase
        .from('competitor_urls')
        .select('*')
        .eq('url', profileUrl)
        .eq('user_id', session.user.id)
        .single();

      if (error || !competitor) {
        throw new Error(`Profile @${username} is not being tracked. Add it in the Agents section first to import content.`);
      }

      if (!competitor.latest_video_url) {
        throw new Error(`We haven't found any videos for @${username} yet. Try again later or check if they have recent posts.`);
      }

      // Success! Set the media and caption
      setMedia({
        url: competitor.latest_video_url,
        data: '',
        mimeType: 'video/mp4',
        type: 'video'
      });

      if (competitor.latest_video_caption && !caption) {
        setCaption(competitor.latest_video_caption);
      }

      showToast(`Imported latest video from @${username}`, 'success');
      setMediaUrlInput('');
      setIsAddingUrl(false);
    } catch (e: any) {
      console.error('[Create] URL Import error:', e);
      showToast(e.message || 'Failed to import content', 'error');
    } finally {
      setIsProcessingUrl(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto space-y-6 pr-2 no-scrollbar relative">
      <AnimatePresence>
        {topError && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-4 right-4 z-[100] flex justify-center pointer-events-none"
          >
            <div className="bg-red-600 text-white px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3 pointer-events-auto">
              <AlertCircle size={20} />
              <span className="text-sm font-bold">{topError}</span>
              <button onClick={() => setTopError(null)} className="ml-2 hover:opacity-80">
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Create Post</h2>
        <button 
          onClick={() => handleSave('draft')}
          disabled={isSaving}
          className="bg-white border border-gray-100 text-gray-400 px-4 py-2 rounded-full text-sm font-bold"
        >
          Save Draft
        </button>
      </header>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-50 overflow-hidden">
        <div 
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "aspect-video flex flex-col items-center justify-center border-b border-gray-50 relative cursor-pointer group transition-all duration-300",
            media ? "bg-black" : "bg-gray-50 hover:bg-orange-50/30",
            isDragging && "bg-orange-50 ring-4 ring-orange-200 ring-inset"
          )}
          id="image-upload-area"
        >
          {media ? (
            <>
              {media.type === 'video' ? (
                <video 
                  src={media.url} 
                  className="w-full h-full object-contain" 
                  controls
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <img 
                  src={media.url} 
                  alt="Preview" 
                  className="w-full h-full object-contain" 
                  referrerPolicy="no-referrer" 
                />
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                <button 
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                  className="p-3 bg-white text-gray-900 rounded-full shadow-xl hover:scale-110 transition-transform"
                >
                  <ImagePlus size={20} />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); setMedia(null); }}
                  className="p-3 bg-red-500 text-white rounded-full shadow-xl hover:scale-110 transition-transform"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="absolute bottom-4 left-4 px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-[10px] font-bold text-white uppercase tracking-widest border border-white/10">
                {media.mimeType.split('/')[1]} • {media.file ? (media.file.size / 1024 / 1024).toFixed(2) + ' MB' : 'Existing'}
              </div>
            </>
          ) : (
            <>
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={cn(
                  "p-6 bg-white rounded-[2rem] shadow-xl shadow-orange-100/50 mb-4 text-orange-600 group-hover:scale-110 transition-transform duration-500",
                  isDragging && "scale-110 rotate-3"
                )}
              >
                <ImagePlus size={40} strokeWidth={1.5} />
              </motion.div>
              <div className="text-center">
                <p className="text-sm font-bold text-gray-900">
                  {isDragging ? "Release to upload" : "Drop your masterpiece here"}
                </p>
                <p className="text-[10px] text-gray-400 mt-1 font-medium uppercase tracking-wider">Supports JPG, PNG, MP4 up to 50MB</p>
              </div>
              <div className="flex gap-3 mt-4">
                <button 
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                  className="px-6 py-2.5 bg-orange-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-orange-100 hover:bg-orange-700 transition-colors"
                >
                  Browse Files
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); setIsAddingUrl(true); }}
                  className="px-6 py-2.5 bg-white border border-gray-100 text-gray-600 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-gray-50 transition-colors"
                >
                  Add URL
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); startCamera(); }}
                  className="px-6 py-2.5 bg-white border border-gray-100 text-gray-600 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-gray-50 transition-colors flex items-center gap-2"
                >
                  <Camera size={12} />
                  Live Capture
                </button>
              </div>
              
              {/* Decorative elements */}
              <div className="absolute top-6 left-6 w-12 h-12 border-t-2 border-l-2 border-gray-100 rounded-tl-2xl" />
              <div className="absolute bottom-6 right-6 w-12 h-12 border-b-2 border-r-2 border-gray-100 rounded-br-2xl" />
            </>
          )}
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*,video/*"
            className="hidden" 
          />
        </div>

        {/* Live Capture Modal */}
        <AnimatePresence>
          {isCapturing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4"
            >
              <div className="w-full max-w-2xl bg-gray-900 rounded-[3rem] overflow-hidden shadow-2xl border border-white/10 relative">
                <button 
                  onClick={stopCamera}
                  className="absolute top-6 right-6 z-10 p-2 bg-black/40 text-white rounded-full hover:bg-black/60 transition-colors"
                >
                  <X size={24} />
                </button>

                <div className="aspect-video relative bg-black">
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    className="w-full h-full object-cover"
                  />
                  
                  {isRecording && (
                    <div className="absolute top-6 left-6 flex items-center gap-2 px-3 py-1 bg-red-600 rounded-full animate-pulse">
                      <div className="w-2 h-2 bg-white rounded-full" />
                      <span className="text-[10px] font-bold text-white uppercase tracking-widest">Recording</span>
                    </div>
                  )}
                </div>

                <div className="p-8 space-y-8">
                  <div className="flex justify-center gap-4">
                    <button
                      onClick={() => setCaptureMode('image')}
                      className={cn(
                        "px-6 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all",
                        captureMode === 'image' ? "bg-orange-600 text-white" : "bg-white/5 text-gray-400 hover:bg-white/10"
                      )}
                    >
                      Photo
                    </button>
                    <button
                      onClick={() => setCaptureMode('video')}
                      className={cn(
                        "px-6 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all",
                        captureMode === 'video' ? "bg-orange-600 text-white" : "bg-white/5 text-gray-400 hover:bg-white/10"
                      )}
                    >
                      Video
                    </button>
                  </div>

                  <div className="flex items-center justify-center gap-12">
                    {captureMode === 'image' ? (
                      <button
                        onClick={captureImage}
                        className="w-20 h-20 bg-white rounded-full p-2 hover:scale-110 active:scale-95 transition-all shadow-xl shadow-white/10"
                      >
                        <div className="w-full h-full border-4 border-gray-900 rounded-full flex items-center justify-center">
                          <Camera size={32} className="text-gray-900" />
                        </div>
                      </button>
                    ) : (
                      <button
                        onClick={isRecording ? stopRecording : startRecording}
                        className="w-20 h-20 bg-white rounded-full p-2 hover:scale-110 active:scale-95 transition-all shadow-xl shadow-white/10"
                      >
                        <div className="w-full h-full border-4 border-gray-900 rounded-full flex items-center justify-center">
                          {isRecording ? (
                            <div className="w-8 h-8 bg-red-600 rounded-sm" />
                          ) : (
                            <Circle size={32} className="text-red-600 fill-red-600" />
                          )}
                        </div>
                      </button>
                    )}
                  </div>

                  <p className="text-center text-gray-500 text-[10px] font-medium uppercase tracking-widest">
                    {captureMode === 'image' ? "Tap to capture photo" : isRecording ? "Tap to stop recording" : "Tap to start recording"}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isAddingUrl && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="p-5 bg-gray-50 border-b border-gray-100 flex flex-col gap-3"
            >
              <div className="flex gap-3">
                <input 
                  type="text" 
                  value={mediaUrlInput}
                  onChange={(e) => setMediaUrlInput(e.target.value)}
                  placeholder="Paste Instagram profile URL here..."
                  className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-3 text-xs focus:ring-2 focus:ring-orange-500 outline-none"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
                  onClick={(e) => e.stopPropagation()}
                  disabled={isProcessingUrl}
                />
                <button 
                  onClick={(e) => { e.stopPropagation(); handleAddUrl(); }}
                  disabled={isProcessingUrl || !mediaUrlInput.trim()}
                  className="px-6 py-3 bg-orange-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 min-w-[100px] flex items-center justify-center"
                >
                  {isProcessingUrl ? <Loader2 size={16} className="animate-spin" /> : "Import"}
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); setIsAddingUrl(false); }}
                  className="p-2 text-gray-400 hover:text-gray-600"
                  disabled={isProcessingUrl}
                >
                  <X size={18} />
                </button>
              </div>
              <p className="text-[10px] text-gray-400 ml-1">
                Enter a profile link (e.g., instagram.com/name) to import their latest tracked content.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
        
        <div className="p-5 space-y-4">
          <div className="relative">
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="What's on your mind? AI can help you refine this..."
              className="w-full h-32 resize-none border-none focus:ring-0 text-base p-0 placeholder:text-gray-300"
            />
            <div className="flex justify-between items-end mt-2">
              <div className="flex gap-2">
                <button className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors">
                  <Hash size={18} />
                </button>
                <button className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors">
                  <Tag size={18} />
                </button>
              </div>
              <button 
                onClick={handleEnhanceWithAI}
                disabled={isGenerating}
                className="px-4 py-2 bg-orange-600 text-white rounded-xl flex items-center gap-2 text-xs font-bold shadow-lg shadow-orange-100 active:scale-95 transition-all disabled:opacity-50"
              >
                <Sparkles size={14} className={isGenerating ? "animate-spin" : ""} />
                {isGenerating ? "AI is thinking..." : "AI Assistant"}
              </button>
            </div>
          </div>
        </div>
      </div>


      <AnimatePresence>
        {suggestions && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* AI Suggestions Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Captions */}
              <section className="bg-white p-6 rounded-[2rem] border border-gray-50 shadow-sm space-y-4">
                <div className="flex items-center gap-2 text-orange-600">
                  <Sparkles size={18} />
                  <h3 className="font-bold">Caption Suggestions</h3>
                </div>
                <div className="space-y-3">
                  {suggestions.captions.map((cap, idx) => (
                    <motion.button
                      key={idx}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => applyCaption(cap.text)}
                      className="w-full text-left p-4 rounded-2xl bg-gray-50 hover:bg-orange-50 transition-colors group relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <CheckCircle size={14} className="text-orange-500" />
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-orange-500 block mb-1">{cap.style}</span>
                      <p className="text-sm text-gray-700 line-clamp-3 font-medium">{cap.text}</p>
                    </motion.button>
                  ))}
                </div>
              </section>

              {/* Hashtags & Best Time */}
              <div className="space-y-6">
                <section className="bg-white p-6 rounded-[2rem] border border-gray-50 shadow-sm space-y-4">
                  <div className="flex items-center justify-between text-blue-600">
                    <div className="flex items-center gap-2">
                      <Hash size={18} />
                      <h3 className="font-bold">Hashtags</h3>
                    </div>
                    <div className="flex gap-2">
                      <motion.button 
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          const allTags = suggestions.hashtags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ');
                          setCaption(prev => prev.trim() + '\n\n' + allTags);
                          showToast('Added all hashtags', 'success');
                        }}
                        className="text-[10px] font-bold uppercase tracking-widest bg-blue-50 px-2 py-1 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        Add All
                      </motion.button>
                      <motion.button 
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          navigator.clipboard.writeText(suggestions.hashtags.map(t => t.startsWith('#') ? t : `#${t}`).join(' '));
                          showToast('Hashtags copied to clipboard!', 'success');
                        }}
                        className="text-[10px] font-bold uppercase tracking-widest bg-gray-50 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
                      >
                        Copy
                      </motion.button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.hashtags.map((tag, idx) => (
                      <motion.button 
                        key={idx} 
                        whileTap={{ scale: 0.9 }}
                        onClick={() => addHashtagToCaption(tag)}
                        className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-medium hover:bg-blue-100 transition-colors flex items-center gap-1 group active:bg-blue-200"
                      >
                        {tag.startsWith('#') ? tag : `#${tag}`}
                        <span className="opacity-0 group-hover:opacity-100 text-[8px] font-bold">+</span>
                      </motion.button>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <section className="space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-sm uppercase tracking-wider text-gray-400">Select Platforms</h3>
          {platforms.some(p => !connectedAccounts.includes(p)) && (
            <button 
              onClick={() => navigate('/profile')}
              className="text-orange-600 text-[10px] font-bold uppercase tracking-wider hover:underline"
            >
              Connect Account
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          {[
            { name: 'Facebook', icon: Facebook, color: 'hover:bg-blue-50 hover:text-blue-600' },
            { name: 'Instagram', icon: Instagram, color: 'hover:bg-pink-50 hover:text-pink-600' },
            { name: 'LinkedIn', icon: Linkedin, color: 'hover:bg-blue-50 hover:text-blue-800' }
          ].map((p) => (
            <button
              key={p.name}
              onClick={() => togglePlatform(p.name)}
              className={cn(
                "flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold border transition-all active:scale-95 relative",
                platforms.includes(p.name.toLowerCase()) 
                  ? "bg-orange-600 border-orange-600 text-white shadow-lg shadow-orange-100" 
                  : cn("bg-white border-gray-100 text-gray-400", p.color)
              )}
            >
              <p.icon size={18} />
              {p.name}
              {connectedAccounts.includes(p.name.toLowerCase()) && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 border-2 border-white rounded-full" />
              )}
              {p.name.toLowerCase() !== 'linkedin' && (
                <span className="absolute -bottom-2 right-2 bg-gray-100 text-[8px] text-gray-400 px-1.5 py-0.5 rounded-full border border-gray-200">
                  Simulated
                </span>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* Realistic Previews */}
      <AnimatePresence>
        {platforms.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="space-y-6"
          >
            <section className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm uppercase tracking-wider text-gray-400">Platform Preview</h3>
                {platforms.length > 1 && (
                  <div className="flex bg-gray-100 p-1 rounded-xl gap-1">
                    {platforms.map(p => (
                      <button
                        key={p}
                        onClick={() => setActivePreview(p)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all",
                          activePreview === p ? "bg-white text-orange-600 shadow-sm" : "text-gray-400 hover:text-gray-600"
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="max-w-md mx-auto">
                <AnimatePresence mode="wait">
                  {/* Instagram Preview */}
                  {activePreview === 'instagram' && (
                    <motion.div
                      key="instagram"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-3"
                    >
                      <div className="flex items-center gap-2 text-pink-600 ml-2">
                        <Instagram size={16} />
                        <span className="text-xs font-bold uppercase tracking-wider">Instagram</span>
                      </div>
                      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-lg">
                        <div className="p-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600 p-[1px]">
                              <div className="w-full h-full rounded-full bg-white p-[1px]">
                                <div className="w-full h-full rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
                                  <User size={16} className="text-gray-400" />
                                </div>
                              </div>
                            </div>
                            <span className="text-xs font-bold">quirko_sphere</span>
                          </div>
                          <MoreHorizontal size={16} className="text-gray-400" />
                        </div>
                        <div className="aspect-square bg-gray-100 flex items-center justify-center">
                          {media ? (
                            media.type === 'video' ? (
                              <video src={media.url} className="w-full h-full object-cover" controls />
                            ) : (
                              <img src={media.url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            )
                          ) : (
                            <ImagePlus size={48} className="text-gray-300" />
                          )}
                        </div>
                        <div className="p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <Heart size={22} className="text-gray-700" />
                              <MessageCircle size={22} className="text-gray-700" />
                              <Share2 size={22} className="text-gray-700" />
                            </div>
                            <Bookmark size={22} className="text-gray-700" />
                          </div>
                          <div className="text-sm">
                            <span className="font-bold mr-2">quirko_sphere</span>
                            <span className="whitespace-pre-wrap">{caption || "Your caption here..."}</span>
                            {suggestions?.hashtags && suggestions.hashtags.length > 0 && (
                              <div className="mt-2 text-blue-800">
                                {suggestions.hashtags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ')}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Facebook Preview */}
                  {activePreview === 'facebook' && (
                    <motion.div
                      key="facebook"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-3"
                    >
                      <div className="flex items-center gap-2 text-blue-600 ml-2">
                        <Facebook size={16} />
                        <span className="text-xs font-bold uppercase tracking-wider">Facebook</span>
                      </div>
                      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-lg">
                        <div className="p-4 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                            <User size={20} className="text-gray-400" />
                          </div>
                          <div>
                            <p className="text-sm font-bold">QuirkoSphere</p>
                            <p className="text-[10px] text-gray-400 flex items-center gap-1">Just now • <Globe size={10} /></p>
                          </div>
                        </div>
                        <div className="px-4 pb-3 text-sm whitespace-pre-wrap">
                          {caption || "Your post content..."}
                          {suggestions?.hashtags && suggestions.hashtags.length > 0 && (
                            <div className="mt-2 text-blue-600">
                              {suggestions.hashtags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ')}
                            </div>
                          )}
                        </div>
                        <div className="aspect-video bg-gray-100 flex items-center justify-center border-y border-gray-50">
                          {media ? (
                            media.type === 'video' ? (
                              <video src={media.url} className="w-full h-full object-cover" controls />
                            ) : (
                              <img src={media.url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            )
                          ) : (
                            <ImagePlus size={48} className="text-gray-300" />
                          )}
                        </div>
                        <div className="p-2 flex border-b border-gray-50">
                          <div className="flex-1 flex items-center justify-center gap-2 py-2 text-gray-500 font-medium text-xs">
                            <Heart size={16} /> Like
                          </div>
                          <div className="flex-1 flex items-center justify-center gap-2 py-2 text-gray-500 font-medium text-xs">
                            <MessageCircle size={16} /> Comment
                          </div>
                          <div className="flex-1 flex items-center justify-center gap-2 py-2 text-gray-500 font-medium text-xs">
                            <Share2 size={16} /> Share
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* LinkedIn Preview */}
                  {activePreview === 'linkedin' && (
                    <motion.div
                      key="linkedin"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-3"
                    >
                      <div className="flex items-center gap-2 text-blue-800 ml-2">
                        <Linkedin size={16} />
                        <span className="text-xs font-bold uppercase tracking-wider">LinkedIn</span>
                      </div>
                      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-lg">
                        <div className="p-4 flex items-center gap-3">
                          <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                            <User size={24} className="text-gray-400" />
                          </div>
                          <div>
                            <p className="text-sm font-bold">QuirkoSphere</p>
                            <p className="text-[10px] text-gray-400">AI Content Strategist</p>
                            <p className="text-[10px] text-gray-400">1m • Edited • <Globe size={10} className="inline" /></p>
                          </div>
                        </div>
                        <div className="px-4 pb-3 text-sm whitespace-pre-wrap">
                          {caption || "Professional insights..."}
                          {platformFields.linkedin?.link && (
                            <div className="mt-2 text-blue-600 underline">
                              {platformFields.linkedin.link}
                            </div>
                          )}
                          {suggestions?.hashtags && suggestions.hashtags.length > 0 && (
                            <div className="mt-2 text-blue-700 font-medium">
                              {suggestions.hashtags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ')}
                            </div>
                          )}
                        </div>
                        <div className="aspect-video bg-gray-100 flex items-center justify-center">
                          {media ? (
                            media.type === 'video' ? (
                              <video src={media.url} className="w-full h-full object-cover" controls />
                            ) : (
                              <img src={media.url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            )
                          ) : (
                            <ImagePlus size={48} className="text-gray-300" />
                          )}
                        </div>
                        <div className="p-3 flex gap-4 border-t border-gray-50">
                          <div className="flex items-center gap-1 text-gray-500 font-bold text-xs">
                            <Heart size={18} /> Like
                          </div>
                          <div className="flex items-center gap-1 text-gray-500 font-bold text-xs">
                            <MessageCircle size={18} /> Comment
                          </div>
                          <div className="flex items-center gap-1 text-gray-500 font-bold text-xs">
                            <Share2 size={18} /> Repost
                          </div>
                          <div className="flex items-center gap-1 text-gray-500 font-bold text-xs">
                            <Send size={18} /> Send
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>

      <section className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <CalendarIcon size={18} className="text-gray-400" />
            <h3 className="font-bold text-sm uppercase tracking-wider text-gray-400">Schedule Post</h3>
          </div>
          <button
            onClick={() => setIsScheduled(!isScheduled)}
            className={cn(
              "w-12 h-6 rounded-full transition-colors relative",
              isScheduled ? "bg-orange-600" : "bg-gray-200"
            )}
          >
            <div className={cn(
              "absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform",
              isScheduled ? "translate-x-6" : "translate-x-0"
            )} />
          </button>
        </div>

        {isScheduled && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="relative"
          >
            <input
              type="datetime-local"
              value={scheduledTime}
              onChange={(e) => {
                setScheduledTime(e.target.value);
                if (e.target.value) setIsScheduled(true);
              }}
              min={(() => {
                const now = new Date();
                const offset = now.getTimezoneOffset() * 60000;
                return new Date(now.getTime() - offset).toISOString().slice(0, 16);
              })()}
              className="w-full bg-white p-4 rounded-2xl border border-gray-100 flex items-center justify-between text-sm text-gray-500 outline-none focus:ring-2 focus:ring-orange-100 transition-all"
            />
            <p className="text-[10px] text-gray-400 mt-2 ml-1">
              Posts will be automatically published at the selected time.
            </p>
          </motion.div>
        )}
      </section>

      <section className="pt-4 pb-8 flex gap-3">
        <button
          onClick={() => handleSave('draft')}
          disabled={isSaving}
          className="flex-1 py-4 bg-white border border-gray-100 rounded-2xl font-bold text-sm text-gray-400 shadow-sm active:bg-gray-50 transition-all disabled:opacity-50"
        >
          {isSaving ? <Loader2 size={18} className="animate-spin mx-auto" /> : "Save Draft"}
        </button>
        <button
          onClick={() => handleSave(isScheduled ? 'scheduled' : 'published')}
          disabled={isSaving}
          className={cn(
            "flex-[2] py-4 rounded-2xl font-bold text-sm shadow-lg active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2",
            isScheduled 
              ? "bg-orange-600 text-white shadow-orange-200" 
              : "bg-white border-2 border-orange-600 text-orange-600 shadow-sm"
          )}
        >
          {isSaving ? (
            <Loader2 size={18} className="animate-spin" />
          ) : isScheduled ? (
            <>
              <CalendarIcon size={18} />
              Schedule Post
            </>
          ) : (
            <>
              <Send size={18} />
              Post Now
            </>
          )}
        </button>
      </section>

      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm px-6"
          >
            <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-gray-50 text-center space-y-4 max-w-xs w-full">
              <div className="w-20 h-20 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle size={48} />
              </div>
              <h3 className="text-xl font-bold">
                {lastStatus === 'published' ? 'Post Published!' : 
                 lastStatus === 'scheduled' ? 'Post Scheduled!' : 'Draft Saved!'}
              </h3>
              <p className="text-gray-500 text-sm">
                Your content is ready. Redirecting to dashboard...
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
