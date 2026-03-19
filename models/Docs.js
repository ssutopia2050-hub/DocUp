import mongoose from "mongoose";

const Docs = new mongoose.Schema({
    college: {
        type:String,
        required:true,
        trim:true,
    },
    year: {
        type:String,
        required:true,
        trim:true,
    },
    semester: {
        type:String,
        required:true,
        trim:true,
    },
    branch: {
        type:String,
        trim:true,
    },
    subject: {
        type:String,
        trim:true,
    },
    file_url: {
        type:String,
        trim:true,
    },
    uploaded_by:{
        type:String,
        trim:true,
        required:true,
    },
    chapter:{
        type:String,
        trim:true,
        required:true,
    },
    comment_section:[
        {
            comment:{
                type:String,
                required:true,
            },
            uploaded_by_email:{
                type:String,
            }

        }
    ],
    likes:{
        type:Number,
        required:true,
        default:0
    },
    liked_by: [
        {
            email: {
                type: String,
                required: true,
                trim: true
            }
        }
    ],
    dislikes:{
        type:Number,
        required:true,
        default:0
    },
    disliked_by: [
        {
            email: {
                type: String,
                required: true,
                trim: true
            }
        }
    ],
});

export default mongoose.model("Docs", Docs);