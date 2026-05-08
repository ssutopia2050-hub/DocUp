import mongoose from "mongoose";
import dotenv from "dotenv";
import USER from "./models/users.js";

dotenv.config();

async function run() {
    try {
        // Connect to DB
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to DB ✅");

        // Fetch only emails where Doc_score = 0
        const users = await USER.find({ Doc_score: 0 }).select("email -_id");

        if (users.length === 0) {
            console.log("No users found with Doc_score = 0");
        } else {
            console.log("Emails of users with Doc_score = 0:\n");

            users.forEach(user => {
                console.log(user.email);
            });

            console.log(`\nTotal users: ${users.length}`);
        }

        process.exit(0);

    } catch (err) {
        console.error("Error ❌:", err.message);
        process.exit(1);
    }
}

run();