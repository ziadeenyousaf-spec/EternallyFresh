const fs=require('fs')
const path= require('path')

function Name_format(name){//checks if parameter name is in right format - also stops sql injection
    let nameLen=name.length;//needed so length isnt checked every iteration
    for (let i = 0 ; i < nameLen;i++){ // loop through every character in the name
        let curAscii= (name.substring(i)).charCodeAt(0); // gets ascii value for that character
        if (curAscii<65 && (curAscii!=39 && curAscii!=45)){ // if character is a symbol that isnt an apostrophe or hyphen
            return false;
        }else if (curAscii<=96 && curAscii>=91){ // additional disallowed symbols
            return false;
        }else if (curAscii>122){ // any other character that isnt a letter,hyphen or an apostrophe
             return false;
        }
    }
     return true
}

function password_format(password){//checks if parameter password follows rules for a password - does not stop sql injection
    let contLet=false; // flag of whether password contains letters
    let contNum=false; // flag of whether password contains numbers
    let contSym=false; // flag of whether password contains letters
    let passLength=password.length; //needed so each iteration is not checking length and instead checking this variable
    if (passLength<8){//if password is under 8 characters
        return false// passwords is to be rejected
    }for (let i = 0;i < passLength ; i++){//checks every character in password
        let curAscii= (password.substring(i)).charCodeAt(0); // get ascii of current character
        if ((curAscii<=90 && curAscii>=65) || (curAscii<=122 && curAscii>=97)) { // character is a letter
            contLet=true;
        }else if (curAscii<=57 && curAscii>=48) { // character is a number
            contNum=true;
        }else if (curAscii<127 && curAscii>32) { //character is a symbol – any other ascii value that is a character
            contSym=true;
        }
    }if (contLet==true && contNum==true && contSym==true) { // contains letters numbers and symbols
         return true;
    }else{
        return false;// it does not have all three
    }
}   

function isSearchTermInArray(item,array){
    let arrayLen=array.length;//needed so length isnt checked every iteration
    for (let i=0;i<arrayLen;i++){//iterates through every item in array
        if (item==array[i]){//if item is item in array
            return i;//return index in array
        }
    }return -1; //if not in array 
}

async function sqlInjectionCheck(queryaddition){//takes in string to be added to query and returns true if it contains banned term(s)
    try{
        let splitQuery=queryaddition.split(" ")//splits each word into its own 
        for (let i=0;i<splitQuery.length;i++){//loops through every word in string
            if (await isBanned(splitQuery[i])==true){// if this word contains banned word
                return true//a banned word is in the query
            }
        }return false//all words in parameter do not have an sql injection
    }catch(err){//if there is an error checking isBanned
        return true //not neccessarily a sql injection but cant be tested so best to reject
    }
}

async function isBanned(searchterm){//checks if search term is in blacklist.true if it is
    try{
        const filePath=path.join(__dirname,'BannedWords.txt')
        //split each line in blacklist into individual lower case element in array
        const blacklist = fs.readFileSync(path.join(__dirname, 'BannedWords.txt'), 'utf-8')
            .split(/\r?\n/)
            .map(word => word.toLowerCase().trim());
        //compare search term in lower case with no spaces
        if (blacklist.includes(searchterm.toLowerCase().trim())){
            return true
        }else{
            return false;
        }
    }catch(err){
        console.error(`Error trying to check blacklist using ${searchterm} \n`, err)
    }
}

function ema_correct(email){//function that checks if parameter is actually an email. true or false returned.
    //declare 'shape' of an email - actually the email regex but shape is easier to understand
    const emailShape= /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailShape.test(email);//returns true if email fits the shape of an email
}
function date_correct(input) {//returns false if not a date
    input=input.trim()
    // Check format first: 4 digits - 2 digits - 2 digits
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(input)) {
      return false;
    }
    // Check if it's a date
    const date = new Date(input);
    if (isNaN(date.getTime())) {
      return false;
    }
    //Check it is an actual date - not the 2020-02-31 as feb only has 28/29 days
    const parts = input.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // JavaScript months are 0-based
    const day = parseInt(parts[2], 10);
  
    return (
      date.getFullYear() === year &&
      date.getMonth() === month &&
      date.getDate() === day
    );
}



module.exports={Name_format,password_format,isSearchTermInArray,sqlInjectionCheck,isBanned,ema_correct,date_correct}