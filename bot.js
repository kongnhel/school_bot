const { Telegraf, Scenes, session, Markup } = require("telegraf");
const express = require("express");
const fs = require("fs");
const path = require("path");
const registrationWizard = require("./scenes/registration");

// នាំចូល Database ពី Mongoose 
const { initDb, Student, Major } = require("./config/database"); 
require("dotenv").config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

// ==========================================
// ១. ការកំណត់ EXPRESS (សម្រាប់ WEB ADMIN PANEL)
// ==========================================
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));

// ==========================================
// ២. ការរៀបចំ MIDDLEWARE សម្រាប់ BOT
// ==========================================
const stage = new Scenes.Stage([registrationWizard]);
bot.use(session());
bot.use(stage.middleware());

// ==========================================
// ៣. WEB ROUTES (ផ្លូវសម្រាប់បើក Admin Panel)
// ==========================================
app.get("/", (req, res) => res.send("Bot & Admin Panel is running on Railway with MongoDB! 🚀"));

// បង្ហាញផ្ទាំង Admin Panel
app.get("/admin/panel", async (req, res) => {
  try {
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
  } catch (err) { res.status(500).send("Add Major Failed"); }
});

app.post("/admin/majors/update/:id", async (req, res) => {
  const { major_name } = req.body;
  try {
    if (major_name) await Major.findByIdAndUpdate(req.params.id, { major_name: major_name.trim() });
    res.redirect("/admin/panel");
  } catch (err) { res.status(500).send("Update Major Failed"); }
});

app.get("/admin/majors/delete/:id", async (req, res) => {
  try {
    await Major.findByIdAndDelete(req.params.id);
    res.redirect("/admin/panel");
  } catch (err) { res.status(500).send("Delete Major Failed"); }
});

app.post("/admin/students/update/:id", async (req, res) => {
  const { fullname, phone, course } = req.body;
  try {
    const updateData = {};
    if (fullname) updateData.fullname = fullname.trim();
    if (phone) updateData.phone = phone.trim();
    if (course) updateData.course = course.trim();
    if (Object.keys(updateData).length > 0) await Student.findByIdAndUpdate(req.params.id, updateData);
    res.redirect("/admin/panel");
  } catch (err) { res.status(500).send("Update Student Failed"); }
});

app.get("/admin/students/delete/:id", async (req, res) => {
  try {
    await Student.findByIdAndDelete(req.params.id);
    res.redirect("/admin/panel");
  } catch (err) { res.status(500).send("Delete Student Failed"); }
});

// ==========================================
// ៤. មុខងារសម្រាប់ USER (សិស្សចុះឈ្មោះ)
// ==========================================
bot.start((ctx) => {
  ctx.reply(
    `សួស្តី ${ctx.from.first_name}! សូមស្វាគមន៍មកកាន់សាលាយើង។`,
    Markup.inlineKeyboard([
      [Markup.button.callback("📚 ព័ត៌មានសិក្សា", "COURSE_INFO")],
      [Markup.button.callback("💰 តម្លៃសិក្សា", "FEES")],
      [Markup.button.callback("📝 ចុះឈ្មោះឥឡូវនេះ", "REGISTER_NOW")],
    ])
  );
});

bot.action("COURSE_INFO", async (ctx) => {
  ctx.answerCbQuery();
  try {
    const rows = await Major.find();
    if (rows.length === 0) return ctx.reply("📚 បច្ចុប្បន្នមិនទាន់មានវគ្គសិក្សានៅឡើយទេ។");
    let message = "📚 **វគ្គសិក្សាដែលមានបង្រៀន៖**\n\n";
    rows.forEach((row) => { message += `- ${row.major_name}\n`; });
    ctx.reply(message);
  } catch (err) { ctx.reply("❌ មានបញ្ហាបច្ចេកទេសក្នុងការទាញទិន្នន័យ!"); }
});

bot.action("FEES", (ctx) => {
  ctx.answerCbQuery();
  ctx.reply(
    "💰 **តម្លៃសិក្សានៅសាលាយើង៖**\n\n- វគ្គខ្លី (៣ខែ)៖ $1XX\n- វគ្គឆ្នាំ (១ឆ្នាំ)៖ $4XX\n\n📞 *សម្រាប់ព័ត៌មានលម្អិត សូមទាក់ទងមកកាន់លេខ 012 XXX XXX*",
    { parse_mode: 'Markdown' }
  );
});

bot.action("REGISTER_NOW", (ctx) => {
  ctx.answerCbQuery();
  ctx.scene.enter("REGISTRATION_SCENE");
});

// ==========================================
// ៥. មុខងារសម្រាប់ ADMIN (Commands)
// ==========================================

// --- បើកផ្ទាំង Web Panel ---
bot.command("panel", (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  // Link ពិតប្រាកដរបស់ Railway
  const webAppUrl = "https://schoolbot-production.up.railway.app/admin/panel";
  ctx.reply(
    "🛠️ សូមចុចប៊ូតុងខាងក្រោមដើម្បីបើកផ្ទាំងគ្រប់គ្រង៖",
    Markup.inlineKeyboard([[Markup.button.webApp("🚀 បើក Admin Panel", webAppUrl)]])
  );
});

// --- មើលបញ្ជីសិស្ស ---
bot.command("list", async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return ctx.reply("❌ គ្មានសិទ្ធិទេ!");
  try {
    const rows = await Student.find().sort({ registered_at: -1 }).limit(10);
    if (rows.length === 0) return ctx.reply("📭 មិនទាន់មានសិស្សចុះឈ្មោះទេ។");
    let report = "📋 **បញ្ជីសិស្សចុះឈ្មោះថ្មីៗ៖**\n\n";
    rows.forEach((s, i) => { report += `${i + 1}. ${s.fullname}\n📞 ${s.phone} | 📚 ${s.course}\n\n`; });
    ctx.replyWithMarkdown(report);
  } catch (err) { ctx.reply("❌ បញ្ហាក្នុងការទាញទិន្នន័យ!"); }
});

