import { Router }         from 'express';
import multer             from 'multer';
import path               from 'path';
import fs                 from 'fs';
import fsp                from 'fs/promises';
import { FileController } from '../controllers/FileController';

const router         = Router();
const fileController = new FileController();
const uploadsPath    = path.join(process.cwd(), 'uploads');

// ── Upload helpers ─────────────────────────────────────────────────────────
async function clearUploadsDirectory(): Promise<void> {
    try { await fsp.rm(uploadsPath, { recursive: true, force: true }); } catch {}
    await fsp.mkdir(uploadsPath, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(uploadsPath, path.dirname(file.originalname));
        fs.mkdirSync(dir, { recursive: true }); // multer requires sync cb
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, path.basename(file.originalname));
    },
});
const upload = multer({ storage });

// ── Routes ─────────────────────────────────────────────────────────────────

router.get('/', (_req, res) => {
    res.send('AI Code Visualizer API is running!');
});

router.get('/structure', fileController.getFileStructure);
router.get('/content',   fileController.getFileContent);

router.post(
    '/upload',
    async (req, res, next) => {
        await clearUploadsDirectory();
        next();
    },
    upload.array('projectFiles'),
    fileController.handleUpload,
);

router.post('/flowchart',   fileController.generateFlowchart);
router.post('/ai-analyze',  fileController.aiAnalyze);

// ── Local code stats (single-pass, no AI) ─────────────────────────────────
router.post('/analyze', (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'No code provided' });

    // Single pass: count lines and non-whitespace tokens simultaneously
    let lines = 1;
    let words = 0;
    let inWord = false;
    for (let i = 0; i < code.length; i++) {
        const ch = code[i];
        if (ch === '\n') { lines++; }
        const ws = ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
        if (!ws && !inWord) { words++; inWord = true; }
        else if (ws)        { inWord = false; }
    }

    res.json({
        message: 'Code breakdown successful ✅',
        stats: { lines, words },
        preview: code.length > 100 ? code.substring(0, 100) + '...' : code,
    });
});

export default router;
