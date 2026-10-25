const reviewRecipeList = document.getElementById('reviewRecipeList');
const recipeList = document.getElementById('recipeList');
const foodRows = document.getElementById('foodRows');
const recipeDialog = document.getElementById('editRecipeDialog');
const foodDialog = document.getElementById('editFoodDialog');
const recipeForm = document.getElementById('editRecipeForm');
const foodForm = document.getElementById('editFoodForm');
const ingredientRows = document.getElementById('editRecipeIngredients');

const recipeStatuses = ['private', 'needs review', 'public', 'banned'];
let recipes = [];
let foods = [];
let activeRecipe = null;
let activeFood = null;
let ingredientRowId = 0;

function setMessage(id, message, isError = false) {
    const element = document.getElementById(id);
    element.textContent = message;
    element.classList.toggle('error', isError);
}

async function getJson(url, options) {
    const response = await fetch(url, options);
    let result;
    try {
        result = await response.json();
    } catch {
        throw new Error('The server returned an unreadable response.');
    }
    if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
    return result;
}

function normalizeArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return [];
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
    } catch {
        return value.replace(/^\{|\}$/g, '').split(',').filter(Boolean);
    }
    return [];
}

function normalizeInstructions(value) {
    if (Array.isArray(value)) {
        return value.map((step) => {
            if (step && typeof step === 'object') return step.instruction ?? step.step ?? step.text ?? '';
            return String(step);
        }).filter(Boolean).join('\n');
    }
    if (value && typeof value === 'object') {
        return normalizeInstructions(value.instructions ?? value.steps ?? value.method ?? '');
    }
    const text = String(value ?? '');
    try {
        const parsed = JSON.parse(text);
        if (parsed !== value) return normalizeInstructions(parsed);
    } catch {
        return text.replace(/\\n/g, '\n');
    }
    return text;
}

function recipeIngredients(recipe) {
    if (Array.isArray(recipe.ingredients) && recipe.ingredients.length) {
        return recipe.ingredients.map((ingredient) => ({
            foodID: String(ingredient.foodID),
            amount: ingredient.amount
        }));
    }
    const ids = normalizeArray(recipe.foodIDs);
    const amounts = normalizeArray(recipe.foodAmount);
    return ids.map((foodID, index) => ({
        foodID: String(foodID && typeof foodID === 'object' ? foodID.foodID ?? foodID.id : foodID),
        amount: amounts[index] ?? ''
    }));
}

function recipeImageSource(base64) {
    if (!base64) return '/logo.png';
    const signature = atob(base64.slice(0, 32));
    if (signature.startsWith('GIF87a') || signature.startsWith('GIF89a')) {
        return `data:image/gif;base64,${base64}`;
    }
    if (signature.startsWith('\x89PNG\r\n\x1a\n')) {
        return `data:image/png;base64,${base64}`;
    }
    if (signature.startsWith('RIFF') && signature.slice(8, 12) === 'WEBP') {
        return `data:image/webp;base64,${base64}`;
    }
    return `data:image/jpeg;base64,${base64}`;
}

function makeIngredientRow(ingredient = {}) {
    const row = document.createElement('div');
    row.className = 'ingredient-row';

    const foodField = document.createElement('div');
    const foodLabel = document.createElement('label');
    const foodSelect = document.createElement('select');
    const selectId = `moderatorIngredient${ingredientRowId++}`;
    foodLabel.htmlFor = selectId;
    foodLabel.textContent = 'Food';
    foodSelect.id = selectId;
    foodSelect.required = true;
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose food';
    foodSelect.appendChild(placeholder);
    foods.forEach((food) => {
        const option = document.createElement('option');
        option.value = String(food.foodID);
        option.textContent = `${food.name} (${food.sizeUnits})`;
        foodSelect.appendChild(option);
    });
    foodSelect.value = String(ingredient.foodID ?? '');
    foodField.append(foodLabel, foodSelect);

    const amountField = document.createElement('div');
    const amountLabel = document.createElement('label');
    const amountInput = document.createElement('input');
    const amountId = `${selectId}Amount`;
    amountLabel.htmlFor = amountId;
    amountLabel.textContent = 'Amount';
    amountInput.id = amountId;
    amountInput.type = 'number';
    amountInput.min = '0.01';
    amountInput.step = 'any';
    amountInput.required = true;
    amountInput.value = ingredient.amount ?? '';
    amountField.append(amountLabel, amountInput);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = '−';
    removeButton.setAttribute('aria-label', 'Remove ingredient');
    removeButton.addEventListener('click', () => row.remove());
    row.append(foodField, amountField, removeButton);
    ingredientRows.appendChild(row);
}

