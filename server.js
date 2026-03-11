import express from 'express';
import dotenv from "dotenv";
import user_profile from "./models/users.js";
import college from "./models/college.js";
import Docs from "./models/Docs.js";
import emailjs from "@emailjs/nodejs";
import multer from "multer";
import fs from "fs";
import csv from "csv-parser";
import MongoStore from "connect-mongo";
import { v2 as cloudinary } from "cloudinary";
const app = express();
const port = process.env.PORT || 5000;
import connectDB from "./config/db.js";
import session from "express-session";
dotenv.config();
const upload = multer({dest:"uploads/"});
/******************************
           Middleware
 ******************************/
app.set("view engine", "ejs");
app.set("views", "./views");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(
    session({
        secret: process.env.SESSION_SECRET,  // keep your secret
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({
            mongoUrl: process.env.MONGO_URI,   // your MongoDB connection string
            collectionName: "sessions",        // collection to store sessions
            ttl: 24 * 60 * 60                  // session expiry in seconds (1 day)
        }),
        cookie: {
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000        // 1 day in ms
        }
    })
);
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});
let collegesList = [];

fs.createReadStream("College_data.csv")
    .pipe(csv())
    .on("data", (row)=>{
        if(row.College_Name){
            collegesList.push(row.College_Name.trim());
        }
    })
    .on("end", ()=>{
        collegesList = [...new Set(collegesList)].sort();
        console.log("Colleges Loaded :", collegesList.length);
    });
/******************************
           Server Start
 ******************************/
app.listen(port, () => {
    console.log(`Server running on url: http://localhost:${port}/`);
});
/******************************
           Database
 ******************************/
(async () => {
    try {
        await connectDB();
        console.log("Mongo Ready");
    } catch (err) {
        console.warn("Mongo unavailable");
    }
})();
/******************************
           Routes
 ******************************/
app.get('/', (req, res) => {
    res.render('signup' , {err:null})
})
/******************************
          Signup
 ******************************/
app.get("/signup", (req, res) => {
    res.render('signup',{err:null});
})
app.post('/signup', async (req, res) => {
    const { name, email, password } = req.body;

    const exists = await user_profile.findOne({ email });

    if (exists) {
        return res.render('signup', {
            err: { message: "An account with your email already exists !!" }
        });
    }

    const otp = Math.floor(100000 + Math.random() * 900000);

    req.session.pendingUser = {
        name,
        email,
        password,
        otp,
        expires: Date.now() + 10 * 60 * 1000,
        resendAllowedAt: Date.now() + 5 * 60 * 1000
    };

    try {
        await emailjs.send(
            process.env.EMAILJS_SERVICE_ID,
            process.env.EMAILJS_VERIF_TEMPLATE_ID,
            {
                email,
                otp,
                name
            },
            {
                publicKey: process.env.EMAILJS_PUBLIC_KEY,
                privateKey: process.env.EMAILJS_PRIVATE_KEY
            }
        );

        console.log(`OTP sent to ${email}: ${otp}`);

    } catch (err) {
        console.error("Email sending failed:", err);
        return res.render("signup", {
            err: { message: "Failed to send OTP. Try again." }
        });
    }

    res.redirect('/email_verify');
});
/******************************
        SignIn
 ******************************/
app.get('/signin',  (req, res) => {
    res.render('signin', {err:null});
})
app.post('/signin', async(req, res) => {
    const{email , password} = req.body;
    const exists = await user_profile.findOne({email});
    if(!exists){
        const err ={
            "message": "You dont have an account with DocUp",
        }
        return res.render('signin', {err});
    }
    console.log(exists);
    if(password === exists.password){
        const err ={
            "message": "Sign in successfull",
        }
        req.session.email =email;
        res.redirect('/dashboard');
    }
    else {
        const err ={
            "message": "Invalid Credentials !!",
        }
         res.render('signin', {err});
    }
})
/******************************
    Email Verification
 ******************************/
app.get("/email_verify", (req, res) => {

    const data = req.session.pendingUser;

    if (!data) {
        return res.redirect("/signup");
    }

    res.render("email_verify", {
        email: data.email,
        expires: data.expires,
        resendAllowedAt: data.resendAllowedAt,
        err:null
    });
});
app.post("/email_verify", async (req, res) => {

    const { otp } = req.body;
    const data = req.session.pendingUser;

    if (!data) {
        return res.redirect("/signup");
    }

    if (Date.now() > data.expires) {
        delete req.session.pendingUser;

        return res.render("signup", {
            err: { message: "OTP expired. Please signup again." }
        });
    }

    if (String(otp) !== String(data.otp)) {
        return res.render("email_verify", {
            email: data.email,
            expires: data.expires,
            resendAllowedAt: data.resendAllowedAt,
            err: { message: "Invalid OTP" }
        });
    }

    // OTP correct → create user
    await user_profile.create({
        name: data.name,
        email: data.email,
        password: data.password
    });

    delete req.session.pendingUser;
    res.redirect("/signin",);
});
/******************************
 OTP Resend
 ******************************/
