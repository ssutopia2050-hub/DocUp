import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import User from "./models/users.js"; // adjust path if needed

const MONGO_URI = process.env.MONGO_URI;

async function increaseDocScore() {
    if (!MONGO_URI) {
        console.error("❌ MONGO_URI not found in .env");
        process.exit(1);
    }

    try {
        await mongoose.connect(MONGO_URI);
        console.log("✅ Connected to MongoDB");

        // Increase Doc_score by 2 for all users
        const result = await User.updateMany(
            {},
            { $inc: { Doc_score: 2 } }
        );

        console.log(`🔥 Increased Doc_score by 2 for ${result.modifiedCount} users`);

    } catch (err) {
        console.error("❌ Error:", err);
    } finally {
        await mongoose.disconnect();
        console.log("🔌 Disconnected");
    }
}

increaseDocScore();