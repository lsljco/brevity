export const MEAL_TYPES = Object.freeze(['breakfast', 'lunch', 'dinner'])

const BREAKFASTS = [
  ['Spinach & Mushroom Eggs', 'Soft scrambled eggs with sautéed spinach and mushrooms.', 15],
  ['Greek Yogurt, Berries & Walnuts', 'Plain Greek yogurt with mixed berries and walnuts.', 5],
  ['Steel-Cut Oats & Blueberries', 'Steel-cut oats finished with blueberries and cinnamon.', 25],
  ['Smoked Salmon & Cucumber Plate', 'Smoked salmon with cucumber, tomato and lemon.', 8],
  ['Egg, Avocado & Tomato Bowl', 'Eggs with sliced avocado, tomato and black pepper.', 12],
  ['Spinach-Feta Omelet', 'Egg omelet filled with spinach, tomato and feta.', 15],
  ['Chicken & Sweet Potato Breakfast Bowl', 'Grilled chicken with roasted sweet potato and spinach.', 20],
  ['Cottage Cheese, Pineapple & Almonds', 'Cottage cheese with pineapple and sliced almonds.', 5],
  ['Chia Pudding & Mixed Berries', 'Chia pudding topped with strawberries and blueberries.', 5],
  ['Banana-Almond Oatmeal', 'Oatmeal with banana, almond butter and cinnamon.', 10],
  ['Shakshuka with Spinach', 'Eggs poached in tomato and pepper sauce with spinach.', 25],
  ['Smoked Trout & Tomato Plate', 'Smoked trout with tomato, cucumber and lemon.', 8],
  ['Quinoa, Egg & Spinach Bowl', 'Warm quinoa with egg, spinach and tomato.', 18],
  ['Berry-Kefir Smoothie', 'Kefir blended with berries, spinach and ice.', 5],
  ['Green Protein Smoothie', 'Protein, cucumber, spinach, green apple, lemon and ginger.', 6],
  ['Eggs, Cucumber & Tomato', 'Hard-boiled eggs with cucumber and tomato.', 10],
  ['Poached Eggs & Asparagus', 'Poached eggs with steamed asparagus and herbs.', 15],
  ['Scrambled Eggs & Kale', 'Scrambled eggs with sautéed kale and tomato.', 14],
  ['Baked Eggs & Bell Peppers', 'Eggs baked with bell peppers, onion and spinach.', 22],
  ['Ricotta, Berries & Pistachios', 'Ricotta topped with berries and pistachios.', 5],
  ['Apple-Cinnamon Overnight Oats', 'Overnight oats with apple, cinnamon and chia.', 5],
  ['Greek Yogurt, Peaches & Pecans', 'Plain Greek yogurt with peaches and pecans.', 5],
  ['Egg-White Broccoli-Feta Scramble', 'Egg whites scrambled with broccoli and feta.', 15],
  ['Salmon-Spinach Egg Bowl', 'Flaked salmon with egg, spinach and tomato.', 15],
  ['Tofu Scramble with Spinach & Peppers', 'Seasoned tofu with spinach, peppers and tomato.', 15],
  ['Grilled Chicken & Tomato Plate', 'Grilled chicken with tomato, cucumber and avocado.', 15],
  ['Tuna, Cucumber & Avocado Plate', 'Tuna with cucumber, avocado and lemon.', 8],
  ['Muesli, Yogurt & Berries', 'Unsweetened muesli with yogurt and fresh berries.', 5],
  ['Sweet Potato-Kale Egg Hash', 'Eggs with roasted sweet potato, kale and peppers.', 22],
  ['Tomato-Basil Egg Cups', 'Baked egg cups with tomato, spinach and basil.', 25],
]

