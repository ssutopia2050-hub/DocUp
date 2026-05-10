import mongoose from "mongoose";
import dotenv from "dotenv";
import DOCS from "./models/Docs.js"; // adjust path if needed

dotenv.config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to DB ✅");

        const result = await DOCS.updateMany(
            { protected: true },
            { $set: { protected: false } }
        );

        console.log(`Documents updated: ${result.modifiedCount}`);

        await mongoose.disconnect();
        console.log("Disconnected ❌");

    } catch (err) {
        console.error("Error ❌:", err);
    }
}

run();