import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "./models/users.js";

dotenv.config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB connected");

        const result = await User.updateMany(
            {},
            { $set: { google_auth: true } }
        );

        console.log("Update result:", result);

        await mongoose.disconnect();
        console.log("Disconnected");
    } catch (err) {
        console.error("Migration error:", err);
    }
}

run();