import { ChromaClient, Collection } from 'chromadb';
import { CodeChunk } from './fileIndexer';

const client = new ChromaClient({ path: 'http://localhost:8000' });
let collection: Collection | null = null;
const COLLECTION_NAME = 'project_code_ollama';

class OllamaEmbeddingFunction {
    private url: string;
    private model: string;

    constructor(params: { url: string; model: string }) {
        this.url = params.url;
        this.model = params.model;
    }

    public async generate(texts: string[]): Promise<number[][]> {
        const embeddings: number[][] = [];
        for (const text of texts) {
            const resp = await fetch(this.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: this.model, prompt: text })
            });
            if (!resp.ok) {
                console.error("Failed to generate embedding", await resp.text());
                throw new Error("Ollama embedding failed");
            }
            const data = await resp.json() as any;
            embeddings.push(data.embedding);
        }
        return embeddings;
    }
}

export async function initChroma(): Promise<Collection> {
    if (collection) return collection;
    try {
        const embedder = new OllamaEmbeddingFunction({
            url: "http://localhost:11434/api/embeddings",
            model: "nomic-embed-text" 
        });

        collection = await client.getOrCreateCollection({
            name: COLLECTION_NAME,
            embeddingFunction: embedder,
            metadata: { "hnsw:space": "cosine" }
        });
        return collection;
    } catch (error) {
        console.error("Failed to initialize ChromaDB collection:", error);
        throw error;
    }
}

export async function clearChromaCollection(): Promise<void> {
    try {
        await client.deleteCollection({ name: COLLECTION_NAME });
        collection = null;
        console.log("Deleted ChromaDB collection.");
    } catch (e) {
        // Ignored if collection does not exist
    }
}

/**
 * Add code chunks to the ChromaDB vector database.
 */
export async function addChunksToChroma(chunks: CodeChunk[]): Promise<void> {
    if (chunks.length === 0) return;
    
    try {
        const col = await initChroma();

        const ids = chunks.map(c => c.id);
        const documents = chunks.map(c => c.content);
        const metadatas = chunks.map(c => ({
            filePath: c.filePath,
            relativePath: c.relativePath,
            startLine: c.startLine,
            endLine: c.endLine,
            language: c.language
        }));

        // ChromaDB supports batch adding. For massive projects, we might want to split into smaller batches,
        // but for typical chunk counts, doing it together is fine.
        await col.add({
            ids,
            documents,
            metadatas
        });
        console.log(`Added ${chunks.length} chunks to ChromaDB.`);
    } catch (error) {
        console.error("Failed to add chunks to ChromaDB:", error);
        throw error;
    }
}

/**
 * Query ChromaDB using vector similarity search.
 */
export async function queryChroma(queryText: string, topK: number = 8) {
    try {
        const col = await initChroma();
        const results = await col.query({
            queryTexts: [queryText],
            nResults: topK
        });
        return results;
    } catch (error) {
        console.error("Failed to query ChromaDB:", error);
        throw error;
    }
}
