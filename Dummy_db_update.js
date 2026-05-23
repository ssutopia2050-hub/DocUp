import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import Docs from "./models/Docs.js"; // adjust path if needed

const MONGO_URI = process.env.MONGO_URI;

async function updateDocsPrice() {
    if (!MONGO_URI) {
        console.error("❌ MONGO_URI not found in .env");
        process.exit(1);
    }

    try {
        await mongoose.connect(MONGO_URI);
        console.log("✅ Connected");

        // OPTION 1: Add price ONLY if missing
        const result = await Docs.updateMany(
            {},  // filter
            { $set: { reviewed: true } }          // default value
        );

        console.log(`🔥 Updated ${result.modifiedCount} documents (missing price)`);

        // OPTION 2 (alternative): Force update ALL docs
        /*
        const result = await Docs.updateMany(
            {},
            { $set: { price: 1 } }
        );

        console.log(`🔥 Updated ${result.modifiedCount} documents (all docs)`);
        */

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
        console.log("🔌 Disconnected");
    }
}

updateDocsPrice();