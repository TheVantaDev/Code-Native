import { Router } from 'express';
import { readdir, readFile, writeFile, mkdir, rm, stat } from 'fs/promises';
import { join, basename, extname } from 'path';
import type { FileNode } from '@code-native/shared';

const router = Router();

// Base project directory (configurable)
const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();

// Build file tree recursively
async function buildFileTree(dirPath: string, idPrefix = ''): Promise<FileNode[]> {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const nodes: FileNode[] = [];

    const ignoredDirs = ['node_modules', '.git', 'dist', 'dist-electron', '.vite', '__pycache__'];

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const fullPath = join(dirPath, entry.name);
        const id = idPrefix ? `${idPrefix}-${i}` : `${i}`;

        if (entry.isDirectory()) {
            if (!ignoredDirs.includes(entry.name)) {
                const children = await buildFileTree(fullPath, id);
                nodes.push({
                    id,
                    name: entry.name,
                    path: fullPath,
                    type: 'folder',
                    children,
                });
            }
        } else {
            nodes.push({
                id,
                name: entry.name,
                path: fullPath,
                type: 'file',
            });
        }
    }

    return nodes.sort((a, b) => {
        if (a.type === 'folder' && b.type === 'file') return -1;
        if (a.type === 'file' && b.type === 'folder') return 1;
        return a.name.localeCompare(b.name);
    });
}

// List files in directory
router.get('/tree', async (req, res) => {
    const path = (req.query.path as string) || PROJECT_ROOT;

    try {
        const tree = await buildFileTree(path);
        res.json({ success: true, data: tree });
    } catch (error) {
        console.error('Error reading directory:', error);
        res.status(500).json({ success: false, error: 'Failed to read directory' });
    }
});

// Read file content
router.get('/read', async (req, res) => {
    const filePath = req.query.path as string;

    if (!filePath) {
        return res.status(400).json({ success: false, error: 'Path is required' });
    }

    try {
        const content = await readFile(filePath, 'utf-8');
        res.json({ success: true, data: { content, path: filePath } });
    } catch (error) {
        console.error('Error reading file:', error);
        res.status(500).json({ success: false, error: 'Failed to read file' });
    }
});

// Write file content
router.post('/write', async (req, res) => {
    const { path: filePath, content } = req.body;

    if (!filePath) {
        return res.status(400).json({ success: false, error: 'Path is required' });
    }

    try {
        await writeFile(filePath, content, 'utf-8');
        res.json({ success: true, data: { path: filePath } });
    } catch (error) {
        console.error('Error writing file:', error);
        res.status(500).json({ success: false, error: 'Failed to write file' });
    }
});

// Create directory
router.post('/mkdir', async (req, res) => {
    const { path: dirPath } = req.body;

    if (!dirPath) {
        return res.status(400).json({ success: false, error: 'Path is required' });
    }

    try {
        await mkdir(dirPath, { recursive: true });
        res.json({ success: true, data: { path: dirPath } });
    } catch (error) {
        console.error('Error creating directory:', error);
        res.status(500).json({ success: false, error: 'Failed to create directory' });
    }
});

// Delete file or directory
router.delete('/delete', async (req, res) => {
    const filePath = req.query.path as string;

    if (!filePath) {
        return res.status(400).json({ success: false, error: 'Path is required' });
    }

    try {
        const fileStat = await stat(filePath);
        await rm(filePath, { recursive: fileStat.isDirectory() });
        res.json({ success: true, data: { path: filePath } });
    } catch (error) {
        console.error('Error deleting:', error);
        res.status(500).json({ success: false, error: 'Failed to delete' });
    }
});

export default router;
