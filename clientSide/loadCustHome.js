async function loadSoonExpiringProducts() {
    info = await fetch('/loadSoonExpiringProducts');
    
}
async function loadRecommendedRecipes() {

}

document.addEventListener('DOMContentLoaded', function() {
    loadSoonExpiringProducts();
    loadRecommendedRecipes
});