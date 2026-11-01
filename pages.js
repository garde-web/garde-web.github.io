const row = (flip, title, text, mock) => `<section class="feat ${flip ? "flip" : ""}"><div class="copy"><h2>${title}</h2><p>${text}</p></div><div class="vis">${mock}</div></section>`;

export const footer = () => `<div class="foot glass"><div><a class="logo" href="#/">Garde</a><p>Your recipes, all in one place.</p></div>
<nav aria-label="Footer"><a href="#/features">Features</a><a href="#/reserve">Garde Reserve</a><a href="#/support">Support</a><a href="#/about">About &amp; FAQ</a><a href="#/login">Sign in</a><a href="#/add">Add a recipe</a></nav></div>`;

const faq = `<div class="faq">${[
  ["Is Garde free?", "Yes. Free accounts can save up to 50 recipes. Garde Reserve ($9.99/month) removes the limit and adds the Sous meal planner and priority support."],
  ["Who can see my recipes?", "Only you. Each account's recipes are private and tied to your Google sign-in."],
  ["Does link import work on every site?", "It works on most sites that publish structured recipe data. If a page doesn't, Garde fills in the title and photo and you add the rest."],
  ["Can I use handwritten recipe cards?", "Yes. Upload a photo and Garde reads the text. Clear, well-lit printed text works best; handwriting may need some cleanup."],
  ["How do I get help?", "Open a ticket from the Support page. A member of the Garde team will reply right in your ticket."],
  ["Can I take my recipes with me?", "Yes. Settings has an export button that downloads everything as a file."]
].map(([q, a]) => `<details class="glass"><summary>${q}</summary><p>${a}</p></details>`).join("")}</div>`;

