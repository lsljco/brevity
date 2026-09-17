const SOURCE_NAME = 'FUEL WITH PURPOSE — Week 9.16.26'

const slug = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

function presentationMeal({ mealType, name, description, ingredients, image, serving = '1 plated serving', macros, nutritionNote = '' }) {
  return Object.freeze({
    id: `fuel-2026-09-16-${mealType}-${slug(name)}`,
    mealType,
    name,
    description,
    ingredients: Object.freeze(ingredients),
    instructions: Object.freeze([]),
    prepMinutes: 0,
    cookMinutes: 0,
    totalMinutes: 0,
    timingRecorded: false,
    image,
    serving,
    macros: Object.freeze(macros),
    nutritionBasis: `${SOURCE_NAME} presentation estimate. Preparation time, complete measured quantities, and recipe steps were not included in the source.${nutritionNote ? ` ${nutritionNote}` : ''}`,
    sourceName: SOURCE_NAME,
    tags: Object.freeze(['fuel-with-purpose', 'presentation-import']),
  })
}

const menuMeal = (mealType, name, description, ingredients, image, calories, proteinGrams, carbohydrateGrams, fatGrams, nutritionNote) => presentationMeal({
  mealType,
  name,
  description,
  ingredients,
  image,
  macros: { calories, proteinGrams, carbohydrateGrams, fatGrams },
  nutritionNote,
})

const MENU_MEALS = [
  menuMeal('breakfast', 'Pan-Seared Chicken Breast + Roasted Asparagus', 'Pan-seared chicken breast served with roasted asparagus.', ['Chicken breast — quantity not specified in presentation', 'Asparagus — quantity not specified in presentation'], '/meal-images/fuel-breakfast-chicken-asparagus.webp', 280, 42, 5, 9),
  menuMeal('lunch', 'Baked Salmon + Roasted Broccolini', 'Baked salmon served with roasted broccolini.', ['Salmon — quantity not specified in presentation', 'Broccolini — quantity not specified in presentation'], '/meal-images/fuel-lunch-salmon-broccolini.webp', 330, 44, 6, 18),
  menuMeal('dinner', 'Roast Beef Slices + Garden Salad', 'Roast beef slices with a garden salad dressed with olive oil.', ['Roast beef slices — quantity not specified in presentation', 'Garden salad vegetables — quantity not specified in presentation', 'Olive oil — quantity not specified in presentation'], '/meal-images/fuel-dinner-roast-beef-salad.webp', 340, 40, 9, 15),

  menuMeal('breakfast', 'Grilled Chicken Legs + Green Peas', 'Two skin-on grilled chicken legs served with green peas.', ['2 skin-on chicken legs', '1 cup green peas'], '/meal-images/fuel-breakfast-chicken-legs-peas.webp', 346, 37, 21, 12),
  menuMeal('lunch', 'Grilled Pork Chop + Broccolini', 'Grilled pork chop served with broccolini.', ['8 oz pork chop', '6 oz broccolini'], '/meal-images/fuel-lunch-pork-chop-broccolini.webp', 490, 71, 11, 17),
  menuMeal('dinner', 'Grilled Chicken Breast + Cooked Spinach', 'Grilled chicken breast served with cooked spinach.', ['9 oz chicken breast', '3/4 cup cooked spinach'], '/meal-images/fuel-dinner-chicken-spinach.webp', 449, 83, 5, 9),

  menuMeal('breakfast', 'Grilled NY Strip + Roasted Broccoli', 'Grilled New York strip steak served with roasted broccoli.', ['8 oz New York strip steak', '1 cup roasted broccoli'], '/meal-images/fuel-breakfast-ny-strip-broccoli.webp', 642, 64, 11, 42),
  menuMeal('lunch', 'Grilled Chicken Breast + Cooked Spinach', 'Grilled chicken breast served with cooked spinach.', ['9 oz chicken breast', '3/4 cup cooked spinach'], '/meal-images/fuel-lunch-chicken-spinach.webp', 449, 83, 5, 9),
  menuMeal('dinner', 'Grilled Ground Beef with Herbs + Green Beans', 'Herb-seasoned grilled ground beef served with green beans.', ['8 oz ground beef', 'Herbs — type and quantity not specified in presentation', '1 cup green beans'], '/meal-images/fuel-dinner-ground-beef-green-beans.webp', 456, 50, 10, 22),

  menuMeal('lunch', 'Grilled Chicken Thighs + Sautéed Turnip Greens', 'Grilled chicken thighs served with sautéed turnip greens.', ['Chicken thighs — quantity not specified in presentation', 'Turnip greens — quantity not specified in presentation'], '/meal-images/fuel-lunch-chicken-thighs-turnip-greens.webp', 365, 40, 5, 25),
  menuMeal('dinner', 'Grilled Steak + Steamed Green Beans', 'Grilled steak served with steamed green beans.', ['Steak — cut and quantity not specified in presentation', 'Green beans — quantity not specified in presentation'], '/meal-images/fuel-dinner-steak-green-beans.webp', 495, 46, 8, 33),

  menuMeal('breakfast', 'Lemon Garlic Chicken Breast + Roasted Asparagus', 'Lemon-garlic chicken breast served with roasted asparagus.', ['Chicken breast — quantity not specified in presentation', 'Lemon — quantity not specified in presentation', 'Garlic — quantity not specified in presentation', 'Asparagus — quantity not specified in presentation'], '/meal-images/fuel-breakfast-lemon-chicken-asparagus.webp', 280, 42, 5, 9),
  menuMeal('lunch', 'Herb-Roasted Salmon + Roasted Broccolini', 'Herb-roasted salmon served with roasted broccolini.', ['Salmon — quantity not specified in presentation', 'Herbs — type and quantity not specified in presentation', 'Broccolini — quantity not specified in presentation'], '/meal-images/fuel-lunch-herb-salmon-broccolini.webp', 330, 44, 6, 18),
  menuMeal('dinner', 'Smoky Pork Tenderloin + Garlic Green Beans', 'Smoky pork tenderloin served with garlic green beans.', ['Pork tenderloin — quantity not specified in presentation', 'Smoky seasoning — type and quantity not specified in presentation', 'Green beans — quantity not specified in presentation', 'Garlic — quantity not specified in presentation'], '/meal-images/fuel-dinner-pork-tenderloin-green-beans.webp', 320, 42, 7, 11),

  menuMeal('breakfast', 'Grilled Chicken Thighs + Sautéed Turnip Greens', 'Grilled chicken thighs served with sautéed turnip greens.', ['Chicken thighs — quantity not specified in presentation', 'Turnip greens — quantity not specified in presentation'], '/meal-images/fuel-breakfast-chicken-thighs-turnip-greens.webp', 395, 40, 5, 0, 'The breakfast fat value was omitted on the source slide and is stored as 0 pending confirmation.'),
  menuMeal('lunch', 'Pan-Seared Pork Chops + Steamed Green Peas', 'Pan-seared pork chops served with steamed green peas.', ['Pork chops — quantity not specified in presentation', 'Green peas — quantity not specified in presentation'], '/meal-images/fuel-lunch-pork-chops-peas.webp', 435, 40, 15, 27),
  menuMeal('dinner', 'Grilled Chicken Breast + Roasted Broccolini', 'Grilled chicken breast served with roasted broccolini.', ['Chicken breast — quantity not specified in presentation', 'Broccolini — quantity not specified in presentation'], '/meal-images/fuel-dinner-chicken-broccolini.webp', 581, 44, 8, 20),

  menuMeal('breakfast', 'Grilled Chicken Breast + Steamed Spinach', 'Grilled chicken breast served with steamed spinach.', ['Chicken breast — quantity not specified in presentation', 'Spinach — quantity not specified in presentation'], '/meal-images/fuel-breakfast-chicken-spinach.webp', 230, 40, 4, 6),
  menuMeal('lunch', 'Pan-Seared Salmon + Roasted Broccoli', 'Pan-seared salmon served with roasted broccoli.', ['Salmon — quantity not specified in presentation', 'Broccoli — quantity not specified in presentation'], '/meal-images/fuel-lunch-salmon-broccoli.webp', 320, 45, 4, 20),
  menuMeal('dinner', 'Grilled Steak + Sautéed Green Beans', 'Grilled steak served with sautéed green beans.', ['Steak — cut and quantity not specified in presentation', 'Green beans — quantity not specified in presentation'], '/meal-images/fuel-dinner-steak-sauteed-green-beans.webp', 310, 40, 8, 19),

  menuMeal('breakfast', 'Grilled Chicken Breast + Steamed Green Peas', 'Grilled chicken breast served with steamed green peas.', ['Chicken breast — quantity not specified in presentation', 'Green peas — quantity not specified in presentation'], '/meal-images/fuel-breakfast-chicken-peas.webp', 280, 41, 9, 8),
  menuMeal('lunch', 'Ground Beef + Roasted Broccolini and Fresh Salad', 'Ground beef served with roasted broccolini and a fresh salad.', ['Ground beef — quantity not specified in presentation', 'Broccolini — quantity not specified in presentation', 'Fresh salad vegetables — types and quantities not specified in presentation'], '/meal-images/fuel-lunch-ground-beef-broccolini-salad.webp', 410, 42, 14, 22),
  menuMeal('dinner', 'Roast Beef Slices + Steamed Asparagus', 'Roast beef slices served with steamed asparagus.', ['Roast beef slices — quantity not specified in presentation', 'Asparagus — quantity not specified in presentation'], '/meal-images/fuel-dinner-roast-beef-asparagus.webp', 370, 44, 7, 19),
]