// --- Export ទិន្នន័យ ---
bot.command("export", async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return ctx.reply("❌ គ្មានសិទ្ធិទេ!");
  try {
    const rows = await Student.find().sort({ registered_at: -1 });
    if (rows.length === 0) return ctx.reply("📭 មិនទាន់មានសិស្សចុះឈ្មោះទេ!");
    let csvContent = "\ufeffលេខសម្គាល់,ឈ្មោះពេញ,លេខទូរស័ព្ទ,ជំនាញ,ថ្ងៃចុះឈ្មោះ\n";
    rows.forEach((s) => {
      const dateStr = new Date(s.registered_at).toLocaleString('en-GB'); 
      csvContent += `${s._id},"${s.fullname}","${s.phone}","${s.course}","${dateStr}"\n`;
    });
    const fileName = `/tmp/Student_List_${Date.now()}.csv`;
    fs.writeFileSync(fileName, csvContent);
    await ctx.replyWithDocument({ source: fileName, filename: `Student_List_${Date.now()}.csv` }, { caption: "📊 នេះគឺជាបញ្ជីឈ្មោះសិស្សទាំងអស់!" });
    fs.unlinkSync(fileName);
  } catch (err) { ctx.reply("❌ មានបញ្ហាបច្ចេកទេស មិនអាច Export បានទេ!"); }
});

// --- បន្ថែមសិស្ស (Manual) ---
bot.command("add", async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const args = ctx.message.text.split("/add ")[1];
  if (!args) return ctx.reply("⚠️ សូមប្រើទម្រង់៖ /add ឈ្មោះ | លេខ | ជំនាញ");
  const [name, phone, major] = args.split("|").map((s) => s.trim());
  try {
    await Student.create({ fullname: name, phone: phone, course: major });
    ctx.reply(`✅ បានបញ្ចូលសិស្សឈ្មោះ ${name} ជោគជ័យ!`);
  } catch (err) { ctx.reply("❌ បញ្ហា Database!"); }
});

// --- គ្រប់គ្រងជំនាញ (Majors) ---
bot.command('addmajor', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const majorName = ctx.message.text.split('/addmajor ')[1];
  if (!majorName) return ctx.reply('⚠️ ទម្រង់៖ /addmajor [ឈ្មោះជំនាញ]');
  try {
    await Major.create({ major_name: majorName.trim() });
    ctx.reply(`✅ បានបន្ថែមជំនាញ "${majorName}" ជោគជ័យ!`);
  } catch (err) { ctx.reply('❌ មិនអាចបន្ថែមបានទេ!'); }
});

bot.command('majors', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  try {
    const rows = await Major.find();
    if (rows.length === 0) return ctx.reply('📭 មិនទាន់មានជំនាញទេ។');
    let list = '🎓 **បញ្ជីជំនាញដែលមានស្រាប់៖**\n\n';
    rows.forEach(m => list += `🆔 \`${m._id}\`\n📚 ${m.major_name}\n\n`);
    list += "_(ចុចលើលេខ ID ដើម្បី Copy)_";
    ctx.replyWithMarkdown(list);
  } catch (err) { ctx.reply('❌ បញ្ហាទាញទិន្នន័យ!'); }
});

bot.command('updatemajor', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const args = ctx.message.text.split('/updatemajor ')[1]; 
  if (!args || !args.includes('|')) return ctx.reply('⚠️ ទម្រង់៖ /updatemajor [ID] | [ឈ្មោះថ្មី]');
  const [id, newName] = args.split('|').map(s => s.trim());
  try {
    const result = await Major.findByIdAndUpdate(id, { major_name: newName });
    if (result) ctx.reply(`✅ បានកែជំនាញរួចរាល់ ទៅជា "${newName}"!`);
    else ctx.reply('❌ រកមិនឃើញ ID នេះទេ!');
  } catch (err) { ctx.reply('❌ ការកែប្រែបរាជ័យ!'); }
});

bot.command('delmajor', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const majorId = ctx.message.text.split('/delmajor ')[1];
  if (!majorId) return ctx.reply('⚠️ ទម្រង់៖ /delmajor [ID]');
  try {
    const result = await Major.findByIdAndDelete(majorId.trim());
    if (result) ctx.reply(`🗑️ បានលុបជំនាញនោះចោលរួចរាល់!`);
    else ctx.reply('❌ រកមិនឃើញ ID នេះទេ!');
  } catch (err) { ctx.reply('❌ មិនអាចលុបបានទេ!'); }
});

// ==========================================
// ៦. ការរៀបចំ SERVER & LAUNCH
// ==========================================
const PORT = process.env.PORT || 3000;

initDb()
  .then(() => {
    // ដាក់ Express ឱ្យដើរ ដើម្បីឱ្យ Railway ស្គាល់ Port
    app.listen(PORT, () => console.log(`🌐 Server & Web View live on port ${PORT}`));
    
    // បើក Bot
    bot.launch()
      .then(() => console.log("🤖 Telegram Bot is online!"))
      .catch((err) => console.error("❌ Bot launch failed:", err));
  })
  .catch((err) => {
    console.error("❌ មិនអាចដំណើរការបានទេ ដោយសារបញ្ហា Database:", err);
  });

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));