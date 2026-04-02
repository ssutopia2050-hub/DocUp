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
        message_type: { type: String, default: "text" },
        shared_doc: {
            doc_id: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Docs"
            },
            subject: String,
            chapter: String,
            college: String,
            reviewed: Boolean,
            likes: Number,
            uploaded_by: String
        }
    },
    { timestamps: true }
);

const ChatMessage = mongoose.model("ChatMessage", chatMessageSchema);
export default ChatMessage;