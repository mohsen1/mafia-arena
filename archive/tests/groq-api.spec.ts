import { test, expect } from '@playwright/test';
import Groq from 'groq-sdk';
import http from 'http';

// This test performs a real API call to Groq using the key provided in the
// GROQ_API_KEY environment variable. It is skipped automatically when the key
// is not available so that CI environments without the secret don't fail.

test('Groq chat completion API responds (mocked)', async () => {
  // Create a tiny local HTTP server to mock the Groq API
  const server = http.createServer((req, res) => {
    if (req.url?.includes('/chat/completions')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          choices: [
            { message: { content: 'Hello from the mock Groq API!' } },
          ],
        })
      );
    } else {
      res.statusCode = 404;
      res.end();
    }
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  const client = new Groq({ apiKey: 'test', baseURL: `http://localhost:${port}` });
  const completion = await client.chat.completions.create({
    model: 'llama3-8b-8192',
    messages: [{ role: 'user', content: 'Say hello from Playwright' }],
    max_tokens: 10,
  });

  expect(completion.choices.length).toBeGreaterThan(0);
  const content = completion.choices[0].message?.content ?? '';
  expect(content).toContain('Hello from the mock Groq API');

  server.close();
});
