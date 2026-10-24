express = require('express');
const path = require('path');
const router = express.Router();
const bcrypt = require("bcryptjs");//allows use of package which will hash passwords so that it is more secure

const sql=require('../generalFunctions/postGresSQLFunctions')
const accountValidation=require('../generalFunctions/AccountAccessCheck')

function checkCustomerSession(req, res, next) {
    const customerId = req.cookies.customerID;
    // if sign up or log in then only redirect if there is a customer id
    if (req.originalUrl.includes('/LogIn') || req.originalUrl.includes('/SignUp')) {//if sign up or log in
        if (customerId){//if they are already logged in
            return res.redirect('/Customer/Home?');
        }else{
            return next();
        }
    }if (!customerId) {//if another page and no id
        // Redirect to the homepage with a session expired message for customer routes
        return res.redirect('/Customer/LogIn?message=session expired (customer)');
    }
    // If the customer cookie is present, proceed
    next();
}
//always check for cookie
router.use(checkCustomerSession)

router.get('/Signup', (req, res) => {
    res.sendFile(path.join(__dirname,"../clientSide","CustomerSignup.html"));
});

router.post('/LogIn' , async(req,res) =>{
    try{
    const {username,password}=req.body;//const as will only be declared once per submission
    const customerId= await accountValidation.custLogInCheck(username,password)//check if data is valid
    console.log(`Customer login attempt for username/email: ${username}, Resulting ID: ${customerId}`);
    if (customerId===-1){//if it doesn't match an existing account or SQL injection
        return res.redirect('/Customer/LogIn?message=Invalid username or password');
    }
    //create a cookie that lasts a week with customerID that is protected from client side attacks
    res.cookie('customerID',customerId,{maxAge:7 * 24 * 60 * 60 * 1000, httpOnly:true});
    //redirect to home page
    res.redirect('/Customer/Home');
    }catch(err){
        console.error("Error logging in :\n",err)
    }
});

router.post('/SignUp' , async(req,res) =>{//error add
    try{
        const {username,forename,surname,email,password,repassword,custSex,custDateOfBirth}=req.body;//const as will only be declared once per submission
        const errors= await accountValidation.getSignUpFormErrors(username,forename,surname,email,password,repassword,custDateOfBirth);//check if data is valid
        if (errors.length>0){//if it doesn't match an existing account or SQL injection
            //Send back with errors to come up as an alert
            const errorString = encodeURIComponent(JSON.stringify(errors));
            return res.redirect(`/Customer/SignUp?errors=${errorString}`)
        }
        //No errors so create a new customer with these details
        const hashedPassword = await bcrypt.hash(password, 10);
        const customerId=await sql.newCustomer(username,forename,surname,email,hashedPassword,custSex,custDateOfBirth)
        console.log(`New customer with id : ${customerId}`)
        //create a cookie that lasts a week with customerID that is protected from client side attacks
        res.cookie('customerID',customerId,{maxAge:7 * 24 * 60 * 60 * 1000, httpOnly:true});
        //redirect to home page
        res.redirect('/Customer/Home');
    }catch(err){//something goes wrong with database or blacklist
        //log error then tell user server error
        console.error('Sign up error:',err);
        res.redirect('/Customer/SignUp?errors=' + encodeURIComponent(JSON.stringify(["Server error, try again later."])));
    }
});

router.get('/LogIn',(req,res) => {//add expired login message
    res.sendFile(path.join(__dirname,"../clientSide","CustomerLogIn.html"));
})

router.get('/Home',(req,res) => {
    res.sendFile(path.join(__dirname,"../clientSide","CustomerHome.html"));
});

router.get('/loadSoonExpiringProducts', async (req, res) => {
    try{
        sql.hardCodedQuery('SELECT * FROM "Product" WHERE "expiryDate" < NOW() + INTERVAL \'7 days\' ORDER BY "expiryDate" DESC', res);
    } catch (err) {
        console.error('Error loading soon expiring products:', err);
        res.status(500).send('Internal Server Error');
    }
});

router.get('/loadRecommendedRecipes', async (req, res) => {
    try{
        sql.hardCodedQuery('SELECT * FROM "Recipe" ORDER BY "popularity" DESC LIMIT 5', res);
    } catch (err) {
        console.error('Error loading recommended recipes:', err);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;