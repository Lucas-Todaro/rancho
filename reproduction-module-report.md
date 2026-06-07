# Reproduction Module Report

## What was added

- New site route: `/reproducao`.
- New frontend screen: `src/components/modules/ReproductionScreen.tsx`.
- New sidebar/global-search entry: `Reproducao`.
- Employee view permission updated so common users can open the page in read-only mode.

## Data structure

- No migration was created.
- No table was added.
- The module reads animals from `animais`.
- The module reads and writes reproductive history in the existing `eventos_animal` table.
- Insemination and birth are stored with existing event types:
  - `tipo = "inseminacao"`
  - `tipo = "parto"`
- Prenhez, pre-parto, protocolo and observacao are stored as `tipo = "observacao"` with a `[Reproducao Animal]` prefix in `descricao`.

## Permissions and safety

- Queries and writes use the existing CRUD services with `fazenda_id` context.
- Users with manager roles can create, edit and remove reproductive events.
- Common users can view the page but cannot create, edit or remove records.
- No Supabase schema, authentication, dashboard, login, deploy, Twilio or WhatsApp parser file was changed.

## Screen behavior

- Animal cards show reproductive status, last event, event count and lot.
- Filters include reproductive status, animal status, category and lot.
- The detail drawer shows summary, form and timeline for the selected animal.
- Event cost still uses the existing event-finance synchronization.
- Birth events still use the existing animal lifecycle synchronization.
