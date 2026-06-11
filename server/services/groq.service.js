import Groq from "groq-sdk";
import { Readable } from "stream";

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
 * Transcribe audio from an in-memory Buffer using Groq Whisper large-v3-turbo.
 * No disk I/O — buffer comes directly from multer memoryStorage.
 * Free tier: 20 req/min, 2000 audio seconds/hour
 *
 * @param {Buffer} buffer   - Raw audio bytes
 * @param {string} mimetype - e.g. "audio/webm" or "audio/ogg"
 */
export const transcribeAudio = async (buffer, mimetype = "audio/webm") => {
  try {
    const client = getGroqClient();

    // Build a Readable stream from the buffer and attach a filename
    // so Groq SDK can infer the file format correctly
    const ext = mimetype.includes("ogg") ? "ogg" : "webm";
    const stream = Readable.from(buffer);
    stream.path = `answer.${ext}`;

    const transcription = await client.audio.transcriptions.create({
      file: stream,
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
