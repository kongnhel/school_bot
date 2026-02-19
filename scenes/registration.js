const { Scenes, Markup } = require('telegraf');
const { pool } = require('../config/database');

const registrationWizard = new Scenes.WizardScene(
  'REGISTRATION_SCENE',
  
  // ជំហានទី ១: សួរឈ្មោះ
  (ctx) => {
    ctx.reply('👋 ជម្រាបសួរ! ដើម្បីចុះឈ្មោះ សូមបញ្ចូលឈ្មោះពេញរបស់ប្អូន៖');
    ctx.wizard.state.formData = {}; 
    return ctx.wizard.next();
  },

  // ជំហានទី ២: ទទួលឈ្មោះ និងសួរលេខទូរស័ព្ទ
  (ctx) => {
    if (!ctx.message || !ctx.message.text) {
      return ctx.reply('❌ សូមបញ្ចូលឈ្មោះជាអក្សរ!');
    }
    ctx.wizard.state.formData.fullname = ctx.message.text;
    ctx.reply('📱 សូមបញ្ចូលលេខទូរស័ព្ទរបស់ប្អូន (ឧទាហរណ៍៖ 012345678)៖');
    return ctx.wizard.next();
  },

  // ជំហានទី ៣: ទាញយកជំនាញពី Database និងបង្ហាញប៊ូតុង
  async (ctx) => {
    const phone = ctx.message.text;
    const phoneRegex = /^[0-9]{9,10}$/;

    if (!phoneRegex.test(phone)) {
      return ctx.reply('⚠️ លេខទូរស័ព្ទមិនត្រឹមត្រូវ! សូមបញ្ចូលឡើងវិញ (៩ ទៅ ១០ ខ្ទង់)៖');
    }

    ctx.wizard.state.formData.phone = phone;

    try {
      // --- ផ្នែក Dynamic: ទាញយកជំនាញពី Table majors ---
      const [rows] = await pool.query('SELECT major_name FROM majors');
      
      if (rows.length === 0) {
        ctx.reply('❌ សុំទោស! បច្ចុប្បន្នមិនទាន់មានវគ្គសិក្សាបើកឱ្យចុះឈ្មោះទេ។');
        return ctx.scene.leave();
      }

      // បង្កើតបញ្ជីប៊ូតុងចេញពី Database
      const majorButtons = rows.map(row => [row.major_name]);
      ctx.wizard.state.validCourses = rows.map(row => row.major_name); // រក្សាទុកសម្រាប់ Check ជំហានបន្ទាប់

      ctx.reply('🎓 តើប្អូនចង់រៀនជំនាញអ្វី?', 
        Markup.keyboard(majorButtons).oneTime().resize()
      );
      return ctx.wizard.next();

    } catch (err) {
      console.error('Database Error:', err);
      ctx.reply('❌ មានបញ្ហាបច្ចេកទេសក្នុងការទាញទិន្នន័យវគ្គសិក្សា។');
      return ctx.scene.leave();
    }
  },

  // ជំហានទី ៤: រក្សាទុកទិន្នន័យចុះឈ្មោះ
  async (ctx) => {
    const { fullname, phone, validCourses } = ctx.wizard.state.formData;
    const course = ctx.message.text;

    // ផ្ទៀងផ្ទាត់ថាជំនាញដែលសិស្សវាយ/ចុច គឺមានក្នុងបញ្ជីពិតមែន
    if (!ctx.wizard.state.validCourses.includes(course)) {
      return ctx.reply('❌ សូមជ្រើសរើសជំនាញដែលមានក្នុងប៊ូតុងខាងក្រោមប៉ុណ្ណោះ៖');
    }

    try {
      await pool.query(
        'INSERT INTO students (fullname, phone, course) VALUES (?, ?, ?)',
        [fullname, phone, course]
      );

      if (process.env.ADMIN_ID) {
        ctx.telegram.sendMessage(process.env.ADMIN_ID, 
          `🔔 **មានសិស្សចុះឈ្មោះថ្មី!**\n\n👤 ឈ្មោះ៖ ${fullname}\n📞 លេខ៖ ${phone}\n📚 ជំនាញ៖ ${course}`
        );
      }

      ctx.reply('✅ ការចុះឈ្មោះជោគជ័យ! សាលានឹងទាក់ទងទៅប្អូនតាមរយៈលេខ ' + phone + ' ឆាប់ៗ។', 
        Markup.removeKeyboard()
      );

    } catch (err) {
      console.error('MySQL Error:', err);
      ctx.reply('❌ បញ្ហាបច្ចេកទេស! សូមព្យាយាមម្តងទៀតក្រោយ។', Markup.removeKeyboard());
    }
    return ctx.scene.leave();
  }
);

module.exports = registrationWizard;