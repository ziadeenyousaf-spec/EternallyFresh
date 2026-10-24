express = require('express');
const app = express();
const path = require('path');
const router = express.Router();

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

module.exports = router;