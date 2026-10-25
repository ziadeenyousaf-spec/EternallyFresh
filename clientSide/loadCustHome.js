async function loadSoonExpiringProducts() {
    let info = await fetch(`/Customer/getSoonExpiringProducts/`);
    let food = await info.json();
    food.forEach((item,index) => {
        document.getElementById(`foodPic${index + 1}`).src = `data:image/jpeg;base64,${item.foodPic}`;
        document.getElementById(`foodName${index + 1}`).textContent = item.name;
        //calculate the amount of time until expiry and display it
        let expiryDate = new Date(item.expiryDate);
        let currentDate = new Date();
        let timeDiff = expiryDate - currentDate;
        let daysUntilExpiry = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
        document.getElementById(`expiry${index + 1}`).textContent = `Expires in ${daysUntilExpiry} day(s)`;
    });

}
async function loadRecommendedRecipes() {
    let info = await fetch('/Customer/loadRecommendedRecipes');
    let recipes = await info.json();
    recipes.forEach((recipe, index) => {
        document.getElementById(`recipePic${index + 1}`).src = `data:image/jpeg;base64,${recipe.recipePic}`;
        document.getElementById(`recipeName${index + 1}`).textContent = recipe.name;
        document.getElementById(`recipeTime${index + 1}`).textContent = `Takes ${recipe.cookingTime} mins`;
    });
}

document.addEventListener('DOMContentLoaded', async function() {
    loadSoonExpiringProducts(); 
    loadRecommendedRecipes();
});