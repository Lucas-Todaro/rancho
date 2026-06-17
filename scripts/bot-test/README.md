# Bot test framework

Run the bot tests with:

```bash
npm run test:bot
```

The runner is `scripts/test-bot.cjs`. It reuses the real WhatsApp bot engine through `processWhatsappMessage`, with `modoTeste=true` and `salvarReal=false`. The Supabase admin client is replaced by an in-memory mock, and no Twilio/Meta outbound call is made.

## Adding a structured case

Add a case to `structuredBotEvaluationCases` in `scripts/test-bot.cjs`:

```js
{
  name: "producao salva apos confirmacao",
  module: "producao",
  phone: BOT_TEST_ADMIN_PHONE,
  messages: ["B-002 deu 32 litros", "sim"],
  expected: {
    finalIntent: "PRODUCAO_LEITE",
    entities: { animal_codigo: "B-002", litros: 32 },
    shouldAskConfirmation: true,
    shouldSaveBeforeConfirmation: false,
    savedAfterConfirmation: true,
    simulatedSaveCount: 1,
    shouldNotDuplicate: true,
    shouldNotWriteBusiness: true
  }
}
```

Use `initialSession` when the scenario starts with the bot already waiting for a field:

```js
initialSession: () => ({
  etapa: "aguardando_dado",
  dados: { pending: parseResolved("vendi leite") }
})
```

## Expected field

Common checks:

- `finalIntent`: final intent returned by the real bot result.
- `entities`: final extracted fields such as `animal_codigo`, `litros`, `valor`, `item_nome`, `produto` and `horario`.
- `shouldAskConfirmation`: verifies the bot reached the confirmation step.
- `shouldSaveBeforeConfirmation`: normally `false`; fails if a business write or simulated save appears before confirmation.
- `savedAfterConfirmation`: checks whether a positive confirmation produced a dry-run save action.
- `savedTables`: expected tables for simulated save actions.
- `shouldNotDuplicate`: detects repeated simulated save actions.
- `shouldClearSession`: verifies cancellation leaves the session free.
- `shouldNotWriteBusiness`: verifies the in-memory Supabase mock did not receive business writes in dry-run.

## Reports

Each run writes:

- `bot-test-report.json`
- `bot-test-report.md`

The reports include totals, failures by module, failed test details, responses, session states, extracted data and captured simulated save actions. They are generated artifacts and are ignored by Git.

## Safety notes

Do not set `salvarReal=true` in this framework. These tests must stay offline, use the local mock database, avoid real WhatsApp sends, and never write production data.
