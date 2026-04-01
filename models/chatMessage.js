import mongoose from "mongoose";

const chatMessageSchema = new mongoose.Schema(
    {
        room_id: {
            type: String,
            required: true,
            index: true,
        },
        college: {
            type: String,
            required: true,
            trim: true,
        },
        sender_email: {
            type: String,
            required: true,
            trim: true,
        },
        sender_name: {
            type: String,
            required: true,
            trim: true,
        },
        sender_profile_pic: {
            type: String,
            default: "",
            trim: true,
        },
        message: {
            type: String,
            required: true,
            trim: true,
            maxlength: 1000,
        },
    },
    { timestamps: true }
);

const ChatMessage = mongoose.model("ChatMessage", chatMessageSchema);
export default ChatMessage;