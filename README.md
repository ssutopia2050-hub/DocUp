# DocUp - College Notes Sharing Platform 
- Version 1.0.0
- [DocUp Website](www.docup.in)

DocUp is a web application that allows students to **upload, share, and access study materials** such as lecture notes, PDFs, and resources for different colleges, streams, branches, and subjects. The platform includes user authentication, document uploads, and a points system (`Doc_score`) to reward users for contributions.

---

## Features

- **User Authentication**
  - Signup with OTP email verification
  - Signin with email/password
  - Forgot password email support

- **Document Upload**
  - Upload PDFs, notes, or study resources
  - Stored on **Cloudinary** with secure URLs
  - Each upload is tracked in the user's profile (`uploads` array)

- **DocScore**
  - Users earn points (`Doc_score`) for every uploaded document
  - Dashboard shows current Doc_score

- **Search**
  - Search documents by college, stream, branch, year, or subject

- **Persistent Sessions**
  - Session data stored in **MongoDB** using `connect-mongo`
  - Survives server restarts and sleep (works on Render or Vercel)

---

## Tech Stack

- **Backend:** Node.js, Express.js  
- **Frontend:** EJS templating  
- **Database:** MongoDB  
- **File Storage:** Cloudinary  
- **Email Service:** EmailJS  
- **Session Store:** connect-mongo (MongoDB-backed sessions)  
- **File Uploads:** Multer  

---


## Contributing

- Fork the repository

- Create a new branch git checkout -b feature/YourFeature

- Make your changes and commit git commit -m 'Add your message'

- Push to branch git push origin feature/YourFeature

- Open a pull request

## License

© 2026 DocUp. All rights reserved.  

This project is **fully copyrighted** and protected under applicable copyright laws. Unauthorized copying, reproduction, distribution, or commercial use of this project or any part of it **without express written permission from the owner** is strictly prohibited.  

Any violation may result in **legal action** to the fullest extent of the law.

---

## Rights

- All **source code, assets, and content** in this repository are the property of the DocUp development team.  
- Users or third parties **cannot use, modify, distribute, or claim ownership** of this project without explicit permission.  
- Permission to use or modify this project must be obtained **in writing from the project owner**.  
- The DocUp team reserves the right to **take legal action** against any individual or entity violating these terms.  
- This project is intended for **educational and internal use only**, unless a formal license is granted.
- ⚠️ This project is NOT open source.
  Code copying, redistribution or commercial usage without permission is strictly prohibited.
- [This company DocUp is a registered trademark under the Government of India: click to view Patent File Diary](https://github.com/ssutopia2050-hub/DocUp/blob/0ac558183a5ddec520deff3e9b3a80c24e7ca538/Copyright%20Office.pdf)
- [LICENSE](https://github.com/ssutopia2050-hub/DocUp/blob/5dd6a4e9fc24bb1ec5031a8e153a6fdeeca1591d/LICENSE)

