import mongoose from "mongoose";
import College from "./models/college.js";

const MONGO_URI = "mongodb+srv://shikhar_admin:0ucVuj6vWR1uDRq0@shikhar.7nkj3vq.mongodb.net/DocUp?appName=Shikhar";

const exams = [
    { name: "JEE Main",    branch: "Engineering", image: "/images/JEE_MAIN.png" },
    { name: "JEE Advanced",branch: "Engineering", image: "/images/JEE_ADVANCED.png" },
    { name: "NEET",        branch: "Medical",     image: "/images/NEET.png" },
    { name: "BITSAT",      branch: "Engineering", image: "/images/BITSAT.png" },
    { name: "VITEEE",      branch: "Engineering", image: "/images/VITEEE.png" },
    { name: "MHT CET",     branch: "Engineering", image: "/images/MHT_CET.png" },
    { name: "CUET",        branch: "Engineering", image: "/images/CUET.png" },
    { name: "COMEDK",      branch: "Engineering", image: "/images/COMEDK.png" },
    { name: "WBJEE",       branch: "Engineering", image: "/images/WBJEE.png" },
    { name: "KCET",        branch: "Engineering", image: "/images/KCET.png" },
    { name: "Other",       branch: "Engineering", image: "/images/OTHER.png" }
];

async function seedExams() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("MongoDB Connected");

        // ✅ Remove old broken entries first
        await College.deleteMany({ college_name: { $in: exams.map(e => e.name) } });

        // ✅ No extra [ ] wrapping — exams.map returns the array directly
        const formattedData = exams.map(exam => ({
            college_name: exam.name,
            branch: exam.branch,
            state: "Delhi",
            image: exam.image
        }));

        await College.insertMany(formattedData);
        console.log("✅ Exams inserted successfully");
        process.exit();
    } catch (error) {
        console.error("❌ Error inserting exams:", error);
        process.exit(1);
    }
}

seedExams();