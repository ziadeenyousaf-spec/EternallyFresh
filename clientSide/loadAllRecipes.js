const recipeList = document.getElementById('recipeList');
const recipeStatus = document.getElementById('recipeStatus');
const recipeDialog = document.getElementById('recipeDetails');
const editRecipeDialog = document.getElementById('editRecipeDialog');
const editRecipeForm = document.getElementById('editRecipeForm');
const ingredientList = document.getElementById('recipeIngredients');
const instructionList = document.getElementById('recipeInstructions');
const editRecipeIngredientRows = document.getElementById('editRecipeIngredients');

let availableFoods = [];
let activeRecipe = null;
let nextEditIngredientId = 1;

function createListItem(list, text) {
    const item = document.createElement('li');
    item.textContent = text;
    list.appendChild(item);
}

function getRecipeImageDataUrl(base64) {
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

function parseRecipeFoodIds(foodIDs) {
    if (typeof foodIDs === 'string') {
        try {
            foodIDs = JSON.parse(foodIDs);
        } catch {
            foodIDs = foodIDs.split(',').map((id) => id.trim());
        }
    }
    if (!Array.isArray(foodIDs)) return [];
    return foodIDs.map((entry) => (
        entry && typeof entry === 'object' ? entry.foodID ?? entry.id : entry
    ));
}

function getRecipeIngredients(foodIDs, foodsById, ingredientDetails = []) {
    if (Array.isArray(ingredientDetails) && ingredientDetails.length) {
        return ingredientDetails.map((ingredient) => {
            const name = foodsById.get(String(ingredient.foodID)) || `Food item ${ingredient.foodID}`;
            return `${ingredient.amount} ${ingredient.unit} ${name}`;
        });
    }

    let ids = foodIDs;
    if (typeof ids === 'string') {
        try {
            ids = JSON.parse(ids);
        } catch {
            ids = ids.split(',').map((id) => id.trim());
        }
    }
    if (!Array.isArray(ids)) {
        return [];
    }

    return ids.map((entry) => {
        const id = entry && typeof entry === 'object'
            ? entry.foodID ?? entry.id
            : entry;
        return foodsById.get(String(id)) || `Food item ${id}`;
    });
}

function getInstructionSteps(instructions) {
    const splitInstructionLines = (value) => String(value)
        .replace(/\\n/g, '\n')
        .split(/\r?\n/)
        .map((step) => step.trim())
        .filter(Boolean);

    if (instructions === null || instructions === undefined || instructions === '') {
        return [];
    }
    if (Array.isArray(instructions)) {
        return instructions.flatMap((step) => {
            if (typeof step === 'string' || typeof step === 'number') {
                return splitInstructionLines(step);
            }
            if (step && typeof step === 'object') {
                const text = step.instruction ?? step.step ?? step.text ?? step.description;
                return text ? splitInstructionLines(text) : [];
            }
            return [];
        });
    }
    if (typeof instructions === 'object') {
        const text = instructions.instructions ?? instructions.steps ?? instructions.method;
        return getInstructionSteps(text);
    }

    const text = String(instructions).trim();
    if (!text) {
        return [];
    }
    try {
        const parsed = JSON.parse(text);
        if (parsed !== instructions) {
            return getInstructionSteps(parsed);
        }
    } catch {
        return splitInstructionLines(text);
    }
    return [text];
}

function openRecipe(recipe, foodsById) {
    activeRecipe = recipe;
    document.getElementById('recipeDetailTitle').textContent = recipe.name || 'Recipe';
    document.getElementById('recipeCookingTime').textContent =
        recipe.cookingTime ? `Ready in ${recipe.cookingTime} minutes` : '';
    document.getElementById('recipeServingSize').textContent =
        recipe.servingSize ? `Serves ${recipe.servingSize}` : '';

    const detailImage = document.getElementById('recipeDetailImage');
    detailImage.src = recipe.recipePic
        ? getRecipeImageDataUrl(recipe.recipePic)
        : '/logo.png';
    detailImage.alt = recipe.name ? `${recipe.name} recipe` : 'Recipe image';

    ingredientList.replaceChildren();
    const ingredients = getRecipeIngredients(recipe.foodIDs, foodsById, recipe.ingredients);
    if (ingredients.length) {
        ingredients.forEach((ingredient) => createListItem(ingredientList, ingredient));
    } else {
        createListItem(ingredientList, 'No ingredients listed.');
    }

    instructionList.replaceChildren();
    const steps = getInstructionSteps(recipe.instructions);
    if (steps.length) {
        steps.forEach((step) => createListItem(instructionList, step));
    } else {
        createListItem(instructionList, 'Instructions are not available for this recipe yet.');
    }
    const ownerActions = document.getElementById('recipeOwnerActions');
    ownerActions.hidden = !recipe.isOwner;
    document.getElementById('recipePublicStatus').textContent = recipe.isOwner
        ? `Status: ${recipe.publicStatus || 'private'}`
        : '';
    document.getElementById('recipeActionStatus').textContent = '';
    document.getElementById('recipeActionStatus').classList.remove('error');
    document.getElementById('publishOwnRecipe').disabled =
        recipe.publicStatus === 'needs review' || recipe.publicStatus === 'public';
    recipeDialog.showModal();
}

function createRecipeCard(recipe, foodsById) {
    const card = document.createElement('article');
    card.className = 'recipe-card';

    const image = document.createElement('img');
    image.src = recipe.recipePic
        ? getRecipeImageDataUrl(recipe.recipePic)
        : '/logo.png';
    image.alt = '';

    const name = document.createElement('h2');
    name.textContent = recipe.name || 'Untitled recipe';

    const time = document.createElement('p');
    time.textContent = recipe.cookingTime
        ? `Takes ${recipe.cookingTime} minutes`
        : 'Cooking time not listed';

    const ingredientNames = getRecipeIngredients(recipe.foodIDs, foodsById, recipe.ingredients);
    const ingredients = document.createElement('p');
    ingredients.textContent = ingredientNames.length
        ? `${ingredientNames.length} ingredient${ingredientNames.length === 1 ? '' : 's'}`
        : 'View recipe details';

    const viewButton = document.createElement('button');
    viewButton.type = 'button';
    viewButton.className = 'recipe-card-view';
    viewButton.setAttribute('aria-label', `View full recipe: ${recipe.name}`);
    viewButton.addEventListener('click', () => openRecipe(recipe, foodsById));
    viewButton.append(image, name, time, ingredients);

    if (recipe.isOwner) {
        const actions = document.createElement('div');
        actions.className = 'recipe-card-actions';

        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.textContent = '✎';
        editButton.className = 'recipe-card-edit';
        editButton.title = `Edit ${recipe.name}`;
        editButton.setAttribute('aria-label', `Edit ${recipe.name}`);
        editButton.addEventListener('click', () => openRecipeEditor(recipe));

        const publishButton = document.createElement('button');
        publishButton.type = 'button';
        publishButton.className = 'recipe-card-publish';
        publishButton.textContent = recipe.publicStatus === 'needs review' || recipe.publicStatus === 'public'
            ? 'Submitted'
            : 'Submit for review';
        publishButton.disabled = recipe.publicStatus === 'needs review' || recipe.publicStatus === 'public';
        publishButton.addEventListener('click', () => submitRecipeForReview(recipe, publishButton));

        actions.append(editButton, publishButton);
        card.appendChild(actions);

        const status = document.createElement('span');
        status.className = 'recipe-status-badge';
        status.textContent = recipe.publicStatus || 'private';
        viewButton.appendChild(status);
    }
    card.appendChild(viewButton);
    return card;
}

function addEditRecipeIngredient(foodID = '', amount = '') {
    const row = document.createElement('div');
    row.className = 'recipe-edit-ingredient';
    const foodField = document.createElement('div');
    const foodLabel = document.createElement('label');
    const foodSelect = document.createElement('select');
    const id = `edit-recipe-food-${nextEditIngredientId++}`;
    foodLabel.htmlFor = id;
    foodLabel.textContent = 'Ingredient';
    foodSelect.id = id;
    foodSelect.required = true;
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose an ingredient';
    foodSelect.appendChild(placeholder);
    availableFoods.forEach((food) => {
        const option = document.createElement('option');
        option.value = food.foodID;
        option.textContent = `${food.name} (${food.sizeUnits})`;
        option.dataset.sizeUnits = food.sizeUnits || '';
        foodSelect.appendChild(option);
    });
    foodSelect.value = String(foodID);
    foodField.append(foodLabel, foodSelect);

    const amountField = document.createElement('div');
    const amountLabel = document.createElement('label');
    const amountInput = document.createElement('input');
    amountLabel.textContent = 'Amount';
    amountInput.type = 'number';
    amountInput.min = '0.01';
    amountInput.step = 'any';
    amountInput.required = true;
    amountInput.value = amount;
    amountField.append(amountLabel, amountInput);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = '−';
    removeButton.setAttribute('aria-label', 'Remove ingredient');
    removeButton.addEventListener('click', () => row.remove());

    row.append(foodField, amountField, removeButton);
    editRecipeIngredientRows.appendChild(row);
}

function openRecipeEditor(recipe) {
    if (!recipe.isOwner) return;
    activeRecipe = recipe;
    document.getElementById('editRecipeName').value = recipe.name || '';
    document.getElementById('editRecipeCookingTime').value = recipe.cookingTime || '';
    document.getElementById('editRecipeServingSize').value = recipe.servingSize || 1;
    document.getElementById('editRecipeInstructions').value = getInstructionSteps(recipe.instructions).join('\n');
    document.getElementById('editRecipeStatus').textContent = '';
    document.getElementById('editRecipeStatus').classList.remove('error');
    editRecipeIngredientRows.replaceChildren();

    let ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
    if (!ingredients.length) {
        const ids = parseRecipeFoodIds(recipe.foodIDs);
        let amounts = recipe.foodAmount;
        if (typeof amounts === 'string') {
            try {
                amounts = JSON.parse(amounts);
            } catch {
                amounts = amounts.split(',').map((amount) => amount.trim());
            }
        }
        ingredients = ids.map((foodID, index) => ({
            foodID,
            amount: Array.isArray(amounts) ? amounts[index] : ''
        }));
    }
    ingredients.forEach((ingredient) => addEditRecipeIngredient(ingredient.foodID, ingredient.amount));
    if (!ingredients.length) addEditRecipeIngredient();

    recipeDialog.close();
    editRecipeDialog.showModal();
}

async function loadAllRecipes() {
    recipeStatus.textContent = 'Loading recipes...';
    recipeStatus.classList.remove('error');
    const response = await fetch('/Customer/getAllRecipes');
    const result = await response.json();
    if (!response.ok) {
        throw new Error(result.error || 'Unable to load recipes.');
    }

    availableFoods = result.foods;
    const foodsById = new Map(availableFoods.map((food) => [String(food.foodID), food.name]));
    recipeList.replaceChildren();
    result.recipes.forEach((recipe) => {
        recipeList.appendChild(createRecipeCard(recipe, foodsById));
    });
    recipeStatus.textContent = result.recipes.length
        ? ''
        : 'No recipes are available yet.';
}

document.getElementById('editOwnRecipe').addEventListener('click', () => {
    if (activeRecipe) openRecipeEditor(activeRecipe);
});

async function submitRecipeForReview(recipe, button, status = null) {
    if (!recipe?.isOwner || button.disabled) return;
    button.disabled = true;
    if (status) {
        status.textContent = 'Submitting recipe for review...';
        status.classList.remove('error');
    }
    try {
        const response = await fetch('/Customer/publishRecipe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipeID: recipe.recipeID })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to submit this recipe for review.');
        recipe.publicStatus = result.publicStatus;
        if (status) status.textContent = 'Recipe submitted for review.';
        await loadAllRecipes();
        if (activeRecipe?.recipeID === recipe.recipeID) {
            activeRecipe.publicStatus = result.publicStatus;
            document.getElementById('recipePublicStatus').textContent = `Status: ${result.publicStatus}`;
            document.getElementById('publishOwnRecipe').disabled = true;
        }
    } catch (error) {
        if (status) {
            status.textContent = error.message;
            status.classList.add('error');
        } else {
            recipeStatus.textContent = error.message;
            recipeStatus.classList.add('error');
        }
    } finally {
        button.disabled = recipe.publicStatus === 'needs review' || recipe.publicStatus === 'public';
    }
}

document.getElementById('publishOwnRecipe').addEventListener('click', (event) => {
    if (activeRecipe) {
        submitRecipeForReview(activeRecipe, event.currentTarget, document.getElementById('recipeActionStatus'));
    }
});

document.getElementById('addEditRecipeIngredient').addEventListener('click', () => addEditRecipeIngredient());
document.getElementById('cancelEditRecipe').addEventListener('click', () => editRecipeDialog.close());

editRecipeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!activeRecipe?.isOwner) return;
    const status = document.getElementById('editRecipeStatus');
    const submitButton = editRecipeForm.querySelector('button[type="submit"]');
    status.textContent = '';
    submitButton.disabled = true;
    try {
        const response = await fetch('/Customer/updateRecipe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipeID: activeRecipe.recipeID,
                name: document.getElementById('editRecipeName').value,
                cookingTime: document.getElementById('editRecipeCookingTime').value,
                servingSize: document.getElementById('editRecipeServingSize').value,
                instructions: document.getElementById('editRecipeInstructions').value,
                ingredients: [...editRecipeIngredientRows.querySelectorAll('.recipe-edit-ingredient')].map((row) => ({
                    foodID: row.querySelector('select').value,
                    amount: row.querySelector('input').value
                }))
            })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to update this recipe.');
        editRecipeDialog.close();
        await loadAllRecipes();
    } catch (error) {
        status.textContent = error.message;
        status.classList.add('error');
    } finally {
        submitButton.disabled = false;
    }
});

document.getElementById('recipeClose').addEventListener('click', () => {
    recipeDialog.close();
});

recipeDialog.addEventListener('click', (event) => {
    if (event.target === recipeDialog) {
        recipeDialog.close();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    loadAllRecipes().catch((error) => {
        recipeStatus.textContent = error.message;
        recipeStatus.classList.add('error');
    });
});