const LUNCHES = [
  ['Lemon Chicken + Broccoli', 'Lemon-herb chicken breast with steamed broccoli.', 25],
  ['Salmon + Asparagus', 'Baked salmon with roasted asparagus.', 25],
  ['Turkey Cutlet + Green Beans', 'Pan-seared turkey cutlet with green beans.', 25],
  ['Lean Beef + Brussels Sprouts', 'Lean beef strips with roasted Brussels sprouts.', 25],
  ['Cod + Zucchini', 'Baked cod with garlic zucchini.', 22],
  ['Pork Tenderloin + Cabbage', 'Roasted pork tenderloin with braised cabbage.', 30],
  ['Garlic Shrimp + Spinach', 'Garlic shrimp with sautéed spinach.', 18],
  ['Tuna Steak + Cucumber-Tomato Salad', 'Seared tuna steak with cucumber and tomato.', 20],
  ['Chicken + Cauliflower', 'Herb chicken breast with roasted cauliflower.', 25],
  ['Ground Turkey + Bell Peppers', 'Lean ground turkey sautéed with bell peppers.', 20],
  ['Tilapia + Collard Greens', 'Baked tilapia with seasoned collard greens.', 25],
  ['Sirloin + Mushrooms', 'Lean sirloin with sautéed mushrooms and spinach.', 25],
  ['Chicken + Greek Cucumber Salad', 'Grilled chicken with cucumber, tomato and herbs.', 20],
  ['Salmon + Green Beans', 'Roasted salmon with garlic green beans.', 25],
  ['Turkey Meatballs + Zucchini', 'Herbed turkey meatballs with roasted zucchini.', 30],
  ['Pork Chop + Broccoli', 'Lean pork chop with steamed broccoli.', 25],
  ['Shrimp + Asparagus', 'Lemon shrimp with roasted asparagus.', 18],
  ['Chicken + Kale', 'Grilled chicken breast with sautéed kale.', 22],
  ['Cod + Spinach', 'Lemon cod with garlic spinach.', 20],
  ['Lean Beef Patty + Garden Salad', 'Lean beef patty with lettuce, cucumber and tomato.', 20],
  ['Chicken + Brussels Sprouts', 'Roasted chicken breast with Brussels sprouts.', 27],
  ['Salmon + Cauliflower', 'Baked salmon with roasted cauliflower.', 25],
  ['Turkey + Braised Cabbage', 'Herb turkey breast with braised cabbage.', 25],
  ['Steak + Asparagus', 'Lean steak with roasted asparagus.', 25],
  ['Mahi-Mahi + Zucchini', 'Grilled mahi-mahi with zucchini.', 22],
  ['Chicken + Green Beans', 'Garlic chicken breast with green beans.', 23],
  ['Shrimp + Broccoli', 'Sautéed shrimp with broccoli.', 18],
  ['Pork Tenderloin + Green Beans', 'Roasted pork tenderloin with green beans.', 30],
  ['Tuna + Spinach Salad', 'Tuna over spinach, cucumber and tomato.', 12],
  ['Chicken + Roasted Vegetables', 'Grilled chicken with zucchini, peppers and broccoli.', 28],
]

const DINNERS = [
  ['Rosemary Chicken + Carrots', 'Rosemary chicken breast with roasted carrots.', 30],
  ['Garlic Salmon + Broccoli', 'Garlic baked salmon with broccoli.', 25],
  ['Lean Beef + Green Beans', 'Lean beef strips with garlic green beans.', 25],
  ['Herb Turkey Cutlets + Asparagus', 'Herb turkey cutlets with roasted asparagus.', 25],
  ['Cod + Brussels Sprouts', 'Baked cod with roasted Brussels sprouts.', 25],
  ['Pork Tenderloin + Zucchini', 'Roasted pork tenderloin with zucchini.', 30],
  ['Shrimp + Cauliflower', 'Garlic shrimp with roasted cauliflower.', 20],
  ['Chicken + Sautéed Spinach', 'Grilled chicken breast with garlic spinach.', 22],
  ['Tilapia + Green Beans', 'Baked tilapia with seasoned green beans.', 24],
  ['Sirloin + Broccoli', 'Lean sirloin with steamed broccoli.', 25],
  ['Herbed Turkey Patty + Cabbage', 'Lean turkey patty with braised cabbage.', 25],
  ['Baked Chicken + Yellow Squash', 'Baked chicken breast with yellow squash.', 28],
  ['Salmon + Kale', 'Roasted salmon with sautéed kale.', 25],
  ['Lean Beef + Bell Peppers', 'Lean beef strips with sautéed bell peppers.', 22],
  ['Turkey Tenderloin + Carrots', 'Roasted turkey tenderloin with carrots.', 30],
  ['Grouper + Asparagus', 'Grilled grouper with asparagus.', 24],
  ['Chicken + Collard Greens', 'Herb chicken breast with collard greens.', 28],
  ['Pork Chop + Brussels Sprouts', 'Lean pork chop with roasted Brussels sprouts.', 28],
  ['Shrimp + Zucchini', 'Lemon shrimp with sautéed zucchini.', 18],
  ['Lamb Loin + Green Beans', 'Lean lamb loin with green beans.', 30],
  ['Turkey Patty + Cucumber Salad', 'Lean turkey patty with cucumber and tomato.', 22],
  ['Cod + Cauliflower', 'Lemon cod with roasted cauliflower.', 23],
  ['Chicken + Okra', 'Roasted chicken breast with seasoned okra.', 27],
  ['Salmon + Spinach', 'Baked salmon with garlic spinach.', 24],
  ['Lean Beef + Cabbage', 'Lean beef with sautéed cabbage.', 24],
  ['Turkey Meatballs + Broccoli', 'Herbed turkey meatballs with broccoli.', 30],
  ['Mahi-Mahi + Green Beans', 'Grilled mahi-mahi with green beans.', 24],
  ['Chicken + Asparagus', 'Lemon-herb chicken breast with asparagus.', 25],
  ['Pork Tenderloin + Carrots', 'Garlic pork tenderloin with roasted carrots.', 30],
  ['Shrimp + Mixed Vegetables', 'Sautéed shrimp with broccoli, peppers and zucchini.', 20],
]

