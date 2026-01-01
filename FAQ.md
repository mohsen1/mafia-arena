# Frequently Asked Questions


## Game Design

### Why only core Mafia roles? Why no Doctor, Seer, or other special roles?
We keep the game to Town and Mafia so we're measuring social deduction, persuasion, and strategy instead of who got the lucky power role.

### Why is the team size fixed at 9 Town vs 2 Mafia?
- Balanced win rates from testing.
- Enough voices (11 players) to keep conversations lively.
- Same setup every time so results are comparable.


## Characters & Themes

### Why do games have themes?
Themes prevent repeated names, force varied personalities, and make the dialogue less generic.

### What themes are available?
- Noir (1940s): Private Detectives, Jazz Singers, Disgraced Journalists
- Victorian (London): Clockmakers, Governesses, Apothecaries
- Modern (Tech Hub): Data Scientists, Startup Founders, Baristas
- Fantasy (High Fantasy): Elven Scholars, Dwarven Smiths, Temple Oracles

### How are characters generated?
The engine assigns a name, role, and personality trait from the theme list, then an AI writes a short background and communication style. Fisher-Yates shuffling ensures each player gets a unique archetype in a game.

### How does seeded randomness work?
We use Mulberry32 for reproducible assignments. The same seed and theme give the same character slots. Backstories can vary slightly because temperature is 0.7, but the roster stays consistent.

### Do characters know they are AI?
They speak in character. Mafia know their partner. Town only know their own innocence. No one sees transcripts or meta info.


## Benchmarking Fairness

### Why can't I change the temperature setting?
Temperature is fixed at 0.7 for every action so models are compared under the same conditions. Lower feels robotic; higher gets chaotic.


## Gameplay Balance

### Is it harder to play as Town? The win rates seem lower.
Too early to tell—we need more games. If you are curious, run some with your own keys and add to the data.


## Game Mechanics

### What happens if there is a tie vote?
If multiple players tie for the most votes, we randomly pick one of them to eliminate so the game keeps moving.

### Can Town players see Mafia communications?
No. Mafia have a private night channel. Town only see public chat.

### How do AI players "remember" what happened?
We send the full history by default. When it gets too long, we summarize older rounds and keep recent rounds verbatim.


## Rankings & ELO

### How are ELO ratings calculated?
Standard ELO starting at 1500. Dynamic K-factor: under 30 games -> 32, 30-100 -> 24, over 100 -> 16.

### Do self-play games affect ELO?
No. Same-model matchups are logged but do not change ratings.


## Technical

### What happens if an AI refuses to answer or crashes?
We retry with exponential backoff. If it keeps failing, we fall back to a safe action so the game finishes.

### Which AI providers are supported?
Direct: OpenAI, Anthropic, Google (Gemini), Cerebras, Fireworks, MiniMax. Aggregator: OpenRouter (for Llama, Mistral, Qwen, and more).

### What is the Batch API and how does discount pricing work?
We batch supported requests to cut costs by roughly 40-50%. Games are already asynchronous, so the extra latency is fine. Discounts vary (Anthropic/OpenAI/Google/Cerebras 50%, Fireworks 40%); we pick the best option automatically.


## Prompts & Transparency

### Can I see the prompts used to instruct the AI players?
Yes. Check the [Prompts page](`/prompts`) for every system and action prompt.


### What is "Vote Pattern Analysis"?
We precompute who voted for whom and flag patterns (like repeatedly targeting Town) so models do not lose track while reasoning.


## About the Project

### What is Mafia Arena?
Mafia Arena benchmarks LLMs through the social deduction game Mafia, testing persuasion and deception instead of trivia or math.

### Who built this?
Built by Mohsen Azimi — GitHub: [mohsen1](https://github.com/mohsen1), Twitter: [@mohsen____](https://twitter.com/mohsen____)

### How can I contribute to Mafia Arena?
Run games with your API keys to grow the dataset (batch APIs keep costs lower), and share feedback or issues on [GitHub](https://github.com/mohsen1/mafia-arena).
