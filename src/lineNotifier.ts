import type { LineNotificationSecrets } from "./types.js";

export class LineNotifier {
  constructor(private readonly secrets: LineNotificationSecrets) {}

  async send(message: string): Promise<void> {
    const response = await fetch(this.secrets.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secrets.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: this.secrets.recipientId,
        messages: [
          {
            type: "text",
            text: message,
          },
        ],
      }),
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      throw new Error(`LINE notification failed: ${response.status} ${responseText}`.trim());
    }
  }
}
