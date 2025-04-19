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
  if (!response) return "";

  let cleanedResponse = response;

  cleanedResponse = cleanedResponse.replace(/<think>[\s\S]*?<\/think>/g, "");

  cleanedResponse = cleanedResponse.replace(
    /```(?:json|javascript|js)?([\s\S]*?)```/g,
    "$1",
  );

  cleanedResponse = cleanedResponse.replace(/`/g, "");

  cleanedResponse = cleanedResponse.replace(
    /^(?:Reasoning|Thought|Thinking|Analysis):\s*/i,
    "",
  );

  cleanedResponse = cleanedResponse.trim().replace(/\n{3,}/g, "\n\n");

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
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return text.substring(firstBrace, lastBrace + 1);
  }

  return text;
}

// Export additional string utility functions as needed
