const editDialog = document.getElementById('editFoodDialog');
const editForm = document.getElementById('editFoodForm');
const editCurrSize = document.getElementById('editCurrSize');
const editExpiryDate = document.getElementById('editExpiryDate');
const editAmountMode = document.getElementById('editAmountMode');
const editAmountResult = document.getElementById('editAmountResult');
const editFoodStatus = document.getElementById('editFoodStatus');
const itemsStatus = document.getElementById('itemsStatus');
const editSubmitButton = editForm.querySelector('button[type="submit"]');

let selectedItem = null;

function getFoodPictureDataUrl(base64) {
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

function formatExpiryDate(value) {
    return String(value).slice(0, 10);
}

function openFoodEditor(item) {
    selectedItem = item;
    editFoodStatus.textContent = '';
    editAmountMode.value = 'amount';
    editCurrSize.value = item.currSize;
    editExpiryDate.value = formatExpiryDate(item.expiryDate);
    updateAmountMode();
    updateAmountResult();
    editDialog.showModal();
}

function getEditedAmount() {
    if (!selectedItem) {
        return null;
    }

    const inputValue = Number(editCurrSize.value);
    if (!Number.isFinite(inputValue) || inputValue < 0) {
        return null;
    }
    if (editAmountMode.value === 'maxSizePercent') {
        return Number(selectedItem.maxSize) * inputValue / 100;
    }
    if (editAmountMode.value === 'currentAmountPercent') {
        return Number(selectedItem.currSize) * (1 - inputValue / 100);
    }
    return inputValue;
}

function updateAmountMode() {
    if (!selectedItem) {
        return;
    }

    const percentageMode = editAmountMode.value !== 'amount';
    const percentUsed = editAmountMode.value === 'currentAmountPercent';
    const unit = selectedItem.sizeUnits || '';
    editCurrSize.value = percentageMode ? '' : selectedItem.currSize;
    editCurrSize.min = '0';
    editCurrSize.max = percentageMode ? '100' : selectedItem.maxSize;
    editCurrSize.setAttribute('aria-label', percentageMode
        ? (percentUsed ? 'Percentage of current amount to use' : 'Percentage of maximum size remaining')
        : `Amount remaining in ${unit}`);
    editForm.querySelector('label[for="editCurrSize"]').textContent = percentageMode
        ? (percentUsed ? 'Percentage of current amount to use' : 'Percentage of max size remaining')
        : `Amount remaining (${unit})`;
    updateAmountResult();
}

function updateAmountResult() {
    if (!selectedItem) {
        editAmountResult.textContent = '';
        return;
    }

    const percentageMode = editAmountMode.value !== 'amount';
    const percentUsed = editAmountMode.value === 'currentAmountPercent';
    const unit = selectedItem.sizeUnits || '';
    if (!editCurrSize.value) {
        editAmountResult.textContent = percentageMode
            ? 'Enter a percentage from 0 to 100.'
            : '';
        return;
    }

    const amount = getEditedAmount();
    if (amount === null) {
        editAmountResult.textContent = 'Enter a valid amount.';
        return;
    }
    const action = percentUsed ? 'Remaining after use' : 'Amount to save';
    editAmountResult.textContent = `${action}: ${Number(amount.toFixed(3))} ${unit}`;
}

async function loadAllExpiringProducts() {
    itemsStatus.textContent = 'Loading your food items...';
    const response = await fetch('/Customer/getAllExpiringProducts');
    if (!response.ok) {
        throw new Error('Unable to load your food items. Please refresh and try again.');
    }

    const data = await response.json();
    const container = document.getElementById('soonToExpireFoods');
    container.replaceChildren();

    data.items.forEach((item) => {
        const foodDiv = document.createElement('div');
        foodDiv.classList.add('foodItem');

        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.classList.add('food-edit-button');
        editButton.setAttribute('aria-label', `Edit ${item.name}`);
        editButton.title = `Edit ${item.name}`;
        editButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.04a1 1 0 0 0 0-1.41l-2.51-2.51a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 2-1.66z"/></svg>';
        editButton.addEventListener('click', () => openFoodEditor(item));

        const foodPic = document.createElement('img');
        foodPic.src = item.foodPic ? getFoodPictureDataUrl(item.foodPic) : '/logo.png';
        foodPic.alt = item.name;

        const foodName = document.createElement('p');
        foodName.textContent = item.name;

        const expiryDate = new Date(item.expiryDate);
        const daysUntilExpiry = Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));
        const expiryInfo = document.createElement('p');
        expiryInfo.textContent = `Expires in ${daysUntilExpiry} day(s)`;

        const amountInfo = document.createElement('p');
        amountInfo.textContent = `Amount left: ${item.currSize} ${item.sizeUnits} out of ${item.maxSize} ${item.sizeUnits}`;

        foodDiv.append(editButton, foodPic, foodName, expiryInfo, amountInfo);
        container.appendChild(foodDiv);
    });

    itemsStatus.textContent = data.items.length ? '' : 'No current food items to display.';
}

document.getElementById('cancelFoodEdit').addEventListener('click', () => {
    editDialog.close();
});

editAmountMode.addEventListener('change', updateAmountMode);
editCurrSize.addEventListener('input', updateAmountResult);

editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!selectedItem) {
        editFoodStatus.textContent = 'Select a food item to edit.';
        return;
    }

    editFoodStatus.textContent = '';
    const editedAmount = getEditedAmount();
    if (editedAmount === null ||
        editedAmount > Number(selectedItem.maxSize) ||
        (editAmountMode.value !== 'amount' &&
            (Number(editCurrSize.value) < 0 || Number(editCurrSize.value) > 100))) {
        editFoodStatus.textContent = `Enter a valid amount not exceeding ${selectedItem.maxSize} ${selectedItem.sizeUnits}.`;
        return;
    }
    editSubmitButton.disabled = true;
    try {
        const body = new URLSearchParams({
            recordKey: JSON.stringify(selectedItem.recordKey),
            currSize: String(editedAmount),
            expiryDate: editExpiryDate.value
        });
        const response = await fetch('/Customer/updateFoodItem', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Unable to save the food item.');
        }
    } catch (error) {
        editFoodStatus.textContent = error.message;
        editSubmitButton.disabled = false;
        return;
    }

    editDialog.close();
    editSubmitButton.disabled = false;
    try {
        await loadAllExpiringProducts();
    } catch (error) {
        itemsStatus.textContent = error.message;
    }
});

document.addEventListener('DOMContentLoaded', () => {
    loadAllExpiringProducts().catch((error) => {
        itemsStatus.textContent = error.message;
    });
});
