const face = `<circle cx="38" cy="54" r="5" fill="#2a1d05"/><circle cx="62" cy="54" r="5" fill="#2a1d05"/><path d="M40 66q10 10 20 0" stroke="#2a1d05" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="29" cy="64" r="4" fill="#ff8a8a" opacity=".6"/><circle cx="71" cy="64" r="4" fill="#ff8a8a" opacity=".6"/>`;
export const toon = {
  tomato: `<svg viewBox="0 0 100 100"><circle cx="50" cy="56" r="38" fill="#ff5a47"/><path d="M50 22c-6 8-16 8-24 5 8 1 15 7 24 3 9 4 16-2 24-3-8 3-18 3-24-5z" fill="#3fae6a"/>${face}</svg>`,
  lemon: `<svg viewBox="0 0 100 100"><ellipse cx="50" cy="55" rx="40" ry="33" fill="#ffd84d"/><path d="M8 55l-6-3M92 55l6-3" stroke="#e8b923" stroke-width="6" stroke-linecap="round"/><path d="M66 22c8-6 16-4 20 2-8 2-14 2-20-2z" fill="#3fae6a"/>${face}</svg>`,
  avocado: `<svg viewBox="0 0 100 100"><path d="M50 6c18 0 34 30 34 56 0 18-14 32-34 32S16 80 16 62C16 36 32 6 50 6z" fill="#4c9a52"/><path d="M50 16c14 0 26 26 26 46 0 14-11 24-26 24S24 76 24 62c0-20 12-46 26-46z" fill="#c8e68a"/><circle cx="50" cy="68" r="12" fill="#9a6a3c"/><circle cx="43" cy="44" r="4" fill="#2a1d05"/><circle cx="57" cy="44" r="4" fill="#2a1d05"/><path d="M44 54q6 6 12 0" stroke="#2a1d05" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`,
  pot: `<svg viewBox="0 0 100 100"><path d="M34 14q-6 8 0 14M50 10q-6 8 0 14M66 14q-6 8 0 14" stroke="#fff" stroke-opacity=".6" stroke-width="3" fill="none" stroke-linecap="round"/><rect x="14" y="34" width="72" height="12" rx="6" fill="#8d94a8"/><rect x="18" y="46" width="64" height="44" rx="14" fill="#aeb5c8"/><rect x="4" y="54" width="14" height="8" rx="4" fill="#8d94a8"/><rect x="82" y="54" width="14" height="8" rx="4" fill="#8d94a8"/>${face.replace(/cy="54"/g, 'cy="62"').replace("M40 66q10 10 20 0", "M42 74q8 8 16 0")}</svg>`
};
const t = (k, c = "") => `<div class="toon ${c}" aria-hidden="true">${toon[k]}</div>`;

const row = (flip, title, text, mock, toonKey) => `<section class="feat ${flip ? "flip" : ""}"><div class="copy"><h2>${title}</h2><p>${text}</p></div><div class="vis">${mock}${t(toonKey, "mini")}</div></section>`;

export const footer = () => `<div class="foot glass"><div><a class="logo" href="#/">Recolio</a><p>Your recipes, all in one place.</p></div>
<nav aria-label="Footer"><a href="#/features">Features</a><a href="#/about">About &amp; FAQ</a><a href="#/login">Sign in</a><a href="#/add">Add a recipe</a></nav></div>`;

const faq = `<div class="faq">${[
  ["Is Recolio free?", "Yes. Creating an account and saving recipes costs nothing."],
  ["Who can see my recipes?", "Only you. Each account's recipes are private and tied to your Google sign-in."],
  ["Does link import work on every site?", "It works on most sites that publish structured recipe data. If a page doesn't, Recolio fills in the title and photo and you add the rest."],
  ["Can I use handwritten recipe cards?", "Yes. Upload a photo and Recolio reads the text. Clear, well-lit printed text works best; handwriting may need some cleanup."],
  ["Can I take my recipes with me?", "Yes. Settings has an export button that downloads everything as a file."]
].map(([q, a]) => `<details class="glass"><summary>${q}</summary><p>${a}</p></details>`).join("")}</div>`;

