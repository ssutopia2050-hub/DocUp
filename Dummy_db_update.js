import dotenv from "dotenv";
import mongoose from "mongoose";
import Docs from "./models/Docs.js";
import users from "./models/users.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

async function updateProtectedField() {
    try {
        if (!MONGO_URI) {
            throw new Error("MONGO_URI is missing in .env");
        }

        await mongoose.connect(MONGO_URI);
        console.log("Connected to MongoDB");

        const result = await Docs.updateMany(
            {},
             {
                $set: {
                   reviewed: true,
                }
            }
        );
        // const result = await users.updateMany({}, { $set: { popup: [] } });

        console.log(`Updated ${result.modifiedCount} documents`);

        await mongoose.disconnect();
    } catch (err) {
        console.error("Error:", err);
    }
}

updateProtectedField();