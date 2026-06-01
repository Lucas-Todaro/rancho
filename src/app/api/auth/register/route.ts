import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    error: "O acesso ao Rancho é feito apenas por convite. Fale com o administrador do Rancho."
  }, { status: 403 });
}
