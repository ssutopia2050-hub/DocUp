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
// app.post('/signin', async(req, res) => {
//     const{email , password} = req.body;
//     const exists = await user_profile.findOne({email});
//     if(!exists){
//         const err ={
//             "message": "You dont have an account with DocUp",
//         }
//         return res.render('signin', {err});
//     }
//     console.log(exists);
//     if(password === exists.password){
//         const err ={
//             "message": "Sign in successfull",
//         }
//         req.session.email =email;
//         res.redirect('/dashboard');
//     }
//     else {
//         const err ={
//             "message": "Invalid Credentials !!",
//         }
//          res.render('signin', {err});
//     }
// })
app.post('/signin', async (req, res) => {
    const { email, password } = req.body;

    // console.log("typed email:", JSON.stringify(email));
    // console.log("typed password:", JSON.stringify(password));

    const exists = await user_profile.findOne({ email });
    // console.log("db user:", exists);

    if (!exists) {
        return res.render('signin', {
            err: { message: "You dont have an account with DocUp" }
        });
    }

    // console.log("db password:", JSON.stringify(exists.pin));

    if (password === exists.password) {
        req.session.email = email;
        return res.redirect('/dashboard');
    } else {
        return res.render('signin', {
            err: { message: "Invalid Credentials !!" }
        });
    }
});
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
/******************************
 Dashboard
 ******************************/
