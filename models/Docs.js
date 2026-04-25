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
    comment_section: [
        {
            user_id: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "user_profile",
                required: true
            },
            comment: {
                type: String,
                required: true,
                trim: true
            },
            createdAt: {
                type: Date,
                default: Date.now
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
    reviewed:{
        type:Boolean,
        default:false
    },
    protected:{
        type:Boolean,
        default:true
    },
    special_tag:{
        type:String,
        trim:true,
        default:"9+ CGPA"
    },
    doc_type:{
        type:String,
        enum:["college_doc","ed_doc","research_doc","random_doc"],
        required:true,
    }

});

export default mongoose.model("Docs", Docs);