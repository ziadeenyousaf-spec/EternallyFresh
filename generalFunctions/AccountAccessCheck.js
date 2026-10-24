//Import all format checkers along and functions to access sql database
//const { format } = require("mysql2"); change to whatever is needed for postgres
let formatChecks=require("./formatChecks.js")
let sqlManipulation=require('./postGresSQLFunctions.js')
const bcrypt = require("bcryptjs");//allows use of package which will hash passwords so that it is more secure


async function getSignUpFormErrors(username,forename,surname,email,password,repassword,DOB){
    let errors = []
    try{
    if (await formatChecks.sqlInjectionCheck(username)){// if username contains an sql injection
        errors.push("Username contains banned phrases.Ensure username does not contain any SQL.")
    }else{//Safe to use in database
        let usernames= await sqlManipulation.getAllFromSingleRow('Customer','username')//Gets all usernames currently in database
        if (formatChecks.isSearchTermInJSON(username,'username',usernames)>-1){//if username is in array - already exists
            errors.push('Username is already in use.Please choose another username or log into this account if you own this username.')
        }
    }let for_correct=formatChecks.Name_format(forename);//flag for if forename is correct - stops sql injection as well
    let sur_correct=formatChecks.Name_format(surname);//flag for if surname is correct - stops sql injection as well
    if ((for_correct==false) || (sur_correct==false)){// if either is in the wrong format
        errors.push('Name is not in right format.Please write your name with no illegal symbols.');//adds message to error
    }if (formatChecks.ema_correct(email)==false){//if it not a valid email
        errors.push('Not a valid email entered. Please enter a real email')
    }if (await formatChecks.sqlInjectionCheck(email)){
        errors.push('Email contains banned phrases. Ensure it does not try to use SQL.')
    }else{//if safe to use to query database
        let emails= await sqlManipulation.getAllFromSingleRow('Customer','email')//array containing all emails of existing accounts
        if (formatChecks.isSearchTermInJSON(email,'email',emails)>-1){//if email is already in use
            errors.push('Email is already in use. Please log in to the account connected to this email.')
        }
    }let pass_correct = formatChecks.password_format(password)//flag for if password is in right format
    if((formatChecks.sqlInjectionCheck(password)==true) || (pass_correct==false)){
        errors.push('Password is in the incorrect format. Must be above 8 characters and contain a letter, number and symbol.')
    }else if(password!=repassword){
        errors.push('Passwords do not match. Please try again.')
    }if (formatChecks.date_correct(DOB)===false){
        errors.push('Not a valid date of birth entered.')
    }
    }catch(err){//if there is an error accessing data
        console.error("Error signing up : \n", err)
        errors.push('There was an error processing your sign in. Please try again.')
    }finally{
        return errors
    }
}

async function custLogInCheck(username,password){
    //gets user that matches parameters. returns -1 if there isnt an account.username can be username or email
    try{
        let customerID;//declares the variable
        if (formatChecks.ema_correct(username)){//if username is an email
            //Gets all usernames currently in database
            let emails= await sqlManipulation.getAllFromSingleRow('Customer','email');
            //check if username is one of the usernames. +1 dues to 0 index
            customerID=formatChecks.isSearchTermInArray(username,emails)+1;
            if (customerID===0){//if username/email is not in array - no account with that info
            return -1;
            }if (formatChecks.sqlInjectionCheck(password)===true){//if password is an sql injection
                return -1;
            }//if email exists and password is not an sqlInjection - already cheked so can be passed in
            var accPass=await sqlManipulation.conditionalSelect('Customer','password',`email = '${username}'`)
        }else{//it is a username    
            //Gets all usernames currently in database
            let usernames= await sqlManipulation.getAllFromSingleRow('Customer','username');
            //check if username is one of the usernames. +1 dues to 0 index
            customerID=formatChecks.isSearchTermInJSON(username,'username',usernames)+1;
            if (customerID===0){//if username/email is not in array - no account with that info
                return -1;
                }if (formatChecks.sqlInjectionCheck(password)===true){//if password is an sql injection
                    return -1;
                //if username exists and password is not an sqlInjection - already cheked so can be passed in
            }var accPass=await sqlManipulation.conditionalSelect('Customer','password',`username = '${username}'`)
        }
        const match = await bcrypt.compare(password,accPass[0].password);
        if (match===true){//if passwords match - is a valid account
            return customerID;
        }else{
            return -1
        }
    }catch(error){//if there is an error in database
        console.error(`Error checking login with username: ${username} password ${password} \n`,error);
        return -1;
    }
}

async function modLogInCheck(username,password){
    //gets user that matches parameters. returns -1 if there isnt an account.username can be username or email
    try{
        let moderatorID;//declares the variable   
        //Gets all usernames currently in database
        let usernames= await sqlManipulation.getAllFromSingleRow('Moderator','username');
        //check if username is one of the usernames. +1 dues to 0 index
        moderatorID=formatChecks.isSearchTermInJSON(username,'username',usernames)+1;
        if (moderatorID===0){//if username is not in array - no account with that info
            return -1;
        }else if (formatChecks.sqlInjectionCheck(password)===true){//if password is an sql injection
            return -1;
        }//if username exists and password is not an sqlInjection - already cheked so can be passed in
        var accPass=await sqlManipulation.conditionalSelect('Moderator','password',`username = '${username}'`)
        accPass = accPass[0].password;//turns the JSON into the string matching the password
        const match = await bcrypt.compare(password,accPass);
        if (match===true){//if passwords match - is a valid account
            return moderatorID;
        }else{
            return -1
        }
    }catch(error){//if there is an error in database
        console.error(`Error checking login with username: ${username} password ${password} \n`,error);
        return -1;
    }
}



module.exports={custLogInCheck,modLogInCheck,getSignUpFormErrors}