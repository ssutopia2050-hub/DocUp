import mongoose from "mongoose";
import dotenv from "dotenv";
import Docs from "./models/Docs.js"; // adjust path if needed

dotenv.config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB connected");

        const before = await Docs.find({
            college: "University of Petroleum and Energy Studies"
        });

        console.log("Matched before update:", before.length);

        const result = await Docs.updateMany(
            { college: "University of Petroleum and Energy Studies" },
            {
                $set: {
                    college: "University of Petroleum and Energy Studies,UPES"
                }
            }
        );

        console.log("matchedCount:", result.matchedCount);
        console.log("modifiedCount:", result.modifiedCount);

        const after = await Docs.find({
            college: "University of Petroleum and Energy Studies,UPES"
        });

        console.log("Matched after update:", after.length);

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

run();