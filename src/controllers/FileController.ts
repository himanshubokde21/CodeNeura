// FILE: ai-code-visualizer/src/controllers/FileController.ts

import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { GeminiService } from '../services/geminiService';

const projectRoot = process.cwd();
const uploadsPath = path.join(projectRoot, 'uploads');

export class FileController {
    private geminiService: GeminiService | null = null;

    private getGeminiService(): GeminiService {
        if (!this.geminiService) {
            this.geminiService = new GeminiService();
        }
        return this.geminiService;
    }

    public handleUpload = (req: Request, res: Response): void => {
        res.status(200).json({ message: 'Project uploaded successfully.' });
    }

    public getFileStructure = async (req: Request, res: Response): Promise<void> => {
        try {
            if (!fs.existsSync(uploadsPath) || fs.readdirSync(uploadsPath).length === 0) {
                res.json({ summary: 'Please import a project folder to begin analysis.', mermaidDiagram: '' });
                return;
            }

            let projectContext = "Analyze the following project file structure and generate a high-level architectural diagram.\n\nFILE STRUCTURE:\n";
            const filePaths: string[] = [];

            const walkDir = (dir: string) => {
                const files = fs.readdirSync(dir);
                files.forEach(file => {
                    const fullPath = path.join(dir, file);
                    const relativePath = path.relative(uploadsPath, fullPath);
                    if (fs.statSync(fullPath).isDirectory()) {
                        filePaths.push(`- ${relativePath}/ (directory)`);
                        walkDir(fullPath);
                    } else {
                        filePaths.push(`- ${relativePath}`);
                    }
                });
            };

            walkDir(uploadsPath);
            projectContext += filePaths.join('\n');

            const analysis = await this.getGeminiService().getArchitecturalAnalysis(projectContext);
            res.json(analysis);

        } catch (error) {
            console.error("Failed to get architectural analysis:", error);
            res.status(500).json({ error: 'Error generating architectural analysis.' });
        }
    }

    public aiAnalyze = async (req: Request, res: Response): Promise<void> => {
        const { code, filename } = req.body;
        if (!code || !filename) {
            res.status(400).json({ error: 'code and filename are required.' });
            return;
        }
        try {
            const result = await this.getGeminiService().analyzeCode(code, filename);
            res.json(result);
        } catch (error: any) {
            console.error('AI analyze failed:', error);
            res.status(500).json({ error: error?.message || 'AI analysis failed.' });
        }
    }

    public generateFlowchart = async (req: Request, res: Response): Promise<void> => {
        const { code, filename } = req.body;
        if (!code || !filename) {
            res.status(400).json({ error: 'code and filename are required.' });
            return;
        }
        try {
            const mermaidSyntax = await this.getGeminiService().getCodeFlowchart(code, filename);
            res.json({ mermaid: mermaidSyntax });
        } catch (error) {
            console.error('Flowchart generation failed:', error);
            res.status(500).json({ error: 'Failed to generate flowchart.' });
        }
    }

    public getFileContent = (req: Request, res: Response): void => {
        const { filePath } = req.query;

        if (typeof filePath !== 'string') {
            res.status(400).json({ error: 'A file path must be provided.' });
            return;
        }

        try {
            const fullPath = path.join(uploadsPath, filePath);
            if (!fullPath.startsWith(uploadsPath)) {
                res.status(403).json({ error: 'Forbidden' });
                return;
            }
            const content = fs.readFileSync(fullPath, 'utf-8');
            res.type('text/plain').send(content);
        } catch (error) {
            console.error("Failed to read file:", error);
            res.status(404).json({ error: 'File not found.' });
        }
    }
}
