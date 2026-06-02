import type { ParsedRanchoMessage } from "./types";
import { parseBatchMessage } from "./batch-parser";
import { parseSingleRanchoMessage } from "./intent-detector";

export function parseRanchoMessage(text: string): ParsedRanchoMessage {
  return parseBatchMessage(text) || parseSingleRanchoMessage(text);
}