const SOURCE = { breakfast: BREAKFASTS, lunch: LUNCHES, dinner: DINNERS }

function estimatedMacros(name, mealType) {
  const normalized = name.toLowerCase()
  if (mealType === 'breakfast') {
    if (/oat|muesli/.test(normalized)) return { calories: 360, proteinGrams: 13, carbohydrateGrams: 52, fatGrams: 12 }
    if (/smoothie/.test(normalized)) return { calories: 290, proteinGrams: 25, carbohydrateGrams: 34, fatGrams: 7 }
    if (/yogurt|cottage cheese|ricotta|chia/.test(normalized)) return { calories: 330, proteinGrams: 24, carbohydrateGrams: 30, fatGrams: 14 }
    if (/chicken|tuna/.test(normalized)) return { calories: 390, proteinGrams: 40, carbohydrateGrams: 18, fatGrams: 17 }
    if (/salmon|trout/.test(normalized)) return { calories: 370, proteinGrams: 32, carbohydrateGrams: 13, fatGrams: 21 }
    if (/egg-white/.test(normalized)) return { calories: 270, proteinGrams: 29, carbohydrateGrams: 12, fatGrams: 12 }
    if (/tofu/.test(normalized)) return { calories: 300, proteinGrams: 22, carbohydrateGrams: 18, fatGrams: 17 }
    if (/sweet potato|quinoa|shakshuka/.test(normalized)) return { calories: 360, proteinGrams: 24, carbohydrateGrams: 32, fatGrams: 16 }
    return { calories: 310, proteinGrams: 25, carbohydrateGrams: 12, fatGrams: 18 }
  }

  let macros = { calories: 390, proteinGrams: 43, carbohydrateGrams: 15, fatGrams: 17 }
  if (/salmon/.test(normalized)) macros = { calories: 430, proteinGrams: 39, carbohydrateGrams: 14, fatGrams: 25 }
  else if (/shrimp|cod|tilapia|mahi|grouper|tuna/.test(normalized)) macros = { calories: 340, proteinGrams: 42, carbohydrateGrams: 14, fatGrams: 12 }
  else if (/beef|sirloin|steak|lamb/.test(normalized)) macros = { calories: 460, proteinGrams: 43, carbohydrateGrams: 15, fatGrams: 25 }
  else if (/pork/.test(normalized)) macros = { calories: 420, proteinGrams: 44, carbohydrateGrams: 15, fatGrams: 20 }
  else if (/turkey/.test(normalized)) macros = { calories: 370, proteinGrams: 43, carbohydrateGrams: 15, fatGrams: 15 }
  if (/carrot|mixed vegetables|roasted vegetables|bell pepper/.test(normalized)) macros = { ...macros, calories: macros.calories + 35, carbohydrateGrams: macros.carbohydrateGrams + 9 }
  return macros
}

export const MEAL_LIBRARY = Object.freeze(MEAL_TYPES.flatMap(mealType => SOURCE[mealType].map(([name, description, prepMinutes], index) => Object.freeze({
  id: `${mealType}-${String(index + 1).padStart(2, '0')}`,
  mealType,
  name,
  description,
  prepMinutes,
  image: `/meal-images/${mealType}-${String(index + 1).padStart(2, '0')}.webp`,
  serving: '1 plated serving',
  macros: estimatedMacros(name, mealType),
  nutritionBasis: 'Estimated from standard portions; actual values vary by ingredients and preparation.',
  tags: mealType === 'breakfast' ? ['light-breakfast', 'no-heavy-breakfast'] : ['protein-and-vegetable', 'simple'],
}))))

export const MEALS_BY_ID = new Map(MEAL_LIBRARY.map(meal => [meal.id, meal]))

export function mealsForType(mealType) {
  return MEAL_LIBRARY.filter(meal => meal.mealType === mealType)
}
