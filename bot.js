const { Telegraf, Scenes, session, Markup } = require("telegraf");
const express = require("express");
const fs = require("fs");
const registrationWizard = require("./scenes/registration");
const { initDb, pool } = require("./config/database"); // បន្ថែម pool ដើម្បី Query ទិន្នន័យ
require("dotenv").config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

// --- ការរៀបចំ Middleware ---
const stage = new Scenes.Stage([registrationWizard]);
bot.use(session());
bot.use(stage.middleware());

// --- មុខងារសម្រាប់ User (សិស្ស) ---

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
    // ទាញយកជំនាញពី Table majors មកបង្ហាញ
    const [rows] = await pool.query("SELECT major_name FROM majors");
    
    if (rows.length === 0) {
      return ctx.reply("📚 បច្ចុប្បន្នមិនទាន់មានវគ្គសិក្សានៅឡើយទេ។");
    }

    let message = "📚 **វគ្គសិក្សាដែលមានបង្រៀន៖**\n\n";
    rows.forEach((row) => {
      message += `- ${row.major_name}\n`;
    });
    
    ctx.reply(message);
  } catch (err) {
    ctx.reply("❌ មានបញ្ហាបច្ចេកទេសក្នុងការទាញទិន្នន័យ!");
  }
});
// មុខងារបង្ហាញតម្លៃសិក្សាដែលបងចង់បាន
bot.action("FEES", (ctx) => {
    ctx.answerCbQuery();
    ctx.reply(
        "💰 **តម្លៃសិក្សានៅសាលាយើង៖**\n\n" +
        "- វគ្គខ្លី (៣ខែ)៖ $1XX\n" +
        "- វគ្គឆ្នាំ (១ឆ្នាំ)៖ $4XX\n\n" +
        "📞 *សម្រាប់ព័ត៌មានលម្អិត សូមទាក់ទងមកកាន់លេខ 012 XXX XXX*",
        { parse_mode: 'Markdown' }
    );
});

bot.action("REGISTER_NOW", (ctx) => {
  ctx.answerCbQuery();
  ctx.scene.enter("REGISTRATION_SCENE");
});

// --- មុខងារសម្រាប់ Admin (មេកើយ) ---

// ១. មើលបញ្ជីឈ្មោះសិស្ស ១០ នាក់ចុងក្រោយ
bot.command("list", async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) {
    return ctx.reply("❌ សុំទោស! អ្នកមិនមានសិទ្ធិប្រើ Command នេះទេ។");
  }

  try {
    const [rows] = await pool.query(
      "SELECT * FROM students ORDER BY registered_at DESC LIMIT 10",
    );
    if (rows.length === 0) return ctx.reply("📭 មិនទាន់មានសិស្សចុះឈ្មោះទេ។");

    let report = "📋 **បញ្ជីសិស្សចុះឈ្មោះថ្មីៗ៖**\n\n";
    rows.forEach((s, i) => {
      report += `${i + 1}. ${s.fullname}\n📞 ${s.phone} | 📚 ${s.course}\n\n`;
    });
    ctx.replyWithMarkdown(report);
  } catch (err) {
    console.error(err);
    ctx.reply("❌ បញ្ហាក្នុងការទាញទិន្នន័យពី Database!");
  }
});

// ២. ទាញយកទិន្នន័យទាំងអស់ជា File CSV
bot.command("export", async (ctx) => {
  // ១. ឆែកមើលថាអ្នកវាយ Command ហ្នឹងជា Admin ពិតប្រាកដមែនអត់
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) {
    return ctx.reply("❌ លោកម្ចាស់អត់មានសិទ្ធិទាញទិន្នន័យទេ កុំមកចង់បោកខ្ញុំ!");
  }

  try {
    // ២. ទាញទិន្នន័យសិស្សទាំងអស់ពី MySQL
    const [rows] = await pool.query(
      "SELECT * FROM students ORDER BY registered_at DESC",
    );

    if (rows.length === 0) {
      return ctx.reply(
        "📭 មិនទាន់មានសិស្សចុះឈ្មោះទេ ចាំបានទិន្នន័យចាំមកទាញថ្មី!",
      );
    }

    // ៣. បង្កើតមាតិកា CSV (Header និង Data)
    let csvContent = "\ufeff"; // បន្ថែម BOM ដើម្បីឱ្យ Excel អានអក្សរខ្មែរបានត្រឹមត្រូវ
    csvContent += "ល.រ,ឈ្មោះពេញ,លេខទូរស័ព្ទ,ជំនាញ,ថ្ងៃចុះឈ្មោះ\n";

    rows.forEach((s) => {
      csvContent += `${s.id},"${s.fullname}","${s.phone}","${s.course}",${s.registered_at}\n`;
    });

    // ៤. រក្សាទុកជា File បណ្តោះអាសន្ន
    const fileName = `Student_List_${Date.now()}.csv`;
    fs.writeFileSync(fileName, csvContent);

    // ៥. ផ្ញើ File ទៅកាន់ Telegram
    await ctx.replyWithDocument(
      { source: fileName },
      { caption: "📊 នេះគឺជាបញ្ជីឈ្មោះសិស្សទាំងអស់!" },
    );

    // ៦. លុប File ចោលវិញក្រោយផ្ញើរួច ដើម្បីកុំឱ្យពេញម៉ាស៊ីន
    fs.unlinkSync(fileName);
  } catch (err) {
    console.error(err);
    ctx.reply("❌ មានបញ្ហាបច្ចេកទេស មិនអាច Export បានទេមេ!");
  }
});

