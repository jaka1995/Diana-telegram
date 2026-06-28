// Minimal Telegram Bot API client + inline keyboard helpers.

export type InlineButton =
  | { text: string; callback_data: string }
  | { text: string; url: string };

export function btn(text: string, callback_data: string): InlineButton {
  return { text, callback_data };
}

export function urlBtn(text: string, url: string): InlineButton {
  return { text, url };
}

/** Build a reply_markup object from rows of inline buttons. */
export function keyboard(rows: InlineButton[][]) {
  return { reply_markup: { inline_keyboard: rows } };
}

export function makeTg(token: string) {
  const base = `https://api.telegram.org/bot${token}`;

  async function call(
    method: string,
    body: Record<string, unknown>,
    canRetry = true,
  ): Promise<any> {
    const res = await fetch(`${base}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) {
      // Respect Telegram rate limiting: wait the suggested time and retry once.
      if (data.error_code === 429 && canRetry) {
        const wait = ((data.parameters?.retry_after ?? 1) * 1000) + 100;
        await new Promise((r) => setTimeout(r, wait));
        return call(method, body, false);
      }
      console.error(`Telegram API error [${method}]:`, JSON.stringify(data));
    }
    return data;
  }

  return {
    call,
    sendMessage(
      chat_id: number,
      text: string,
      opts: Record<string, unknown> = {},
    ) {
      return call("sendMessage", {
        chat_id,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...opts,
      });
    },
    answerCallbackQuery(callback_query_id: string, text?: string) {
      return call("answerCallbackQuery", { callback_query_id, text });
    },
  };
}

export type Tg = ReturnType<typeof makeTg>;