export function home(user) {
  const go = user ? "#/add" : "#/login";
  return `
<section class="hero">
  <div class="copy"><h1>Every recipe you've loved, in one place.</h1>
    <p class="lead">Save a recipe from any website, snap a photo of a handwritten card, or type it in. Recolio keeps them all searchable and ready the moment you start cooking.</p>
    <div class="row"><a class="btn main big" href="${go}">${user ? "Add a recipe" : "Start your collection"}</a><a class="btn big" href="#/features">See what it does</a></div></div>
  <div class="scene">${t("tomato", "a")}${t("lemon", "b")}${t("pot", "c")}${t("avocado", "d")}
    <div class="win glass"><div class="dots"><i></i><i></i><i></i></div><h3>Weeknight green curry</h3><p class="meta">25 min · 4 servings</p>
    <ul><li>1 can coconut milk</li><li>2 tbsp green curry paste</li><li>1 cup snap peas</li></ul><span class="pill">★ Favorite</span></div></div>
</section>

<div class="strip glass"><span>Blogs</span><span>Magazines</span><span>Cookbooks</span><span>Grandma's cards</span><span>Screenshots</span><span>Your own ideas</span></div>

${row(0, "Paste a link, get a recipe.", "Found something delicious online? Drop the link into Recolio and it pulls in the title, ingredients, steps and photo. No more bookmarks you can never find again.",
  `<div class="mock glass"><div class="url">https://your-favorite-recipe-site.com/pasta</div><button class="btn main" tabindex="-1">Import</button><p class="meta">Creamy lemon pasta<br>8 ingredients · 6 steps · 25 min</p></div>`, "lemon")}
${row(1, "Scan the cards in your drawer.", "Take a photo of a cookbook page or a faded family recipe card. Recolio reads the text so you can tidy it up and keep it forever.",
  `<div class="mock paper"><b>Nonna's lemon bars</b><br>2 cups flour · 1 cup butter<br>4 eggs · 3 lemons<br>Bake 350° for 25 min</div>`, "avocado")}
${row(0, "Find dinner in seconds.", "Search by name, ingredient or tag, star your favorites, and group recipes into collections like weeknight, baking or holiday.",
  `<div class="mock glass"><div class="url">chicken</div><div class="row"><span class="pill">Weeknight</span><span class="pill">Baking</span><span class="pill">Holiday</span></div><p class="meta">3 recipes match</p></div>`, "tomato")}
${row(1, "Turn recipes into a shopping list.", "Pick the recipes you're cooking this week and Recolio combines the ingredients into one checklist you can use at the store.",
  `<div class="mock glass"><label class="chk"><input type="checkbox" checked> Lemons</label><label class="chk"><input type="checkbox"> Butter</label><label class="chk"><input type="checkbox"> Spaghetti</label></div>`, "pot")}

<section class="steps"><h2>Up and running in three steps</h2>
  <div class="grid3"><div class="glass"><b class="n">1</b><h3>Sign in</h3><p>Continue with Google. No new password to remember.</p></div>
  <div class="glass"><b class="n">2</b><h3>Add recipes</h3><p>Import a link, scan a card, or type one in.</p></div>
  <div class="glass"><b class="n">3</b><h3>Cook</h3><p>Open any recipe, check the ingredients, and follow the steps.</p></div></div></section>

<section class="steps"><h2>Made for real kitchens</h2>
  <div class="grid3">${[["🔒", "Private by default", "Only you can see your recipes."], ["📱", "Works on your phone", "Open a recipe on the counter or at the store."], ["⭐", "Favorites", "Keep the keepers one tap away."], ["🏷️", "Tags and collections", "Sort recipes your way."], ["🧾", "Notes", "Remember what you'd change next time."], ["⬇️", "Export anytime", "Your recipes are yours to take."]].map(([e, h, p]) => `<div class="glass"><span class="emoji">${e}</span><h3>${h}</h3><p>${p}</p></div>`).join("")}</div></section>

<section class="steps"><h2>Questions, answered</h2>${faq}</section>

<section class="cta glass">${t("tomato", "l")}${t("lemon", "r")}<h2>Your next favorite recipe is waiting.</h2><p>Start saving the ones you love. It takes under a minute.</p><a class="btn main big" href="${go}">${user ? "Add a recipe" : "Get started free"}</a></section>`;
}

export const features = () => `<h1 class="pg">Features</h1><p class="lead">Everything Recolio does to keep your recipes organized.</p>
<div class="grid3">${[["🔗", "Link import", "Pull a recipe from a web page into your collection."], ["📷", "Photo scan", "Read text from recipe cards and cookbook pages."], ["🔍", "Search", "Find recipes by name, ingredient or tag."], ["★", "Favorites", "Pin the recipes you make again and again."], ["🗂️", "Collections", "See recipes grouped by tag."], ["🛒", "Shopping list", "Combine ingredients from several recipes."], ["✏️", "Editing", "Fix amounts and add notes any time."], ["⬇️", "Export", "Download all your recipes as a file."], ["🔒", "Private", "Your recipes are visible only to you."]].map(([e, h, p]) => `<div class="glass panel"><span class="emoji">${e}</span><h3>${h}</h3><p>${p}</p></div>`).join("")}</div>
<div class="row" style="margin-top:36px"><a class="btn main big" href="#/login">Get started free</a></div>`;

export const about = () => `<h1 class="pg">About Recolio</h1><div class="story">${t("pot", "mini")}<p class="lead">Recolio started with a simple problem: loving to cook, but never being able to find the recipe you loved. They were scattered across bookmarks, screenshots and scraps of paper.</p><p>So we made one calm, good-looking place for all of them. Save a recipe from anywhere, find it in seconds, and get back to the stove.</p></div><h2>Questions, answered</h2>${faq}`;