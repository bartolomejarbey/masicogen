export function streamPlainText(text: string, delayMs = 12) {
  const encoder = new TextEncoder();
  const chunks = text.match(/.{1,28}(\s|$)/g) ?? [text];

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      controller.close();
    }
  });
}
