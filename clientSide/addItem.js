const methodButtons = document.querySelectorAll('.method-button');
const catalogPanel = document.getElementById('catalogPanel');
const manualPanel = document.getElementById('manualPanel');
const barcodePanel = document.getElementById('barcodePanel');
const catalogSelect = document.getElementById('catalogFood');
const catalogCurrentAmount = document.getElementById('catalogCurrentAmount');
const manualMaxSize = document.getElementById('manualMaxSize');
const barcodeNumber = document.getElementById('barcodeNumber');
const barcodeName = document.getElementById('barcodeName');
const barcodeMaxSize = document.getElementById('barcodeMaxSize');
const barcodeSizeUnits = document.getElementById('barcodeSizeUnits');
const barcodeCurrentAmount = document.getElementById('barcodeCurrentAmount');
const barcodeStatus = document.getElementById('barcodeStatus');
const barcodeImageLink = document.getElementById('barcodeImageLink');
const addBarcodeItemButton = document.getElementById('addBarcodeItem');
const barcodeProductFields = document.querySelectorAll('.product-detail');
const foodPreviewDialog = document.getElementById('foodPreviewDialog');
const previewImages = new Map();
let barcodeImageUrl = '';
let catalogImageUrl = '';
const previewDefaults = {
    catalog: 'Choose a food to preview',
    manual: 'Your food name',
    barcode: 'Look up a food to preview'
};

function getItemPreviewDetails(method) {
    const selectedFood = catalogSelect.selectedOptions[0];
    const name = method === 'catalog'
        ? (selectedFood?.value ? selectedFood.textContent.replace(/\s+\([^)]*\)$/, '') : '')
        : method === 'manual'
            ? document.getElementById('manualName').value.trim()
            : barcodeName.value.trim();
    const amount = method === 'catalog'
        ? catalogCurrentAmount.value
        : method === 'manual'
            ? document.getElementById('manualCurrentAmount').value
            : barcodeCurrentAmount.value;
    const unit = method === 'manual'
        ? document.getElementById('manualSizeUnits').value.trim()
        : method === 'barcode'
            ? barcodeSizeUnits.value.trim()
            : '';
    const expiryDate = document.getElementById(
        method === 'catalog' ? 'catalogExpiryDate' : method === 'manual' ? 'manualExpiryDate' : 'barcodeExpiryDate'
    ).value;

    return {
        name: name || previewDefaults[method],
        amount: amount ? `Current amount: ${amount}${unit ? ` ${unit}` : ''}` : 'Add the amount you have',
        expiryDate: expiryDate ? `Expires: ${expiryDate}` : 'Add an expiry date',
        image: previewImages.get(method) ||
            (method === 'catalog' ? catalogImageUrl : '') ||
            (method === 'barcode' ? barcodeImageUrl : '') ||
            '/logo.png'
    };
}

function updateItemPreview(method) {
    const previewButton = document.querySelector(`[data-item-preview="${method}"]`);
    const details = getItemPreviewDetails(method);
    const image = previewButton.querySelector('img');
    image.onerror = () => {
        image.onerror = null;
        image.src = '/logo.png';
    };
    image.src = details.image;
    previewButton.querySelector('strong').textContent = details.name;
    previewButton.querySelector('.item-preview-copy > span').textContent =
        `${details.amount} | ${details.expiryDate}`;
}

function updateFoodImagePreview(method, input) {
    const file = input.files[0];
    if (!file) {
        previewImages.delete(method);
        updateItemPreview(method);
        return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) ||
        file.size > 5 * 1024 * 1024) {
        previewImages.delete(method);
        setStatus(
            document.getElementById(`${method}Status`) || barcodeStatus,
            file.size > 5 * 1024 * 1024
                ? 'Images must be smaller than 5 MB.'
                : 'Choose a JPEG, PNG, WebP, or GIF image.',
            true
        );
        input.value = '';
        updateItemPreview(method);
        return;
    }

    const reader = new FileReader();
    reader.addEventListener('load', () => {
        if (typeof reader.result === 'string') {
            previewImages.set(method, reader.result);
            updateItemPreview(method);
        }
    });
    reader.addEventListener('error', () => {
        setStatus(
            document.getElementById(`${method}Status`) || barcodeStatus,
            'Unable to read the selected image.',
            true
        );
    });
    reader.readAsDataURL(file);
}