app.get("/dashboard", async (req, res) => {
    if (!req.session.email) {
        return res.redirect("/signin");
    }

    try {
        const data = await user_profile.findOne({ email: req.session.email });
        const clg = await college.find({});

        res.render("dashboard", {
            data,
            colleges: collegesList,
            results: [],
            college_specific_data: clg
        });

    } catch (err) {
        console.log(err);
        res.status(500).send("Server error");
    }
});
app.post("/api/dashboard-search", async (req, res) => {
    try {
        if (!req.session.email) {
            return res.status(401).json({
                success: false,
                message: "Please sign in first"
            });
        }

        const { search_parameter_text, year, branch } = req.body;

        let searchType = "";
        let searchValue = "";

        if (!search_parameter_text || !search_parameter_text.trim()) {
            return res.status(400).json({
                success: false,
                message: "Search text is required"
            });
        }

        if (search_parameter_text.startsWith("/c")) {
            searchType = "college";
            searchValue = search_parameter_text.slice(2).trim();
        } else if (search_parameter_text.startsWith("/s")) {
            searchType = "subject";
            searchValue = search_parameter_text.slice(2).trim();
        } else {
            searchType = "";
            searchValue = search_parameter_text.trim();
        }

        const resultsMap = new Map();

        function addResults(docs, scoreToAdd) {
            docs.forEach(doc => {
                const id = doc._id.toString();

                if (!resultsMap.has(id)) {
                    resultsMap.set(id, {
                        ...doc.toObject(),
                        _score: 0
                    });
                }

                resultsMap.get(id)._score += scoreToAdd;
            });
        }

        if (searchType === "college") {
            const s1 = await Docs.find({
                college: { $regex: searchValue, $options: "i" },
                ...(year !== "all" ? { year } : {}),
                ...(branch !== "all" ? { branch } : {})
            });
            addResults(s1, 100);

            const s2 = await Docs.find({
                college: { $regex: searchValue, $options: "i" }
            });
            addResults(s2, 70);

            if (branch !== "all") {
                const s3 = await Docs.find({ branch });
                addResults(s3, 20);
            }

            if (year !== "all") {
                const s4 = await Docs.find({ year });
                addResults(s4, 15);
            }
        }

        else if (searchType === "subject") {
            const s1 = await Docs.find({
                subject: { $regex: searchValue, $options: "i" },
                ...(year !== "all" ? { year } : {}),
                ...(branch !== "all" ? { branch } : {})
            });
            addResults(s1, 100);

            const s2 = await Docs.find({
                subject: { $regex: searchValue, $options: "i" }
            });
            addResults(s2, 75);

            if (branch !== "all") {
                const s3 = await Docs.find({ branch });
                addResults(s3, 20);
            }

            if (year !== "all") {
                const s4 = await Docs.find({ year });
                addResults(s4, 15);
            }
        }

        else {
            const s1 = await Docs.find({
                college: { $regex: searchValue, $options: "i" },
                ...(year !== "all" ? { year } : {}),
                ...(branch !== "all" ? { branch } : {})
            });
            addResults(s1, 80);

            const s2 = await Docs.find({
                subject: { $regex: searchValue, $options: "i" },
                ...(year !== "all" ? { year } : {}),
                ...(branch !== "all" ? { branch } : {})
            });
            addResults(s2, 80);

            const s3 = await Docs.find({
                branch: { $regex: searchValue, $options: "i" }
            });
            addResults(s3, 60);

            const s4 = await Docs.find({
                uploaded_by: { $regex: searchValue, $options: "i" }
            });
            addResults(s4, 40);

            if (branch !== "all") {
                const s5 = await Docs.find({ branch });
                addResults(s5, 20);
            }

            if (year !== "all") {
                const s6 = await Docs.find({ year });
                addResults(s6, 15);
            }
        }

        let results_after_search = Array.from(resultsMap.values());
        results_after_search.sort((a, b) => b._score - a._score);

        res.json({
            success: true,
            results: results_after_search
        });

    } catch (err) {
        console.log(err);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
});
// app.post("/dashboard", async (req, res) => {
//     try {
//         if (!req.session.email) {
//             return res.redirect("/signin");
//         }
//
//         const { search_parameter_text, year, branch } = req.body;
//
//         const data = await user_profile.findOne({ email: req.session.email });
//         const clg = await college.find({});
//
//         let searchType = "";
//         let searchValue = "";
//
//         if (search_parameter_text.startsWith("/c")) {
//             searchType = "college";
//             searchValue = search_parameter_text.slice(2).trim();
//         } else if (search_parameter_text.startsWith("/s")) {
//             searchType = "subject";
//             searchValue = search_parameter_text.slice(2).trim();
//         } else {
//             searchType = "";
//             searchValue = search_parameter_text.trim();
//         }
//
//         const resultsMap = new Map();
//
//         function addResults(docs, scoreToAdd) {
//             docs.forEach(doc => {
//                 const id = doc._id.toString();
//
//                 if (!resultsMap.has(id)) {
//                     resultsMap.set(id, {
//                         ...doc.toObject(),
//                         _score: 0
//                     });
//                 }
//
//                 resultsMap.get(id)._score += scoreToAdd;
//             });
//         }
//
//         if (searchType === "college") {
//             const s1 = await Docs.find({
//                 college: { $regex: searchValue, $options: "i" },
//                 ...(year !== "all" ? { year } : {}),
//                 ...(branch !== "all" ? { branch } : {})
//             });
//             addResults(s1, 100);
//
//             const s2 = await Docs.find({
//                 college: { $regex: searchValue, $options: "i" }
//             });
//             addResults(s2, 70);
//
//             if (branch !== "all") {
//                 const s3 = await Docs.find({ branch });
//                 addResults(s3, 20);
//             }
//
//             if (year !== "all") {
//                 const s4 = await Docs.find({ year });
//                 addResults(s4, 15);
//             }
//         }
//
//         else if (searchType === "subject") {
//             const s1 = await Docs.find({
//                 subject: { $regex: searchValue, $options: "i" },
//                 ...(year !== "all" ? { year } : {}),
//                 ...(branch !== "all" ? { branch } : {})
//             });
//             addResults(s1, 100);
//
//             const s2 = await Docs.find({
//                 subject: { $regex: searchValue, $options: "i" }
//             });
//             addResults(s2, 75);
//
//             if (branch !== "all") {
//                 const s3 = await Docs.find({ branch });
//                 addResults(s3, 20);
//             }
//
//             if (year !== "all") {
//                 const s4 = await Docs.find({ year });
//                 addResults(s4, 15);
//             }
//         }
//
//         else {
//             const s1 = await Docs.find({
//                 college: { $regex: searchValue, $options: "i" },
//                 ...(year !== "all" ? { year } : {}),
//                 ...(branch !== "all" ? { branch } : {})
//             });
//             addResults(s1, 80);
//
//             const s2 = await Docs.find({
//                 subject: { $regex: searchValue, $options: "i" },
//                 ...(year !== "all" ? { year } : {}),
//                 ...(branch !== "all" ? { branch } : {})
//             });
//             addResults(s2, 80);
//
//             const s3 = await Docs.find({
//                 branch: { $regex: searchValue, $options: "i" }
//             });
//             addResults(s3, 60);
//
//             const s4 = await Docs.find({
//                 uploaded_by: { $regex: searchValue, $options: "i" }
//             });
//             addResults(s4, 40);
//
//             if (branch !== "all") {
//                 const s5 = await Docs.find({ branch });
//                 addResults(s5, 20);
//             }
//
//             if (year !== "all") {
//                 const s6 = await Docs.find({ year });
//                 addResults(s6, 15);
//             }
//         }
//
//         let results_after_search = Array.from(resultsMap.values());
//
//         results_after_search.sort((a, b) => b._score - a._score);
//
//         res.render("dashboard", {
//             data,
//             colleges: collegesList,
//             results: results_after_search,
//             college_specific_data: clg
//         });
//
//     } catch (err) {
//         console.log(err);
//         res.status(500).send("Server error");
//     }
// });
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
        if (!req.session.email) {
            return res.status(401).json({ success: false, message: "Please sign in first" });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: "No file uploaded" });
        }

        const user = await user_profile.findOne({ email: req.session.email });
        if (!user) {
            return res.status(401).json({ success: false, message: "User not found" });
        }

        const originalName = req.file.originalname;
        const extension = originalName.split(".").pop().toLowerCase();
        const baseName = originalName.replace(/\.[^/.]+$/, "");

        const safeBaseName = baseName
            .toLowerCase()
            .replace(/\s+/g, "_")
            .replace(/[^a-z0-9_-]/g, "");

        const publicId = `${Date.now()}_${safeBaseName}`;

        let resourceType = "raw";
        if (extension === "pdf") {
            resourceType = "image";
        }

        const result = await cloudinary.uploader.upload(req.file.path, {
            resource_type: resourceType,
            folder: "docs",
            public_id: publicId
        });

        const doc = await Docs.create({
            college: req.body.college,
            year: req.body.year,
            semester: req.body.semester,
            branch: req.body.branch,
            subject: req.body.subject,
            file_url: result.secure_url,
            uploaded_by: user.email
        });

        await user_profile.updateOne(
            { email: req.session.email },
            {
                $inc: { Doc_score: 1 },
                $push: {
                    uploads: {
                        url: result.secure_url,
                        subject: req.body.subject,
                        college: req.body.college,
                        uploadedAt: new Date()
                    }
                }
            }
        );

        fs.unlink(req.file.path, (err) => {
            if (err) {
                console.log("Failed to delete temp file:", err);
            }
        });

        res.json({
            success: true,
            docId: doc._id,
            file_url: result.secure_url
        });

    } catch (err) {
        console.error("Upload failed:", err);

        if (req.file?.path) {
            fs.unlink(req.file.path, () => {});
        }

        res.status(500).json({ success: false, message: "Upload failed" });
    }
});
/******************************
      Profile
 ******************************/
app.get("/profile", async (req, res) => {
   res.render("profile")
})
/******************************
    Privacy Policy
 ******************************/
app.get("/privacy_policy", async (req, res) => {
res.render("privacy_policy");
})
/******************************
 Logout
 ******************************/
app.get("/logout", (req, res) => {

    req.session.destroy((err) => {

        if (err) {
            console.log("Logout Error:", err);
            return res.redirect("/dashboard");
        }

        res.clearCookie("connect.sid");   // VERY IMPORTANT
        res.redirect("/signin");           // or homepage

    });

});