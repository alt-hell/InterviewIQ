import Groq from "groq-sdk";
import fs from "fs";

// Lazy initialization — only creates Groq client when actually needed
let groq = null;

const getGroqClient = () => {
  if (!groq) {
    if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === "your_groq_api_key_here") {
      throw new Error("GROQ_API_KEY is not configured. Get a free key at https://console.groq.com");
    }
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groq;
};

/**
 * Transcribe audio file using Groq's Whisper large-v3-turbo model
 * Free tier: 20 req/min, 2000 audio seconds/hour
 */
export const transcribeAudio = async (filePath) => {
  try {
    const client = getGroqClient();

    const transcription = await client.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: "whisper-large-v3-turbo",
      language: "en",
      response_format: "json",
    });

    return transcription.text || "";
  } catch (error) {
    console.error("Groq Whisper Error:", error?.message || error);
    throw new Error(error?.message || "Speech transcription failed");
  }
};
