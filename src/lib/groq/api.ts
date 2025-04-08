import { cache } from 'react'; 

interface GroqModel {
    id: string;
}

interface GroqModelListResponse {
    data: GroqModel[];
}

/**
 * Fetches the list of available models from the Groq API.
 * Uses React cache for server-side deduplication during rendering.
 * IMPORTANT: This function should only be called from Server Components or Server Actions.
 */
export const getGroqModels = cache(async (): Promise<string[]> => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        console.error("GROQ_API_KEY is not set in environment variables.");
        return []; 
    }

    const url = 'https://api.groq.com/openai/v1/models'; 

    try {
        console.log("Fetching models from Groq API...");
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            // next: { revalidate: 3600 } // Optional: revalidate hourly
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Error fetching Groq models: ${response.status} ${response.statusText}`, errorBody);
            return []; 
        }

        const data: GroqModelListResponse = await response.json();
        
        const modelIds = data.data.map(model => model.id).sort(); 
        return modelIds;

    } catch (error) {
        console.error("Network or parsing error fetching Groq models:", error);
        return []; 
    }
});
