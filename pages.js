const row = (flip, title, text, mock) => `<section class="feat ${flip ? "flip" : ""}"><div class="copy"><h2>${title}</h2><p>${text}</p></div><div class="vis">${mock}</div></section>`;

export const footer = () => `<div class="foot glass"><div><a class="logo" href="#/">Garde</a><p>Your recipes, all in one place.</p></div>
<nav aria-label="Footer"><a href="#/features">Features</a><a href="#/reserve">Garde Reserve</a><a href="#/support">Support</a><a href="#/about">About &amp; FAQ</a><a href="#/login">Sign in</a><a href="#/add">Add a recipe</a></nav></div>`;

export const FAQ = [
  ["Is Garde free?", "Yes. Free accounts can save up to 50 recipes. Garde Reserve ($9.99/month) removes the limit and adds the Sous meal planner and priority support."],
  ["Who can see my recipes?", "Only you. Each account's recipes are private and tied to your Google sign-in."],
  ["Does link import work on every site?", "It works on most sites. For the few that block automatic import, the Save to Garde bookmarklet on the Add page grabs the recipe straight from your browser."],
  ["How does the Pantry work?", "Pick recipes, set how many servings you want, and Garde combines and scales every ingredient into one shopping list sorted by aisle."],
  ["What is Sous?", "Sous is the weekly meal planner in Garde Reserve. Plan breakfast, lunch and dinner for the week, and the ingredients flow into your Pantry."],
  ["Can I use handwritten recipe cards?", "Yes. Upload a photo and Garde reads the text. Clear, well-lit printed text works best; handwriting may need some cleanup."],
  ["How do I get help?", "Open a ticket from the Support page. A member of the Garde team will reply right in your ticket."],
  ["Can I take my recipes with me?", "Yes. Settings has an export button that downloads everything as a file."]
];
const faq = `<div class="faq">${FAQ.map(([q, a]) => `<details class="glass"><summary>${q}</summary><p>${a}</p></details>`).join("")}</div>`;

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

export const about = () => `
<section class="mission"><span class="eyebrow">Our mission</span>
  <h1 class="big">Keep every recipe you love. <em>Cook it without the hunt.</em></h1>
  <p class="lead">Garde exists so the dish you made once and never forgot is always one tap away, wherever you found it.</p></section>

<section class="aboutblock"><h2>Where we started</h2>
  <div class="timeline">
    <div class="tl"><b>October 29, 2026</b><h3>A problem in the kitchen</h3><p>Jonny loves to cook, and he could never find the recipes he loved. They were scattered across bookmarks, screenshots, blog posts and scraps of paper. So he started building one calm place for all of them.</p></div>
    <div class="tl"><b>October 2026</b><h3>The first version</h3><p>The first build could save a recipe from a link or a photo of a recipe card and keep it in one place. It was called Recolio, then Commis, until the name finally clicked.</p></div>
    <div class="tl"><b>November 2026</b><h3>Garde</h3><p>The name comes from garde manger, the kitchen station that keeps and prepares the pantry for everyone else. Around it grew the Pantry shopping list, Sous weekly planning, Garde Reserve and a support team.</p></div>
  </div></section>

<section class="aboutblock"><h2>Why we build it</h2>
  <div class="grid3"><div class="glass"><i class="mark"></i><h3>Your recipes are yours</h3><p>They're private to you, and you can export all of them whenever you like.</p></div>
  <div class="glass"><i class="mark"></i><h3>Fast beats fancy</h3><p>Saving a recipe should take seconds, not an evening of copying and pasting.</p></div>
  <div class="glass"><i class="mark"></i><h3>Cooking should feel calm</h3><p>No story to scroll past, no ads between the steps. Just the ingredients and what to do.</p></div></div></section>

<section class="aboutblock me"><figure><img src="img/jonny.jpg" alt="A person standing on a quiet street at dusk, looking up at an orange and pink sunset sky" loading="lazy"><figcaption>Golden hour, somewhere on my street.</figcaption></figure>
  <div><span class="eyebrow">About me</span><h2>Hi, I'm Jonny.</h2>
  <p class="lead">I'm the person behind Garde. I love cooking, and I love building things for the web.</p>
  <p>Garde started as a fix for my own problem: I'd make something great, forget where I found it, and spend an hour looking for it. I wanted a place that felt as good to open as the meal felt to eat.</p>
  <p>I design and build every part of it myself, from the Pantry list to the support desk. If something's confusing or broken, open a ticket and it comes straight to me and the team.</p>
  <div class="row"><a class="btn main" href="#/support">Say hello</a><a class="btn" href="#/features">See what Garde does</a></div></div></section>

<section class="steps"><h2>Questions, answered</h2>${faq}</section>`;