export function home(user) {
  const go = user ? "#/add" : "#/login";
  return `
<section class="hero">
  <div class="copy"><h1>Every recipe you've loved, in one place.</h1>
    <p class="lead">Save a recipe from any website, snap a photo of a handwritten card, or type it in. Garde keeps them all searchable and ready the moment you start cooking.</p>
    <div class="row"><a class="btn main big" href="${go}">${user ? "Add a recipe" : "Start your collection"}</a><a class="btn big" href="#/features">See what it does</a></div></div>
  <div class="scene">
    <div class="win glass"><div class="dots"><i></i><i></i><i></i></div><h3>Weeknight green curry</h3><p class="meta">25 min · 4 servings</p>
    <ul><li>1 can coconut milk</li><li>2 tbsp green curry paste</li><li>1 cup snap peas</li></ul><span class="pill">★ Favorite</span></div>
    <div class="win w2 glass"><b>Pantry</b><div class="aisle">Produce</div><p>3 lemons · 5 cloves garlic</p><div class="aisle">Dairy &amp; eggs</div><p>4 tbsp butter</p></div></div>
</section>

<div class="strip glass"><span>Blogs</span><span>Magazines</span><span>Cookbooks</span><span>Grandma's cards</span><span>Screenshots</span><span>Your own ideas</span></div>

${row(0, "Paste a link, get a recipe.", "Found something delicious online? Drop the link into Garde and it pulls in the title, ingredients, steps and photo. No more bookmarks you can never find again.",
  `<div class="mock glass"><div class="url">https://your-favorite-recipe-site.com/pasta</div><button class="btn main" tabindex="-1">Import</button><p class="meta">Creamy lemon pasta<br>8 ingredients · 6 steps · 25 min</p></div>`)}
${row(1, "Scan the cards in your drawer.", "Take a photo of a cookbook page or a faded family recipe card. Garde reads the text so you can tidy it up and keep it forever.",
  `<div class="mock paper"><b>Nonna's lemon bars</b><br>2 cups flour · 1 cup butter<br>4 eggs · 3 lemons<br>Bake 350° for 25 min</div>`)}
${row(0, "Find dinner in seconds.", "Search by name, ingredient or tag, star your favorites, and group recipes into collections like weeknight, baking or holiday.",
  `<div class="mock glass"><div class="url">chicken</div><div class="row"><span class="pill">Weeknight</span><span class="pill">Baking</span><span class="pill">Holiday</span></div><p class="meta">3 recipes match</p></div>`)}
${row(1, "Cooking for more? Scale any recipe.", "Change the servings and every ingredient adjusts, in the recipe and in your Pantry. A cookie recipe for 2 becomes a recipe for 6 with one tap.", `<div class="mock glass"><div class="row" style="justify-content:space-between"><b>Brown butter cookies</b><span class="step"><button tabindex="-1">−</button><b>6</b><button tabindex="-1">+</button></span></div><p class="meta">1½ cups flour<br>¾ cup butter<br>3 eggs</p></div>`)}
${row(0, "A shopping list that follows the store.", "Pick the recipes you're cooking this week and Garde combines everything into one Pantry list, sorted by produce, dairy, pantry staples and more.", `<div class="mock glass"><div class="aisle">Produce</div><label class="chk"><input type="checkbox" checked> 3 lemons</label><label class="chk"><input type="checkbox"> 5 cloves garlic</label><div class="aisle">Dairy &amp; eggs</div><label class="chk"><input type="checkbox"> 4 tbsp butter</label></div>`)}

<section class="steps"><h2>Up and running in three steps</h2>
  <div class="grid3"><div class="glass"><b class="n">1</b><h3>Sign in</h3><p>Continue with Google. No new password to remember.</p></div>
  <div class="glass"><b class="n">2</b><h3>Add recipes</h3><p>Import a link, scan a card, or type one in.</p></div>
  <div class="glass"><b class="n">3</b><h3>Cook</h3><p>Open any recipe, check the ingredients, and follow the steps.</p></div></div></section>

<section class="steps"><h2>Made for real kitchens</h2>
  <div class="grid3">${[["", "Private by default", "Only you can see your recipes."], ["", "Works on your phone", "Open a recipe on the counter or at the store."], ["", "Favorites", "Keep the keepers one tap away."], ["", "Tags and collections", "Sort recipes your way."], ["", "Notes", "Remember what you'd change next time."], ["", "Export anytime", "Your recipes are yours to take."]].map(([e, h, p]) => `<div class="glass"><i class="mark"></i><h3>${h}</h3><p>${p}</p></div>`).join("")}</div></section>

<section class="band"><div><h2>Garde Reserve</h2><p class="lead" style="color:#bdbdbd">For people who cook a lot. Unlimited recipes, the Sous meal planner and priority support, for $9.99 a month.</p><div class="row"><a class="btn main big" href="#/reserve">Learn more</a></div></div>
  <ul><li>Unlimited saved recipes</li><li>Sous meal planner</li><li>Priority support, answered first</li><li>Reserve badge on your account</li></ul></section>

<section class="steps"><h2>Questions, answered</h2>${faq}</section>

<section class="cta glass"><h2>Your next favorite recipe is waiting.</h2><p>Start saving the ones you love. It takes under a minute.</p><a class="btn main big" href="${go}">${user ? "Add a recipe" : "Get started free"}</a></section>`;
}

export const features = () => `<h1 class="pg">Features</h1><p class="lead">Everything Garde does to keep your recipes organized.</p>
<div class="grid3">${[["", "Link import", "Pull a recipe from a web page into your collection."], ["", "Photo scan", "Read text from recipe cards and cookbook pages."], ["", "Search", "Find recipes by name, ingredient or tag."], ["", "Favorites", "Pin the recipes you make again and again."], ["", "Collections", "See recipes grouped by tag."], ["", "Pantry", "One shopping list, combined, scaled and sorted by aisle."], ["", "Scale servings", "Change servings and every amount adapts."], ["", "Editing", "Fix amounts and add notes any time."], ["", "Export", "Download all your recipes as a file."], ["", "Private", "Your recipes are visible only to you."], ["", "Support tickets", "Ask for help and follow the reply in one place."], ["", "Garde Reserve", "Unlimited recipes, the Sous meal planner and priority support."]].map(([e, h, p]) => `<div class="glass panel"><i class="mark"></i><h3>${h}</h3><p>${p}</p></div>`).join("")}</div>
<div class="row" style="margin-top:36px"><a class="btn main big" href="#/login">Get started free</a></div>`;

export const about = () => `<h1 class="pg">About Garde</h1><div class="story"><p class="lead">Garde started with a simple problem: loving to cook, but never being able to find the recipe you loved. They were scattered across bookmarks, screenshots and scraps of paper.</p><p>The name comes from garde manger, the kitchen station that keeps and prepares the pantry for everyone else. That is the idea here: one calm, good-looking place for all of them. Save a recipe from anywhere, find it in seconds, and get back to the stove.</p></div><h2>Questions, answered</h2>${faq}`;
