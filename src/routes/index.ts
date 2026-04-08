// FILE: ai-code-visualizer/src/routes/index.ts

import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { FileController } from '../controllers/FileController';

const router = Router();
const fileController = new FileController();

// --- Multer Configuration ---
const uploadsPath = path.join(process.cwd(), 'uploads');

// Helper to clear directory before an upload
const clearUploadsDirectory = () => {
    if (fs.existsSync(uploadsPath)) {
        fs.rmSync(uploadsPath, { recursive: true, force: true });
    }
    fs.mkdirSync(uploadsPath, { recursive: true });
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Use the file's original path to recreate the folder structure
        const dir = path.join(uploadsPath, path.dirname(file.originalname));
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, path.basename(file.originalname));
    },
});
const upload = multer({ storage });

// --- API Routes ---

// ✅ NEW: Add this root route for a health check
router.get('/', (req, res) => {
    res.send('AI Code Visualizer API is running!');
});

router.get('/structure', fileController.getFileStructure);

router.get('/content', fileController.getFileContent);

// Upload new project files
router.post(
    '/upload',
    (req, res, next) => {
        clearUploadsDirectory(); // Clear old project before uploading new one
        next();
    },
    upload.array('projectFiles'),
    fileController.handleUpload
);

// --- Flowchart Route ---
router.post('/flowchart', fileController.generateFlowchart);

// --- AI Code Analysis (Gemini) ---
router.post('/ai-analyze', fileController.aiAnalyze);

// --- New Analyze Route ---
router.post('/analyze', (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ error: "No code provided" });
    }

    // Example breakdown logic (replace with your AI logic later)
    const lines = code.split("\n").length;
    const words = code.split(/\s+/).filter(Boolean).length;

    res.json({
        message: "Code breakdown successful ✅",
        stats: {
            lines,
            words,
        },
        preview: code.substring(0, 100) + (code.length > 100 ? "..." : "")
    });
});

export default router;