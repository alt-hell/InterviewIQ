import multer from "multer";

// Memory storage — no disk writes, zero latency, no orphaned temp files
const memoryStorage = multer.memoryStorage();

// Disk storage — still used for resume PDF parsing (pdfjs needs a file path or buffer)
import fs from "fs";
const diskStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = "public";
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + "-" + file.originalname);
    }
});

// For audio uploads (Groq Whisper) — memory only, audio MIME validation
export const uploadAudio = multer({
    storage: memoryStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB for longer answers
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith("audio/")) {
            cb(null, true);
        } else {
            cb(new Error("Only audio files are allowed for transcription"), false);
        }
    }
});

// For resume uploads — disk storage (pdfjs-dist reads from file path)
export const upload = multer({
    storage: diskStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB for resumes
    fileFilter: (req, file, cb) => {
        if (file.mimetype === "application/pdf") {
            cb(null, true);
        } else {
            cb(new Error("Only PDF files are allowed for resume upload"), false);
        }
    }
});