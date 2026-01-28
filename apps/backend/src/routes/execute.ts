import { Router } from 'express';
import { executorService } from '../services/executor';
import type { ExecuteRequest, SupportedLanguage } from '@code-native/shared';

const router = Router();

// Execute code
router.post('/', async (req, res) => {
    const { code, language, timeout } = req.body as ExecuteRequest;

    if (!code) {
        return res.status(400).json({ success: false, error: 'Code is required' });
    }

    if (!language) {
        return res.status(400).json({ success: false, error: 'Language is required' });
    }

    const supportedLanguages: SupportedLanguage[] = ['javascript', 'python', 'java', 'typescript'];
    if (!supportedLanguages.includes(language)) {
        return res.status(400).json({
            success: false,
            error: `Unsupported language. Supported: ${supportedLanguages.join(', ')}`
        });
    }

    try {
        const result = await executorService.execute(code, language, timeout);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('Error executing code:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Execution failed'
        });
    }
});

// Get supported languages
router.get('/languages', (req, res) => {
    res.json({
        success: true,
        data: [
            { id: 'javascript', name: 'JavaScript', extension: '.js' },
            { id: 'typescript', name: 'TypeScript', extension: '.ts' },
            { id: 'python', name: 'Python', extension: '.py' },
            { id: 'java', name: 'Java', extension: '.java' },
        ]
    });
});

export default router;