document.querySelectorAll('.item-preview').forEach((previewButton) => {
    const method = previewButton.dataset.itemPreview;
    previewButton.addEventListener('click', () => {
        const details = getItemPreviewDetails(method);
        const dialogImage = document.getElementById('foodPreviewDialogImage');
        dialogImage.onerror = () => {
            dialogImage.onerror = null;
            dialogImage.src = '/logo.png';
        };
        dialogImage.src = details.image;
        document.getElementById('foodPreviewTitle').textContent = details.name;
        document.getElementById('foodPreviewAmount').textContent = details.amount;
        document.getElementById('foodPreviewExpiry').textContent = details.expiryDate;
        foodPreviewDialog.showModal();
    });
    updateItemPreview(method);
});

document.getElementById('closeFoodPreview').addEventListener('click', () => {
    foodPreviewDialog.close();
});

foodPreviewDialog.addEventListener('click', (event) => {
    if (event.target === foodPreviewDialog) {
        foodPreviewDialog.close();
    }
});

function selectMethod(method) {
    const panels = {
        catalog: catalogPanel,
        manual: manualPanel,
        barcode: barcodePanel
    };

    methodButtons.forEach((button) => {
        const selected = button.dataset.method === method;
        button.setAttribute('aria-pressed', String(selected));
    });
    Object.entries(panels).forEach(([name, panel]) => {
        panel.hidden = name !== method;
    });
}

function setStatus(element, message, isError = false) {
    element.textContent = message;
    element.classList.toggle('error', isError);
}

function readProductQuantity(product) {
    const rawQuantity = product.product_quantity ?? product.quantity;
    const rawUnit = product.product_quantity_unit;
    if (rawQuantity === undefined || rawQuantity === null) {
        return null;
    }

    const parsedQuantity = String(rawQuantity).trim().match(/^(\d+(?:[.,]\d+)?)\s*([^\d\s].*)?$/);
    if (!parsedQuantity) {
        return null;
    }

    const amount = Number(parsedQuantity[1].replace(',', '.'));
    const unit = String(rawUnit || parsedQuantity[2] || '').trim();
    if (!Number.isFinite(amount) || amount <= 0 || !unit) {
        return null;
    }
    return { amount, unit };
}

async function loadFoodCatalog() {
    try {
        const response = await fetch('/Customer/foodCatalog');
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Unable to load the food catalog.');
        }

        catalogSelect.replaceChildren();
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = result.length ? 'Choose a food' : 'No catalog foods available';
        catalogSelect.appendChild(placeholder);

        result.forEach((food) => {
            const option = document.createElement('option');
            option.value = food.foodID;
            option.textContent = `${food.name} (${food.maxSize} ${food.sizeUnits})`;
            option.dataset.maxSize = food.maxSize;
            option.dataset.hasPicture = String(food.hasPicture);
            catalogSelect.appendChild(option);
        });
    } catch (error) {
        catalogSelect.replaceChildren();
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Unable to load foods';
        catalogSelect.appendChild(option);
        setStatus(document.getElementById('catalogStatus'), error.message, true);
    }
}

function setProductFieldsEnabled(enabled, readOnly = false) {
    barcodeProductFields.forEach((field) => {
        field.hidden = !enabled;
        field.querySelector('input').disabled = !enabled;
    });
    barcodeName.readOnly = readOnly;
    barcodeMaxSize.readOnly = readOnly;
    barcodeSizeUnits.readOnly = readOnly;
}

function readFoodImage(form) {
    const fileInput = form.querySelector('input[type="file"]');
    const file = fileInput?.files[0];
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
            const dataUrl = reader.result;
            if (typeof dataUrl !== 'string' || !dataUrl.includes(',')) {
                reject(new Error('Unable to read the selected image.'));
                return;
            }
            resolve({
                imageData: dataUrl.slice(dataUrl.indexOf(',') + 1),
                imageMimeType: file.type
            });
        });
        reader.addEventListener('error', () => {
            reject(new Error('Unable to read the selected image.'));
        });
        reader.readAsDataURL(file);
    });
}

