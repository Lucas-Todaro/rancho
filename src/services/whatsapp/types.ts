import type { AnyRecord } from "@/lib/types";
import type { ParsedRanchoMessage } from "@/lib/whatsapp/nlp";
import type { BotSession } from "@/services/whatsapp/session-service";

export type ProcessWhatsappMessageInput = {
  telefone: string;
  mensagem: string;
  provider: "twilio" | "simulador" | "meta" | "whatsapp";
  modoTeste?: boolean;
  salvarReal?: boolean;
  messageSid?: string;
  to?: string;
  raw?: AnyRecord;
};

export type ProcessWhatsappMessageResult = {
  respostaTexto: string;
  intencaoDetectada: ParsedRanchoMessage["tipo"] | null;
  confianca: number | null;
  dadosExtraidos: AnyRecord | null;
  estadoAnterior: BotSession["etapa"] | null;
  estadoNovo: BotSession["etapa"] | null;
  camposFaltantes: string[];
  eventoConfirmado: boolean;
  erro: string | null;
  debug?: AnyRecord | null;
};
