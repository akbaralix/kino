const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const { MongoClient } = require("mongodb");
require("dotenv").config();

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const mongoUri = process.env.MONGO_URI;
const client = new MongoClient(mongoUri);
let db, usersCollection, videosCollection;

const adminId = 907402803;
const channelUsername = "@panjara_ortida_prison_berk";

let adminStep = {
  stage: null,
  video: null,
  code: null,
};

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Bot ishlayapti!");
});

app.listen(PORT, () => {
  console.log(`🌐 Server is running on port ${PORT}`);
});

const connectMongo = async () => {
  try {
    await client.connect();
    db = client.db("telegramBot");
    usersCollection = db.collection("users");
    videosCollection = db.collection("videos");
    console.log("✅ MongoDB Atlas ga ulandi!");
    startBot(); // 👉 faqat MongoDB ulanganidan keyin ishga tushiramiza
  } catch (err) {
    console.error("❌ MongoDB ulanishda xatolik:", err);
  }
};

connectMongo();
const isSubscribed = async (userId) => {
  try {
    const res = await bot.getChatMember(channelUsername, userId);
    return ["member", "creator", "administrator"].includes(res.status);
  } catch {
    return false;
  }
};

const saveUser = async (user) => {
  await usersCollection.updateOne(
    { id: user.id },
    {
      $set: {
        first_name: user.first_name,
        username: user.username || "",
        last_seen: new Date().toISOString(),
      },
    },
    { upsert: true }
  );
};

function startBot() {
  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    const user = msg.from;
    const adminKeyboard = {
      keyboard: [
        ["➕ Kino qo‘shish", "📊 Statistikani ko‘rish"],
        ["👥 Barchaga habar yuborish"],
      ],
      resize_keyboard: true,
    };

    await saveUser(user);

    if (text === "/start") {
      if (user.id === adminId) {
        return bot.sendMessage(
          chatId,
          `🧑‍💻*Salom Admin* [${user.first_name}](tg://user?id=${user.id})`,
          {
            parse_mode: "Markdown",
            reply_markup: adminKeyboard,
          }
        );
      } else {
        return bot.sendMessage(
          chatId,
          `*👋 Assalomu alaykum* [${msg.from.first_name}](tg://user?id=${msg.from.id}) *botimizga xush kelibsiz.*\n\n✍🏻 Kino kodini yuboring...`,
          {
            parse_mode: "Markdown",
          }
        );
      }
    }

    const subscribed = await isSubscribed(user.id);
    if (!subscribed && user.id !== adminId) {
      return bot.sendMessage(
        chatId,
        "*❌ Kechirasiz botimizdan foydalanishdan oldin ushbu kanallarga a'zo bo'lishingiz kerak.*",
        {
          parse_mode: "Markdown",
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
    if (user.id === adminId) {
      if (text === "❌ Bekor qilish") {
        adminStep = { stage: null, video: null, code: null };
        bot.broadcasting = false;
        return bot.sendMessage(chatId, "❌ Amaliyot bekor qilindi.", {
          reply_markup: adminKeyboard,
        });
      }

      if (text === "📊 Statistikani ko‘rish") {
        const usersCount = await usersCollection.countDocuments();
        const videosCount = await videosCollection.countDocuments();
        return bot.sendMessage(
          chatId,
          `📊 Statistika:\n👥 Foydalanuvchilar: ${usersCount}\n🎬 Kinolar: ${videosCount}`
        );
      }
      if (text === "➕ Kino qo‘shish") {
        adminStep.stage = "waiting_for_video";
        return bot.sendMessage(chatId, "📥 Kino videosini yuboring:", {
          reply_markup: {
            keyboard: [["❌ Bekor qilish"]],
            resize_keyboard: true,
          },
        });
      }

      if (text === "👥 Barchaga habar yuborish") {
        bot.broadcasting = true;
        return bot.sendMessage(
          chatId,
          "✉️ Yubormoqchi bo‘lgan xabaringizni yozing:",
          {
            reply_markup: {
              keyboard: [["❌ Bekor qilish"]],
              resize_keyboard: true,
            },
          }
        );
      }
    }

    if (user.id === adminId && bot.broadcasting) {
      bot.broadcasting = false;

      if (msg.photo) {
        const photoId = msg.photo[msg.photo.length - 1].file_id; // eng sifatlisini olish
        const caption = msg.caption || "";

        const users = await usersCollection.find({}).toArray();
        users.forEach((u) => {
          bot.sendPhoto(u.id, photoId, { caption }).catch(() => {});
        });

        return bot.sendMessage(chatId, "✅ Xabar yuborildi.", {
          reply_markup: adminKeyboard,
        });
      } else {
        const users = await usersCollection.find({}).toArray();
        users.forEach((u) => {
          bot.sendMessage(u.id, msg.text).catch(() => {});
        });

        return bot.sendMessage(chatId, "✅ Xabar yuborildi.", {
          reply_markup: adminKeyboard,
        });
      }
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
        await videosCollection.insertOne({
          code: adminStep.code,
          file_id: adminStep.video,
          title: text,
        });
        adminStep = { stage: null, video: null, code: null };
        return bot.sendMessage(chatId, "*✅ Kino saqlandi!*", {
          parse_mode: "Markdown",
          reply_markup: adminKeyboard,
        });
      }
    }

    if (!/^\d+$/.test(text)) {
      return bot.sendMessage(chatId, "*❗ Iltimos, faqat raqam kiriting.*", {
        parse_mode: "Markdown",
      });
    }

    const found = await videosCollection.findOne({ code: text });
    if (!found) {
      return bot.sendMessage(
        chatId,
        `*❗ Hozircha ${text} kodiga bog'liq kino yo‘q.*`,
        {
          parse_mode: "Markdown",
        }
      );
    }

    return bot.sendVideo(chatId, found.file_id, {
      caption: ` ${found.title}`,
    });
  });

if (query.data === "check_sub") {
      const subscribed = await isSubscribed(userId);
      await bot.answerCallbackQuery(query.id); // ✅ Javob berish majburiy

      if (subscribed) {
        await saveUser(query.from);
        return bot.sendMessage(
          chatId,
          "*✅ Obuna tasdiqlandi! Endi foydalanishingiz mumkin.*",
          { parse_mode: "Markdown" }
        );
      } else {
        return bot.sendMessage(chatId, "*❗ Siz hali obuna bo‘lmagansiz.*", {
          parse_mode: "Markdown",
        });
      }
    }
  });

}
