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

function isValidDateOnly(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function getUploadedFoodImage(body) {
    const { imageData, imageMimeType } = body;
    if (imageData === undefined && imageMimeType === undefined) {
        return null;
    }
    if (typeof imageData !== 'string' || typeof imageMimeType !== 'string' ||
        !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(imageMimeType) ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(imageData)) {
        throw Object.assign(new Error('Upload a valid JPEG, PNG, WebP, or GIF image.'), { status: 400 });
    }

    const image = Buffer.from(imageData, 'base64');
    if (image.length === 0 || image.length > 5 * 1024 * 1024) {
        throw Object.assign(new Error('Images must be smaller than 5 MB.'), { status: 400 });
    }

    const matchesMimeType = imageMimeType === 'image/jpeg'
        ? image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff
        : imageMimeType === 'image/png'
            ? image.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
            : imageMimeType === 'image/webp'
                ? image.toString('ascii', 0, 4) === 'RIFF' && image.toString('ascii', 8, 12) === 'WEBP'
                : image.toString('ascii', 0, 3) === 'GIF';
    if (!matchesMimeType) {
        throw Object.assign(new Error('The uploaded file does not match its image type.'), { status: 400 });
    }
    return image;
}

async function getOpenFoodFactsImage(imageUrl) {
    if (typeof imageUrl !== 'string' || !imageUrl.trim()) {
        return null;
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(imageUrl);
    } catch {
        throw Object.assign(new Error('The barcode image link is invalid.'), { status: 400 });
    }
    const imageHost = parsedUrl.hostname.toLowerCase();
    const isOpenFoodFactsHost = ['.openfoodfacts.org', '.openfoodfacts.net'].some(
        (domain) => imageHost === domain.slice(1) || imageHost.endsWith(domain)
    );
    if (!isOpenFoodFactsHost ||
        parsedUrl.username ||
        parsedUrl.password ||
        (parsedUrl.port && parsedUrl.port !== '443')) {
        throw Object.assign(new Error('Barcode images must be hosted by Open Food Facts.'), { status: 400 });
    }
    if (parsedUrl.protocol === 'http:') {
        parsedUrl.protocol = 'https:';
    } else if (parsedUrl.protocol !== 'https:') {
        throw Object.assign(new Error('Barcode images must use HTTPS.'), { status: 400 });
    }

    let response;
    try {
        response = await fetch(parsedUrl, {
            signal: AbortSignal.timeout(8000),
            redirect: 'error'
        });
    } catch (error) {
        throw Object.assign(new Error('Unable to download the image provided by the barcode lookup.'), {
            status: 502,
            cause: error
        });
    }
    if (!response.ok || !response.body) {
        throw Object.assign(new Error('The image provided by the barcode lookup is unavailable.'), { status: 502 });
    }

    const imageMimeType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(imageMimeType)) {
        await response.body.cancel();
        throw Object.assign(new Error('The barcode image has an unsupported image format.'), { status: 400 });
    }

    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > 5 * 1024 * 1024) {
        await response.body.cancel();
        throw Object.assign(new Error('Barcode images must be smaller than 5 MB.'), { status: 400 });
    }

    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            totalBytes += value.length;
            if (totalBytes > 5 * 1024 * 1024) {
                await reader.cancel();
                throw Object.assign(new Error('Barcode images must be smaller than 5 MB.'), { status: 400 });
            }
            chunks.push(Buffer.from(value));
        }
    } catch (error) {
        if (error.status) throw error;
        throw Object.assign(new Error('Unable to download the image provided by the barcode lookup.'), {
            status: 502,
            cause: error
        });
    }

    const image = Buffer.concat(chunks, totalBytes);
    return getUploadedFoodImage({
        imageData: image.toString('base64'),
        imageMimeType
    });
}

let recipeIngredientDetailsTablePromise;

function ensureRecipeIngredientDetailsTable() {
    if (!recipeIngredientDetailsTablePromise) {
        recipeIngredientDetailsTablePromise = sql.parameterizedQuery(`
        CREATE TABLE IF NOT EXISTS "RecipeIngredientDetail" (
            "recipeID" bigint NOT NULL,
            "foodID" integer NOT NULL,
            amount numeric NOT NULL CHECK (amount > 0),
            unit varchar(40) NOT NULL,
            position integer NOT NULL,
            PRIMARY KEY ("recipeID", position)
        );
        `).catch((error) => {
            recipeIngredientDetailsTablePromise = null;
            throw error;
        });
    }
    return recipeIngredientDetailsTablePromise;
}

let recipeOwnershipTablePromise;

function ensureRecipeOwnershipTable() {
    if (!recipeOwnershipTablePromise) {
        recipeOwnershipTablePromise = sql.parameterizedQuery(`
            CREATE TABLE IF NOT EXISTS "RecipeOwnership" (
                "recipeID" integer PRIMARY KEY,
                "custID" integer NOT NULL
            );
        `).catch((error) => {
            recipeOwnershipTablePromise = null;
            throw error;
        });
    }
    return recipeOwnershipTablePromise;
}

