
import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import path from 'path';
import apiRoutes from './routes/index';

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

app.use(cors());
app.use(express.json());

// --- API routes will remain at /api ---
app.use('/api', apiRoutes);

// --- Serve static files from the 'public' folder ---
const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(publicPath));

// --- Page routes ---
app.get('/app', (req, res) => {
  res.sendFile(path.join(publicPath, 'app.html'));
});

// Landing page for everything else
app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});
// --- End of new UI block ---

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server and UI running at http://localhost:${PORT}`);
});