const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");

const token = "8072672790:AAH0vfEJMn34EBKWnsluaeKkmRSSiMx6h90"; // o‘zingizning bot tokeningizni yozing
const bot = new TelegramBot(token, { polling: true });

const adminId = 907402803;
const channelUsername = "@panjara_ortida_prison_berk";

const ensureFile = (path) => {
  if (!fs.existsSync(path)) fs.writeFileSync(path, "[]");
};
ensureFile("users.json");
ensureFile("videos.json");

let adminStep = {
  stage: null,
  video: null,
  code: null,
};

const isSubscribed = async (userId) => {
  try {
    const res = await bot.getChatMember(channelUsername, userId);
    return ["member", "creator", "administrator"].includes(res.status);
  } catch {
    return false;
  }
};

const saveUser = (user) => {
  const users = JSON.parse(fs.readFileSync("users.json", "utf8"));
  if (!users.find((u) => u.id === user.id)) {
    users.push({
      id: user.id,
      first_name: user.first_name,
      username: user.username || "",
      joined_at: new Date().toISOString(),
    });
    fs.writeFileSync("users.json", JSON.stringify(users, null, 2));
  }
};

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  const user = msg.from;

  const subscribed = await isSubscribed(user.id);
  if (!subscribed && user.id !== adminId) {
    return bot.sendMessage(
      chatId,
      "❗ Botdan foydalanish uchun quyidagi kanalga obuna bo‘ling:",
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🔗 Obuna bo‘lish",
                url: `https://t.me/${channelUsername.replace("@", "")}`,
              },
            ],
            [{ text: "✅ Tekshirish", callback_data: "check_sub" }],
          ],
        },
      }
    );
  }

  saveUser(user);

  if (text === "/start") {
    if (user.id === adminId) {
      return bot.sendMessage(chatId, "👋 Admin menyu:", {
        reply_markup: {
          keyboard: [
            ["➕ Kino qo‘shish", "📊 Statistikani ko‘rish"],
            ["👥 Barchaga habar yuborish"],
          ],
          resize_keyboard: true,
        },
      });
    } else {
      return bot.sendMessage(
        chatId,
        `*👋 Xush kelibsiz! ${msg.from.first_name}  Kino kodi yuboring, men sizga mos videoni topib beraman.*`,
        {
          parse_mode: "Markdown",
        }
      );
    }
  }
  if (user.id === adminId) {
    if (text === "❌ Bekor qilish") {
      adminStep = { stage: null, video: null, code: null };
      return bot.sendMessage(chatId, "❌ Amaliyot bekor qilindi.");
    }

    if (text === "📊 Statistikani ko‘rish") {
      const users = JSON.parse(fs.readFileSync("users.json", "utf8"));
      const videos = JSON.parse(fs.readFileSync("videos.json", "utf8"));
      return bot.sendMessage(
        chatId,
        `📊 Statistika:\n👥 Foydalanuvchilar: ${users.length}\n🎬 Kinolar: ${videos.length}`
      );
    }

    if (text === "➕ Kino qo‘shish") {
      adminStep.stage = "waiting_for_video";
      return bot.sendMessage(chatId, "📥 Kino videosini yuboring:");
    }

    if (text === "👥 Barchaga habar yuborish") {
      bot.broadcasting = true;
      return bot.sendMessage(
        chatId,
        "✉️ Yubormoqchi bo‘lgan xabaringizni yozing:"
      );
    }
  }

  if (user.id === adminId && bot.broadcasting) {
    const users = JSON.parse(fs.readFileSync("users.json", "utf8"));
    users.forEach((u) => {
      bot.sendMessage(u.id, text).catch(() => {});
    });
    bot.broadcasting = false;
    return bot.sendMessage(chatId, "✅ Xabar yuborildi.");
  }

  if (user.id === adminId) {
    if (msg.video && adminStep.stage === "waiting_for_video") {
      adminStep.video = msg.video.file_id;
      adminStep.stage = "waiting_for_code";
      return bot.sendMessage(chatId, "🔢 Kino kodi?");
    }

    if (adminStep.stage === "waiting_for_code" && /^\d+$/.test(text)) {
      adminStep.code = text;
      adminStep.stage = "waiting_for_title";
      return bot.sendMessage(chatId, "🎬 Kino nomi?");
    }

    if (adminStep.stage === "waiting_for_title") {
      const videos = JSON.parse(fs.readFileSync("videos.json", "utf8"));
      videos.push({
        code: adminStep.code,
        file_id: adminStep.video,
        title: text,
      });
      fs.writeFileSync("videos.json", JSON.stringify(videos, null, 2));
      adminStep = { stage: null, video: null, code: null };
      return bot.sendMessage(chatId, "✅ Kino saqlandi!");
    }
  }

  if (!/^\d+$/.test(text)) {
    return bot.sendMessage(chatId, "❗ Iltimos, faqat raqam kiriting.");
  }

  const videos = JSON.parse(fs.readFileSync("videos.json", "utf8"));
  const found = videos.find((v) => v.code === text);
  if (!found) {
    return bot.sendMessage(
      chatId,
      `❗ Hozircha ${text} kodiga bog'liq kino yo‘q.`
    );
  }

  return bot.sendVideo(chatId, found.file_id, {
    caption: `🎬  ${found.title}`,
  });
});

bot.on("callback_query", async (query) => {
  const userId = query.from.id;
  const chatId = query.message.chat.id;

  if (query.data === "check_sub") {
    const subscribed = await isSubscribed(userId);
    if (subscribed) {
      saveUser(query.from);
      return bot.sendMessage(
        chatId,
        "✅ Obuna tasdiqlandi! Endi foydalanishingiz mumkin."
      );
    } else {
      return bot.sendMessage(chatId, "❗ Siz hali obuna bo‘lmagansiz.");
    }
  }
});