function createRecipeCard(recipe) {
    const card = document.createElement('article');
    card.className = 'recipe-card';
    const image = document.createElement('img');
    image.className = 'recipe-card-image';
    image.src = recipeImageSource(recipe.recipePic);
    image.alt = recipe.name ? `${recipe.name} recipe` : 'Recipe image';
    const title = document.createElement('h2');
    title.textContent = recipe.name || `Recipe ${recipe.recipeID}`;
    const badge = document.createElement('span');
    badge.className = 'status-badge';
    badge.textContent = recipe.publicStatus || 'private';
    const author = document.createElement('p');
    author.textContent = recipe.custID
        ? `Created by customer #${recipe.custID}`
        : 'Creator not recorded';
    const summary = document.createElement('p');
    summary.textContent = `${recipe.cookingTime} min · Serves ${recipe.servingSize}`;
    const ingredientSummary = document.createElement('p');
    const items = recipeIngredients(recipe);
    ingredientSummary.textContent = items.length
        ? items.map((item) => {
            const food = foods.find((entry) => String(entry.foodID) === item.foodID);
            return `${item.amount} ${food?.sizeUnits || ''} ${food?.name || `Food ${item.foodID}`}`.trim();
        }).join(', ')
        : 'No ingredients listed';
    const instructions = document.createElement('p');
    const instructionText = normalizeInstructions(recipe.instructions);
    instructions.textContent = instructionText
        ? `${instructionText.slice(0, 220)}${instructionText.length > 220 ? '…' : ''}`
        : 'No instructions listed';
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.textContent = 'Edit recipe';
    editButton.addEventListener('click', () => openRecipeEditor(recipe));
    card.append(image, title, badge, author, summary, ingredientSummary, instructions, editButton);
    return card;
}

function renderRecipes() {
    recipeList.replaceChildren();
    reviewRecipeList.replaceChildren();
    const reviewQueue = recipes.filter((recipe) => recipe.publicStatus === 'needs review');
    recipes.forEach((recipe) => recipeList.appendChild(createRecipeCard(recipe)));
    reviewQueue.forEach((recipe) => reviewRecipeList.appendChild(createRecipeCard(recipe)));
    setMessage('recipeStatus', recipes.length ? '' : 'There are no recipes yet.');
    setMessage('reviewStatus', reviewQueue.length
        ? ''
        : 'There are no recipes waiting for review.');
}

function renderFoods() {
    foodRows.replaceChildren();
    foods.forEach((food) => {
        const row = document.createElement('tr');
        [food.foodID, food.name, food.maxSize, food.sizeUnits, food.barcodeNumber].forEach((value) => {
            const cell = document.createElement('td');
            cell.textContent = String(value ?? '');
            row.appendChild(cell);
        });
        const actionCell = document.createElement('td');
        actionCell.className = 'food-actions';
        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.textContent = 'Edit';
        editButton.addEventListener('click', () => openFoodEditor(food));
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'delete-food';
        deleteButton.textContent = 'Delete';
        deleteButton.addEventListener('click', () => deleteFood(food, deleteButton));
        actionCell.append(editButton, deleteButton);
        row.appendChild(actionCell);
        foodRows.appendChild(row);
    });
    setMessage('foodStatus', foods.length ? '' : 'The Food table is empty.');
}

function openRecipeEditor(recipe) {
    activeRecipe = recipe;
    document.getElementById('editRecipeTitle').textContent = `Edit ${recipe.name || 'recipe'}`;
    document.getElementById('editRecipeName').value = recipe.name || '';
    document.getElementById('editRecipeCookingTime').value = recipe.cookingTime || '';
    document.getElementById('editRecipeServingSize').value = recipe.servingSize || 1;
    document.getElementById('editRecipeStatus').value = recipeStatuses.includes(recipe.publicStatus)
        ? recipe.publicStatus
        : 'private';
    document.getElementById('editRecipeInstructions').value = normalizeInstructions(recipe.instructions);
    ingredientRows.replaceChildren();
    const ingredients = recipeIngredients(recipe);
    ingredients.forEach(makeIngredientRow);
    if (!ingredients.length) makeIngredientRow();
    setMessage('editRecipeStatusMessage', '');
    recipeDialog.showModal();
}

