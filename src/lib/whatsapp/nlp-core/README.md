# WhatsApp NLP

The public API remains in `src/lib/whatsapp/nlp.ts`. Internal rules live in `src/lib/whatsapp/nlp-core/` so the bot handler can keep importing the same functions while parser responsibilities stay smaller.

- `types.ts`: shared parser contracts and intent names.
- `constants.ts`: examples, question text, keyword maps and shared regular-expression constants.
- `extractors.ts`: pure extraction helpers for animals, stock, finance, employees, dates, numbers and support fields.
- `intent-detector.ts`: orchestrates single-message intent detection in the same priority order as the old parser.
- `batch-parser.ts`: detects multi-record messages and contextual batch segments.
- `contextual-parser.ts`: fills missing fields from short replies based on the pending parser result.
- `result.ts`: missing-field calculation, questions and human-readable summaries.

To add a new rule, put shared words or synonyms in `constants.ts`, pure value extraction in `extractors.ts`, and the intent decision in `intent-detector.ts` or `batch-parser.ts` depending on the flow. Contextual replies such as a lone animal code, amount or product name belong in `contextual-parser.ts`.

Run `npm run test:bot` for bot fixtures and `npm run build` before shipping.
