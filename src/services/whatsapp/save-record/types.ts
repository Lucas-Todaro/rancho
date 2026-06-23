import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AnyRecord } from "@/lib/types";
import type { ParsedRanchoMessage } from "@/lib/whatsapp/nlp";
import type { WhatsAppOwner } from "@/services/whatsapp/identity";
import type { BotSession } from "@/services/whatsapp/session-service";

export type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

export type SaveResult = {
  response: string;
  nextSession?: BotSession;
  sessionData?: AnyRecord;
  savedReal?: boolean;
  savedTables?: string[];
};

export type SaveRecordDependencies = Record<string, any>;

export type SaveRecordContext = {
  supabase: SupabaseAdmin;
  owner: WhatsAppOwner;
  pending: ParsedRanchoMessage;
};

export type SaveConfirmedRecordRunner = (
  supabase: SupabaseAdmin,
  owner: WhatsAppOwner,
  pending: ParsedRanchoMessage
) => Promise<SaveResult>;

export type SaveRecordHandlerContext = SaveRecordContext & {
  deps: SaveRecordDependencies;
  saveConfirmedRecord: SaveConfirmedRecordRunner;
};