function openFoodEditor(food) {
    activeFood = food;
    document.getElementById('editFoodTitle').textContent = `Edit ${food.name}`;
    document.getElementById('editFoodName').value = food.name || '';
    document.getElementById('editFoodMaxSize').value = food.maxSize ?? '';
    document.getElementById('editFoodUnits').value = food.sizeUnits || '';
    document.getElementById('editFoodBarcode').value = food.barcodeNumber ?? -1;
    setMessage('editFoodStatus', '');
    foodDialog.showModal();
}

async function loadRecipes() {
    setMessage('recipeStatus', 'Loading recipes...');
    setMessage('reviewStatus', 'Loading recipes for review...');
    recipes = await getJson('/Moderator/api/recipes');
    renderRecipes();
}

async function loadFoods() {
    setMessage('foodStatus', 'Loading food items...');
    foods = await getJson('/Moderator/api/foods');
    renderFoods();
}

async function deleteFood(food, button) {
    if (!window.confirm(`Delete "${food.name}" from the Food table? It will also be removed from customer inventories and recipe ingredients.`)) {
        return;
    }
    button.disabled = true;
    try {
        await getJson(`/Moderator/api/foods/${encodeURIComponent(food.foodID)}`, { method: 'DELETE' });
        await Promise.all([loadFoods(), loadRecipes()]);
    } catch (error) {
        setMessage('foodStatus', error.message, true);
        button.disabled = false;
    }
}

document.querySelectorAll('[data-dashboard-section]').forEach((link) => {
    link.addEventListener('click', (event) => {
        event.preventDefault();
        const section = link.dataset.dashboardSection;
        document.querySelectorAll('.dashboard-section').forEach((element) => {
            element.hidden = element.id !== `${section}Section`;
        });
        document.querySelectorAll('[data-nav-close]').forEach((backdrop) => {
            backdrop.dispatchEvent(new Event('click'));
        });
    });
});

document.getElementById('addRecipeIngredient').addEventListener('click', () => makeIngredientRow());
document.querySelectorAll('[data-close-dialog]').forEach((button) => {
    button.addEventListener('click', () => document.getElementById(button.dataset.closeDialog).close());
});

recipeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!activeRecipe) return;
    const button = recipeForm.querySelector('button[type="submit"]');
    button.disabled = true;
    setMessage('editRecipeStatusMessage', 'Saving recipe...');
    try {
        const ingredients = [...ingredientRows.querySelectorAll('.ingredient-row')].map((row) => ({
            foodID: row.querySelector('select').value,
            amount: row.querySelector('input').value
        }));
        await getJson(`/Moderator/api/recipes/${encodeURIComponent(activeRecipe.recipeID)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: document.getElementById('editRecipeName').value,
                cookingTime: document.getElementById('editRecipeCookingTime').value,
                servingSize: document.getElementById('editRecipeServingSize').value,
                publicStatus: document.getElementById('editRecipeStatus').value,
                instructions: document.getElementById('editRecipeInstructions').value,
                ingredients
            })
        });
        recipeDialog.close();
        await loadRecipes();
    } catch (error) {
        setMessage('editRecipeStatusMessage', error.message, true);
    } finally {
        button.disabled = false;
    }
});

foodForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!activeFood) return;
    const button = foodForm.querySelector('button[type="submit"]');
    button.disabled = true;
    setMessage('editFoodStatus', 'Saving item...');
    try {
        await getJson(`/Moderator/api/foods/${encodeURIComponent(activeFood.foodID)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: document.getElementById('editFoodName').value,
                maxSize: document.getElementById('editFoodMaxSize').value,
                sizeUnits: document.getElementById('editFoodUnits').value,
                barcodeNumber: document.getElementById('editFoodBarcode').value
            })
        });
        foodDialog.close();
        await loadFoods();
    } catch (error) {
        setMessage('editFoodStatus', error.message, true);
    } finally {
        button.disabled = false;
    }
});

loadRecipes().catch((error) => {
    setMessage('recipeStatus', error.message, true);
    setMessage('reviewStatus', error.message, true);
});
loadFoods().catch((error) => setMessage('foodStatus', error.message, true));
