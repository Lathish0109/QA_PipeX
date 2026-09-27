import { createServer } from 'node:http';
import type { WorkerRunRequest, WorkerSnapshotRequest } from '@qapipex/shared-types';
import { capturePageSnapshot, runTestSuite } from './runner.js';

const PORT = Number(process.env.PORT ?? 4088);
const SHARED_SECRET = process.env.WORKER_SHARED_SECRET;

if (!SHARED_SECRET) {
  throw new Error('WORKER_SHARED_SECRET must be set.');
}

function isValidRequest(body: unknown): body is WorkerRunRequest {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.testRunId === 'string' &&
    typeof b.projectId === 'string' &&
    typeof b.baseUrl === 'string' &&
    Array.isArray(b.testCases)
  );
}

function isValidSnapshotRequest(body: unknown): body is WorkerSnapshotRequest {
  if (!body || typeof body !== 'object') return false;
  return typeof (body as Record<string, unknown>).baseUrl === 'string';
}

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (req.method !== 'POST' || (req.url !== '/run' && req.url !== '/snapshot')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${SHARED_SECRET}`) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  if (req.url === '/snapshot') {
    if (!isValidSnapshotRequest(body)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid snapshot request shape' }));
      return;
    }
    try {
      const elements = await capturePageSnapshot(body.baseUrl);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ elements }));
    } catch (err) {
      console.error('Page snapshot capture crashed:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: err instanceof Error ? err.message : 'Unknown snapshot error',
        }),
      );
    }
    return;
  }

  if (!isValidRequest(body)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid run request shape' }));
    return;
  }

  try {
    const result = await runTestSuite(body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (err) {
    console.error('Test suite execution crashed:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Unknown execution error',
      }),
    );
  }
});

server.listen(PORT, () => {
  console.log(`QAPipeX worker listening on http://localhost:${PORT}`);
});
