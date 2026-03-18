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
    }
});

export default mongoose.model("Docs", Docs);