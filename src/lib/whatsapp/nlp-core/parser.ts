import type { ParsedRanchoMessage } from "./types";
import { parseBatchMessage } from "./batch-parser";
import { parseSingleRanchoMessage } from "./intent-detector";
import { evaluateRanchoParseConfidence } from "./confidence-evaluator";
import { parseTabularAnimalEventsMessage } from "./tabular-events";

export function parseRanchoMessage(text: string): ParsedRanchoMessage {
  return evaluateRanchoParseConfidence(text, parseTabularAnimalEventsMessage(text) || parseBatchMessage(text) || parseSingleRanchoMessage(text));
}
