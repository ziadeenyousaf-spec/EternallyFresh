express = require('express');
const app = express();
const port = 3000;
const path = require('path');
const cookieParser = require('cookie-parser');//allows server to read cookies
const bcrypt = require("bcryptjs");//allows use of package which will hash passwords so that it is more secure
require('dotenv').config();

app.use(express.static(path.join(__dirname, 'clientSide')));//allows server to serve the html pages without unneeded additions to the URL
app.use(express.urlencoded({ extended: true })); // ensures form submissions are readable and available
app.use(express.json({ limit: '8mb' }));
app.use(cookieParser());//allows server to read cookies

const modRoutes = require("./routers/modRouter")//router for all employee pages
const customerRoutes= require("./routers/customerRouter")//router for all customer pages

//console.log(bcrypt.hashSync("DiddyOilIsCoolAsf", 10))//hashes the password to be stored in the database
//console.log(bcrypt.hashSync("ILoveAbel", 10))//hashes the password to be stored in the database

//use the routers
app.use('/Moderator',modRoutes) 
app.use('/Customer',customerRoutes)

app.get("/",(req,res) => {//if URL is only website name
    res.sendFile(path.join(__dirname,"clientSide","FrontPage.html"));//show front page with added message
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});