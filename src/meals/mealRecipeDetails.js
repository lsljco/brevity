const freezeRecipe=recipe=>Object.freeze({
  ...recipe,
  ingredients:Object.freeze(recipe.ingredients),
  instructions:Object.freeze(recipe.instructions),
  totalMinutes:recipe.prepMinutes+recipe.cookMinutes,
  timingRecorded:true,
})

const BREAKFAST_INGREDIENTS={
  'Spinach & Mushroom Eggs':['2 large eggs','1/2 cup liquid egg whites','1 cup baby spinach','1/2 cup sliced cremini mushrooms','1 teaspoon extra-virgin olive oil','1/8 teaspoon kosher salt','1/8 teaspoon black pepper'],
  'Greek Yogurt, Berries & Walnuts':['1 cup plain nonfat Greek yogurt','1/2 cup mixed berries','2 tablespoons chopped walnuts','1/4 teaspoon ground cinnamon'],
  'Steel-Cut Oats & Blueberries':['1/3 cup dry steel-cut oats','1 cup water','1/2 cup blueberries','1/2 teaspoon ground cinnamon','1 teaspoon honey, optional','Pinch of kosher salt'],
  'Smoked Salmon & Cucumber Plate':['4 ounces smoked salmon','1 cup sliced cucumber','1 medium tomato, sliced','1 lemon wedge','1 tablespoon chopped fresh dill','Black pepper to taste'],
  'Egg, Avocado & Tomato Bowl':['2 large eggs','1/2 cup liquid egg whites','1/2 medium avocado, sliced','1 medium tomato, chopped','1 teaspoon extra-virgin olive oil','Salt and black pepper to taste'],
  'Spinach-Feta Omelet':['2 large eggs','1/2 cup liquid egg whites','1 cup baby spinach','1/3 cup diced tomato','2 tablespoons crumbled feta','1 teaspoon extra-virgin olive oil','Black pepper to taste'],
  'Chicken & Sweet Potato Breakfast Bowl':['4 ounces cooked chicken breast, sliced','3/4 cup roasted sweet-potato cubes','1 cup baby spinach','1 teaspoon extra-virgin olive oil','1/4 teaspoon smoked paprika','Salt and black pepper to taste'],
  'Cottage Cheese, Pineapple & Almonds':['1 cup low-fat cottage cheese','1/2 cup pineapple chunks','2 tablespoons sliced almonds','Pinch of cinnamon'],
  'Chia Pudding & Mixed Berries':['3 tablespoons chia seeds','3/4 cup unsweetened almond milk','1/2 teaspoon vanilla extract','1/2 cup mixed berries','1 teaspoon honey, optional'],
  'Banana-Almond Oatmeal':['1/2 cup old-fashioned oats','1 cup water or unsweetened almond milk','1 small banana, sliced','1 tablespoon almond butter','1/2 teaspoon ground cinnamon','Pinch of kosher salt'],
  'Shakshuka with Spinach':['2 large eggs','3/4 cup crushed tomatoes','1 cup baby spinach','1/3 cup diced red bell pepper','2 tablespoons diced onion','1 teaspoon extra-virgin olive oil','1/4 teaspoon each cumin and smoked paprika','Salt and black pepper to taste'],
  'Smoked Trout & Tomato Plate':['4 ounces smoked trout','1 medium tomato, sliced','1 cup sliced cucumber','1 lemon wedge','1 tablespoon chopped parsley','Black pepper to taste'],
  'Quinoa, Egg & Spinach Bowl':['3/4 cup cooked quinoa','2 large eggs','1 cup baby spinach','1/2 cup chopped tomato','1 teaspoon extra-virgin olive oil','Salt and black pepper to taste'],
  'Berry-Kefir Smoothie':['1 cup plain low-fat kefir','1 cup frozen mixed berries','1 cup baby spinach','1/2 cup ice','1 tablespoon chia seeds'],
  'Green Protein Smoothie':['1 scoop vanilla protein powder','1 cup baby spinach','1/2 small cucumber, chopped','1/2 green apple, chopped','1 tablespoon lemon juice','1/2 teaspoon grated fresh ginger','1 cup cold water','1/2 cup ice'],
  'Eggs, Cucumber & Tomato':['2 large hard-boiled eggs','1 cup sliced cucumber','1 medium tomato, sliced','1 teaspoon extra-virgin olive oil','1 teaspoon lemon juice','Salt and black pepper to taste'],
  'Poached Eggs & Asparagus':['2 large eggs','8 asparagus spears, trimmed','1 teaspoon extra-virgin olive oil','1 teaspoon lemon juice','1 tablespoon chopped fresh herbs','Salt and black pepper to taste'],
  'Scrambled Eggs & Kale':['2 large eggs','1/2 cup liquid egg whites','1 cup chopped kale','1/2 cup chopped tomato','1 teaspoon extra-virgin olive oil','Salt and black pepper to taste'],
  'Baked Eggs & Bell Peppers':['2 large eggs','1/2 cup liquid egg whites','1/2 cup diced bell pepper','1/4 cup diced onion','1 cup baby spinach','1 teaspoon extra-virgin olive oil','Salt and black pepper to taste'],
  'Ricotta, Berries & Pistachios':['3/4 cup part-skim ricotta','1/2 cup mixed berries','2 tablespoons chopped pistachios','1/4 teaspoon ground cinnamon'],
  'Apple-Cinnamon Overnight Oats':['1/2 cup old-fashioned oats','1/2 cup plain Greek yogurt','1/2 cup unsweetened almond milk','1/2 apple, diced','1 tablespoon chia seeds','1/2 teaspoon ground cinnamon'],
  'Greek Yogurt, Peaches & Pecans':['1 cup plain nonfat Greek yogurt','1 medium peach, sliced','2 tablespoons chopped pecans','1/4 teaspoon ground cinnamon'],
  'Egg-White Broccoli-Feta Scramble':['1 cup liquid egg whites','3/4 cup finely chopped broccoli','2 tablespoons crumbled feta','1 teaspoon extra-virgin olive oil','Salt and black pepper to taste'],
  'Salmon-Spinach Egg Bowl':['3 ounces cooked salmon, flaked','1 large egg','1/2 cup liquid egg whites','1 cup baby spinach','1/2 cup chopped tomato','1 teaspoon extra-virgin olive oil','Black pepper to taste'],
  'Tofu Scramble with Spinach & Peppers':['6 ounces extra-firm tofu, drained and crumbled','1 cup baby spinach','1/2 cup diced bell pepper','1/2 cup chopped tomato','1 teaspoon extra-virgin olive oil','1/4 teaspoon turmeric','1/4 teaspoon garlic powder','Salt and black pepper to taste'],
  'Grilled Chicken & Tomato Plate':['4 ounces cooked chicken breast, sliced','1 medium tomato, sliced','1 cup sliced cucumber','1/2 medium avocado, sliced','1 teaspoon lemon juice','Salt and black pepper to taste'],
  'Tuna, Cucumber & Avocado Plate':['1 5-ounce can tuna in water, drained','1 cup sliced cucumber','1/2 medium avocado, sliced','1 tablespoon lemon juice','1 tablespoon chopped parsley','Salt and black pepper to taste'],
  'Muesli, Yogurt & Berries':['1/2 cup unsweetened muesli','3/4 cup plain Greek yogurt','1/2 cup fresh berries','2 tablespoons unsweetened almond milk'],
  'Sweet Potato-Kale Egg Hash':['2 large eggs','3/4 cup cooked sweet-potato cubes','1 cup chopped kale','1/3 cup diced bell pepper','1 teaspoon extra-virgin olive oil','1/4 teaspoon smoked paprika','Salt and black pepper to taste'],
  'Tomato-Basil Egg Cups':['2 large eggs','1/2 cup liquid egg whites','1/2 cup chopped tomato','1 cup chopped spinach','1 tablespoon chopped fresh basil','1 teaspoon extra-virgin olive oil','Salt and black pepper to taste'],
}

