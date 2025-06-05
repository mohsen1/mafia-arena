import { test, expect } from '@playwright/test';
import Groq from 'groq-sdk';

// This test performs a real API call to Groq using the key provided in the
// GROQ_API_KEY environment variable. It is skipped automatically when the key
// is not available so that CI environments without the secret don't fail.

test('Groq chat completion API responds', async () => {
  const apiKey = process.env.GROQ_API_KEY;
  test.skip(!apiKey, 'GROQ_API_KEY not set');

  const client = new Groq({ apiKey });
  const completion = await client.chat.completions.create({
    model: 'llama3-8b-8192',
    messages: [{ role: 'user', content: 'Say hello from Playwright' }],
    max_tokens: 10,
  });

  expect(completion.choices.length).toBeGreaterThan(0);
  const content = completion.choices[0].message?.content ?? '';
  expect(content.length).toBeGreaterThan(0);
});
