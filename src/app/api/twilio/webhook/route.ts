import { handleTwilioRanchoMessage } from "@/services/whatsapp/twilio";
import { isOversizedText, maskSensitivePhone, safeErrorText, sanitizeFreeText } from "@/lib/security";

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
      "Content-Type": "text/xml; charset=utf-8"
    }
  });
}

export async function GET() {
  return new Response("Method Not Allowed", { status: 405 });
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType && !contentType.toLowerCase().includes("application/x-www-form-urlencoded")) {
      return xmlResponse(twiml("Formato de mensagem inválido."), 415);
    }

    const rawBody = await request.text();
    if (isOversizedText(rawBody, 10000)) {
      return xmlResponse(twiml("Mensagem muito longa para processar com segurança."), 413);
    }

    const params = new URLSearchParams(rawBody);

    const Body = sanitizeFreeText(params.get("Body") || "");
    const From = sanitizeFreeText(params.get("From") || "", 80);
    const To = sanitizeFreeText(params.get("To") || "", 80);
    const MessageSid = sanitizeFreeText(params.get("MessageSid") || "", 120);

    console.log("[Twilio webhook]", {
      From: maskSensitivePhone(From),
      To: maskSensitivePhone(To),
      MessageSid,
      hasBody: Boolean(Body)
    });

    const responseMessage = await handleTwilioRanchoMessage({ Body, From, To, MessageSid });

    return xmlResponse(twiml(escapeXml(responseMessage)));
  } catch (error) {
    console.error("[Twilio webhook]", safeErrorText(error));
    return xmlResponse(twiml("Erro interno no Rancho. Tente novamente."));
  }
}
