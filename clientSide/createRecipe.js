const createRecipeForm = document.getElementById('createRecipeForm');
const ingredientRows = document.getElementById('ingredientRows');
const createRecipeStatus = document.getElementById('createRecipeStatus');
const recipeImageInput = document.getElementById('recipeImage');
const previewImage = document.getElementById('previewImage');
const recipePreviewDialog = document.getElementById('recipePreviewDialog');

let availableFoods = [];
let previewImageData = null;
let nextIngredientRowId = 1;

function setStatus(message, isError = false) {
    createRecipeStatus.textContent = message;
    createRecipeStatus.classList.toggle('error', isError);
}

function addIngredientRow() {
    const row = document.createElement('div');
    row.className = 'ingredient-row';

    const field = document.createElement('div');
    field.className = 'ingredient-select-field';
    const label = document.createElement('label');
    const select = document.createElement('select');
    const selectId = `ingredient-${nextIngredientRowId++}`;

    label.htmlFor = selectId;
    label.textContent = 'Ingredient';
    select.id = selectId;
    select.required = true;

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = availableFoods.length ? 'Choose ingredient' : 'No foods available';
    select.appendChild(placeholder);
    availableFoods.forEach((food) => {
        const option = document.createElement('option');
        option.value = food.foodID;
        option.textContent = food.name;
        option.dataset.sizeUnits = food.sizeUnits || '';
        select.appendChild(option);
    });

    field.append(label, select);

    const quantityField = document.createElement('div');
    quantityField.className = 'ingredient-quantity';
    const amountField = document.createElement('div');
    const amountLabel = document.createElement('label');
    const amountInput = document.createElement('input');
    const amountId = `ingredient-amount-${nextIngredientRowId}`;
    amountLabel.htmlFor = amountId;
    amountLabel.textContent = 'Amount';
    amountInput.id = amountId;
    amountInput.type = 'number';
    amountInput.min = '0.01';
    amountInput.step = 'any';
    amountInput.placeholder = 'e.g. 250';
    amountInput.required = true;
    amountInput.addEventListener('input', updateRecipePreview);
    amountField.append(amountLabel, amountInput);

    const unitField = document.createElement('div');
    const unitLabel = document.createElement('label');
    const unitOutput = document.createElement('output');
    const unitId = `ingredient-unit-${nextIngredientRowId}`;
    unitLabel.htmlFor = unitId;
    unitLabel.textContent = 'Measurement';
    unitOutput.id = unitId;
    unitOutput.className = 'ingredient-measurement';
    unitOutput.textContent = 'Select an ingredient';
    unitOutput.setAttribute('aria-live', 'polite');
    unitField.append(unitLabel, unitOutput);
    unitField.className = 'ingredient-unit-field';
    quantityField.append(amountField, unitField);
    select.addEventListener('change', () => {
        unitOutput.textContent = select.value
            ? select.selectedOptions[0]?.dataset.sizeUnits || 'Unit not set'
            : 'Select an ingredient';
        updateRecipePreview();
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-ingredient';
    remove.textContent = '−';
    remove.setAttribute('aria-label', 'Remove ingredient');
    remove.addEventListener('click', () => {
        row.remove();
        updateRecipePreview();
    });

    row.append(field, quantityField, remove);
    ingredientRows.appendChild(row);
}

function selectedIngredients() {
    const foodsById = new Map(availableFoods.map((food) => [String(food.foodID), food]));
    return [...ingredientRows.querySelectorAll('.ingredient-row')]
        .map((row) => {
            const select = row.querySelector('select');
            const rawValue = row.querySelector('input[type="number"]').value;
            const value = rawValue === '' ? null : Number(rawValue);
            const food = foodsById.get(select.value);
            if (!food) return null;
            return {
                foodID: select.value,
                name: food.name,
                amount: value === null || !Number.isFinite(value) ? null : value,
                unit: food.sizeUnits || ''
            };
        })
        .filter(Boolean);
}

function updateRecipePreview() {
    const name = document.getElementById('recipeName').value.trim();
    const cookingTime = document.getElementById('cookingTime').value;
    const instructions = document.getElementById('instructions').value.trim();
    const ingredients = selectedIngredients();

    document.getElementById('previewName').textContent = name || 'Your recipe name';
    document.getElementById('previewTime').textContent = cookingTime
        ? `Takes ${cookingTime} minutes`
        : 'Cooking time will appear here';
    document.getElementById('previewIngredients').textContent = ingredients.length
        ? ingredients.map((ingredient) =>
            `${ingredient.amount ?? 'Enter amount'} ${ingredient.unit || 'unit'} ${ingredient.name}`
        ).join(', ')
        : 'Add ingredients to see them here';

    document.getElementById('previewDialogTitle').textContent = name || 'Your recipe';
    document.getElementById('previewDialogTime').textContent = cookingTime
        ? `Ready in ${cookingTime} minutes`
        : 'Cooking time not listed';
    document.getElementById('previewDialogInstructions').textContent =
        instructions || 'Your instructions will appear here.';

    const previewIngredientList = document.getElementById('previewDialogIngredients');
    previewIngredientList.replaceChildren();
    if (ingredients.length) {
        ingredients.forEach((ingredient) => {
            const listItem = document.createElement('li');
            listItem.textContent =
                `${ingredient.amount ?? 'Enter amount'} ${ingredient.unit || 'unit'} ${ingredient.name}`;
            previewIngredientList.appendChild(listItem);
        });
    } else {
        const listItem = document.createElement('li');
        listItem.textContent = 'Add at least one ingredient.';
        previewIngredientList.appendChild(listItem);
    }
}

function readRecipeImage(file) {
    if (!file) {
        return Promise.resolve({});
    }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
        return Promise.reject(new Error('Choose a JPEG, PNG, WebP, or GIF image.'));
    }
    if (file.size > 5 * 1024 * 1024) {
        return Promise.reject(new Error('Images must be smaller than 5 MB.'));
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener('load', () => {
            if (typeof reader.result !== 'string' || !reader.result.includes(',')) {
                reject(new Error('Unable to read the selected image.'));
                return;
            }
            resolve({
                imageData: reader.result.slice(reader.result.indexOf(',') + 1),
                imageMimeType: file.type
            });
        });
        reader.addEventListener('error', () => reject(new Error('Unable to read the selected image.')));
        reader.readAsDataURL(file);
    });
}

