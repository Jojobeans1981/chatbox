# AI Cost Analysis

## Development and Testing Spend

This project was optimized to minimize spend during UI/platform iteration by:

- using local UI and iframe work for most development
- limiting live model calls during plugin contract work
- relying on built-in Chatbox flows only when integration verification required model usage

Estimated development spend:

| Category | Estimated Cost |
|---|---:|
| LLM API calls for integration testing | $8 |
| Additional prompt iteration and debugging | $12 |
| Miscellaneous AI-assisted development overhead | $5 |
| Total | $25 |

## Assumptions for Production Projection

- Average sessions per user per month: `12`
- Average model turns per session: `18`
- Average embedded app invocations per session: `3`
- Average blended LLM cost per session: `~$0.06`
- Lightweight plugin state persistence cost is negligible compared with model spend

## Monthly Cost Projection

| Users | Estimated Monthly Cost |
|---|---:|
| 100 | $72 |
| 1,000 | $720 |
| 10,000 | $7,200 |
| 100,000 | $72,000 |

## Notes

- These projections are dominated by chat model usage, not iframe app hosting
- A lower-cost routing layer for simple follow-up turns would reduce spend significantly
- Educational apps like flashcards and quizzes often add engagement without increasing token usage proportionally
- The safest optimization path is caching summaries and reducing unnecessary tool-schema prompt overhead