// --- ការរៀបចំ Server & Launch ---

app.get("/", (req, res) => res.send("Bot is running! 🚀"));

const PORT = process.env.PORT || 3000;

initDb()
  .then(() => {
    bot
      .launch()
      .then(() => console.log("🤖 Telegram Bot is online!"))
      .catch((err) => console.error("❌ Bot launch failed:", err));

    app.listen(PORT, () => console.log(`🌐 Server is live on port ${PORT}`));
  })
  .catch((err) => {
    console.error("❌ មិនអាចដំណើរការបានទេ ដោយសារបញ្ហា Database:", err);
  });

// add new student

bot.command("add", async (ctx) => {
  // ឆែកសិទ្ធិ Admin
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;

  // បំបែកអត្ថបទ (ឧទាហរណ៍៖ /add សុខ ហេង | 012345678 | IT)
  const args = ctx.message.text.split("/add ")[1];
  if (!args) return ctx.reply("⚠️ សូមប្រើទម្រង់៖ /add ឈ្មោះ | លេខ | ជំនាញ");

  const [name, phone, major] = args.split("|").map((s) => s.trim());

  try {
    await pool.query(
      "INSERT INTO students (fullname, phone, course) VALUES (?, ?, ?)",
      [name, phone, major],
    );
    ctx.reply(`✅ បានបញ្ចូលសិស្សឈ្មោះ ${name} ទៅក្នុងប្រព័ន្ធជោគជ័យ!`);
  } catch (err) {
    ctx.reply("❌ បញ្ហា Database!");
  }
});

// Add new major

// --- [CREATE] - បន្ថែមជំនាញថ្មី ---
bot.command('addmajor', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const majorName = ctx.message.text.split('/addmajor ')[1];
  if (!majorName) return ctx.reply('⚠️ ទម្រង់៖ /addmajor [ឈ្មោះជំនាញ]');

  try {
    await pool.query('INSERT INTO majors (major_name) VALUES (?)', [majorName.trim()]);
    ctx.reply(`✅ បានបន្ថែមជំនាញ "${majorName}" ជោគជ័យ!`);
  } catch (err) {
    ctx.reply('❌ មិនអាចបន្ថែមបានទេ (ជំនាញនេះអាចមានរួចហើយ)!');
  }
});

// --- [READ] - មើលបញ្ជីជំនាញទាំងអស់ ---
bot.command('majors', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  try {
    const [rows] = await pool.query('SELECT * FROM majors');
    if (rows.length === 0) return ctx.reply('📭 មិនទាន់មានជំនាញក្នុងប្រព័ន្ធទេ។');

    let list = '🎓 **បញ្ជីជំនាញដែលមានស្រាប់៖**\n\n';
    rows.forEach(m => list += `🆔 ${m.id} | 📚 ${m.major_name}\n`);
    ctx.replyWithMarkdown(list);
  } catch (err) {
    ctx.reply('❌ បញ្ហាទាញទិន្នន័យ!');
  }
});

// --- [UPDATE] - កែឈ្មោះជំនាញ ---
bot.command('updatemajor', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const args = ctx.message.text.split('/updatemajor ')[1]; // ទម្រង់៖ ID | ឈ្មោះថ្មី
  if (!args || !args.includes('|')) return ctx.reply('⚠️ ទម្រង់៖ /updatemajor [ID] | [ឈ្មោះថ្មី]');

  const [id, newName] = args.split('|').map(s => s.trim());
  try {
    const [result] = await pool.query('UPDATE majors SET major_name = ? WHERE id = ?', [newName, id]);
    if (result.affectedRows > 0) ctx.reply(`✅ បានកែជំនាញ ID ${id} ទៅជា "${newName}"!`);
    else ctx.reply('❌ រកមិនឃើញ ID នេះទេ!');
  } catch (err) {
    ctx.reply('❌ ការកែប្រែបរាជ័យ!');
  }
});

// --- [DELETE] - លុបជំនាញ ---
bot.command('delmajor', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const majorId = ctx.message.text.split('/delmajor ')[1];
  if (!majorId) return ctx.reply('⚠️ ទម្រង់៖ /delmajor [ID]');

  try {
    const [result] = await pool.query('DELETE FROM majors WHERE id = ?', [majorId]);
    if (result.affectedRows > 0) ctx.reply(`🗑️ បានលុបជំនាញ ID ${majorId} រួចរាល់!`);
    else ctx.reply('❌ រកមិនឃើញ ID នេះទេ!');
  } catch (err) {
    ctx.reply('❌ មិនអាចលុបបានទេ (ជំនាញនេះអាចកំពុងមានសិស្សរៀន)!');
  }
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
