express = require('express');
const path = require('path');
const router = express.Router();
const sql = require('../generalFunctions/postGresSQLFunctions');

const accountValidation=require('../generalFunctions/AccountAccessCheck')

const RECIPE_STATUSES = new Set(['private', 'needs review', 'public', 'banned']);

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

function getRecipeAmountArray(ingredients, columnType) {
    const amounts = ingredients.map((ingredient) => ingredient.amount);
    return /(?:smallint|integer|bigint)\[\]/.test(columnType)
        ? amounts.map(Math.round)
        : amounts;
}

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
        console.error("Error logging in :\n",err);
    }
});

router.get('/Home', (req,res) =>  {
    res.sendFile(path.join(__dirname,"../clientSide","modHome.html"))
});

router.get('/LogOut', (req, res) => {
    res.clearCookie('moderatorID');
    res.redirect('/');
});

router.get('/api/recipes', async (req, res) => {
    try {
        await ensureRecipeIngredientDetailsTable();
        const result = await sql.parameterizedQuery(`
            SELECT
                r."recipeID",
                r.name,
                r."cookingTime",
                r."servingSize",
                r."publicStatus"::text AS "publicStatus",
                r."custID",
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
                encode(image."recipePic", 'base64') AS "recipePic"
            FROM "Recipe" AS r
            LEFT JOIN "recipeImage" AS image ON image."recipeID" = r."recipeID"
            LEFT JOIN LATERAL (
                SELECT json_agg(
                    json_build_object(
                        'foodID', detail."foodID",
                        'amount', detail.amount,
                        'unit', detail.unit
                    ) ORDER BY detail.position
                ) AS ingredients
                FROM "RecipeIngredientDetail" AS detail
                WHERE detail."recipeID" = r."recipeID"
            ) AS ingredient_details ON TRUE
            ORDER BY r.name ASC, r."recipeID" ASC;
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error loading moderator recipes:', error);
        res.status(500).json({ error: 'Unable to load recipes right now.' });
    }
});

router.get('/api/foods', async (req, res) => {
    try {
        const result = await sql.parameterizedQuery(`
            SELECT "foodID", name, "maxSize", "sizeUnits", "barcodeNumber"
            FROM "Food"
            ORDER BY "foodID" ASC;
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error loading moderator food catalog:', error);
        res.status(500).json({ error: 'Unable to load food items right now.' });
    }
});

router.put('/api/recipes/:recipeId', async (req, res) => {
    try {
        const recipeId = Number(req.params.recipeId);
        const { name, cookingTime, servingSize, instructions, ingredients, publicStatus } = req.body;
        const normalizedName = typeof name === 'string' ? name.trim() : '';
        const normalizedInstructions = typeof instructions === 'string' ? instructions.trim() : '';
        const normalizedCookingTime = Number(cookingTime);
        const normalizedServingSize = Number(servingSize);

        if (!Number.isSafeInteger(recipeId) || recipeId <= 0 ||
            !normalizedName || normalizedName.length > 200 ||
            !Number.isSafeInteger(normalizedCookingTime) || normalizedCookingTime < 1 ||
            !Number.isSafeInteger(normalizedServingSize) || normalizedServingSize < 1 ||
            !normalizedInstructions || normalizedInstructions.length > 20000 ||
            !RECIPE_STATUSES.has(publicStatus) ||
            !Array.isArray(ingredients) || ingredients.length === 0 ||
            ingredients.some((ingredient) =>
                !ingredient ||
                !Number.isSafeInteger(Number(ingredient.foodID)) ||
                Number(ingredient.foodID) <= 0 ||
                !Number.isFinite(Number(ingredient.amount)) ||
                Number(ingredient.amount) <= 0)) {
            return res.status(400).json({ error: 'Enter valid recipe details, ingredients, and status.' });
        }

        await ensureRecipeIngredientDetailsTable();
        const normalizedFoodIDs = [...new Set(ingredients.map((ingredient) => Number(ingredient.foodID)))];
        const foods = await sql.parameterizedQuery(
            'SELECT "foodID", "sizeUnits" FROM "Food" WHERE "foodID" = ANY($1::integer[])',
            [normalizedFoodIDs]
        );
        if (foods.rows.length !== normalizedFoodIDs.length) {
            return res.status(400).json({ error: 'One or more selected foods no longer exist.' });
        }
        const unitsByFoodId = new Map(foods.rows.map((food) => [
            Number(food.foodID),
            typeof food.sizeUnits === 'string' ? food.sizeUnits.trim() : ''
        ]));
        if (normalizedFoodIDs.some((foodID) => !unitsByFoodId.get(foodID))) {
            return res.status(400).json({ error: 'A measurement type is missing for one or more foods.' });
        }
        const normalizedIngredients = ingredients.map((ingredient, index) => ({
            foodID: Number(ingredient.foodID),
            amount: Number(ingredient.amount),
            unit: unitsByFoodId.get(Number(ingredient.foodID)),
            position: index + 1
        }));
        const columnResult = await sql.parameterizedQuery(`
            SELECT attname AS name, format_type(atttypid, atttypmod) AS type
            FROM pg_attribute
            WHERE attrelid = '"Recipe"'::regclass AND attnum > 0 AND NOT attisdropped;
        `);
        const columnTypes = new Map(columnResult.rows.map((column) => [column.name, column.type]));
        const instructionColumn = ['instructions', 'instruction', 'steps', 'directions', 'method']
            .find((column) => columnTypes.has(column));
        const required = ['name', 'cookingTime', 'servingSize', 'foodIDs', 'foodAmount', 'publicStatus'];
        if (!instructionColumn || required.some((column) => !columnTypes.has(column))) {
            console.error('Recipe table is missing fields required for moderator edits.');
            return res.status(500).json({ error: 'The recipe database is missing fields needed to edit recipes.' });
        }

        const fields = [
            ['name', normalizedName],
            ['cookingTime', normalizedCookingTime],
            ['servingSize', normalizedServingSize],
            ['foodIDs', columnTypes.get('foodIDs').includes('[]')
                ? normalizedIngredients.map((ingredient) => ingredient.foodID)
                : JSON.stringify(normalizedIngredients.map((ingredient) => ingredient.foodID))],
            ['foodAmount', columnTypes.get('foodAmount').includes('[]')
                ? getRecipeAmountArray(normalizedIngredients, columnTypes.get('foodAmount'))
                : JSON.stringify(normalizedIngredients.map((ingredient) => ingredient.amount))],
            ['publicStatus', publicStatus],
            [instructionColumn, columnTypes.get(instructionColumn).includes('json')
                ? JSON.stringify(normalizedInstructions)
                : normalizedInstructions]
        ];
        const setClause = fields.map(([column], index) => `"${column}" = $${index + 1}`).join(', ');
        const recipeParams = fields.map(([, value]) => value);
        recipeParams.push(recipeId);
        const saved = await sql.withTransaction(async (client) => {
            const update = await client.query(`
                UPDATE "Recipe" SET ${setClause}
                WHERE "recipeID" = $${recipeParams.length}
                RETURNING "recipeID";
            `, recipeParams);
            if (update.rowCount !== 1) return false;

            await client.query(
                'DELETE FROM "RecipeIngredientDetail" WHERE "recipeID" = $1',
                [recipeId]
            );
            await client.query(`
                INSERT INTO "RecipeIngredientDetail" ("recipeID", "foodID", amount, unit, position)
                SELECT $1, ingredient."foodID", ingredient.amount, ingredient.unit, ingredient.position
                FROM jsonb_to_recordset($2::jsonb)
                    AS ingredient("foodID" integer, amount numeric, unit varchar, position integer);
            `, [recipeId, JSON.stringify(normalizedIngredients)]);
            return true;
        });
        if (!saved) return res.status(404).json({ error: 'Recipe not found.' });
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving moderator recipe:', error);
        res.status(500).json({ error: 'Unable to save this recipe right now.' });
    }
});

router.put('/api/foods/:foodId', async (req, res) => {
    try {
        const foodId = Number(req.params.foodId);
        const { name, maxSize, sizeUnits, barcodeNumber } = req.body;
        const normalizedName = typeof name === 'string' ? name.trim() : '';
        const normalizedUnits = typeof sizeUnits === 'string' ? sizeUnits.trim() : '';
        const normalizedMaxSize = Number(maxSize);
        const normalizedBarcode = Number(barcodeNumber);
        if (!Number.isSafeInteger(foodId) || foodId <= 0 ||
            !normalizedName || normalizedName.length > 200 ||
            !Number.isFinite(normalizedMaxSize) || normalizedMaxSize <= 0 ||
            !normalizedUnits || normalizedUnits.length > 40 ||
            !Number.isSafeInteger(normalizedBarcode) || normalizedBarcode < -1) {
            return res.status(400).json({ error: 'Enter a valid name, maximum size, measurement, and barcode number.' });
        }
        const result = await sql.parameterizedQuery(`
            UPDATE "Food"
            SET name = $1, "maxSize" = $2, "sizeUnits" = $3, "barcodeNumber" = $4
            WHERE "foodID" = $5
            RETURNING "foodID";
        `, [normalizedName, normalizedMaxSize, normalizedUnits, normalizedBarcode, foodId]);
        if (result.rowCount !== 1) return res.status(404).json({ error: 'Food item not found.' });
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating moderator food item:', error);
        res.status(500).json({ error: 'Unable to update this food item right now.' });
    }
});

router.delete('/api/foods/:foodId', async (req, res) => {
    try {
        const foodId = Number(req.params.foodId);
        if (!Number.isSafeInteger(foodId) || foodId <= 0) {
            return res.status(400).json({ error: 'The food item identifier is invalid.' });
        }
        await ensureRecipeIngredientDetailsTable();
        const deleted = await sql.withTransaction(async (client) => {
            const found = await client.query(
                'SELECT "foodID" FROM "Food" WHERE "foodID" = $1 FOR UPDATE',
                [foodId]
            );
            if (found.rowCount !== 1) return false;

            await client.query('DELETE FROM "food2Cust" WHERE "foodID" = $1', [foodId]);
            await client.query('DELETE FROM "foodPicture" WHERE "foodID" = $1', [foodId]);
            await client.query('DELETE FROM "RecipeIngredientDetail" WHERE "foodID" = $1', [foodId]);
            await client.query(`
                UPDATE "Recipe" AS recipe
                SET "foodIDs" = ARRAY(
                        SELECT item.food_id
                        FROM unnest(recipe."foodIDs") WITH ORDINALITY AS item(food_id, position)
                        WHERE item.food_id <> $1
                        ORDER BY item.position
                    ),
                    "foodAmount" = ARRAY(
                        SELECT amount.value
                        FROM unnest(recipe."foodAmount") WITH ORDINALITY AS amount(value, position)
                        WHERE amount.position <= cardinality(recipe."foodIDs")
                            AND recipe."foodIDs"[amount.position] <> $1
                        ORDER BY amount.position
                    )
                WHERE $1 = ANY(recipe."foodIDs");
            `, [foodId]);
            await client.query('DELETE FROM "Food" WHERE "foodID" = $1', [foodId]);
            return true;
        });
        if (!deleted) return res.status(404).json({ error: 'Food item not found.' });
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting moderator food item:', error);
        if (error.code === '23503') {
            return res.status(409).json({ error: 'This food item is still referenced by other records and cannot be deleted.' });
        }
        res.status(500).json({ error: 'Unable to delete this food item right now.' });
    }
});

module.exports = router;