function breakfastRecipe(meal){
  const ingredients=BREAKFAST_INGREDIENTS[meal.name]
  if(!ingredients)return null
  if(/Smoothie/.test(meal.name))return freezeRecipe({ingredients,prepMinutes:6,cookMinutes:0,instructions:['Add the liquid to a blender first, followed by the remaining ingredients.','Blend on high until completely smooth, 45–60 seconds.','Add a splash of water for a thinner texture, then serve immediately.']})
  if(/Yogurt|Cottage Cheese|Ricotta|Muesli/.test(meal.name))return freezeRecipe({ingredients,prepMinutes:5,cookMinutes:0,instructions:['Spoon the dairy base into a serving bowl.','Arrange the fruit and nuts or muesli over the top.','Finish with cinnamon, if listed, and serve immediately.']})
  if(/Chia Pudding/.test(meal.name))return freezeRecipe({ingredients,prepMinutes:5,cookMinutes:0,instructions:['Whisk the chia seeds, almond milk, vanilla, and optional honey in a jar.','Rest 5 minutes, whisk again to prevent clumps, cover, and refrigerate at least 4 hours or overnight.','Stir, top with berries, and serve chilled.']})
  if(/Overnight Oats/.test(meal.name))return freezeRecipe({ingredients,prepMinutes:5,cookMinutes:0,instructions:['Combine oats, yogurt, almond milk, chia seeds, apple, and cinnamon in a covered jar.','Stir thoroughly and refrigerate at least 6 hours.','Stir again before serving; loosen with a splash of almond milk if needed.']})
  if(/Oats|Oatmeal/.test(meal.name))return freezeRecipe({ingredients,prepMinutes:3,cookMinutes:20,instructions:['Bring the liquid and salt to a gentle boil; stir in the oats.','Reduce heat and simmer, stirring occasionally, until tender and creamy.','Fold in the fruit and cinnamon; finish with the listed optional sweetener or nut butter.']})
  if(/Plate/.test(meal.name)||meal.name==='Eggs, Cucumber & Tomato')return freezeRecipe({ingredients,prepMinutes:8,cookMinutes:0,instructions:['Wash, dry, and slice the vegetables.','Arrange the protein and vegetables on a plate.','Finish with lemon, herbs, olive oil when listed, and black pepper; serve chilled or at room temperature.']})
  if(/Poached/.test(meal.name))return freezeRecipe({ingredients,prepMinutes:5,cookMinutes:10,instructions:['Steam the asparagus until crisp-tender and season with olive oil, lemon, salt, and pepper.','Bring a shallow pan of water to a bare simmer. Crack each egg into a cup, slide into the water, and poach 3–4 minutes.','Drain the eggs, place over the asparagus, and finish with fresh herbs.']})
  if(/Shakshuka/.test(meal.name))return freezeRecipe({ingredients,prepMinutes:7,cookMinutes:18,instructions:['Heat olive oil in a skillet; soften the onion and bell pepper for 4–5 minutes.','Add tomatoes, cumin, paprika, salt, and pepper; simmer until slightly thickened, then fold in spinach.','Make two wells, add the eggs, cover, and cook until the whites set and yolks reach the desired doneness.']})
  if(/Egg Cups/.test(meal.name)||/Baked Eggs/.test(meal.name))return freezeRecipe({ingredients,prepMinutes:8,cookMinutes:17,instructions:['Heat the oven to 375°F and lightly oil two large muffin wells or a small baking dish.','Whisk the eggs and egg whites with salt and pepper; fold in the vegetables and herbs.','Pour into the prepared vessel and bake until just set in the center, 15–17 minutes.','Rest 2 minutes before serving.']})
  if(/Chicken & Sweet Potato|Sweet Potato-Kale/.test(meal.name))return freezeRecipe({ingredients,prepMinutes:7,cookMinutes:15,instructions:['Heat olive oil in a skillet over medium heat and warm the cooked sweet potato until browned at the edges.','Add the greens and remaining vegetables; cook until tender.','Add the chicken or eggs as listed and cook until hot and fully set. Season and serve.']})
  return freezeRecipe({ingredients,prepMinutes:7,cookMinutes:8,instructions:['Heat olive oil in a nonstick skillet over medium heat; cook the firm vegetables until tender.','Add the leafy greens and cook just until wilted.','Whisk eggs and egg whites with salt and pepper, add to the skillet, and cook gently while folding until softly set.','Add cheese or cooked protein when listed, warm through, and serve immediately.']})
}

