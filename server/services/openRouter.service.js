import axios from "axios"

/**
 * Call the OpenRouter LLM API with automatic retry and exponential backoff.
 * Retries up to 3 times on transient errors (network, 429 rate limit, 5xx).
 *
 * @param {Array}  messages  - Chat messages array
 * @param {number} retries   - Max attempts (default 3)
 */
export const askAi = async (messages, retries = 3) => {
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        throw new Error("Messages array is empty.");
    }

    let lastError;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await axios.post(
                "https://openrouter.ai/api/v1/chat/completions",
                {
                    model: "openai/gpt-4o-mini",
                    messages,
                },
                {
                    headers: {
                        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                        "Content-Type": "application/json",
                    },
                    timeout: 20000, // 20s timeout per attempt
                }
            );

            const content = response?.data?.choices?.[0]?.message?.content;

            if (!content || !content.trim()) {
                throw new Error("AI returned empty response.");
            }

            return content;

        } catch (error) {
            lastError = error;
            const status = error.response?.status;
            const isRetryable = !status || status === 429 || status >= 500;

            if (!isRetryable || attempt === retries) break;

            // Exponential backoff: 500ms, 1000ms, 1500ms
            const delay = 500 * attempt;
            console.warn(`OpenRouter attempt ${attempt} failed (${status || "network"}). Retrying in ${delay}ms…`);
            await new Promise(r => setTimeout(r, delay));
        }
    }

    const errDetail = lastError.response?.data?.error?.message || lastError.message;
    console.error("OpenRouter Error (all retries exhausted):", errDetail);
    throw new Error(`OpenRouter API Error: ${errDetail}`);
}