export function streamFromServer(args: {
    serverUrl: string; // e.g. http://localhost:8000
    modelId: string;
    prompt: string;
    onText: (t: string) => void;
    onDone?: () => void;
}) {
    let { serverUrl, modelId, prompt, onText, onDone } = args;
    const ctrl = new AbortController();

    const url = serverUrl.replace(/\/$/, '') + '/generate/stream';
    
    // use fetch with ReadableStream for SSE streaming (supports POST)
    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: modelId, prompt }),
        signal: ctrl.signal,
    }).then(async (resp) => {
        const reader = resp.body?.getReader();
        if (!reader) return;
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let idx;
            while ((idx = buffer.indexOf('\n\n')) >= 0) {
                const chunk = buffer.slice(0, idx);
                buffer = buffer.slice(idx + 2);
                if (chunk.startsWith('data:')) {
                    const data = chunk.slice(5).trimStart();
                    if (data) onText(data);
                }
            }
        }
        onDone && onDone();
    }).catch(() => {
        // ignore
    });

    return () => ctrl.abort();
}


