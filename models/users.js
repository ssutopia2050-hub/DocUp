import mongoose from "mongoose";

const user_profile = new mongoose.Schema({
    email: {
        type:String,
        required:true,
        trim:true,
        unique:true
    },
    password: {
        type:String,
        required:true,
        trim:true,
    },
    name: {
        type:String,
        required:true,
        trim:true,
    },
    Doc_score:{
        type:Number,
        required:true,
        trim:true,
        default:0
    },
    uploads: [
        {
            url: { type: String, required: true },
            subject: String,
            college: String,
            uploadedAt: { type: Date, default: Date.now }
        }
    ]
});

export default mongoose.model("user_profile", user_profile);