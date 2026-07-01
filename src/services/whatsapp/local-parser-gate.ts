import {
  parseRanchoMessage,
  parseTabularAnimalEventsMessageAs
} from "@/lib/whatsapp/nlp";
import { detectStructuredInput, looksLikeCollapsedStructuredInput } from "@/lib/whatsapp/nlp-core/tabular-events";

export {
  detectStructuredInput,
  looksLikeCollapsedStructuredInput,
  parseRanchoMessage,
  parseTabularAnimalEventsMessageAs
};
