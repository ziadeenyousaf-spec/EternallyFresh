express = require('express');
const app = express();
const path = require('path');
const cookieParser = require('cookie-parser');//allows server to read cookies
const router = express.Router();

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
    const customerId= await accountValidation.logInCheck(username,password)//check if data is valid
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

router.get('/LogIn',(req,res) => {//add expired login message
    res.sendFile(path.join(__dirname,"../clientSide","CustomerLogIn.html"));
})

module.exports = router;