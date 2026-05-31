function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function twiml(message: string) {
  return `<Response>
  <Message>${message}</Message>
</Response>`;
}

function xmlResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/xml"
    }
  });
}

export async function GET() {
  return new Response("Method Not Allowed", { status: 405 });
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const params = new URLSearchParams(rawBody);

    const Body = params.get("Body") || "";
    const From = params.get("From") || "";
    const To = params.get("To") || "";
    const MessageSid = params.get("MessageSid") || "";

    console.log("[Twilio webhook]", { Body, From, To, MessageSid });

    return xmlResponse(twiml(`Mensagem recebida no Rancho: ${escapeXml(Body)}`));
  } catch (error) {
    console.error("[Twilio webhook]", error);
    return xmlResponse(twiml("Erro interno no Rancho. Tente novamente."));
  }
}
