const mongoose = require("mongoose");
require("dotenv").config();

// =====================
// ១. បង្កើត Schema សម្រាប់ Students 👨‍🎓
// =====================
const studentSchema = new mongoose.Schema({
  fullname: { type: String, required: true },
  phone: { type: String },
  course: { type: String },
  registered_at: { type: Date, default: Date.now }
});

// =====================
// ២. បង្កើត Schema សម្រាប់ Majors 📚
// =====================
const majorSchema = new mongoose.Schema({
  major_name: { type: String, unique: true, required: true }
});

// =====================
// ៣. បង្កើត Models (ប្រៀបដូចជា Table ក្នុង SQL ដែរ)
// =====================
const Student = mongoose.model("Student", studentSchema);
const Major = mongoose.model("Major", majorSchema);

// =====================
// ៤. មុខងារសម្រាប់តភ្ជាប់ទៅ MongoDB 🍃
// =====================
const initDb = async () => {
  try {
    console.log("🚀 កំពុងតភ្ជាប់ទៅកាន់ MongoDB...");
    
    // បងត្រូវប្រាកដថាក្នុង .env របស់បងមាន MONGO_URL ណា៎
    await mongoose.connect(process.env.MONGO_URL);
    
    console.log("✅ តភ្ជាប់ជោគជ័យ និងមាន Collection (Table) រួចរាល់!");
  } catch (err) {
    console.error("❌ ខូចការហើយមេ! តភ្ជាប់ Database អត់បានទេ៖", err.message);
  }
};

// Export យកទៅប្រើនៅកន្លែងផ្សេង
module.exports = { Student, Major, initDb };