const proteinSpec=name=>{
  if(/shrimp/i.test(name))return ['6 ounces peeled, deveined shrimp','shrimp']
  if(/salmon/i.test(name))return ['6 ounces salmon fillet','salmon']
  if(/cod/i.test(name))return ['6 ounces cod fillet','cod']
  if(/tilapia/i.test(name))return ['6 ounces tilapia fillet','tilapia']
  if(/mahi/i.test(name))return ['6 ounces mahi-mahi fillet','mahi-mahi']
  if(/grouper/i.test(name))return ['6 ounces grouper fillet','grouper']
  if(/tuna steak/i.test(name))return ['6 ounces tuna steak','tuna']
  if(/tuna/i.test(name))return ['1 5-ounce can tuna in water, drained','tuna']
  if(/chicken legs/i.test(name))return ['2 small skin-on chicken legs','chicken']
  if(/chicken thigh/i.test(name))return ['6 ounces boneless, skinless chicken thighs','chicken']
  if(/chicken/i.test(name))return ['6 ounces boneless, skinless chicken breast','chicken']
  if(/turkey meatball/i.test(name))return ['6 ounces lean ground turkey','turkey']
  if(/ground turkey/i.test(name))return ['6 ounces 93% lean ground turkey','turkey']
  if(/turkey/i.test(name))return ['6 ounces turkey breast or tenderloin','turkey']
  if(/pork tenderloin/i.test(name))return ['6 ounces pork tenderloin','pork']
  if(/pork chop/i.test(name))return ['6-ounce center-cut pork chop','pork']
  if(/lamb/i.test(name))return ['6 ounces trimmed lamb loin','lamb']
  if(/ground beef/i.test(name))return ['6 ounces 90% lean ground beef','beef']
  if(/roast beef/i.test(name))return ['6 ounces thinly sliced lean roast beef','beef']
  if(/beef|sirloin|steak|strip/i.test(name))return ['6 ounces lean sirloin or strip steak','beef']
  return ['6 ounces lean protein','protein']
}