app.post("/resend_otp", async (req, res) => {

    const data = req.session.pendingUser;

    if (!data) {
        return res.redirect("/signup");
    }

    if (Date.now() < data.resendAllowedAt) {
        return res.redirect("/email_verify");
    }

    const newOtp = Math.floor(100000 + Math.random() * 900000);

    data.otp = newOtp;
    data.expires = Date.now() + 10 * 60 * 1000;
    data.resendAllowedAt = Date.now() + 5*60 * 1000;

    console.log("Resent OTP:", newOtp);

    await emailjs.send(
        process.env.EMAILJS_SERVICE_ID,
        process.env.EMAILJS_VERIF_TEMPLATE_ID,
        {
            email: data.email,
            otp: newOtp,
            name: data.name
        },
        {
            publicKey: process.env.EMAILJS_PUBLIC_KEY,
            privateKey: process.env.EMAILJS_PRIVATE_KEY
        }
    );

    res.redirect("/email_verify");
});
/******************************
      Forgot Password
 ******************************/
 app.get("/forgot_password", async (req, res) => {
     res.render('forgot_password', {err:null});
 })
app.post("/forgot_password", async (req, res) => {

    const { email } = req.body;
    const exists = await user_profile.findOne({ email });

    if (!exists) {
        return res.render("forgot_password", {
            err: { message: "You have not signed up." }
        });
    }

    req.session.forgotData = {
        email: exists.email,
        name: exists.name,
        password: exists.password,
        resendAllowedAt: Date.now() + 5 * 60 * 1000
    };

    try {
        await emailjs.send(
            process.env.EMAILJS_SERVICE_ID,
            process.env.EMAILJS_TEMPLATE_ID,
            {
                email: exists.email,
                password: exists.password,
                name: exists.name
            },
            {
                publicKey: process.env.EMAILJS_PUBLIC_KEY,
                privateKey: process.env.EMAILJS_PRIVATE_KEY
            }
        );

        console.log("Password email sent");

    } catch (err) {
        console.error("Email sending failed:", err);
        return res.render("forgot_password", {
            err: { message: "Password sent to your email." },
            resendAllowedAt: req.session.forgotData.resendAllowedAt
        });
    }

    res.render("forgot_password", {
        err: { message: "Password sent to your email." },
        resendAllowedAt: req.session.forgotData.resendAllowedAt
    });

});
app.post("/resend_forgot_password", async (req, res) => {

    const data = req.session.forgotData;

    if (!data) {
        return res.redirect("/forgot_password");
    }

    if (Date.now() < data.resendAllowedAt) {
        return res.render("forgot_password", {
            err: { message: "Password sent to your email." },
            resendAllowedAt: req.session.forgotData.resendAllowedAt
        });
    }

    data.resendAllowedAt = Date.now() + 5 * 60 * 1000;

    await emailjs.send(
        process.env.EMAILJS_SERVICE_ID,
        process.env.EMAILJS_TEMPLATE_ID,
        {
            email: data.email,
            password: data.password,
            name: data.name
        },
        {
            publicKey: process.env.EMAILJS_PUBLIC_KEY,
            privateKey: process.env.EMAILJS_PRIVATE_KEY
        }
    );

    res.render("forgot_password", {
        err: { message: "Password sent to your email." },
        resendAllowedAt: req.session.forgotData.resendAllowedAt
    });
});
/******************************
      Dashboard
 ******************************/
app.get("/dashboard", async (req, res) => {
    if (!req.session.email) {
        return res.redirect("/signin");
    }
    const data = await user_profile.findOne({email:req.session.email})
    console.log(data);
    res.render("dashboard", {
        data
    });
})
app.post("/dashboard", async (req, res) => {
    const{search_parameter_text,year,stream,branch} = req.body;
    console.log(req.body);

})
/******************************
      Uploads
 ******************************/
app.get("/uploads", async (req, res) => {

    const data = await user_profile.findOne({ email: req.session.email });

    const colleges = [];

    fs.createReadStream("College_data.csv")
        .pipe(csv())
        .on("data", (row) => {

            // change column name if different
            if (row["College_Name"]) {
                colleges.push(row["College_Name"].trim());
            }

        })
        .on("end", () => {

            const uniqueColleges = [...new Set(colleges)].sort();

            res.render("uploads", {
                data,
                colleges: uniqueColleges
            });

        });

});
app.post("/upload_docs", upload.single("file"), async (req, res) => {
    try {
        // 1️⃣ Upload file to Cloudinary
        const result = await cloudinary.uploader.upload(req.file.path);

        // 2️⃣ Get current user
        const user = await user_profile.findOne({ email: req.session.email });
        if (!user) {
            return res.status(401).json({ success: false, message: "User not found" });
        }

        // 3️⃣ Create the document entry in Docs collection
        const doc = await Docs.create({
            college: req.body.college,
            year: req.body.year,
            semester: req.body.semester,
            branch: req.body.branch,
            subject: req.body.subject,
            file_url: result.secure_url,
            uploaded_by: user.email
        });

        // 4️⃣ Update user profile: increment Doc_score & push to uploads array
        await user_profile.updateOne(
            { email: req.session.email },
            {
                $inc: { Doc_score: 1 },      // increment Doc_score
                $push: {
                    uploads: {
                        url: result.secure_url,
                        subject: req.body.subject,
                        college: req.body.college,
                        uploadedAt: new Date()   // optional, schema already defaults
                    }
                }
            }
        );

        // 5️⃣ Send success response
        res.json({ success: true, docId: doc._id });

    } catch (err) {
        console.error("Upload failed:", err);
        res.status(500).json({ success: false, message: "Upload failed" });
    }
});