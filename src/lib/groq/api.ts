// import { cache } from "react"; // Removed unused import
// import Groq from "groq-sdk"; // Removed unused import
import type {} from // ModelListResponse as GroqModelListResponse, // Removed unused import
"groq-sdk/resources/models";

interface GroqModel {
  id: string;
  // Add other known properties if available
}

/**
 * Fetches the list of available models from the Groq API.
 * Requires the GROQ_API_KEY environment variable to be set.
 *
 * @returns {Promise<string[]>} A promise resolving to an array of model IDs.
 * @throws If the API key is missing or the fetch request fails.
 */
export async function getGroqModels(): Promise<string[]> {
  const apiKey = process.env.GROQ_API_KEY;
  const groqApiUrl = "https://api.groq.com/openai/v1/models";

  if (!apiKey) {
    console.error("Missing GROQ_API_KEY environment variable.");
    // Return an empty list or a default list if preferred when key is missing
    // throw new Error('Missing GROQ_API_KEY environment variable.');
    return []; // Return empty list for now
  }

  try {
    const response = await fetch(groqApiUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Groq API request failed with status ${response.status}: ${errorBody}`,
      );
    }

    const data = await response.json();

    // Extract model IDs from the response data structure
    if (data && Array.isArray(data.data)) {
      const modelIds: string[] = data.data
        .map((model: GroqModel) => model.id)
        .filter(
          (id: string | undefined): id is string => typeof id === "string",
        );
      console.log(`Fetched ${modelIds.length} models from Groq.`);
      return modelIds;
    }
    // If we reach here, the format was unexpected
    throw new Error("Unexpected response format from Groq API");
  } catch (error) {
    let errorMessage = "Failed to fetch models from Groq.";
    if (error instanceof Error) {
      errorMessage += ` ${error.message}`;
    }
    console.error(errorMessage, error);
    // Return empty list on error or re-throw
    // throw new Error(`Failed to fetch models: ${error.message}`);
    return []; // Return empty list on error
  }
}
