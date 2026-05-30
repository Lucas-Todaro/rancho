import { NextResponse } from "next/server";
import { isMetaConfigured, isServerSupabaseConfigured, isSupabaseConfigured } from "@/lib/env";

export async function GET() {
  return NextResponse.json({
    supabasePublic: isSupabaseConfigured(),
    supabaseServer: isServerSupabaseConfigured(),
    meta: isMetaConfigured(),
    timestamp: new Date().toISOString()
  });
}
