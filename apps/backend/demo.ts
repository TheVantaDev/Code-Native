import http from 'http';

function post(path: string, data: any) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: 'localhost',
            port: 3001,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk.toString());
            res.on('end', () => resolve(body));
        });
        
        req.on('error', reject);
        req.write(JSON.stringify(data));
        req.end();
    });
}

async function runDemo() {
    console.log("=== RAG Vector DB Demo ===\n");
    
    // 1. Indexing the project
    console.log("1. Indexing the backend directory...");
    const projectPath = process.cwd(); // assuming run from apps/backend
    const indexRes = await post('/api/rag/index', { projectPath });
    console.log("Response:", indexRes, "\n");
    
    // 2. Querying RAG
    console.log("2. Asking the AI a question about the project using RAG...");
    // The chat endpoint uses SSE, so we'll read the stream
    const req = http.request({
        hostname: 'localhost',
        port: 3001,
        path: '/api/rag/chat',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, (res) => {
        console.log("Receiving response stream:");
        res.on('data', chunk => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                    try {
                        const data = JSON.parse(line.substring(6));
                        if (data.message?.content) {
                            process.stdout.write(data.message.content);
                        }
                    } catch(e) {}
                }
            }
        });
        res.on('end', () => {
            console.log("\n\n=== Demo Finished ===");
        });
    });
    
    req.write(JSON.stringify({ message: "What vector database does this project use? List the file where it is implemented." }));
    req.end();
}

runDemo().catch(console.error);