const vegetableSpec=name=>{
  if(/broccolini/i.test(name))return ['1 1/2 cups broccolini','broccolini']
  if(/broccoli/i.test(name))return ['1 1/2 cups broccoli florets','broccoli']
  if(/asparagus/i.test(name))return ['10 asparagus spears, trimmed','asparagus']
  if(/brussels/i.test(name))return ['1 1/2 cups halved Brussels sprouts','Brussels sprouts']
  if(/green beans/i.test(name))return ['1 1/2 cups trimmed green beans','green beans']
  if(/green peas/i.test(name))return ['1 cup green peas','green peas']
  if(/cauliflower/i.test(name))return ['1 1/2 cups cauliflower florets','cauliflower']
  if(/collard/i.test(name))return ['2 cups chopped collard greens','collard greens']
  if(/turnip/i.test(name))return ['2 cups chopped turnip greens','turnip greens']
  if(/spinach/i.test(name))return ['3 cups baby spinach','spinach']
  if(/kale/i.test(name))return ['2 cups chopped kale','kale']
  if(/cabbage/i.test(name))return ['2 cups thinly sliced cabbage','cabbage']
  if(/yellow squash/i.test(name))return ['1 1/2 cups sliced yellow squash','yellow squash']
  if(/zucchini/i.test(name))return ['1 1/2 cups sliced zucchini','zucchini']
  if(/okra/i.test(name))return ['1 1/2 cups sliced okra','okra']
  if(/carrot/i.test(name))return ['1 1/2 cups carrot batons','carrots']
  if(/bell pepper/i.test(name))return ['1 1/2 cups sliced bell peppers','bell peppers']
  if(/mushroom/i.test(name))return ['1 1/2 cups sliced mushrooms','mushrooms']
  if(/cucumber|garden salad|fresh salad|spinach salad/i.test(name))return ['2 cups mixed salad greens','salad greens']
  if(/mixed vegetables|roasted vegetables/i.test(name))return ['2 cups mixed broccoli, zucchini, and bell peppers','mixed vegetables']
  return ['1 1/2 cups seasonal vegetables','vegetables']
}

