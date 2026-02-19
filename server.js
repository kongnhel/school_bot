const { Telegraf, Scenes, session, Markup } = require("telegraf");
const express = require("express");
const fs = require("fs");
const path = require("path");
const registrationWizard = require("./scenes/registration");
const { initDb, pool } = require("./config/database");
require("dotenv").config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

// --- ១. ការកំណត់ Express & EJS View Engine ---
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));

// --- ២. ការរៀបចំ Middleware សម្រាប់ Bot ---
const stage = new Scenes.Stage([registrationWizard]);
bot.use(session());
bot.use(stage.middleware());

// --- ៣. WEB ROUTES (សម្រាប់ Admin Panel) ---

app.get("/", (req, res) => res.send("Bot & Admin Panel is running! 🚀"));

app.get("/admin/panel", async (req, res) => {
  try {
    const [majors] = await pool.query("SELECT * FROM majors ORDER BY id DESC");
    const [students] = await pool.query(
      "SELECT * FROM students ORDER BY registered_at DESC",
    );
    res.render("admin", { majors, students });
  } catch (err) {
    res.status(500).send("Error loading Admin Panel");
  }
});

app.post("/admin/majors/add", async (req, res) => {
  const { major_name } = req.body;
  try {
    if (major_name)
      await pool.query("INSERT INTO majors (major_name) VALUES (?)", [
        major_name.trim(),
      ]);
    res.redirect("/admin/panel");
  } catch (err) {
    res.status(500).send("Add Major Failed");
  }
});

app.post("/admin/majors/update/:id", async (req, res) => {
  const { major_name } = req.body;
  try {
    if (major_name)
      await pool.query("UPDATE majors SET major_name = ? WHERE id = ?", [
        major_name.trim(),
        req.params.id,
      ]);
    res.redirect("/admin/panel");
  } catch (err) {
    res.status(500).send("Update Major Failed");
  }
});

app.get("/admin/majors/delete/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM majors WHERE id = ?", [req.params.id]);
    res.redirect("/admin/panel");
  } catch (err) {
    res.status(500).send("Delete Major Failed");
  }
});

app.post("/admin/students/update/:id", async (req, res) => {
  const { fullname, phone, course } = req.body;
  try {
    if (fullname || phone || course) {
      await pool.query(
        "UPDATE students SET fullname = COALESCE(?, fullname), phone = COALESCE(?, phone), course = COALESCE(?, course) WHERE id = ?",
        [
          fullname?.trim() || null,
          phone?.trim() || null,
          course?.trim() || null,
          req.params.id,
        ],
      );
    }
    res.redirect("/admin/panel");
  } catch (err) {
    res.status(500).send("Update Student Failed");
  }
});

app.get("/admin/students/delete/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM students WHERE id = ?", [req.params.id]);
    res.redirect("/admin/panel");
  } catch (err) {
    res.status(500).send("Delete Student Failed");
  }
});

// --- ៤. មុខងារសម្រាប់ User (សិស្ស) ---

bot.start((ctx) => {
  ctx.reply(
    `សួស្តី ${ctx.from.first_name}! សូមស្វាគមន៍មកកាន់សាលាយើង។`,
    Markup.inlineKeyboard([
      [Markup.button.callback("📚 ព័ត៌មានសិក្សា", "COURSE_INFO")],
      [Markup.button.callback("💰 តម្លៃសិក្សា", "FEES")],
      [Markup.button.callback("📝 ចុះឈ្មោះឥឡូវនេះ", "REGISTER_NOW")],
    ]),
  );
});

bot.action("COURSE_INFO", async (ctx) => {
  ctx.answerCbQuery();
  try {
    const [rows] = await pool.query("SELECT major_name FROM majors");
    if (rows.length === 0) return ctx.reply("📚 មិនទាន់មានវគ្គសិក្សានៅឡើយទេ។");
    let message = "📚 **វគ្គសិក្សាដែលមានបង្រៀន៖**\n\n";
    rows.forEach((row) => {
      message += `- ${row.major_name}\n`;
    });
    ctx.reply(message);
  } catch (err) {
    ctx.reply("❌ បញ្ហាបច្ចេកទេស!");
  }
});

