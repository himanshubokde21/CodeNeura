// FILE: ai-code-visualizer/src/types/index.ts

export interface FileNode {
    name: string;
    type: 'file';
    path: string;
    iconKeyword: string;
}

export interface FolderNode {
    name: string;
    type: 'folder';
    children: FileSystemNode[];
    iconKeyword: string;
}

export type FileSystemNode = FileNode | FolderNode;

export interface AnalyzeRequestBody {
    filePath: string;
}