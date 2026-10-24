express = require('express');
const path = require('path');
const router = express.Router();

const accountValidation=require('../generalFunctions/AccountAccessCheck')


function checkModSession(req, res, next) {
    const moderatorId = req.cookies.moderatorID;
    // if sign up or log in then only redirect if there is a moderator id
    if (req.originalUrl.includes('/LogIn') || req.originalUrl.includes('/SignUp')) {//if sign up or log in
        if (moderatorId){//if they are already logged in
            return res.redirect('/Moderator/Home?');
        }else{
            return next();
        }
    }if (!moderatorId) {//if another page and no id
        // Redirect to the homepage with a session expired message for moderator routes
        return res.redirect('/Moderator/LogIn?message=session expired (moderator)');
    }
    // If the customer cookie is present, proceed
    next();
}
//always check for cookie
router.use(checkModSession)

router.get('/LogIn', (req, res) => {
    res.sendFile(path.join(__dirname,"../clientSide","ModLogIn.html"));
});

router.post('/LogIn' , async(req,res) =>{
    try{
    const {username,password}=req.body;//const as will only be declared once per submission
    const moderatorId= await accountValidation.modLogInCheck(username,password)//check if data is valid
    if (moderatorId===-1){//if it doesn't match an existing account or SQL injection
        return res.redirect('/Moderator/LogIn?message=Invalid username or password');
    }
    //create a cookie that lasts a week with moderatorId that is protected from client side attacks
    res.cookie('moderatorID',moderatorId,{maxAge:7 * 24 * 60 * 60 * 1000, httpOnly:true});
    //redirect to home page
    res.redirect('/Moderator/Home');
    }catch(err){
        console.error("Error logging in :\n",err)
    }
});

module.exports = router;