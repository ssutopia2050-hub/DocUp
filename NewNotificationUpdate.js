import mongoose from "mongoose";
import dotenv from "dotenv";
import Docs from "./models/Docs.js";

dotenv.config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB connected");

        const countBefore = await Docs.countDocuments({ reviewed: false });
        console.log(`Found ${countBefore} unreviewed doc(s).`);

        if (countBefore === 0) {
            console.log("Nothing to update.");
        } else {
            const result = await Docs.updateMany(
                { reviewed: false },
                { $set: { reviewed: true } }
            );
            console.log(`Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);
        }

        await mongoose.disconnect();
        console.log("Disconnected");
    } catch (err) {
        console.error("Migration error:", err);
    }
}

run();