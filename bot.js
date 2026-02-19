const { Telegraf, Scenes, session, Markup } = require("telegraf");
const express = require("express");
const fs = require("fs");
const registrationWizard = require("./scenes/registration");
// នាំចូល Student និង Major ពី File Database ថ្មីដែលបងបាន Update មិញហ្នឹង
const { initDb, Student, Major } = require("./config/database"); 
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
    // ប្រើ Mongoose ដើម្បីទាញយកជំនាញទាំងអស់
    const rows = await Major.find();
    
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

// មុខងារបង្ហាញតម្លៃសិក្សា
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
    // ប្រើ Mongoose ទាញយក ១០ នាក់ចុងក្រោយ
    const rows = await Student.find().sort({ registered_at: -1 }).limit(10);
    
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
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) {
    return ctx.reply("❌ លោកម្ចាស់អត់មានសិទ្ធិទាញទិន្នន័យទេ កុំមកចង់បោកខ្ញុំ!");
  }

  try {
    // ទាញយកសិស្សទាំងអស់
    const rows = await Student.find().sort({ registered_at: -1 });

    if (rows.length === 0) {
      return ctx.reply("📭 មិនទាន់មានសិស្សចុះឈ្មោះទេ ចាំបានទិន្នន័យចាំមកទាញថ្មី!");
    }

    let csvContent = "\ufeff"; 
    csvContent += "លេខសម្គាល់,ឈ្មោះពេញ,លេខទូរស័ព្ទ,ជំនាញ,ថ្ងៃចុះឈ្មោះ\n";

    rows.forEach((s) => {
      // កែទម្រង់ថ្ងៃខែឱ្យមើលយល់
      const dateStr = new Date(s.registered_at).toLocaleString('en-GB'); 
      csvContent += `${s._id},"${s.fullname}","${s.phone}","${s.course}","${dateStr}"\n`;
    });

    // ប្រើ /tmp ដើម្បីកុំឱ្យមានបញ្ហាពេល Deploy លើ Cloud ដូចជា Render
    const fileName = `/tmp/Student_List_${Date.now()}.csv`;
    fs.writeFileSync(fileName, csvContent);

    await ctx.replyWithDocument(
      { source: fileName, filename: `Student_List_${Date.now()}.csv` },
      { caption: "📊 នេះគឺជាបញ្ជីឈ្មោះសិស្សទាំងអស់!" },
    );

    fs.unlinkSync(fileName);
  } catch (err) {
    console.error(err);
    ctx.reply("❌ មានបញ្ហាបច្ចេកទេស មិនអាច Export បានទេមេ!");
  }
});

// --- ការរៀបចំ Server & Launch ---

app.get("/", (req, res) => res.send("Bot is running with MongoDB! 🚀"));

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

// --- បន្ថែមសិស្សថ្មី ---
bot.command("add", async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;

  const args = ctx.message.text.split("/add ")[1];
  if (!args) return ctx.reply("⚠️ សូមប្រើទម្រង់៖ /add ឈ្មោះ | លេខ | ជំនាញ");

  const [name, phone, major] = args.split("|").map((s) => s.trim());

  try {
    // ប្រើ Mongoose បង្កើតសិស្សថ្មី
    await Student.create({ fullname: name, phone: phone, course: major });
    ctx.reply(`✅ បានបញ្ចូលសិស្សឈ្មោះ ${name} ទៅក្នុងប្រព័ន្ធជោគជ័យ!`);
  } catch (err) {
    console.error(err);
    ctx.reply("❌ បញ្ហា Database មិនអាចបញ្ចូលបានទេ!");
  }
});

// --- [CREATE] - បន្ថែមជំនាញថ្មី ---
bot.command('addmajor', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const majorName = ctx.message.text.split('/addmajor ')[1];
  if (!majorName) return ctx.reply('⚠️ ទម្រង់៖ /addmajor [ឈ្មោះជំនាញ]');

  try {
    await Major.create({ major_name: majorName.trim() });
    ctx.reply(`✅ បានបន្ថែមជំនាញ "${majorName}" ជោគជ័យ!`);
  } catch (err) {
    ctx.reply('❌ មិនអាចបន្ថែមបានទេ (ជំនាញនេះអាចមានរួចហើយ)!');
  }
});

// --- [READ] - មើលបញ្ជីជំនាញទាំងអស់ ---
bot.command('majors', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  try {
    const rows = await Major.find();
    if (rows.length === 0) return ctx.reply('📭 មិនទាន់មានជំនាញក្នុងប្រព័ន្ធទេ។');

    let list = '🎓 **បញ្ជីជំនាញដែលមានស្រាប់៖**\n\n';
    // Mongoose ប្រើ _id មិនមែន id ទេ
    rows.forEach(m => list += `🆔 \`${m._id}\`\n📚 ${m.major_name}\n\n`);
    
    list += "_(ចុចលើលេខ ID ដើម្បី Copy វាសម្រាប់យកទៅកែ ឬលុប)_";
    ctx.replyWithMarkdown(list);
  } catch (err) {
    ctx.reply('❌ បញ្ហាទាញទិន្នន័យ!');
  }
});

// --- [UPDATE] - កែឈ្មោះជំនាញ ---
bot.command('updatemajor', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const args = ctx.message.text.split('/updatemajor ')[1]; 
  if (!args || !args.includes('|')) return ctx.reply('⚠️ ទម្រង់៖ /updatemajor [ID] | [ឈ្មោះថ្មី]');

  const [id, newName] = args.split('|').map(s => s.trim());
  try {
    // ប្រើ findByIdAndUpdate របស់ Mongoose
    const result = await Major.findByIdAndUpdate(id, { major_name: newName });
    if (result) ctx.reply(`✅ បានកែជំនាញរួចរាល់ ទៅជា "${newName}"!`);
    else ctx.reply('❌ រកមិនឃើញ ID នេះទេ តើ Copy ខុសមែនអត់?');
  } catch (err) {
    ctx.reply('❌ ការកែប្រែបរាជ័យ (ប្រហែល ID មិនត្រឹមត្រូវ)!');
  }
});

// --- [DELETE] - លុបជំនាញ ---
bot.command('delmajor', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;
  const majorId = ctx.message.text.split('/delmajor ')[1];
  if (!majorId) return ctx.reply('⚠️ ទម្រង់៖ /delmajor [ID]');

  try {
    // ប្រើ findByIdAndDelete របស់ Mongoose
    const result = await Major.findByIdAndDelete(majorId.trim());
    if (result) ctx.reply(`🗑️ បានលុបជំនាញនោះចោលរួចរាល់!`);
    else ctx.reply('❌ រកមិនឃើញ ID នេះទេ តើ Copy ខុសមែនអត់?');
  } catch (err) {
    ctx.reply('❌ មិនអាចលុបបានទេ (ប្រហែល ID មិនត្រឹមត្រូវ)!');
  }
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));