function proteinVegetableRecipe(meal){
  const [proteinAmount,protein]=proteinSpec(meal.name),[vegetableAmount,vegetable]=vegetableSpec(meal.name)
  const recipeText=`${meal.name} ${meal.description}`.toLowerCase()
  const isSalad=/salad/.test(recipeText),isSeafood=/shrimp|salmon|cod|tilapia|mahi|grouper|tuna/.test(recipeText),isGround=/ground|patty|meatball/.test(recipeText)
  const readyProtein=/^tuna \+|roast beef slices/.test(meal.name.toLowerCase())
  const safeTemperature=/chicken|turkey/.test(protein)?'165°F':isGround?'160°F':/pork|beef|lamb/.test(protein)?'145°F after resting':isSeafood?'145°F or opaque and easily flaked':'the safe temperature for the selected protein'
  const ingredients=[proteinAmount,vegetableAmount,'2 teaspoons extra-virgin olive oil','1 small garlic clove, minced','1/2 teaspoon kosher salt, divided','1/4 teaspoon black pepper','1/2 teaspoon dried herbs or salt-free seasoning blend','1 lemon wedge']
  if(isSalad)ingredients.splice(2,0,'1/2 cup sliced cucumber','1/2 cup chopped tomato')
  if(/meatball/.test(recipeText))ingredients.splice(1,0,'1 tablespoon whole-wheat breadcrumbs','1 tablespoon beaten egg')
  const proteinStep=readyProtein
    ? `The ${protein} is ready to serve; keep it chilled until the vegetables are prepared.`
    : /grill/.test(recipeText)
    ? `Heat a grill or grill pan to medium-high. Cook the ${protein} until marked, browned, and it reaches ${safeTemperature}.`
    : /baked|bake|roast/.test(recipeText)
      ? `Place the ${protein} on a lined sheet pan and roast at ${isSeafood?'400':'425'}°F until it reaches ${safeTemperature}.`
      : `Heat 1 teaspoon olive oil in a skillet over medium-high heat and cook the ${protein} until browned and it reaches ${safeTemperature}.`
  const vegetableStep=/steam/.test(recipeText)
    ? `Steam the ${vegetable} until crisp-tender, then season with garlic, the remaining olive oil, and salt.`
    : /brais/.test(recipeText)
      ? `Cook the ${vegetable} with garlic and 2 tablespoons water in a covered skillet until tender; uncover and cook off excess liquid.`
      : /roast/.test(recipeText)
        ? `Toss the ${vegetable} with the remaining olive oil, garlic, and salt; roast at 425°F until browned and tender.`
        : `Sauté the ${vegetable} with the remaining olive oil, garlic, and salt until tender-crisp.`
  const instructions=isSalad?[
    `Season the ${protein} with half the salt, pepper, and dried herbs.`,
    proteinStep,
    `Toss the ${vegetable}, cucumber, and tomato with the remaining olive oil, lemon, garlic, and salt.`,
    `Arrange the ${readyProtein?protein:`sliced ${protein}`} with the salad and serve.`,
  ]:[
    `Pat the ${protein} dry and season with half the salt, pepper, and dried herbs.${isGround?' Shape into a patty or meatballs when called for.':''}`,
    proteinStep,
    vegetableStep,
    `Rest the ${protein} for 3 minutes, plate with the ${vegetable}, and finish with lemon.`,
  ]
  return freezeRecipe({ingredients,prepMinutes:readyProtein?12:8,cookMinutes:readyProtein?0:Math.max(10,(meal.prepMinutes||25)-8),instructions})
}

function chipotleRecipe(){return freezeRecipe({prepMinutes:15,cookMinutes:20,ingredients:['5 ounces boneless, skinless chicken breast','1/2 cup cooked brown rice or quinoa','1/3 cup black beans, rinsed','1/4 cup corn','1/3 cup fresh tomato-onion salsa','1 cup chopped romaine','1/4 medium avocado, sliced','1/2 cup sliced bell peppers and onions','1 teaspoon extra-virgin olive oil','1 teaspoon chipotle seasoning'],instructions:['Season the chicken with chipotle seasoning and cook in a lightly oiled skillet until browned and safely cooked through; rest, then slice.','Sauté the peppers and onions until tender-crisp. Warm the rice, beans, and corn.','Layer romaine, rice, beans, corn, peppers, salsa, avocado, and sliced chicken in a bowl.','Serve immediately, keeping any additional sauce on the side.']})}
function spaghettiRecipe(){return freezeRecipe({prepMinutes:10,cookMinutes:25,ingredients:['5 ounces 90% lean ground beef','2 ounces dry whole-wheat spaghetti','3/4 cup no-added-sugar marinara sauce','1 teaspoon extra-virgin olive oil','1 small garlic clove, minced','1/2 teaspoon Italian seasoning','1 tablespoon grated Parmesan, optional','Salt and black pepper to taste'],instructions:['Cook spaghetti in salted water until al dente; reserve 1/4 cup pasta water, then drain.','Brown the beef in olive oil, breaking it into small pieces; drain excess fat if necessary.','Add garlic and Italian seasoning, then stir in marinara and simmer 8–10 minutes.','Toss with spaghetti, loosen with reserved pasta water as needed, and finish with optional Parmesan.']})}

export function completeMealRecipe(meal){
  const breakfast=meal.mealType==='breakfast'&&breakfastRecipe(meal)
  let recipe=breakfast||(meal.name==='Chicken Chipotle Bowl'?chipotleRecipe():meal.name==='Lean Beef Spaghetti'?spaghettiRecipe():proteinVegetableRecipe(meal))
  const measuredSourceIngredients=(meal.tags||[]).includes('fuel-with-purpose')?(meal.ingredients||[]).filter(ingredient=>!/not specified|not recorded/i.test(ingredient)):[]
  if(measuredSourceIngredients.length>=2&&!['Chicken Chipotle Bowl','Lean Beef Spaghetti'].includes(meal.name)){
    recipe=freezeRecipe({...recipe,ingredients:[...measuredSourceIngredients,...recipe.ingredients.slice(2)]})
  }
  return Object.freeze({...meal,...recipe,nutritionBasis:`${meal.nutritionBasis||'Estimated nutrition.'} Recipe quantities are Brevity-standardized for the displayed serving; adjust seasoning and verify doneness with a food thermometer.`})
}
