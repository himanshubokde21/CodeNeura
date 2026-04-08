# CodeNeura — AI Code Visualizer

## Overview
A professional-grade AI code visualization tool. Import any project folder to explore its structure in a VS Code-style file tree, view source files with full syntax highlighting, generate instant Mermaid flowcharts (zero API calls), and get deep code metrics + on-demand Gemini AI insights.

## Architecture
- **Backend**: Node.js + Express + TypeScript, serves both the REST API and the static frontend UI
- **Frontend**: Vanilla HTML/CSS/JS served from `public/`
- **AI**: Google Gemini via `@google/generative-ai` (lazy-initialized, two models)
- **Flowcharts**: Client-side parser (`flowchart-parser.js`) — no API needed

## Project Structure
```
/
├── src/
│   ├── app.ts                      # Express server entrypoint (port 5000, host 0.0.0.0)
│   ├── routes/index.ts             # API routes + multer upload config
│   ├── controllers/FileController.ts
│   ├── services/geminiService.ts   # Gemini AI: analyzeCode(), getCodeFlowchart(), getArchitecturalAnalysis()
│   └── types/index.ts              # Shared TypeScript types
├── public/
│   ├── index.html       # Landing page
│   ├── landing.css      # Landing page styles
│   ├── landing.js       # Landing page scripts (Three.js orb, typed animation)
│   ├── script.js        # Main app logic: file tree, metrics, AI insights, search, shortcuts
│   ├── style.css        # Main app dark design system
│   ├── flowchart-parser.js  # Client-side Mermaid generator (JS/TS/Py/Java/C/C++)
│   └── images/          # SVG icons
├── uploads/             # Temp storage for uploaded project files (cleared on each upload)
├── package.json
└── tsconfig.json
```

## API Endpoints
| Method | Route | Description |
|--------|-------|-------------|
| GET | /api/ | Health check |
| GET | /api/structure | AI architectural analysis of uploaded project |
| GET | /api/content | Serve a file's raw content |
| POST | /api/upload | Upload a project folder |
| POST | /api/flowchart | Gemini flowchart generation (backend fallback) |
| POST | /api/ai-analyze | Gemini code analysis → JSON with summary, insights, suggestions |
| POST | /api/analyze | Basic code stats (lines, words) |

## Key Configuration
- **Port**: 5000 (required for Replit webview)
- **Host**: 0.0.0.0 (required for Replit proxy)
- **Required Secrets**:
  - `GEMINI_API_KEY` — free tier, used for AI analysis (gemini-2.5-flash)
  - `GENERATIVE_AI_API_KEY` — paid tier, used for flowchart generation
- **Dev command**: `npm run dev` (nodemon + ts-node)
- **Build command**: `npm run build` (tsc)
- **Start command**: `node dist/app.js`

## Running in Development
Workflow: `npm run dev`
Uses `nodemon` + `ts-node` for hot-reloading TypeScript.

## Deployment
- **Target**: autoscale
- **Build**: `npm install && npm run build`
- **Run**: `node dist/app.js`

## Notes
- `GeminiService` is lazily initialized — server starts without API keys set
- Flowchart generation is 100% client-side (no API quota used per click)
- AI Insights are on-demand only (user must click "Generate AI Insights")
- `uploads/` is cleared on each new project upload to avoid stale data
