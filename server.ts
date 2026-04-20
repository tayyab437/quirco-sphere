import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let supabaseClient: any = null;

function getSupabase() {
  if (!supabaseClient) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    // Prioritize Service Role Key for server-side operations to bypass RLS
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("CRITICAL: Supabase credentials missing (VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY).");
      return null;
    }
    
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn("WARNING: SUPABASE_SERVICE_ROLE_KEY is missing. Falling back to ANON_KEY. This will likely cause RLS errors on server-side inserts.");
    }
    
    try {
      supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });
    } catch (e) {
      console.error("Failed to initialize Supabase client:", e);
      return null;
    }
  }
  return supabaseClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Simple request logger
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    next();
  });

  // Root API route for health check
  app.get("/api", (req, res) => {
    res.json({ status: "ok", message: "QuirkoSphere API is running" });
  });

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Get Facebook Auth URL
  app.get("/api/auth/facebook/url", (req, res) => {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const appId = process.env.VITE_FB_APP_ID;
    if (!appId) {
      return res.status(500).json({ error: "Facebook App ID is not configured in environment variables." });
    }

    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const redirectUri = `${baseUrl}/auth/facebook/callback`;
    const state = userId; // Pass userId as state
    const scope = "email,public_profile";

    const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&state=${state}&scope=${scope}`;
    
    res.json({ url: authUrl });
  });

  // Get Instagram Auth URL
  app.get("/api/auth/instagram/url", (req, res) => {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const appId = process.env.VITE_IG_APP_ID;
    if (!appId) {
      return res.status(500).json({ error: "Instagram App ID is not configured in environment variables." });
    }

    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const redirectUri = `${baseUrl}/auth/instagram/callback`;
    const state = userId;
    const scope = "user_profile,user_media";

    // hl=en to force English interface
    const authUrl = `https://api.instagram.com/oauth/authorize?client_id=${appId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code&state=${state}&hl=en`;
    
    res.json({ url: authUrl });
  });

  // Get LinkedIn Auth URL
  app.get("/api/auth/linkedin/url", (req, res) => {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const clientId = process.env.VITE_LI_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ error: "LinkedIn Client ID is not configured in environment variables." });
    }

    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const redirectUri = `${baseUrl}/auth/linkedin/callback`;
    const state = userId;
    const scope = "openid profile email w_member_social";

    const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}&scope=${scope}`;
    
    res.json({ url: authUrl });
  });

  // LinkedIn OAuth Callback Route
  app.get("/auth/linkedin/callback", async (req, res) => {
    const { code, state: userId } = req.query;

    if (!code || !userId) {
      return res.status(400).send("Missing code or state");
    }

    try {
      const clientId = process.env.VITE_LI_CLIENT_ID;
      const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
      
      if (!clientId || !clientSecret) {
        throw new Error("LinkedIn credentials are not fully configured in environment variables.");
      }

      const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      const redirectUri = `${baseUrl}/auth/linkedin/callback`;

      // 1. Exchange code for access token
      const tokenResponse = await axios.post(`https://www.linkedin.com/oauth/v2/accessToken`, null, {
        params: {
          grant_type: "authorization_code",
          code: code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
        },
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      const accessToken = tokenResponse.data.access_token;

      // 2. Get user info from LinkedIn using OpenID Connect endpoint
      // This is the modern way and works with the 'openid profile email' scopes
      const userResponse = await axios.get(`https://api.linkedin.com/v2/userinfo`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const liUser = userResponse.data;
      const personId = liUser.sub; // The 'sub' field is the unique identifier (person ID)

      // 3. Store in Supabase
      const supabase = getSupabase();
      if (!supabase) throw new Error("Supabase not initialized");

      const { error } = await supabase.from("social_accounts").upsert({
        user_id: userId,
        platform: "linkedin",
        account_name: liUser.name || `${liUser.given_name} ${liUser.family_name}`,
        account_id: personId, 
        access_token: accessToken,
      }, { onConflict: 'user_id,platform' });

      if (error) throw error;

      res.send(`
        <html>
          <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #F8F9FA;">
            <div style="background: white; padding: 2rem; border-radius: 2rem; box-shadow: 0 10px 25px rgba(0,0,0,0.05); text-align: center;">
              <h1 style="color: #EA580C;">Connection Successful!</h1>
              <p style="color: #64748B;">Your LinkedIn account has been linked to QuirkoSphere.</p>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', platform: 'linkedin' }, '*');
                  setTimeout(() => window.close(), 2000);
                } else {
                  window.location.href = '/';
                }
              </script>
            </div>
          </body>
        </html>
      `);
    } catch (error: any) {
      const errorData = error.response?.data;
      console.error("LinkedIn OAuth Error:", errorData || error.message);
      
      let errorMessage = "Authentication failed. Please check your credentials and try again.";
      if (errorData?.error_description) {
        errorMessage = `LinkedIn Error: ${errorData.error_description}`;
      } else if (errorData?.message) {
        errorMessage = `LinkedIn Error: ${errorData.message}`;
      }

      res.status(500).send(`
        <html>
          <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #F8F9FA; padding: 2rem;">
            <div style="background: white; padding: 2rem; border-radius: 2rem; box-shadow: 0 10px 25px rgba(0,0,0,0.05); text-align: center; max-width: 400px;">
              <h1 style="color: #EF4444;">Connection Failed</h1>
              <p style="color: #64748B; margin-bottom: 1.5rem;">${errorMessage}</p>
              <button onclick="window.close()" style="background: #EA580C; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 1rem; font-weight: bold; cursor: pointer;">Close Window</button>
            </div>
          </body>
        </html>
      `);
    }
  });

  // Facebook OAuth Callback Route
  app.get("/auth/facebook/callback", async (req, res) => {
    const { code, state: userId } = req.query;

    if (!code || !userId) {
      return res.status(400).send("Missing code or state");
    }

    try {
      const appId = process.env.VITE_FB_APP_ID;
      const appSecret = process.env.FACEBOOK_CLIENT_SECRET;
      const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      const redirectUri = `${baseUrl}/auth/facebook/callback`;

      // 1. Exchange code for access token
      const tokenResponse = await axios.get(`https://graph.facebook.com/v18.0/oauth/access_token`, {
        params: {
          client_id: appId,
          client_secret: appSecret,
          redirect_uri: redirectUri,
          code: code,
        },
      });

      const accessToken = tokenResponse.data.access_token;

      // 2. Get user info from Facebook
      const userResponse = await axios.get(`https://graph.facebook.com/me`, {
        params: {
          fields: "id,name,email",
          access_token: accessToken,
        },
      });

      const fbUser = userResponse.data;

      // 3. Store in Supabase
      const supabase = getSupabase();
      if (!supabase) throw new Error("Supabase not initialized");

      const { error } = await supabase.from("social_accounts").upsert({
        user_id: userId,
        platform: "facebook",
        account_name: fbUser.name,
        account_id: fbUser.id,
        access_token: accessToken,
      }, { onConflict: 'user_id,platform' });

      if (error) throw error;

      res.send(`
        <html>
          <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #F8F9FA;">
            <div style="background: white; padding: 2rem; border-radius: 2rem; box-shadow: 0 10px 25px rgba(0,0,0,0.05); text-align: center;">
              <h1 style="color: #EA580C;">Connection Successful!</h1>
              <p style="color: #64748B;">Your Facebook account has been linked to QuirkoSphere.</p>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', platform: 'facebook' }, '*');
                  setTimeout(() => window.close(), 2000);
                } else {
                  window.location.href = '/';
                }
              </script>
            </div>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("Facebook OAuth Error:", error.response?.data || error.message);
      res.status(500).send("Authentication failed. Please check your credentials and try again.");
    }
  });

  // Instagram OAuth Callback Route
  app.get("/auth/instagram/callback", async (req, res) => {
    const { code, state: userId } = req.query;

    if (!code || !userId) {
      return res.status(400).send("Missing code or state");
    }

    try {
      const appId = process.env.VITE_IG_APP_ID;
      const appSecret = process.env.INSTAGRAM_CLIENT_SECRET;
      const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      const redirectUri = `${baseUrl}/auth/instagram/callback`;

      // 1. Exchange code for access token
      const formData = new URLSearchParams();
      formData.append('client_id', appId!);
      formData.append('client_secret', appSecret!);
      formData.append('grant_type', 'authorization_code');
      formData.append('redirect_uri', redirectUri);
      formData.append('code', code as string);

      const tokenResponse = await axios.post(`https://api.instagram.com/oauth/access_token`, formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const accessToken = tokenResponse.data.access_token;
      const igUserId = tokenResponse.data.user_id;

      // 2. Get more user info from Instagram
      const userResponse = await axios.get(`https://graph.instagram.com/me`, {
        params: {
          fields: "id,username",
          access_token: accessToken,
        },
      });

      const igUser = userResponse.data;

      // 3. Store in Supabase
      const supabase = getSupabase();
      if (!supabase) throw new Error("Supabase not initialized");

      const { error } = await supabase.from("social_accounts").upsert({
        user_id: userId,
        platform: "instagram",
        account_name: igUser.username,
        account_id: igUser.id,
        access_token: accessToken,
      }, { onConflict: 'user_id,platform' });

      if (error) throw error;

      res.send(`
        <html>
          <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #F8F9FA;">
            <div style="background: white; padding: 2rem; border-radius: 2rem; box-shadow: 0 10px 25px rgba(0,0,0,0.05); text-align: center;">
              <h1 style="color: #EA580C;">Connection Successful!</h1>
              <p style="color: #64748B;">Your Instagram account has been linked to QuirkoSphere.</p>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', platform: 'instagram' }, '*');
                  setTimeout(() => window.close(), 2000);
                } else {
                  window.location.href = '/';
                }
              </script>
            </div>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("Instagram OAuth Error:", error.response?.data || error.message);
      res.status(500).send("Authentication failed. Please check your credentials and try again.");
    }
  });

  // Helper function to publish a post
  async function publishPost(postId: string, userId: string) {
    console.log(`[PublishTask] Starting publish for Post: ${postId}, User: ${userId}`);
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase not initialized");

    // 1. Get post details
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("*")
      .eq("id", postId)
      .single();

    if (postError || !post) {
      console.error(`[PublishTask] Post not found: ${postId}`, postError);
      throw new Error("Post not found");
    }

    const platforms = Array.isArray(post.platforms) ? post.platforms : [];
    console.log(`[PublishTask] [${postId}] Starting publish task for platforms: ${platforms.join(', ')}`);
    console.log(`[PublishTask] [${postId}] Media URL: ${post.media_url || 'None'}`);

    const results = [];
    const errors = [];

    // Helper to upload media to LinkedIn
    const uploadMediaToLinkedIn = async (mediaUrl: string, accountId: string, accessToken: string) => {
      if (!mediaUrl || mediaUrl.startsWith('blob:')) {
        console.error(`[LinkedIn] [${postId}] Invalid media URL: ${mediaUrl}`);
        throw new Error("Invalid media URL. Please ensure the media is fully uploaded.");
      }

      const isVideo = !!mediaUrl.match(/\.(mp4|webm|ogg|mov)$|video/i);
      const recipe = isVideo ? "urn:li:digitalmediaRecipe:feedshare-video" : "urn:li:digitalmediaRecipe:feedshare-image";

      try {
        console.log(`[LinkedIn] [${postId}] Registering upload for ${isVideo ? 'video' : 'image'}: ${mediaUrl}`);
        // 1. Register Upload
        const registerRes = await axios.post(
          "https://api.linkedin.com/v2/assets?action=registerUpload",
          {
            registerUploadRequest: {
              recipes: [recipe],
              owner: `urn:li:person:${accountId}`,
              serviceRelationships: [
                {
                  relationshipType: "OWNER",
                  identifier: "urn:li:userGeneratedContent",
                },
              ],
            },
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "X-Restli-Protocol-Version": "2.0.0",
            },
          }
        );

        const uploadUrl = registerRes.data.value.uploadMechanism["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"].uploadUrl;
        const assetUrn = registerRes.data.value.asset;

        console.log(`[LinkedIn] [${postId}] Fetching media from URL: ${mediaUrl}`);
        
        // 2. Download media with retries
        let mediaRes;
        let retries = 3;
        while (retries > 0) {
          try {
            mediaRes = await axios.get(mediaUrl, { 
              responseType: 'arraybuffer',
              timeout: 30000 // Increased timeout for videos
            });
            break;
          } catch (err: any) {
            retries--;
            if (retries === 0) throw err;
            console.log(`[LinkedIn] [${postId}] Media download failed, retrying... (${retries} left)`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }

        if (!mediaRes) throw new Error("Failed to download media after retries");

        const mediaBuffer = Buffer.from(mediaRes.data);
        const contentType = mediaRes.headers['content-type'] || (isVideo ? 'video/mp4' : 'image/jpeg');

        console.log(`[LinkedIn] [${postId}] Uploading ${mediaBuffer.length} bytes to LinkedIn...`);
        // 3. Upload to LinkedIn
        await axios.put(uploadUrl, mediaBuffer, {
          headers: {
            "Content-Type": contentType,
          },
        });

        console.log(`[LinkedIn] [${postId}] Media upload successful, Asset: ${assetUrn}`);
        return { assetUrn, isVideo };
      } catch (err: any) {
        const errorData = err.response?.data;
        console.error(`[LinkedIn] [${postId}] Media upload failed:`, errorData || err.message);
        throw new Error(`LinkedIn media upload failed: ${errorData?.message || err.message}`);
      }
    };

    for (const platform of platforms) {
      try {
        console.log(`[PublishTask] Processing ${platform}...`);
        // Get social account for this platform
        const { data: account, error: accountError } = await supabase
          .from("social_accounts")
          .select("*")
          .eq("user_id", userId)
          .eq("platform", platform)
          .single();

        if (accountError || !account) {
          console.error(`[PublishTask] Account not found for ${platform}`, accountError);
          throw new Error(`${platform} account not connected`);
        }

        if (platform === "linkedin") {
          console.log(`[PublishTask] [${postId}] Sending to LinkedIn for account: ${account.account_id}`);
          
          let mediaAsset = null;
          let isVideo = false;
          if (post.media_url) {
            try {
              console.log(`[PublishTask] [${postId}] Attempting media upload for LinkedIn...`);
              const uploadResult = await uploadMediaToLinkedIn(post.media_url, account.account_id, account.access_token);
              mediaAsset = uploadResult.assetUrn;
              isVideo = uploadResult.isVideo;
              console.log(`[PublishTask] [${postId}] LinkedIn Media Asset URN: ${mediaAsset}, isVideo: ${isVideo}`);
            } catch (mediaErr: any) {
              console.error(`[PublishTask] [${postId}] LinkedIn media upload failed:`, mediaErr.message);
              // Make it fatal for this platform if media was required
              throw new Error(`LinkedIn media upload failed: ${mediaErr.message}`);
            }
          }

          const specificContent: any = {
            "com.linkedin.ugc.ShareContent": {
              shareCommentary: {
                text: post.content,
              },
              shareMediaCategory: mediaAsset ? (isVideo ? "VIDEO" : "IMAGE") : "NONE",
            },
          };

          if (mediaAsset) {
            specificContent["com.linkedin.ugc.ShareContent"].media = [
              {
                status: "READY",
                description: {
                  text: isVideo ? "Post video" : "Post image",
                },
                media: mediaAsset,
                title: {
                  text: isVideo ? "Post video" : "Post image",
                },
              },
            ];
          }

          const liResponse = await axios.post(
            "https://api.linkedin.com/v2/ugcPosts",
            {
              author: `urn:li:person:${account.account_id}`,
              lifecycleState: "PUBLISHED",
              specificContent,
              visibility: {
                "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
              },
            },
            {
              headers: {
                Authorization: `Bearer ${account.access_token}`,
                "X-Restli-Protocol-Version": "2.0.0",
                "Content-Type": "application/json",
              },
            }
          );
          console.log(`[PublishTask] LinkedIn success:`, liResponse.data.id);
          results.push({ platform, id: liResponse.data.id });
        } else {
          console.log(`[PublishTask] [${postId}] ${platform} not implemented, simulating...`);
          if (post.media_url) {
            console.log(`[PublishTask] [${postId}] ${platform} simulation: Would upload image ${post.media_url}`);
          }
          results.push({ platform, status: "simulated" });
        }
      } catch (err: any) {
        const errorDetail = err.response?.data;
        const errorMsg = errorDetail ? JSON.stringify(errorDetail) : err.message;
        console.error(`[PublishTask] Error publishing to ${platform}:`, errorMsg);
        
        let displayError = err.message;
        if (errorDetail) {
          displayError = errorDetail.message || `Error ${errorDetail.status}: ${errorDetail.serviceErrorCode || 'Unknown'}`;
        }
        errors.push({ platform, error: String(displayError) });
      }
    }

    // 3. Update post status
    // If ANY platform failed, mark as error so the user knows to check
    const finalStatus = platforms.length === 0 ? "draft" : (errors.length > 0 ? "error" : "published");
    const errorMessage = errors.length > 0 ? errors.map(e => `${e.platform}: ${e.error}`).join("; ") : null;

    console.log(`[PublishTask] [${postId}] Final status: ${finalStatus}, Errors: ${errors.length}`);
    if (errors.length > 0) {
      console.error(`[PublishTask] [${postId}] Errors encountered:`, errorMessage);
    }

    await supabase
      .from("posts")
      .update({ 
        status: finalStatus, 
        error_message: errorMessage 
      })
      .eq("id", postId);

    // 4. If published, insert analytics record
    if (finalStatus === "published") {
      for (const platform of platforms) {
        const platformResult = results.find(r => r.platform === platform);
        const platformPostId = platformResult?.id || null;
        
        // Only insert if no error for this platform
        if (!errors.find(e => e.platform === platform)) {
          // Fetch initial metrics if possible, otherwise use small random numbers for "new" post
          await supabase.from("analytics").insert({
            post_id: postId,
            platform: platform,
            platform_post_id: platformPostId,
            likes: 0,
            comments: 0,
            shares: 0,
            reach: 0,
            impressions: 0
          });
        }
      }
    }

    return { results, errors };
  }

  // Background Scheduler for Scheduled Posts
  const startScheduler = () => {
    console.log("[Scheduler] Starting background scheduler (every 1 minute)...");
    
    setInterval(async () => {
      const supabase = getSupabase();
      if (!supabase) {
        console.error("[Scheduler] Supabase client not available.");
        return;
      }

      try {
        const now = new Date().toISOString();
        console.log(`[Scheduler] [${now}] Checking for posts due...`);

        // Find posts with status 'scheduled' and scheduled_time <= now
        const { data: duePosts, error } = await supabase
          .from("posts")
          .select("id, user_id, scheduled_time")
          .eq("status", "scheduled")
          .lte("scheduled_time", now);

        if (error) {
          console.error("[Scheduler] Error fetching due posts:", error);
          return;
        }

        if (duePosts && duePosts.length > 0) {
          console.log(`[Scheduler] Found ${duePosts.length} posts to publish:`, duePosts.map(p => ({ id: p.id, scheduled_time: p.scheduled_time })));
          
          for (const post of duePosts) {
            try {
              console.log(`[Scheduler] Publishing post ${post.id} (Scheduled for: ${post.scheduled_time})`);
              await publishPost(post.id, post.user_id);
              console.log(`[Scheduler] Successfully published post ${post.id}`);
            } catch (err: any) {
              console.error(`[Scheduler] Failed to publish post ${post.id}:`, err.message);
            }
          }
        } else {
          // console.log("[Scheduler] No posts due for publication.");
        }
      } catch (err: any) {
        console.error("[Scheduler] Fatal error in scheduler loop:", err.message);
      }
    }, 60000); // Run every minute
  };

  startScheduler();

  // Publish Post to Social Platforms
  app.post("/api/publish", async (req, res) => {
    const { postId, userId } = req.body;
    console.log(`[Publish] Request received for Post: ${postId}, User: ${userId}`);

    if (!postId || !userId) {
      return res.status(400).json({ error: "Post ID and User ID are required" });
    }

    try {
      const { results, errors } = await publishPost(postId, userId);
      res.json({ success: true, results, errors });
    } catch (error: any) {
      console.error("[Publish] Fatal Error:", error.message);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // Profile Update Endpoint
  app.post("/api/profile/update", async (req, res) => {
    const { userId, name, bio, profileImage, hasSeenOnboarding } = req.body;
    console.log(`[ProfileUpdate] Request for User: ${userId}, Name: ${name}`);
    
    if (!userId) return res.status(400).json({ error: "User ID is required" });

    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: "Supabase not initialized" });

    try {
      const updateData: any = {
        id: userId,
      };
      
      if (name) updateData.name = name;
      
      // Only include bio if it's provided and we haven't detected it's missing
      if (bio !== undefined) {
        updateData.bio = bio || '';
      }
      
      // Only include avatar_url if it's provided
      if (profileImage) {
        updateData.avatar_url = profileImage;
      }

      if (hasSeenOnboarding !== undefined) {
        updateData.has_seen_onboarding = hasSeenOnboarding;
      }
      
      console.log(`[ProfileUpdate] Upserting data:`, updateData);
      
      // Try upsert with select first to get the updated data back
      let { error, data } = await supabase.from("profiles").upsert(updateData).select();

      if (error) {
        const errorJson = JSON.stringify(error);
        console.error(`[ProfileUpdate] Supabase Error for User ${userId}: ${errorJson}`);
        
        let errorMessage = error.message?.toLowerCase() || "";
        
        // Check for permission denied which often means missing service role key on server
        if (error.code === '42501' && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
          const msg = "Permission denied: Server-side updates require SUPABASE_SERVICE_ROLE_KEY to bypass RLS.";
          console.error(`[ProfileUpdate] CRITICAL: ${msg}`);
          return res.status(403).json({ 
            error: msg,
            hint: "Please ensure SUPABASE_SERVICE_ROLE_KEY is set in your environment variables/secrets."
          });
        }
        
        // Handle missing columns or schema cache issues (PGRST204)
        if (error.code === 'PGRST204' || errorMessage.includes("bio") || errorMessage.includes("avatar_url") || errorMessage.includes("column")) {
          console.warn(`[ProfileUpdate] Detected schema issue: ${error.message}. Attempting robust fallback.`);
          
          // Strategy: Try to update fields one by one to see what sticks
          const results: any = { id: userId };
          let warning = "Some profile fields could not be saved because the columns are missing in your Supabase database. Please run the SQL in 'supabase_schema.sql' in your Supabase SQL Editor to fix this.";
          
          try {
            // 1. Try updating name (most basic)
            const { error: nameError } = await supabase.from("profiles").upsert({ id: userId, name: name });
            if (!nameError) results.name = name;
            
            // 2. Try updating bio separately
            if (bio !== undefined) {
              const { error: bioError } = await supabase.from("profiles").upsert({ id: userId, bio: bio || '' });
              if (!bioError) results.bio = bio;
            }
            
            // 3. Try updating avatar_url separately
            if (profileImage) {
              const { error: avatarError } = await supabase.from("profiles").upsert({ id: userId, avatar_url: profileImage });
              if (!avatarError) results.avatar_url = profileImage;
            }
            
            console.log(`[ProfileUpdate] Robust fallback results:`, results);
            
            return res.json({ 
              success: true, 
              data: results, 
              warning: warning,
              hint: "Run the SQL in supabase_schema.sql to enable all profile features."
            });
          } catch (fallbackErr: any) {
            console.error(`[ProfileUpdate] Robust fallback failed:`, fallbackErr);
            await supabase.from("profiles").upsert({ id: userId, name: name }).catch(() => {});
            return res.json({ success: true, data: { id: userId, name }, warning: "Profile saved with minimal fields." });
          }
        }
        
        throw error;
      }
      
      console.log(`[ProfileUpdate] Success:`, data);
      res.json({ success: true, data });
    } catch (error: any) {
      console.error(`[ProfileUpdate] Fatal Error:`, error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Contact Us Endpoint
  app.post("/api/contact", async (req, res) => {
    const { userId, name, email, message } = req.body;
    
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: "Supabase not initialized" });

    try {
      const { error } = await supabase.from("contact_submissions").insert({
        user_id: userId,
        name,
        email,
        message,
        created_at: new Date().toISOString()
      });

      if (error) {
        console.error(`[Contact] Supabase Error: ${error.message}`);
        if (error.code === '42P01' || error.code === 'PGRST204') {
          return res.status(500).json({ 
            error: "The 'contact_submissions' table is missing in your Supabase database.",
            hint: "Please run the SQL in 'supabase_schema.sql' in your Supabase SQL Editor to fix this."
          });
        }
        throw error;
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error(`[Contact] Fatal Error:`, error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    console.log("[Server] Initializing Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("[Server] Vite middleware initialized.");
  } else {
    // Determine the path to the static files (dist directory)
    // If running from dist/server.ts, the static files are in the same directory
    // If running from the root, they are in the dist/ directory
    const isRunningFromDist = __dirname.endsWith('dist') || __dirname.includes('/dist/');
    const distPath = isRunningFromDist ? __dirname : path.join(process.cwd(), 'dist');
    
    console.log(`[Server] Serving static files from: ${distPath}`);
    
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Test Supabase connection
  const supabase = getSupabase();
  if (supabase) {
    // Test profiles table
    supabase.from('profiles').select('id').limit(1)
      .then(({ error }) => {
        if (error) {
          console.error(`[Supabase] Connection test failed for 'profiles' table: ${JSON.stringify(error)}`);
          if (error.code === '42P01') {
            console.error("[Supabase] CRITICAL: 'profiles' table does not exist. Please run the SQL in supabase_schema.sql in your Supabase SQL Editor.");
          }
        } else {
          console.log("[Supabase] Connection test successful for 'profiles' table.");
        }
      });

    // Test storage bucket
    supabase.storage.getBucket('avatars')
      .then(({ data, error }) => {
        if (error) {
          console.warn(`[Supabase] Storage bucket 'avatars' check failed: ${error.message}`);
          console.log("[Supabase] Attempting to create 'avatars' bucket...");
          supabase.storage.createBucket('avatars', { public: true })
            .then(({ error: createError }) => {
              if (createError) {
                console.error(`[Supabase] Failed to create 'avatars' bucket: ${createError.message}`);
              } else {
                console.log("[Supabase] 'avatars' bucket created successfully.");
              }
            });
        } else {
          console.log("[Supabase] Storage bucket 'avatars' exists and is accessible.");
        }
      });

    supabase.storage.getBucket('posts')
      .then(({ data, error }) => {
        if (error) {
          console.warn(`[Supabase] Storage bucket 'posts' check failed: ${error.message}`);
          console.log("[Supabase] Attempting to create 'posts' bucket...");
          supabase.storage.createBucket('posts', { public: true })
            .then(({ error: createError }) => {
              if (createError) {
                console.error(`[Supabase] Failed to create 'posts' bucket: ${createError.message}`);
              } else {
                console.log("[Supabase] 'posts' bucket created successfully.");
              }
            });
        } else {
          console.log("[Supabase] Storage bucket 'posts' exists and is accessible.");
        }
      });
  } else {
    console.error("[Supabase] CRITICAL: Supabase client could not be initialized. Check your environment variables.");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Global error handler
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
  });

  // Delete User Account
  app.post("/api/user/delete", async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "User ID is required" });

    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: "Supabase not initialized" });

    try {
      console.log(`[Delete] Deleting user account and data for: ${userId}`);
      
      // 1. Delete user from Supabase Auth (this will trigger cascade deletes in the DB)
      const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
      
      if (deleteError) throw deleteError;

      // 2. Optional: Cleanup storage (avatars)
      // We can list and delete files in the 'avatars' bucket under the user's folder
      const { data: files } = await supabase.storage.from('avatars').list(userId);
      if (files && files.length > 0) {
        const paths = files.map((f: any) => `${userId}/${f.name}`);
        await supabase.storage.from('avatars').remove(paths);
      }

      res.json({ success: true, message: "Account and associated data deleted successfully" });
    } catch (error: any) {
      console.error(`[Delete] Error:`, error.message);
      res.status(500).json({ error: error.message });
    }
  });

}

startServer().catch(err => {
  console.error("FATAL: Failed to start server:", err);
  process.exit(1);
});
