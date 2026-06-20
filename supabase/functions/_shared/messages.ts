// All user-facing bot texts (RU) + the inline keyboards that go with them.
// Texts mirror the existing Flymind bot screenshots.

import { btn, InlineButton, keyboard, urlBtn } from "./telegram.ts";

export const PROMO_CODE = Deno.env.get("PROMO_CODE") ?? "Freeaba60kz";
export const IOS_URL = Deno.env.get("IOS_URL") ?? "https://apps.apple.com/app/flymind";
export const ANDROID_URL = Deno.env.get("ANDROID_URL") ??
  "https://play.google.com/store/apps/details?id=com.flymind";

// ---- Welcome / onboarding ----------------------------------------------------

export const WELCOME = `Приветствуем Вас ❤️

Мы создаём уникальное АВА-приложение — <b>Flymind</b>, не имеющее аналогов в мире! Это незаменимый помощник родителей особенных детей, который облегчит жизнь каждому из Вас.

Предлагаем Вам активировать <b>60 дней бесплатного доступа</b> (вместо $30)!

Пользуйтесь приложением, оставляйте обратную связь. После 2 месяцев участия Вы получите <b>ПОЖИЗНЕННУЮ подписку</b> — совершенно бесплатно.

Для начала работы нажмите на кнопку «Начать».`;

export const welcomeKb = keyboard([[btn("Начать!", "begin")]]);

export const ASK_EMAIL = "Введите адрес Вашей электронной почты ✉️";

export const EMAIL_INVALID =
  "Кажется, это не похоже на email. Пожалуйста, введите корректный адрес электронной почты.";

export const EMAIL_SAVED = "Спасибо! Для получения промокода нажмите на кнопку 👇";
export const emailSavedKb = keyboard([[btn("Получить промокод", "get_promo")]]);

// ---- Promo code --------------------------------------------------------------

export function promoText(): string {
  return `Ваш промокод:\n\n<code>${PROMO_CODE}</code>\n\nНажмите на код, чтобы скопировать. Дальше — инструкция по активации 👇`;
}
export const promoKb = keyboard([[btn("Инструкция", "instruction")]]);

export const INSTRUCTION = `<b>Инструкция по применению промокода:</b>
1. Скачайте приложение Flymind по ссылкам ниже
2. Пройдите авторизацию
3. Перейдите в раздел настроек (значок шестерёнки)
4. Выберите раздел «Тарифы»
5. В блоке «Basic» нажмите кнопку «Изучить подробнее»
6. В открывшемся окне введите промокод и нажмите «Проверить промокод»
7. Готово ❤️

Начинайте пользоваться приложением, а своими впечатлениями делитесь с нами прямо в этом чате.

Позже мы напомним оставить обратную связь.

Благодарим, что Вы с нами ✨`;

export const instructionKb = keyboard([
  [urlBtn("Скачать приложение на iOS", IOS_URL)],
  [urlBtn("Скачать приложение на Android", ANDROID_URL)],
]);

// ---- Help / description ------------------------------------------------------

export const HELP = `<b>Flymind</b> — ваш карманный эксперт по АВА-терапии дома.
✨ Вы делитесь мнением о приложении, а мы через 2 месяца подарим Вам подписку НАВСЕГДА!
👉 Нажмите /start, чтобы начать.`;

// ---- Feedback ----------------------------------------------------------------

export function feedbackThanks(streak: number): string {
  const flame = streak > 0 ? ` 🔥` : "";
  return `Спасибо за обратную связь! 🙏 Мы её записали.

Ваша серия: <b>${streak} дн.</b>${flame}
Так держать — каждый день приближает Вас к пожизненной подписке!`;
}

export function alreadyToday(streak: number): string {
  return `Спасибо, записали и это сообщение! ✍️ За сегодня обратная связь уже засчитана.

Ваша серия: <b>${streak} дн.</b> 🔥
Ждём Вас завтра 🙌`;
}

export const NUDGE_PRESS_BUTTON =
  "Пожалуйста, воспользуйтесь кнопками выше, чтобы продолжить 🙂";

export const NUDGE_START =
  "Чтобы начать, нажмите /start 🙂";

// ---- Reminders (sent by the cron job) ---------------------------------------

export function reminderText(daysMissed: number, streak: number): {
  text: string;
  kb?: { reply_markup: { inline_keyboard: InlineButton[][] } };
} {
  if (daysMissed >= 7) {
    return {
      text: `Мы по Вам скучаем 🥺
Вы давно не делились впечатлениями о Flymind. Ваше мнение очень важно — оно напрямую влияет на развитие приложения.

Напишите пару слов прямо сейчас, и мы продолжим путь к пожизненной подписке вместе ❤️`,
    };
  }
  if (daysMissed >= 3) {
    return {
      text: `Привет! 👋 Уже несколько дней без обратной связи.
Серия сбросилась, но это легко начать заново — просто напишите, как Вам приложение сегодня 🙏`,
    };
  }
  const streakLine = streak > 0
    ? `\nВаша серия: <b>${streak} дн.</b> 🔥 Не теряйте её!`
    : "";
  return {
    text: `Напоминание 🔔
Как проходит использование Flymind сегодня? Поделитесь, пожалуйста, обратной связью — просто напишите сообщение в этот чат.${streakLine}`,
  };
}
