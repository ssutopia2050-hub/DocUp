import mongoose from "mongoose";

const Contact = new mongoose.Schema({
    email: String,
    name: String,
    topic: String,
    message: String,
    created_at: {
        type: Date,
        default: Date.now
    }
});
export default mongoose.model("Contact",Contact );