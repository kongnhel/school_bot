const { Telegraf, Scenes, session, Markup } = require("telegraf");
const express = require("express");
const fs = require("fs");
const path = require("path");
const registrationWizard = require("./scenes/registration");

// ✅ នាំចូល Student និង Major ពី Mongoose (លែងប្រើ pool ហើយ)
const { initDb, Student, Major } = require("./config/database");
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

// --- ៣. WEB ROUTES (សម្រាប់ Admin Panel ជាមួយ MongoDB) ---
app.get("/", (req, res) =>
  res.send("Bot & Admin Panel is running on Railway with MongoDB! 🚀"),
);

app.get("/admin/panel", async (req, res) => {
  try {
    // ទាញទិន្នន័យពី MongoDB តាមរយៈ Mongoose
    const majors = await Major.find().sort({ _id: -1 });
    const students = await Student.find().sort({ registered_at: -1 });
    res.render("admin", { majors, students });
  } catch (err) {
    console.error("Admin Panel Error:", err);
    res.status(500).send("Error loading Admin Panel");
  }
});

app.post("/admin/majors/add", async (req, res) => {
  const { major_name } = req.body;
  try {
    if (major_name) await Major.create({ major_name: major_name.trim() });
    res.redirect("/admin/panel");
  } catch (err) {
    res.status(500).send("Add Major Failed");
  }
});

app.post("/admin/majors/update/:id", async (req, res) => {
  const { major_name } = req.body;
  try {
    if (major_name) {
      await Major.findByIdAndUpdate(req.params.id, { major_name: major_name.trim() });
    }
    res.redirect("/admin/panel");
  } catch (err) {
    res.status(500).send("Update Major Failed");
  }
});

app.get("/admin/majors/delete/:id", async (req, res) => {
  try {
    await Major.findByIdAndDelete(req.params.id);
    res.redirect("/admin/panel");
  } catch (err) {
    res.status(500).send("Delete Major Failed");
  }
});

app.post("/admin/students/update/:id", async (req, res) => {
  const { fullname, phone, course } = req.body;
  try {
    const updateData = {};
    if (fullname) updateData.fullname = fullname.trim();
    if (phone) updateData.phone = phone.trim();
    if (course) updateData.course = course.trim();

    if (Object.keys(updateData).length > 0) {
      await Student.findByIdAndUpdate(req.params.id, updateData);
    }
    res.redirect("/admin/panel");
  } catch (err) {
    res.status(500).send("Update Student Failed");
  }
});

app.get("/admin/students/delete/:id", async (req, res) => {
  try {
    await Student.findByIdAndDelete(req.params.id);
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
    const rows = await Major.find(); // Mongoose
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

  // Link ពិតប្រាកដរបស់ Railway
  const webAppUrl = "https://fusilly-nadene-recloseable.ngrok-free.dev/admin/panel";

  ctx.reply(
    "🛠️ សូមចុចប៊ូតុងខាងក្រោមដើម្បីបើកផ្ទាំងគ្រប់គ្រង៖",
    Markup.inlineKeyboard([
      [Markup.button.webApp("🚀 បើក Admin Panel", webAppUrl)],
    ]),
  );
});

bot.command("export", async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) {
    return ctx.reply("❌ លោកម្ចាស់អត់មានសិទ្ធិទាញទិន្នន័យទេ!");
  }

  try {
    const rows = await Student.find().sort({ registered_at: -1 }); // Mongoose
    if (rows.length === 0) return ctx.reply("📭 មិនទាន់មានសិស្សចុះឈ្មោះទេ។");

    let csvContent = "\ufeffលេខសម្គាល់,ឈ្មោះពេញ,លេខទូរស័ព្ទ,ជំនាញ,ថ្ងៃចុះឈ្មោះ\n";
    rows.forEach((s) => {
      // កែទម្រង់ថ្ងៃខែឱ្យស្អាត និងប្រើ _id
      const dateStr = new Date(s.registered_at).toLocaleString('en-GB'); 
      csvContent += `${s._id},"${s.fullname}","${s.phone}","${s.course}","${dateStr}"\n`;
    });

    const fileName = `/tmp/Student_List_${Date.now()}.csv`;
    fs.writeFileSync(fileName, csvContent);

    await ctx.replyWithDocument(
      { source: fileName, filename: `Student_List_${Date.now()}.csv` },
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
    const rows = await Student.find().sort({ registered_at: -1 }).limit(10); // Mongoose
    let report = "📋 **បញ្ជីសិស្សថ្មីៗ៖**\n\n";
    rows.forEach((s, i) => {
      report += `${i + 1}. ${s.fullname} (${s.course})\n`;
    });
    ctx.reply(report, { parse_mode: "Markdown" }); 
  } catch (err) {
    ctx.reply("❌ មិនអាចទាញទិន្នន័យបានទេ!");
  }
});

// --- ៦. ការរៀបចំ Server & Launch ---
const PORT = process.env.PORT || 3000;

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🌐 Server is live on port ${PORT}`);
    });

    bot
      .launch()
      .then(() => console.log("🤖 Telegram Bot is online!"))
      .catch((err) => console.error("❌ Bot Launch Error:", err));
  })
  .catch((err) => console.error("❌ DB Error:", err));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));