function getRecipeAmountArray(ingredients, columnType) {
    const amounts = ingredients.map((ingredient) => ingredient.amount);
    return /(?:smallint|integer|bigint)\[\]/.test(columnType)
        ? amounts.map(Math.round)
        : amounts;
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

router.get('/LogOut', (req, res) => {
    res.clearCookie('customerID');
    res.redirect('/Customer/LogIn');
});

router.get('/Home',(req,res) => {
    res.sendFile(path.join(__dirname,"../clientSide","CustomerHome.html"));
});

router.get('/getSoonExpiringProducts/', async (req, res) => {
    try{
        const custId = req.cookies.customerID;
        let result = await sql.hardCodedQuery(`
    SELECT
        f.name,
        encode(fp."foodPic", 'base64') AS "foodPic",
        fc."expiryDate"
    FROM "food2Cust" AS fc
    JOIN "Food" AS f
        ON fc."foodID" = f."foodID"
    LEFT JOIN "foodPicture" AS fp
        ON f."foodID" = fp."foodID"
    WHERE fc."custID" = ${custId}
        AND fc."expiryDate" >= CURRENT_DATE
    ORDER BY fc."expiryDate" ASC
    LIMIT 3;`, );
            res.json(result);
    } catch (err) {
        console.error('Error loading soon expiring products:', err);
        res.status(500).send('Internal Server Error');
    }
});



router.get('/loadRecommendedRecipes', async (req, res) => {
    try{
        //fetch food top 10 items that are soon to expire for the customer
        let custId = req.cookies.customerID;
        let soonExpiringFoods = await sql.hardCodedQuery(`
    SELECT
        f."foodID",
        fc."expiryDate",
        fc."currSize",
        f."maxSize"
    FROM "food2Cust" AS fc
    JOIN "Food" AS f
        ON fc."foodID" = f."foodID"
    WHERE fc."custID" = ${custId}
        AND fc."expiryDate" >= CURRENT_DATE
    ORDER BY fc."expiryDate" ASC
    LIMIT 10;`, ); 
        //give them points based on how close they are to expiring and how many they have
        let foodScores= Array.from({length: soonExpiringFoods.length}, () => [0, 0]); //array of arrays with foodID and score
        soonExpiringFoods.forEach((food, index) => {
            let daysUntilExpiry = (new Date(food.expiryDate) - new Date()) / (1000 * 60 * 60 * 24);
            let score = (10-daysUntilExpiry) * food.currSize / food.maxSize;
            foodScores[index] = [food.foodID, score];
        });
        //then get the top 3 recipes that use the most of those ingredients
        let recipesToScore = await sql.hardCodedQuery(`SELECT r."recipeID",r."foodIDs" FROM "Recipe" AS r;`, );
        let recipeScores = Array.from({length: recipesToScore.length}, () => [0, 0]); //array of arrays with recipeID and score
        recipeScores = await recipeScores
        recipesToScore.forEach((recipe, index) => {
            let score = 0;
            let foodIDs = recipe.foodIDs
            foodScores.forEach((food) => {
                if (foodIDs.includes(food[0])) {
                    score += food[1];
                }
            });
            recipeScores[index] = [recipe.recipeID, score];
        });
        //sort the recipes by score and get the top 3
        recipeScores.sort((a, b) => b[1] - a[1]);
        let top3Recipes = recipeScores.slice(0, 3).map((recipe) => recipe[0]);
        //return the recipe name, picture and time to make of those top 3 recipes
        let result = await sql.hardCodedQuery(`
    SELECT
        r.name,
        encode(rp."recipePic", 'base64') AS "recipePic",
        r."cookingTime"
    FROM "Recipe" AS r
    LEFT JOIN "recipeImage" AS rp
        ON r."recipeID" = rp."recipeID"
    WHERE r."recipeID" IN (
        ${top3Recipes.join(',')}
    );`, );      
        res.json(result);
    } catch (err) {
        console.error('Error loading recommended recipes:', err);
        res.status(500).send('Internal Server Error');
    }
});

router.get('/EditItems', (req, res) => {
    res.sendFile(path.join(__dirname,"../clientSide","CustomerEditItems.html"));
});

router.get('/AddItem', (req, res) => {
    res.sendFile(path.join(__dirname,"../clientSide","CustomerAddItem.html"));
});

router.get('/foodCatalog', async (req, res) => {
    try {
        const customerId = Number(req.cookies.customerID);
        if (!Number.isSafeInteger(customerId) || customerId <= 0) {
            return res.status(401).json({ error: 'A valid customer session is required.' });
        }
        const result = await sql.parameterizedQuery(`
            SELECT
                f."foodID",
                f.name,
                f."maxSize",
                f."sizeUnits",
                EXISTS (
                    SELECT 1
                    FROM "foodPicture" AS fp
                    WHERE fp."foodID" = f."foodID"
                        AND fp."foodPic" IS NOT NULL
                ) AS "hasPicture"
            FROM "Food" AS f
            ORDER BY name ASC;
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error loading food catalog:', err);
        res.status(500).json({ error: 'Unable to load the food catalog right now.' });
    }
});

router.get('/foodCatalog/:foodID/image', async (req, res) => {
    try {
        const customerId = Number(req.cookies.customerID);
        const foodId = Number(req.params.foodID);
        if (!Number.isSafeInteger(customerId) || customerId <= 0) {
            return res.status(401).json({ error: 'A valid customer session is required.' });
        }
        if (!Number.isSafeInteger(foodId) || foodId <= 0) {
            return res.status(400).json({ error: 'The food identifier is invalid.' });
        }

        const result = await sql.parameterizedQuery(`
            SELECT fp."foodPic"
            FROM "foodPicture" AS fp
            JOIN "Food" AS f ON f."foodID" = fp."foodID"
            WHERE f."foodID" = $1
                AND fp."foodPic" IS NOT NULL;
        `, [foodId]);
        if (!result.rows.length) {
            return res.status(404).end();
        }

        const image = result.rows[0].foodPic;
        const imageMimeType = image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff
            ? 'image/jpeg'
            : image.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
                ? 'image/png'
                : image.toString('ascii', 0, 4) === 'RIFF' && image.toString('ascii', 8, 12) === 'WEBP'
                    ? 'image/webp'
                    : image.toString('ascii', 0, 3) === 'GIF'
                        ? 'image/gif'
                        : null;
        if (!imageMimeType) {
            console.error(`Stored food image for foodID ${foodId} has an unsupported image format.`);
            return res.status(415).json({ error: 'The stored food image has an unsupported format.' });
        }

        res.type(imageMimeType).send(image);
    } catch (err) {
        console.error('Error loading catalog food image:', err);
        res.status(500).json({ error: 'Unable to load this food image right now.' });
    }
});

router.post('/addFoodItem', async (req, res) => {
    try {
        const customerId = Number(req.cookies.customerID);
        if (!Number.isSafeInteger(customerId) || customerId <= 0) {
            return res.status(401).json({ error: 'A valid customer session is required.' });
        }

        const { method, expiryDate } = req.body;
        const currentAmount = Number(req.body.currentAmount);
        if (!Number.isFinite(currentAmount) || currentAmount < 0 || !isValidDateOnly(expiryDate)) {
            return res.status(400).json({ error: 'Enter a valid current amount and expiry date.' });
        }
        const uploadedImage = getUploadedFoodImage(req.body);

        if (method === 'catalog') {
            const foodId = Number(req.body.foodID);
            if (!Number.isSafeInteger(foodId) || foodId <= 0) {
                return res.status(400).json({ error: 'Choose a food from the catalog.' });
            }

            const food = await sql.parameterizedQuery(
                'SELECT "maxSize" FROM "Food" WHERE "foodID" = $1',
                [foodId]
            );
            if (food.rows.length !== 1) {
                return res.status(404).json({ error: 'The selected food was not found. Refresh the page and try again.' });
            }
            const maxSize = Number(food.rows[0].maxSize);
            if (currentAmount > maxSize) {
                return res.status(400).json({ error: `Current amount cannot exceed ${maxSize}.` });
            }

            await sql.parameterizedQuery(`
                INSERT INTO "food2Cust" ("custID", "foodID", "currSize", "expiryDate")
                VALUES ($1, $2, $3, $4);
            `, [customerId, foodId, currentAmount, expiryDate]);
            if (uploadedImage) {
                const updatedImage = await sql.parameterizedQuery(`
                    UPDATE "foodPicture"
                    SET "foodPic" = $2
                    WHERE "foodID" = $1;
                `, [foodId, uploadedImage]);
                if (updatedImage.rowCount === 0) {
                    await sql.parameterizedQuery(`
                        INSERT INTO "foodPicture" ("foodID", "foodPic")
                        VALUES ($1, $2);
                    `, [foodId, uploadedImage]);
                }
            }
        } else if (method === 'new' || method === 'barcode') {
            const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
            const sizeUnits = typeof req.body.sizeUnits === 'string' ? req.body.sizeUnits.trim() : '';
            const maxSize = Number(req.body.maxSize);
            const barcodeNumber = method === 'barcode'
                ? (typeof req.body.barcodeNumber === 'string' ? req.body.barcodeNumber.trim() : '')
                : '-1';
            if (!name || name.length > 200 || !sizeUnits || sizeUnits.length > 40 ||
                !Number.isFinite(maxSize) || maxSize <= 0 ||
                (method === 'barcode' && !/^\d{8,14}$/.test(barcodeNumber))) {
                return res.status(400).json({ error: 'Enter a valid food name, maximum amount, and unit.' });
            }
            if (currentAmount > maxSize) {
                return res.status(400).json({ error: `Current amount cannot exceed ${maxSize}.` });
            }

            const foodImage = uploadedImage ||
                (method === 'barcode' ? await getOpenFoodFactsImage(req.body.imageUrl) : null);
            await sql.parameterizedQuery(`
                WITH new_food AS (
                    INSERT INTO "Food" (name, "maxSize", "sizeUnits", "barcodeNumber")
                    VALUES ($1, $2, $3, $4)
                    RETURNING "foodID"
                ), new_image AS (
                    INSERT INTO "foodPicture" ("foodID", "foodPic")
                    SELECT "foodID", $8
                    FROM new_food
                    WHERE $8::bytea IS NOT NULL
                    RETURNING "foodID"
                )
                INSERT INTO "food2Cust" ("custID", "foodID", "currSize", "expiryDate")
                SELECT $5, "foodID", $6, $7
                FROM new_food;
            `, [name, maxSize, sizeUnits, barcodeNumber, customerId, currentAmount, expiryDate, foodImage]);
        } else {
            return res.status(400).json({ error: 'Choose a valid add-item method.' });
        }

        res.status(201).json({ success: true });
    } catch (err) {
        if (err.status === 400 || err.status === 502) {
            return res.status(err.status).json({ error: err.message });
        }
        console.error('Error adding customer food item:', err);
        res.status(500).json({ error: 'Unable to add this food item right now.' });
    }
});

router.get('/SearchRecipes', (req, res) => {
    res.sendFile(path.join(__dirname,"../clientSide","CustomerSearchRecipes.html"));
});

router.get('/getAllRecipes', async (req, res) => {
    try {
        const customerId = Number(req.cookies.customerID);
        if (!Number.isSafeInteger(customerId) || customerId <= 0) {
            return res.status(401).json({ error: 'A valid customer session is required.' });
        }
        await Promise.all([ensureRecipeIngredientDetailsTable(), ensureRecipeOwnershipTable()]);
        const [recipes, foods] = await Promise.all([
            sql.parameterizedQuery(`
                SELECT
                    r."recipeID",
                    r.name,
                    r."cookingTime",
                    r."servingSize",
                    r."publicStatus"::text AS "publicStatus",
                    (
                        r."custID" = $1
                        OR (r."custID" IS NULL AND owner."custID" = $1)
                    ) AS "isOwner",
                    to_jsonb(r) -> 'foodIDs' AS "foodIDs",
                    to_jsonb(r) -> 'foodAmount' AS "foodAmount",
                    COALESCE(
                        to_jsonb(r) -> 'instructions',
                        to_jsonb(r) -> 'instruction',
                        to_jsonb(r) -> 'steps',
                        to_jsonb(r) -> 'directions',
                        to_jsonb(r) -> 'method'
                    ) AS instructions,
                    COALESCE(ingredient_details.ingredients, '[]'::json) AS ingredients,
                    encode(rp."recipePic", 'base64') AS "recipePic"
                FROM "Recipe" AS r
                LEFT JOIN "recipeImage" AS rp
                    ON r."recipeID" = rp."recipeID"
                LEFT JOIN "RecipeOwnership" AS owner
                    ON owner."recipeID" = r."recipeID"
                LEFT JOIN LATERAL (
                    SELECT json_agg(
                        json_build_object(
                            'foodID', detail."foodID",
                            'amount', detail.amount,
                            'unit', detail.unit
                        )
                        ORDER BY detail.position
                    ) AS ingredients
                    FROM "RecipeIngredientDetail" AS detail
                    WHERE detail."recipeID" = r."recipeID"
                ) AS ingredient_details ON TRUE
                WHERE r."publicStatus"::text = 'public'
                    OR r."custID" = $1
                    OR (r."custID" IS NULL AND owner."custID" = $1)
                ORDER BY r.name ASC;
            `, [customerId]),
            sql.parameterizedQuery(`
                SELECT "foodID", name, "sizeUnits"
                FROM "Food"
                ORDER BY name ASC;
            `)
        ]);

        res.json({ recipes: recipes.rows, foods: foods.rows });
    } catch (err) {
        console.error('Error loading recipe catalog:', err);
        res.status(500).json({ error: 'Unable to load recipes right now.' });
    }
});

router.get('/CreateRecipe', (req, res) => {
    res.sendFile(path.join(__dirname,"../clientSide","CustomerCreateRecipe.html"));
});

router.get('/recipeFoods', async (req, res) => {
    try {
        const customerId = Number(req.cookies.customerID);
        if (!Number.isSafeInteger(customerId) || customerId <= 0) {
            return res.status(401).json({ error: 'A valid customer session is required.' });
        }
        const result = await sql.parameterizedQuery(`
            SELECT "foodID", name, "sizeUnits"
            FROM "Food"
            ORDER BY name ASC;
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error loading recipe ingredient choices:', err);
        res.status(500).json({ error: 'Unable to load ingredient choices right now.' });
    }
});

router.post('/createRecipe', async (req, res) => {
    try {
        const customerId = Number(req.cookies.customerID);
        if (!Number.isSafeInteger(customerId) || customerId <= 0) {
            return res.status(401).json({ error: 'A valid customer session is required.' });
        }

        const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
        const cookingTime = Number(req.body.cookingTime);
        const servingSize = Number(req.body.servingSize);
        const instructions = typeof req.body.instructions === 'string'
            ? req.body.instructions.trim()
            : '';
        const ingredients = req.body.ingredients;
        const recipeImage = getUploadedFoodImage(req.body);

        if (!name || name.length > 200 || !Number.isSafeInteger(cookingTime) || cookingTime < 1 ||
            !Number.isSafeInteger(servingSize) || servingSize < 1 ||
            !instructions || instructions.length > 20000 ||
            !Array.isArray(ingredients) || ingredients.length === 0 ||
            ingredients.some((ingredient) =>
                !ingredient ||
                !Number.isSafeInteger(Number(ingredient.foodID)) ||
                Number(ingredient.foodID) <= 0 ||
                !Number.isFinite(Number(ingredient.amount)) ||
                Number(ingredient.amount) <= 0)) {
            return res.status(400).json({ error: 'Enter a recipe name, cooking time, instructions, and at least one valid ingredient amount.' });
        }

        const normalizedFoodIDs = [...new Set(ingredients.map((ingredient) => Number(ingredient.foodID)))];
        const availableFoods = await sql.parameterizedQuery(
            'SELECT "foodID", "sizeUnits" FROM "Food" WHERE "foodID" = ANY($1::integer[])',
            [normalizedFoodIDs]
        );
        if (availableFoods.rows.length !== normalizedFoodIDs.length) {
            return res.status(400).json({ error: 'One or more selected ingredients are no longer available.' });
        }
        const foodUnitsById = new Map(availableFoods.rows.map((food) => [
            Number(food.foodID),
            typeof food.sizeUnits === 'string' ? food.sizeUnits.trim() : ''
        ]));
        if (normalizedFoodIDs.some((foodID) => !foodUnitsById.get(foodID))) {
            return res.status(400).json({ error: 'A measurement type is missing for one or more selected foods.' });
        }
        const recipeIngredients = ingredients.map((ingredient, index) => {
            const foodID = Number(ingredient.foodID);
            return {
                foodID,
                amount: Number(ingredient.amount),
                unit: foodUnitsById.get(foodID),
                position: index + 1
            };
        });
        await Promise.all([ensureRecipeIngredientDetailsTable(), ensureRecipeOwnershipTable()]);

        const columnsResult = await sql.parameterizedQuery(`
            SELECT
                attname AS name,
                format_type(atttypid, atttypmod) AS type
            FROM pg_attribute
            WHERE attrelid = '"Recipe"'::regclass
                AND attnum > 0
                AND NOT attisdropped;
        `);
        const availableColumns = new Map(columnsResult.rows.map((column) => [column.name, column.type]));
        const instructionColumn = ['instructions', 'instruction', 'steps', 'directions', 'method']
            .find((column) => availableColumns.has(column));
        const requiredColumns = [
            'name',
            'cookingTime',
            'servingSize',
            'foodIDs',
            'foodAmount',
            'publicStatus',
            'custID'
        ];
        if (requiredColumns.some((column) => !availableColumns.has(column)) || !instructionColumn) {
            console.error('Recipe table is missing one or more required recipe fields.');
            return res.status(500).json({ error: 'The recipe database is missing fields needed to save recipes.' });
        }

        const fields = [
            ['name', name],
            ['cookingTime', cookingTime],
            ['servingSize', servingSize],
            ['foodIDs', availableColumns.get('foodIDs').includes('[]')
                ? recipeIngredients.map((ingredient) => ingredient.foodID)
                : JSON.stringify(recipeIngredients.map((ingredient) => ingredient.foodID))],
            ['foodAmount', availableColumns.get('foodAmount').includes('[]')
                ? getRecipeAmountArray(recipeIngredients, availableColumns.get('foodAmount'))
                : JSON.stringify(recipeIngredients.map((ingredient) => ingredient.amount))],
            ['publicStatus', 'private'],
            ['custID', customerId],
            [instructionColumn, availableColumns.get(instructionColumn).includes('json') ? JSON.stringify(instructions) : instructions]
        ];
        const columns = fields.map(([column]) => `"${column}"`).join(', ');
        const values = fields.map((_, index) => `$${index + 1}`);
        const params = fields.map(([, value]) => value);
        const imagePlaceholder = `$${params.length + 1}`;
        params.push(recipeImage);
        const ingredientDetailsPlaceholder = `$${params.length + 1}`;
        params.push(JSON.stringify(recipeIngredients));

        const result = await sql.parameterizedQuery(`
            WITH new_recipe AS (
                INSERT INTO "Recipe" (${columns})
                VALUES (${values.join(', ')})
                RETURNING "recipeID"
            ), new_owner AS (
                INSERT INTO "RecipeOwnership" ("recipeID", "custID")
                SELECT "recipeID", $${params.length + 1}
                FROM new_recipe
                RETURNING "recipeID"
            ), new_image AS (
                INSERT INTO "recipeImage" ("recipeID", "recipePic")
                SELECT "recipeID", ${imagePlaceholder}
                FROM new_recipe
                WHERE ${imagePlaceholder}::bytea IS NOT NULL
                RETURNING "recipeID"
            ), new_ingredient_details AS (
                INSERT INTO "RecipeIngredientDetail" ("recipeID", "foodID", amount, unit, position)
                SELECT
                    new_recipe."recipeID",
                    ingredient."foodID",
                    ingredient.amount,
                    ingredient.unit,
                    ingredient.position
                FROM new_recipe
                CROSS JOIN LATERAL jsonb_to_recordset(${ingredientDetailsPlaceholder}::jsonb)
                    AS ingredient("foodID" integer, amount numeric, unit varchar, position integer)
                RETURNING "recipeID"
            )
            SELECT "recipeID" FROM new_recipe;
        `, [...params, customerId]);

        res.status(201).json({ success: true, recipeID: result.rows[0].recipeID });
    } catch (err) {
        if (err.status === 400) {
            return res.status(400).json({ error: err.message });
        }
        console.error('Error creating recipe:', err);
        res.status(500).json({ error: 'Unable to save this recipe right now.' });
    }
});

router.post('/updateRecipe', async (req, res) => {
    try {
        const customerId = Number(req.cookies.customerID);
        const recipeId = Number(req.body.recipeID);
        const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
        const cookingTime = Number(req.body.cookingTime);
        const servingSize = Number(req.body.servingSize);
        const instructions = typeof req.body.instructions === 'string'
            ? req.body.instructions.trim()
            : '';
        const ingredients = req.body.ingredients;

        if (!Number.isSafeInteger(customerId) || customerId <= 0) {
            return res.status(401).json({ error: 'A valid customer session is required.' });
        }
        if (!Number.isSafeInteger(recipeId) || recipeId <= 0 ||
            !name || name.length > 200 ||
            !Number.isSafeInteger(cookingTime) || cookingTime < 1 ||
            !Number.isSafeInteger(servingSize) || servingSize < 1 ||
            !instructions || instructions.length > 20000 ||
            !Array.isArray(ingredients) || ingredients.length === 0 ||
            ingredients.some((ingredient) =>
                !ingredient ||
                !Number.isSafeInteger(Number(ingredient.foodID)) ||
                Number(ingredient.foodID) <= 0 ||
                !Number.isFinite(Number(ingredient.amount)) ||
                Number(ingredient.amount) <= 0)) {
            return res.status(400).json({ error: 'Enter valid recipe details and at least one valid ingredient amount.' });
        }

        await Promise.all([ensureRecipeIngredientDetailsTable(), ensureRecipeOwnershipTable()]);
        const normalizedFoodIDs = [...new Set(ingredients.map((ingredient) => Number(ingredient.foodID)))];
        const availableFoods = await sql.parameterizedQuery(
            'SELECT "foodID", "sizeUnits" FROM "Food" WHERE "foodID" = ANY($1::integer[])',
            [normalizedFoodIDs]
        );
        if (availableFoods.rows.length !== normalizedFoodIDs.length) {
            return res.status(400).json({ error: 'One or more selected ingredients are no longer available.' });
        }
        const unitsByFoodId = new Map(availableFoods.rows.map((food) => [
            Number(food.foodID),
            typeof food.sizeUnits === 'string' ? food.sizeUnits.trim() : ''
        ]));
        if (normalizedFoodIDs.some((foodID) => !unitsByFoodId.get(foodID))) {
            return res.status(400).json({ error: 'A measurement type is missing for one or more selected foods.' });
        }
        const recipeIngredients = ingredients.map((ingredient, index) => ({
            foodID: Number(ingredient.foodID),
            amount: Number(ingredient.amount),
            unit: unitsByFoodId.get(Number(ingredient.foodID)),
            position: index + 1
        }));

        const columnsResult = await sql.parameterizedQuery(`
            SELECT attname AS name, format_type(atttypid, atttypmod) AS type
            FROM pg_attribute
            WHERE attrelid = '"Recipe"'::regclass
                AND attnum > 0
                AND NOT attisdropped;
        `);
        const availableColumns = new Map(columnsResult.rows.map((column) => [column.name, column.type]));
        const instructionColumn = ['instructions', 'instruction', 'steps', 'directions', 'method']
            .find((column) => availableColumns.has(column));
        if (!instructionColumn ||
            ['name', 'cookingTime', 'servingSize', 'foodIDs', 'foodAmount', 'publicStatus', 'custID']
                .some((column) => !availableColumns.has(column))) {
            console.error('Recipe table is missing one or more required fields for editing.');
            return res.status(500).json({ error: 'The recipe database is missing fields needed to edit recipes.' });
        }

        const fields = [
            ['name', name],
            ['cookingTime', cookingTime],
            ['servingSize', servingSize],
            ['foodIDs', availableColumns.get('foodIDs').includes('[]')
                ? recipeIngredients.map((ingredient) => ingredient.foodID)
                : JSON.stringify(recipeIngredients.map((ingredient) => ingredient.foodID))],
            ['foodAmount', availableColumns.get('foodAmount').includes('[]')
                ? getRecipeAmountArray(recipeIngredients, availableColumns.get('foodAmount'))
                : JSON.stringify(recipeIngredients.map((ingredient) => ingredient.amount))],
            ['publicStatus', 'private'],
            [instructionColumn, availableColumns.get(instructionColumn).includes('json') ? JSON.stringify(instructions) : instructions]
        ];
        const setClause = fields.map(([column], index) => `"${column}" = $${index + 1}`).join(', ');
        const params = fields.map(([, value]) => value);
        params.push(recipeId, customerId, JSON.stringify(recipeIngredients));
        const recipeIdParameter = fields.length + 1;
        const customerIdParameter = fields.length + 2;
        const ingredientParameter = fields.length + 3;

        const updatedRecipe = await sql.withTransaction(async (client) => {
            const updated = await client.query(`
                UPDATE "Recipe" AS r
                SET ${setClause}
                WHERE r."recipeID" = $${recipeIdParameter}
                    AND (
                        r."custID" = $${customerIdParameter}
                        OR (
                            r."custID" IS NULL
                            AND EXISTS (
                                SELECT 1
                                FROM "RecipeOwnership" AS owner
                                WHERE owner."recipeID" = r."recipeID"
                                    AND owner."custID" = $${customerIdParameter}
                            )
                        )
                    )
                RETURNING r."recipeID";
            `, params.slice(0, recipeIdParameter + 1));
            if (updated.rowCount !== 1) {
                return null;
            }

            await client.query(
                'DELETE FROM "RecipeIngredientDetail" WHERE "recipeID" = $1',
                [recipeId]
            );
            await client.query(`
                INSERT INTO "RecipeIngredientDetail" ("recipeID", "foodID", amount, unit, position)
                SELECT $1, ingredient."foodID", ingredient.amount, ingredient.unit, ingredient.position
                FROM jsonb_to_recordset($2::jsonb)
                    AS ingredient("foodID" integer, amount numeric, unit varchar, position integer);
            `, [recipeId, params[ingredientParameter - 1]]);
            return updated.rows[0];
        });
        if (!updatedRecipe) {
            return res.status(404).json({ error: 'Recipe not found or you do not have permission to edit it.' });
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Error updating customer recipe:', err);
        res.status(500).json({ error: 'Unable to update this recipe right now.' });
    }
});

router.post('/publishRecipe', async (req, res) => {
    try {
        const customerId = Number(req.cookies.customerID);
        const recipeId = Number(req.body.recipeID);
        if (!Number.isSafeInteger(customerId) || customerId <= 0) {
            return res.status(401).json({ error: 'A valid customer session is required.' });
        }
        if (!Number.isSafeInteger(recipeId) || recipeId <= 0) {
            return res.status(400).json({ error: 'The recipe identifier is invalid.' });
        }

        await ensureRecipeOwnershipTable();
        const result = await sql.parameterizedQuery(`
            UPDATE "Recipe" AS r
            SET "publicStatus" = 'needs review'
            WHERE r."recipeID" = $1
                AND (
                    r."custID" = $2
                    OR (
                        r."custID" IS NULL
                        AND EXISTS (
                            SELECT 1
                            FROM "RecipeOwnership" AS owner
                            WHERE owner."recipeID" = r."recipeID"
                                AND owner."custID" = $2
                        )
                    )
                )
            RETURNING r."recipeID";
        `, [recipeId, customerId]);
        if (result.rowCount !== 1) {
            return res.status(404).json({ error: 'Recipe not found or you do not have permission to publish it.' });
        }
        res.json({ success: true, publicStatus: 'needs review' });
    } catch (err) {
        console.error('Error submitting recipe for review:', err);
        res.status(500).json({ error: 'Unable to submit this recipe for review right now.' });
    }
});

router.get('/getAllExpiringProducts', async (req, res) => {
    try{
        const custId = Number(req.cookies.customerID);
        if (!Number.isSafeInteger(custId) || custId <= 0) {
            return res.status(401).json({ error: 'A valid customer session is required.' });
        }

        const [items, metadata] = await Promise.all([
            sql.parameterizedQuery(`
                SELECT
                    f."foodID",
                    f.name,
                    encode(fp."foodPic", 'base64') AS "foodPic",
                    f."maxSize",
                    fc."currSize",
                    f."sizeUnits",
                    fc."expiryDate",
                    item_key."primaryKey" AS "recordKey"
                FROM "food2Cust" AS fc
                JOIN "Food" AS f
                    ON fc."foodID" = f."foodID"
                LEFT JOIN "foodPicture" AS fp
                    ON f."foodID" = fp."foodID"
                LEFT JOIN LATERAL (
                    SELECT jsonb_object_agg(pk_column.attname, to_jsonb(fc) -> pk_column.attname) AS "primaryKey"
                    FROM pg_index AS pk_index
                    JOIN LATERAL unnest(pk_index.indkey) WITH ORDINALITY AS key_column(attnum, ordinal)
                        ON key_column.ordinal <= pk_index.indnkeyatts
                    JOIN pg_attribute AS pk_column
                        ON pk_column.attrelid = pk_index.indrelid
                        AND pk_column.attnum = key_column.attnum
                    WHERE pk_index.indrelid = '"food2Cust"'::regclass
                        AND pk_index.indisprimary
                ) AS item_key ON TRUE
                WHERE fc."custID" = $1
                    AND fc."expiryDate" >= CURRENT_DATE
                ORDER BY fc."expiryDate" ASC;
            `, [custId]),
            sql.parameterizedQuery(`
                SELECT
                    EXISTS (
                        SELECT 1
                        FROM pg_index
                        WHERE indrelid = '"food2Cust"'::regclass AND indisprimary
                    ) AS "hasPrimaryKey";
            `)
        ]);

        if (!metadata.rows[0].hasPrimaryKey) {
            console.error('Cannot edit food records because food2Cust has no primary key.');
            return res.status(500).json({ error: 'Food records cannot be edited because their primary key is unavailable.' });
        }

        res.json({
            items: items.rows
        });
    }catch(err){
        console.error('Error loading all expiring products:', err);
        res.status(500).send('Internal Server Error');
    }
});

router.post('/updateFoodItem', async (req, res) => {
    try {
        const custId = Number(req.cookies.customerID);
        if (!Number.isSafeInteger(custId) || custId <= 0) {
            return res.status(401).json({ error: 'A valid customer session is required.' });
        }

        let recordKey;
        try {
            recordKey = JSON.parse(req.body.recordKey);
        } catch {
            return res.status(400).json({ error: 'The food record identifier is invalid.' });
        }
        if (!recordKey || typeof recordKey !== 'object' || Array.isArray(recordKey)) {
            return res.status(400).json({ error: 'The food record identifier is invalid.' });
        }

        const keyColumns = await sql.parameterizedQuery(`
            SELECT pk_column.attname AS name
            FROM pg_index AS pk_index
            JOIN LATERAL unnest(pk_index.indkey) WITH ORDINALITY AS key_column(attnum, ordinal)
                ON key_column.ordinal <= pk_index.indnkeyatts
            JOIN pg_attribute AS pk_column
                ON pk_column.attrelid = pk_index.indrelid
                AND pk_column.attnum = key_column.attnum
            WHERE pk_index.indrelid = '"food2Cust"'::regclass
                AND pk_index.indisprimary
            ORDER BY key_column.ordinal;
        `);
        const expectedKeys = keyColumns.rows.map((column) => column.name).sort();
        const providedKeys = Object.keys(recordKey).sort();
        if (expectedKeys.length === 0 || expectedKeys.length !== providedKeys.length ||
            expectedKeys.some((key, index) => key !== providedKeys[index])) {
            return res.status(400).json({ error: 'The food record identifier is invalid.' });
        }

        const currSize = Number(req.body.currSize);
        const expiryDate = req.body.expiryDate;
        const parsedExpiryDate = new Date(`${expiryDate}T00:00:00.000Z`);

        if (!Number.isFinite(currSize) || currSize < 0 ||
            typeof expiryDate !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate) ||
            Number.isNaN(parsedExpiryDate.getTime()) ||
            parsedExpiryDate.toISOString().slice(0, 10) !== expiryDate) {
            return res.status(400).json({ error: 'Enter a valid amount and expiry date.' });
        }

        const foodResult = await sql.parameterizedQuery(`
            SELECT f."maxSize"
            FROM "food2Cust" AS fc
            JOIN "Food" AS f ON f."foodID" = fc."foodID"
            WHERE fc."custID" = $1
                AND to_jsonb(fc) @> $2::jsonb;
        `, [custId, JSON.stringify(recordKey)]);
        if (foodResult.rows.length !== 1) {
            return res.status(404).json({ error: 'Food item not found. Refresh the page and try again.' });
        }
        const maxSize = Number(foodResult.rows[0].maxSize);
        if (currSize > maxSize) {
            return res.status(400).json({ error: `Amount cannot exceed ${maxSize}.` });
        }

        const updated = await sql.parameterizedQuery(`
            UPDATE "food2Cust" AS fc
            SET
                "currSize" = $2,
                "expiryDate" = $3
            WHERE fc."custID" = $1
                AND to_jsonb(fc) @> $4::jsonb
            RETURNING fc."currSize";
        `, [custId, currSize, expiryDate, JSON.stringify(recordKey)]);

        if (updated.rowCount !== 1) {
            return res.status(404).json({ error: 'Food item not found. Refresh the page and try again.' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating customer food item:', err);
        res.status(500).json({ error: 'Unable to update the food item right now.' });
    }
});




module.exports = router;