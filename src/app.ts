// ai-code-visualizer/backend/src/app.ts
import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import path from 'path';
import apiRoutes from './routes/index';

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// --- API routes will remain at /api ---
app.use('/api', apiRoutes);

// --- Serve your static UI from the 'public' folder ---
// This is the new block that serves your preferred UI
const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(publicPath));

// /app → main app page
app.get('/app', (req, res) => {
  res.sendFile(path.join(publicPath, 'app.html'));
});

// Everything else → landing page
app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});
// --- End of new UI block ---

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server and UI running at http://localhost:${PORT}`);
});