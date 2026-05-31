import { NextRequest } from "next/server";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const incoming = {
    body: String(formData.get("Body") ?? ""),
    from: String(formData.get("From") ?? ""),
    to: String(formData.get("To") ?? ""),
    messageSid: String(formData.get("MessageSid") ?? "")
  };

  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Mensagem recebida no Rancho: ${escapeXml(incoming.body)}</Message></Response>`;

  return new Response(twiml, {
    status: 200,
    headers: {
      "Content-Type": "text/xml; charset=utf-8"
    }
  });
}
