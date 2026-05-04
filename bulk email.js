import mongoose from "mongoose";
import User from "./models/users.js"; // your schema file
import dotenv from "dotenv";
dotenv.config();
// connect to MongoDB
await mongoose.connect(process.env.MONGO_URI);

// function to convert users
async function exportUsers() {
    try {
        const users = await User.find({}, { email: 1, name: 1, _id: 0 });

        let output = "";

        users.forEach(user => {
            let firstName = "";
            let lastName = "";

            if (user.name) {
                const parts = user.name.trim().split(" ");
                firstName = parts[0] || "";
                lastName = parts.slice(1).join(" ") || "";
            }

            const address = ""; // not in schema

            output += `${user.email},${firstName},${lastName},${address}\n`;
        });

        console.log(output);

    } catch (err) {
        console.error(err);
    } finally {
        mongoose.disconnect();
    }
}

exportUsers();