async function addItem(method, values, status, submitButton, form) {
    setStatus(status, '');
    submitButton.disabled = true;
    try {
        const image = await readFoodImage(form);
        const response = await fetch('/Customer/addFoodItem', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ method, ...values, ...image })
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Unable to add this food item.');
        }

        const previewMethod = form.id === 'manualForm' ? 'manual' : method;
        form.reset();
        previewImages.delete(previewMethod);
        setStatus(status, 'Food added to your items.');
        if (method === 'catalog') {
            catalogImageUrl = '';
            catalogCurrentAmount.removeAttribute('max');
        } else if (form.id === 'barcodeForm') {
            barcodeNumber.value = '';
            barcodeName.value = '';
            barcodeMaxSize.value = '';
            barcodeSizeUnits.value = '';
            barcodeCurrentAmount.value = '';
            barcodeImageUrl = '';
            barcodeImageLink.hidden = true;
            barcodeImageLink.removeAttribute('href');
            previewImages.delete('barcode');
            const barcodeImageInput = form.querySelector('input[type="file"]');
            if (barcodeImageInput) barcodeImageInput.value = '';
            barcodePanel.querySelector('#barcodeExpiryDate').value = '';
            setProductFieldsEnabled(false);
            addBarcodeItemButton.disabled = true;
            setStatus(barcodeStatus, '');
        }
        updateItemPreview(previewMethod);
        await loadFoodCatalog();
    } catch (error) {
        setStatus(status, error.message, true);
    } finally {
        submitButton.disabled = false;
    }
}

methodButtons.forEach((button) => {
    button.addEventListener('click', () => selectMethod(button.dataset.method));
});

catalogSelect.addEventListener('change', () => {
    const selectedOption = catalogSelect.selectedOptions[0];
    if (selectedOption && selectedOption.dataset.maxSize) {
        catalogCurrentAmount.max = selectedOption.dataset.maxSize;
    } else {
        catalogCurrentAmount.removeAttribute('max');
    }
    catalogImageUrl = selectedOption?.value && selectedOption.dataset.hasPicture === 'true'
        ? `/Customer/foodCatalog/${encodeURIComponent(selectedOption.value)}/image`
        : '';
    updateItemPreview('catalog');
});

[
    ['catalog', document.getElementById('catalogForm')],
    ['manual', document.getElementById('manualForm')],
    ['barcode', document.getElementById('barcodeForm')]
].forEach(([method, form]) => {
    form.addEventListener('input', () => updateItemPreview(method));
    form.addEventListener('change', (event) => {
        if (event.target.matches('input[type="file"]')) {
            updateFoodImagePreview(method, event.target);
        } else {
            updateItemPreview(method);
        }
    });
});

document.getElementById('catalogForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const submitButton = event.currentTarget.querySelector('[type="submit"]');
    addItem('catalog', {
        foodID: catalogSelect.value,
        currentAmount: catalogCurrentAmount.value,
        expiryDate: document.getElementById('catalogExpiryDate').value
    }, document.getElementById('catalogStatus'), submitButton, event.currentTarget);
});

document.getElementById('manualForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form.querySelector('[type="submit"]');
    addItem('new', {
        name: document.getElementById('manualName').value,
        maxSize: manualMaxSize.value,
        sizeUnits: document.getElementById('manualSizeUnits').value,
        currentAmount: document.getElementById('manualCurrentAmount').value,
        expiryDate: document.getElementById('manualExpiryDate').value
    }, document.getElementById('manualStatus'), submitButton, form);
});

