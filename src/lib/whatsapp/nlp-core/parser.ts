import type { ParsedRanchoMessage } from "./types";
import { parseBatchMessage } from "./batch-parser";
import { parseSingleRanchoMessage } from "./intent-detector";
import { evaluateRanchoParseConfidence } from "./confidence-evaluator";

export function parseRanchoMessage(text: string): ParsedRanchoMessage {
  return evaluateRanchoParseConfidence(text, parseBatchMessage(text) || parseSingleRanchoMessage(text));
}
