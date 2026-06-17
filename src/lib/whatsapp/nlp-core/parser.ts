import type { ParsedRanchoMessage } from "./types";
import { parseBatchMessage } from "./batch-parser";
import { parseSingleRanchoMessage } from "./intent-detector";
import { evaluateRanchoParseConfidence } from "./confidence-evaluator";
import { finalize } from "./result";
import { detectStructuredInput, looksLikeCollapsedStructuredInput, parseTabularAnimalEventsMessage } from "./tabular-events";

export function parseRanchoMessage(text: string): ParsedRanchoMessage {
  const structuredDetection = detectStructuredInput(text);
  const parsed = !structuredDetection.isStructured && looksLikeCollapsedStructuredInput(text)
    ? finalize("DESCONHECIDO", {}, [], 0.2)
    : evaluateRanchoParseConfidence(text, parseTabularAnimalEventsMessage(text) || parseBatchMessage(text) || parseSingleRanchoMessage(text));
  return {
    ...parsed,
    dados: {
      ...(parsed.dados || {}),
      route: parsed.dados?.route || (structuredDetection.isStructured ? "structured_input" : "normal_message"),
      structuredDetection: parsed.dados?.structuredDetection || structuredDetection,
      interpreter_final_usado: parsed.dados?.interpreter_final_usado || "local_parser"
    }
  };
}