document.getElementById('lookupBarcode').addEventListener('click', async () => {
    const code = barcodeNumber.value.trim();
    addBarcodeItemButton.disabled = true;
    setProductFieldsEnabled(false);
    barcodeName.value = '';
    barcodeMaxSize.value = '';
    barcodeSizeUnits.value = '';
    barcodeImageUrl = '';
    barcodeImageLink.hidden = true;
    barcodeImageLink.removeAttribute('href');
    previewImages.delete('barcode');
    updateItemPreview('barcode');

    if (!/^\d{8,14}$/.test(code)) {
        setStatus(barcodeStatus, 'Enter a barcode containing 8 to 14 digits. You can enter the food details manually below.', true);
        setProductFieldsEnabled(true);
        addBarcodeItemButton.disabled = false;
        return;
    }

    const lookupButton = document.getElementById('lookupBarcode');
    lookupButton.disabled = true;
    setStatus(barcodeStatus, 'Looking up barcode...');
    try {
        const response = await fetch(`https://world.openfoodfacts.net/api/v2/product/${encodeURIComponent(code)}`);
        if (!response.ok) {
            throw new Error('The barcode lookup service could not be reached.');
        }

        const result = await response.json();
        const product = result.product;
        const name = typeof product?.product_name === 'string' ? product.product_name.trim() : '';
        const quantity = product ? readProductQuantity(product) : null;
        const imageUrl = typeof product?.image_url === 'string'
            ? product.image_url
            : typeof product?.image_front_url === 'string'
                ? product.image_front_url
                : '';
        if (result.status !== 1 || !name || !quantity) {
            setStatus(barcodeStatus, 'Product name, amount, or unit was missing. Enter the item details manually to continue.', true);
            setProductFieldsEnabled(true);
        } else {
            barcodeName.value = name;
            barcodeMaxSize.value = quantity.amount;
            barcodeSizeUnits.value = quantity.unit;
            barcodeImageUrl = imageUrl;
            if (imageUrl) {
                barcodeImageLink.href = imageUrl;
                barcodeImageLink.hidden = false;
            }
            setProductFieldsEnabled(true, true);
            setStatus(
                barcodeStatus,
                imageUrl
                    ? 'Product found with an image. Enter the amount you currently have and its expiry date.'
                    : 'Product found. No product image was provided; you can upload one instead.'
            );
        }
        addBarcodeItemButton.disabled = false;
        updateItemPreview('barcode');
    } catch {
        setStatus(barcodeStatus, 'Barcode lookup failed. Enter the item details manually to continue.', true);
        setProductFieldsEnabled(true);
        addBarcodeItemButton.disabled = false;
        updateItemPreview('barcode');
    } finally {
        lookupButton.disabled = false;
    }
});

barcodeNumber.addEventListener('input', () => {
    if (!addBarcodeItemButton.disabled) {
        addBarcodeItemButton.disabled = true;
        setProductFieldsEnabled(false);
        barcodeName.value = '';
        barcodeMaxSize.value = '';
        barcodeSizeUnits.value = '';
        barcodeImageUrl = '';
        barcodeImageLink.hidden = true;
        barcodeImageLink.removeAttribute('href');
        previewImages.delete('barcode');
        setStatus(barcodeStatus, 'Look up this barcode before adding the item.');
        updateItemPreview('barcode');
    }
});

document.getElementById('barcodeForm').addEventListener('submit', (event) => {
    event.preventDefault();
    addItem('barcode', {
        name: barcodeName.value,
        maxSize: barcodeMaxSize.value,
        sizeUnits: barcodeSizeUnits.value,
        barcodeNumber: barcodeNumber.value.trim(),
        currentAmount: barcodeCurrentAmount.value,
        expiryDate: document.getElementById('barcodeExpiryDate').value,
        imageUrl: barcodeImageUrl
    }, barcodeStatus, addBarcodeItemButton, event.currentTarget);
});

const currentDate = new Date();
const today = [
    currentDate.getFullYear(),
    String(currentDate.getMonth() + 1).padStart(2, '0'),
    String(currentDate.getDate()).padStart(2, '0')
].join('-');
['catalogExpiryDate', 'manualExpiryDate', 'barcodeExpiryDate'].forEach((id) => {
    document.getElementById(id).min = today;
});
catalogCurrentAmount.removeAttribute('max');
setProductFieldsEnabled(false);
selectMethod('catalog');
loadFoodCatalog();
