import mongoose from "mongoose";
import dotenv from "dotenv";
import user from "./models/users.js";

dotenv.config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB connected");

        const result = await user.updateMany(
            { doc_view_history: { $exists: false } },   // safer
            {
                $set: {
                    doc_view_history: []
                }
            }
        );

        console.log("Updated Users:", result.modifiedCount);

        await mongoose.disconnect();
        console.log("Disconnected");
    } catch (err) {
        console.error(err);
    }
}

run();