bot.action("FEES", (ctx) => {
  ctx.answerCbQuery();
  ctx.reply(
    "💰 **តម្លៃសិក្សានៅសាលាយើង៖**\n\n" +
      "- វគ្គខ្លី (៣ខែ)៖ $1XX\n" +
      "- វគ្គឆ្នាំ (១ឆ្នាំ)៖ $4XX\n\n" +
      "📞 *សម្រាប់ព័ត៌មានលម្អិត សូមទាក់ទងមកកាន់លេខ 012 XXX XXX*",
    { parse_mode: "Markdown" },
  );
});

bot.action("REGISTER_NOW", (ctx) => {
  ctx.answerCbQuery();
  ctx.scene.enter("REGISTRATION_SCENE");
});

// --- ៥. មុខងារសម្រាប់ Admin (Commands) ---

bot.command("panel", (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const webAppUrl =
    "https://fusilly-nadene-recloseable.ngrok-free.dev/admin/panel";
  ctx.reply(
    "🛠️ សូមចុចប៊ូតុងខាងក្រោមដើម្បីបើកផ្ទាំងគ្រប់គ្រង៖",
    Markup.inlineKeyboard([
      [Markup.button.webApp("🚀 បើក Admin Panel", webAppUrl)],
    ]),
  );
});

// ✅ មុខងារ Export ត្រឡប់មកវិញហើយ
bot.command("export", async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) {
    return ctx.reply("❌ លោកម្ចាស់អត់មានសិទ្ធិទាញទិន្នន័យទេ!");
  }

  try {
    const [rows] = await pool.query(
      "SELECT * FROM students ORDER BY registered_at DESC",
    );
    if (rows.length === 0) return ctx.reply("📭 មិនទាន់មានសិស្សចុះឈ្មោះទេ។");

    let csvContent = "\ufeff";
    csvContent += "លេខសម្គាល់,ឈ្មោះពេញ,លេខទូរស័ព្ទ,ជំនាញ,ថ្ងៃចុះឈ្មោះ\n";
    rows.forEach((s) => {
      csvContent += `${s.id},"${s.fullname}","${s.phone}","${s.course}","${s.registered_at}"\n`;
    });

    const fileName = `Student_List_${Date.now()}.csv`;
    fs.writeFileSync(fileName, csvContent);

    await ctx.replyWithDocument(
      { source: fileName },
      { caption: "📊 បញ្ជីឈ្មោះសិស្សទាំងអស់!" },
    );
    fs.unlinkSync(fileName);
  } catch (err) {
    console.error(err);
    ctx.reply("❌ បញ្ហាបច្ចេកទេសក្នុងការ Export!");
  }
});

bot.command("list", async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  try {
    const [rows] = await pool.query(
      "SELECT * FROM students ORDER BY registered_at DESC LIMIT 10",
    );
    let report = "📋 **បញ្ជីសិស្សថ្មីៗ៖**\n\n";
    rows.forEach((s, i) => {
      report += `${i + 1}. ${s.fullname} (${s.course})\n`;
    });
    ctx.replyWithMarkdown(report);
  } catch (err) {
    ctx.reply("❌ មិនអាចទាញទិន្នន័យបានទេ!");
  }
});

// --- ៦. ការរៀបចំ Server & Launch ---
const PORT = process.env.PORT || 3000;
initDb()
  .then(() => {
    bot.launch().then(() => console.log("🤖 Telegram Bot is online!"));
    app.listen(PORT, () =>
      console.log(`🌐 Server & Web View live on port ${PORT}`),
    );
  })
  .catch((err) => console.error("❌ DB Error:", err));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
