import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

export const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const AGENT_SYSTEM_PROMPTS = {
  content: "You are a creative social media content creator. Your goal is to generate high-quality, engaging captions for social media posts. When a user provides a topic or draft, provide 3 distinct variations: 1) Professional & Informative, 2) Witty & Playful, and 3) Inspirational & Bold. Always include relevant emojis and a clear call-to-action for each.",
  competitor: "You are a competitor analysis expert. Your goal is to provide insights into market trends and competitor strategies. When a user mentions a niche or a competitor, analyze common successful patterns in that space and suggest how the user can differentiate their content to stand out.",
  analytics: "You are a social media analytics expert. Your goal is to help users interpret their performance data. Explain metrics like engagement rate, reach, and conversion in simple terms, and provide 3 actionable steps to improve performance based on the user's goals."
};

export async function generateAIResponse(
  agentType: keyof typeof AGENT_SYSTEM_PROMPTS, 
  prompt: string,
  history: { role: 'user' | 'bot', text: string }[] = []
) {
  if (!ai) throw new Error("Gemini API key not configured");
  
  // Format history for Gemini
  const contents: any[] = history.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.text }]
  }));

  // Add the current prompt
  contents.push({
    role: 'user',
    parts: [{ text: prompt }]
  });

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents,
    config: {
      systemInstruction: AGENT_SYSTEM_PROMPTS[agentType],
    },
  });

  return response.text;
}

export async function generateEnhancedPost(content: string, imageData?: { data: string; mimeType: string }) {
  if (!ai) throw new Error("Gemini API key not configured");

  const parts: any[] = [{ text: `Generate social media post enhancements for this content: "${content}"` }];
  if (imageData) {
    parts.push({
      inlineData: {
        data: imageData.data,
        mimeType: imageData.mimeType
      }
    });
  }

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: { parts },
    config: {
      systemInstruction: "You are an expert social media manager. Analyze the provided content and image (if provided) and generate 3 to 5 high-quality, engaging caption suggestions in different styles (e.g., Professional, Witty, Inspirational, Minimalist, Bold). Also provide 10-15 relevant hashtags, the best posting time with reasoning, and 3-5 suggestions for engagement improvements. Return the response in a structured JSON format.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          captions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                style: { type: Type.STRING, description: "The style of the caption (e.g., Professional, Witty, Inspirational, Minimalist, Bold)" },
                text: { type: Type.STRING, description: "The caption text" }
              },
              required: ["style", "text"]
            },
            description: "3 to 5 caption suggestions"
          },
          hashtags: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "10-15 relevant hashtags"
          },
          bestTime: {
            type: Type.OBJECT,
            properties: {
              time: { type: Type.STRING, description: "The suggested posting time (e.g., Tuesday at 10 AM)" },
              reason: { type: Type.STRING, description: "A short reason why this time is best" }
            },
            required: ["time", "reason"]
          },
          improvements: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "3-5 suggestions to make the content more engaging"
          }
        },
        required: ["captions", "hashtags", "bestTime", "improvements"]
      }
    },
  });

  try {
    return JSON.parse(response.text || "{}");
  } catch (e) {
    console.error("Failed to parse AI response:", e);
    throw new Error("Invalid AI response format");
  }
}