async function loadAvailableFoods() {
    const response = await fetch('/Customer/recipeFoods');
    const result = await response.json();
    if (!response.ok) {
        throw new Error(result.error || 'Unable to load ingredient choices.');
    }
    availableFoods = result;
    ingredientRows.replaceChildren();
    addIngredientRow();
    updateRecipePreview();
}

document.getElementById('addIngredient').addEventListener('click', addIngredientRow);

['recipeName', 'cookingTime', 'instructions'].forEach((id) => {
    document.getElementById(id).addEventListener('input', updateRecipePreview);
});

recipeImageInput.addEventListener('change', () => {
    const file = recipeImageInput.files[0];
    previewImageData = null;
    if (!file) {
        previewImage.src = '/logo.png';
        return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
        setStatus('Choose a JPEG, PNG, WebP, or GIF image.', true);
        recipeImageInput.value = '';
        previewImage.src = '/logo.png';
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        setStatus('Images must be smaller than 5 MB.', true);
        recipeImageInput.value = '';
        previewImage.src = '/logo.png';
        return;
    }

    const reader = new FileReader();
    reader.addEventListener('load', () => {
        if (typeof reader.result === 'string') {
            previewImageData = reader.result;
            previewImage.src = reader.result;
            document.getElementById('previewDialogImage').src = reader.result;
        }
    });
    reader.addEventListener('error', () => setStatus('Unable to read the selected image.', true));
    reader.readAsDataURL(file);
});

document.getElementById('recipePreview').addEventListener('click', () => {
    updateRecipePreview();
    document.getElementById('previewDialogImage').src = previewImageData || '/logo.png';
    recipePreviewDialog.showModal();
});

document.getElementById('closePreview').addEventListener('click', () => {
    recipePreviewDialog.close();
});

recipePreviewDialog.addEventListener('click', (event) => {
    if (event.target === recipePreviewDialog) {
        recipePreviewDialog.close();
    }
});

createRecipeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('');
    const saveButton = document.getElementById('saveRecipe');
    saveButton.disabled = true;
    try {
        const image = await readRecipeImage(recipeImageInput.files[0]);
        const response = await fetch('/Customer/createRecipe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: document.getElementById('recipeName').value,
                cookingTime: document.getElementById('cookingTime').value,
                servingSize: document.getElementById('servingSize').value,
                ingredients: [...ingredientRows.querySelectorAll('.ingredient-row')].map((row) => ({
                    foodID: row.querySelector('select').value,
                    amount: row.querySelector('input[type="number"]').value
                })),
                foodIDs: [...ingredientRows.querySelectorAll('select')].map((select) => select.value),
                instructions: document.getElementById('instructions').value,
                ...image
            })
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Unable to save this recipe.');
        }
        window.location.assign('/Customer/SearchRecipes');
    } catch (error) {
        setStatus(error.message, true);
    } finally {
        saveButton.disabled = false;
    }
});

loadAvailableFoods().catch((error) => setStatus(error.message, true));
