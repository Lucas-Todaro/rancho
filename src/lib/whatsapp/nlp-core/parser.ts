import type { ParsedRanchoMessage } from "./types";
import { parseBatchMessage } from "./batch-parser";
import { parseSingleRanchoMessage } from "./intent-detector";
import { evaluateRanchoParseConfidence } from "./confidence-evaluator";
import { finalize } from "./result";
import { detectStructuredInput, looksLikeCollapsedStructuredInput, parseTabularAnimalEventsMessage } from "./tabular-events";
import {
  detectDestructiveBulkAction,
  destructiveBulkActionParsed,
  normalizeReproductionQueries
} from "./safety-guards";

export function parseRanchoMessage(text: string): ParsedRanchoMessage {
  if (detectDestructiveBulkAction(text)) return destructiveBulkActionParsed(text);

  const structuredDetection = detectStructuredInput(text);
  const parsed = !structuredDetection.isStructured && looksLikeCollapsedStructuredInput(text)
    ? finalize("DESCONHECIDO", {}, [], 0.2)
    : evaluateRanchoParseConfidence(text, parseTabularAnimalEventsMessage(text) || parseBatchMessage(text) || parseSingleRanchoMessage(text));
  const normalized = normalizeReproductionQueries(text, parsed);
  return {
    ...normalized,
    dados: {
      ...(normalized.dados || {}),
      route: normalized.dados?.route || (structuredDetection.isStructured ? "structured_input" : "normal_message"),
      structuredDetection: normalized.dados?.structuredDetection || structuredDetection,
      interpreter_final_usado: normalized.dados?.interpreter_final_usado || "local_parser"
    }
  };
}
