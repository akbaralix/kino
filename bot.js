const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const { MongoClient } = require("mongodb");
require("dotenv").config();

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const mongoUri = process.env.MONGO_URI;
const client = new MongoClient(mongoUri);
let db, usersCollection, videosCollection;

let adminId = [907402803, 6351614390];
const channelUsername = -1002501054130;

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
    startBot();
  } catch (err) {
    console.error("❌ MongoDB ulanishda xatolik:", err);
  }
};

connectMongo();
   const isSubscribed = async (userId) => {
  try {
    const res = await bot.getChatMember(channelUsername, userId);
    // Foydalanuvchi kanal a'zosi yoki so‘rov yuborgan bo‘lsa ham qabul qilish
    return [
      "member",
      "creator",
      "administrator",
      "restricted" // qo‘shilish so‘rov yuborgan holatda
    ].includes(res.status);
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
        ["👥 Admin qo'shish"],
        ["📤 Habar yuborish", "✍️ Kino taxrirlash"],
      ],
      resize_keyboard: true,
    };

    await saveUser(user);

    if (text === "/start") {
      if (adminId.includes(user.id)) {
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
    // start=kod bilan kelganda ishlaydi (masalan: https://t.me/kinoborubot?start=727)
    if (text?.startsWith("/start ") && /^\d+$/.test(text.split(" ")[1])) {
      const code = text.split(" ")[1];

      const subscribed = await isSubscribed(user.id);
      if (!subscribed && !adminId.includes(user.id)) {
        return bot.sendMessage(
          chatId,
          "*❌ Botdan foydalanish uchun kanallarga obuna bo‘ling.*",
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

      const found = await videosCollection.findOne({ code });
      if (!found) {
        return bot.sendMessage(
          chatId,
          `*❗ Hozircha ${code} kodiga bog'liq kino topilmadi.*`,
          {
            parse_mode: "Markdown",
          }
        );
      }

      await videosCollection.updateOne({ code }, { $inc: { views: 1 } });
      const updated = await videosCollection.findOne({ code });

      return bot.sendVideo(chatId, updated.file_id, {
        caption: `🎬 ${updated.title}\n📥 *Yuklangan:* ${updated.views}\n\n 🎬@Kinoborubot | Bizning botmiz`,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🔐 Barcha kino kodlari",
                url: `https://t.me/${channelUsername.replace("@", "")}`,
              },
            ],
            [
              {
                text: "↪️ Ulashish",
                switch_inline_query: updated.code,
              },
            ],
          ],
        },
      });
    }

    const subscribed = await isSubscribed(user.id);
    if (!subscribed && !adminId.includes(user.id)) {
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
    if (adminId.includes(user.id)) {
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

    if (adminId.includes(user.id) && bot.broadcasting) {
      bot.broadcasting = false;

      if (msg.photo) {
        const photoId = msg.photo[msg.photo.length - 1].file_id;
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
    if (text === "👥 Admin qo'shish") {
      adminStep = { stage: "waiting_for_admin_id" };
      return bot.sendMessage(
        chatId,
        "*👥 Admin qo'shish uchun admin ID ni yuboring:*",
        {
          parse_mode: "Markdown",
          reply_markup: {
            keyboard: [["❌ Bekor qilish"]],
            resize_keyboard: true,
          },
        }
      );
    }

    if (text === "✍️ Kino taxrirlash") {
      adminStep = { stage: "editing_code" }; // <<< BU YANGI QATOR
      return bot.sendMessage(
        chatId,
        "✍🏻 Taxrirlamoqchi bo‘lgan kino kodini yuboring:",
        {
          reply_markup: {
            keyboard: [["❌ Bekor qilish"]],
            resize_keyboard: true,
          },
        }
      );
    }
    if (
      adminId.includes(user.id) &&
      adminStep.stage === "waiting_for_admin_id"
    ) {
      const newAdminId = parseInt(text.trim());

      // Tekshiruv: bu ID allaqachon adminmi?
      if (adminId.includes(newAdminId)) {
        return bot.sendMessage(chatId, "❗ Bu ID allaqachon admin.");
      }

      // Yangi adminni qo‘shamiz
      adminId.push(newAdminId);
      adminStep.stage = null;

      // 1. Sizga tasdiq xabari
      await bot.sendMessage(
        chatId,
        `✅ ${newAdminId} ID li foydalanuvchi admin sifatida qo‘shildi.`,
        {
          parse_mode: "Markdown",
          reply_markup: adminKeyboard,
        }
      );

      // 2. Yangi adminning o‘ziga xabar
      try {
        await bot.sendMessage(
          newAdminId,
          "✅ Siz admin sifatida qo‘shildingiz. Dvom etish uchun /start buyrug‘ini yuboring."
        );
      } catch (err) {
        console.error("❌ Adminni ogohlantirishda xatolik:", err.message);
        await bot.sendMessage(
          chatId,
          "⚠️ Yangi adminga xabar yuborilmadi (ehtimol, bot u bilan gaplashmagan)."
        );
      }

      return;
    }

    // 1. Admin kino kodini yuborgandan keyingi holat
    if (adminId.includes(user.id) && adminStep.stage === "editing_code") {
      const editing = await videosCollection.findOne({ code: text });

      if (!editing) {
        return bot.sendMessage(chatId, "❌ Bu kod bilan kino topilmadi.");
      }

      adminStep = {
        stage: "choose_edit_option",
        editingCode: text,
        video: editing.file_id,
        title: editing.title,
      };

      return bot.sendMessage(chatId, "Nimani taxrirlaysiz?", {
        reply_markup: {
          keyboard: [["🎬 Nomi", "📹 Videosi"], ["❌ Bekor qilish"]],
          resize_keyboard: true,
        },
      });
    }

    // 2. Tanlov: Nomi yoki Videosi
    if (adminId.includes(user.id) && adminStep.stage === "choose_edit_option") {
      if (text === "🎬 Nomi") {
        adminStep.stage = "editing_title";
        return bot.sendMessage(chatId, "✍️ Yangi nomni kiriting:");
      }

      if (text === "📹 Videosi") {
        adminStep.stage = "editing_video";
        return bot.sendMessage(chatId, "📥 Yangi video yuboring:");
      }
    }

    // 3. Yangi nomni saqlash
    if (adminId.includes(user.id) && adminStep.stage === "editing_title") {
      await videosCollection.updateOne(
        { code: adminStep.editingCode },
        { $set: { title: text } }
      );

      adminStep = { stage: null };
      return bot.sendMessage(chatId, "✅ Kino nomi yangilandi.", {
        reply_markup: adminKeyboard,
      });
    }

    // 4. Yangi video faylini saqlash
    if (
      adminId.includes(user.id) &&
      adminStep.stage === "editing_video" &&
      msg.video
    ) {
      await videosCollection.updateOne(
        { code: adminStep.editingCode },
        { $set: { file_id: msg.video.file_id } }
      );

      adminStep = { stage: null };
      return bot.sendMessage(chatId, "✅ Kino videosi yangilandi.", {
        reply_markup: adminKeyboard,
      });
    }

    if (adminId.includes(user.id)) {
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
          views: 0,
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

    // Ko‘rishlar sonini oshiramiz
    await videosCollection.updateOne({ code: text }, { $inc: { views: 1 } });

    // Yangilangan hujjatni qayta olamiz
    const updated = await videosCollection.findOne({ code: text });

    return bot.sendVideo(chatId, updated.file_id, {
      caption: ` ${updated.title}\n📥 *Yuklangan:* ${updated.views}\n\n 🎬@Kinoborubot | Bizning botmiz`,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🔐 Barcha kino kodlari",
              url: `https://t.me/${channelUsername.replace("@", "")}`,
            },
          ],
          [
            {
              text: "↪️ Ulashish",
              switch_inline_query: updated.code,
            },
          ],
        ],
      },
    });
  });

  bot.on("callback_query", async (query) => {
    const userId = query.from.id;
    const chatId = query.message?.chat?.id || query.from.id;

    if (query.data === "check_sub") {
      const subscribed = await isSubscribed(userId);
      await bot.answerCallbackQuery(query.id);

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