const STANDBY_MEALS = ['lunch', 'dinner'].flatMap(mealType => [
  presentationMeal({
    mealType,
    name: 'Chicken Chipotle Bowl',
    description: 'A balanced chicken chipotle bowl presented as a standby meal.',
    ingredients: ['Grilled chicken', 'Grain base', 'Black beans', 'Corn', 'Tomato and onion salsa', 'Romaine lettuce', 'Avocado', 'Sautéed bell peppers and onions', 'Chipotle seasoning or sauce — exact formulation not recorded in presentation'],
    image: '/meal-images/fuel-standby-chicken-chipotle-bowl.webp',
    serving: '1 entire bowl',
    macros: { calories: 510, proteinGrams: 43, carbohydrateGrams: 54, fatGrams: 14 },
  }),
  presentationMeal({
    mealType,
    name: 'Lean Beef Spaghetti',
    description: 'Spaghetti with lean ground beef and rich marinara sauce, using whole-wheat or traditional pasta.',
    ingredients: ['Lean ground beef — quantity not specified in presentation', 'Marinara sauce — quantity not specified in presentation', 'Whole-wheat or traditional pasta — quantity not specified in presentation'],
    image: '/meal-images/fuel-standby-lean-beef-spaghetti.webp',
    serving: 'approximately 2 cups',
    macros: { calories: 620, proteinGrams: 42, carbohydrateGrams: 68, fatGrams: 18 },
  }),
])

export const FUEL_WITH_PURPOSE_MEALS = Object.freeze([...MENU_MEALS, ...STANDBY_MEALS])
