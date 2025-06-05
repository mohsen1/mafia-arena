/**
 * Utility functions for string manipulation, particularly for cleaning AI responses.
 */

/**
 * Cleans an AI response by removing <think> blocks and other unwanted content.
 * This helps ensure AI outputs don't include internal reasoning or markdown that
 * shouldn't be shown to users.
 *
 * @param response The raw text response from the AI
 * @returns A cleaned version of the response
 */
export function cleanAIResponse(response: string): string {
  if (!response) return '';

  let cleanedResponse = response;

  cleanedResponse = cleanedResponse.replace(/<think>[\s\S]*?<\/think>/g, '');

  cleanedResponse = cleanedResponse.replace(
    /```(?:json|javascript|js)?([\s\S]*?)```/g,
    '$1'
  );

  cleanedResponse = cleanedResponse.replace(/`/g, '');

  cleanedResponse = cleanedResponse.replace(
    /^\s*(?:Reasoning|Thought|Thinking|Analysis):\s*/i,
    ''
  );

  // Collapse multiple newlines first
  cleanedResponse = cleanedResponse.replace(/\n{3,}/g, '\n\n');
  // Trim whitespace at the very end
  cleanedResponse = cleanedResponse.trim();

  return cleanedResponse;
}

/**
 * Extracts a JSON object from a string that might contain extra text.
 * Useful for when AI models add explanations around requested JSON.
 *
 * @param text The text potentially containing a JSON object
 * @returns The extracted JSON string, or the original if no JSON found
 */
export function extractJSONFromText(text: string): string {
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return text.substring(firstBrace, lastBrace + 1);
  }

  return text;
}

/**
 * Escapes control characters in JSON string values to make the JSON valid for parsing.
 * This is particularly useful when AI models return JSON with unescaped newlines or other control characters.
 *
 * @param jsonString The potentially invalid JSON string
 * @returns A valid JSON string with properly escaped control characters
 */
export function escapeJSONControlCharacters(jsonString: string): string {
  if (!jsonString) return '';

  // Simple approach: replace literal newlines, tabs, etc. in JSON string values
  // This regex matches JSON string values (accounting for escaped quotes)
  return jsonString.replace(/"((?:[^"\\]|\\.)*)"/g, (match, content) => {
    // Don't process if this might be a JSON key (followed by colon)
    const afterMatch = jsonString.slice(
      jsonString.indexOf(match) + match.length
    );
    const nextNonWhitespace = afterMatch.match(/^\s*(.)/)?.[1];
    if (nextNonWhitespace === ':') {
      return match; // This is likely a key, don't escape it
    }

    // Replace literal control characters with escaped versions
    // Handle already escaped sequences first by temporarily replacing them
    const escaped = content
      .replace(/\\\\/g, '\uE000') // Temporarily replace escaped backslashes
      .replace(/\\n/g, '\uE001') // Temporarily replace escaped newlines
      .replace(/\\r/g, '\uE002') // Temporarily replace escaped carriage returns
      .replace(/\\t/g, '\uE003') // Temporarily replace escaped tabs
      .replace(/\n/g, '\\n') // Escape literal newlines
      .replace(/\r/g, '\\r') // Escape literal carriage returns
      .replace(/\t/g, '\\t') // Escape literal tabs
      .replace(/\uE000/g, '\\\\') // Restore escaped backslashes as double-escaped
      .replace(/\uE001/g, '\\\\n') // Restore escaped newlines as double-escaped
      .replace(/\uE002/g, '\\\\r') // Restore escaped carriage returns as double-escaped
      .replace(/\uE003/g, '\\\\t'); // Restore escaped tabs as double-escaped

    return `"${escaped}"`;
  });
}

// Export additional string utility functions as needed
