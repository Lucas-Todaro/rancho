import { processWhatsappMessage } from "@/services/whatsapp/process-message";

type TwilioMessageInput = {
  Body: string;
  From: string;
  To: string;
  MessageSid: string;
};

export async function handleTwilioRanchoMessage(input: TwilioMessageInput) {
  const result = await processWhatsappMessage({
    telefone: input.From,
    mensagem: input.Body,
    provider: "twilio",
    modoTeste: false,
    messageSid: input.MessageSid,
    to: input.To,
    raw: {
      from: input.From,
      to: input.To,
      messageSid: input.MessageSid
    }
  });

  return result.respostaTexto;
}
