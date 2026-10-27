# Project concept imagery

Generated with the built-in image-generation tool. These are aspirational finished-result concepts, not photographs of the actual home or evidence that work is complete. Existing uploaded project photos take precedence. Generic title matching selects the relevant work imagery before the room fallback; no household records or personal names are embedded in the mapping.

Saved assets: `public/project-images/*.webp`. Re-encoded to WebP without changing the generated composition; original dimensions retained. Cards lazy-load and decode asynchronously.

## Shared prompt

Use case: photorealistic-natural. Asset: wide 3:2 editorial architectural photograph for a home maintenance project card. Match Brevity's established moody neutral luxury aesthetic: charcoal shadows, warm champagne highlights, walnut, cream, olive greenery, realistic stone and wood textures, refined timeless architecture, softly cinematic natural light. Show the aspirational finished result of the project, not a worksite. No people, text, logos, UI, borders or collage. Keep the distinguishing subject clear in the central horizontal band for a wide card crop.

## Subject prompts

- `painted-doors.webp`: Freshly painted elegant interior paneled doors, warm ivory satin paint, refined aged-brass lever, open door revealing a softly lit sophisticated hallway. Understated luxury, warm neutral stone and walnut, timeless architecture, cinematic natural light. No people, text, logos or collage.

- `door-seals.webp`: Close architectural detail of a beautifully fitted warm ivory paneled exterior door and its dark weatherstripping meeting a clean door jamb and stone threshold. Carefully aligned tight door seal is the main subject, with aged bronze hardware and softly blurred elegant entry beyond.
- `light-bulbs.webp`: A refined home lighting detail: warmly glowing clear LED filament bulbs in elegant aged-brass wall sconces and a softly blurred matching pendant, against cream stone walls and walnut. Bulbs clearly recognizable, inviting layered residential lighting.
- `bedroom-wall.webp`: A serene sophisticated primary bedroom focused on a pristine smooth warm taupe plaster-painted wall behind an upholstered cream headboard, walnut nightstand and champagne wall sconce. Natural grazing light reveals a flawless repaired wall surface.
- `entry-closet.webp`: An elegant open front-entry coat closet, freshly painted warm ivory walls with a single aged-brass coat rail, neatly hung neutral coats and walnut shelf. Clearly a practical narrow coat closet, not a pantry or bedroom. Beautiful clean wall finish.
- `grills.webp`: Two premium matte-black outdoor grills neatly arranged in a refined stone patio cooking area, with uncluttered limestone paving, walnut outdoor cabinetry and olive-green planting. Residential setting, realistic outdoor appliance forms, late-afternoon light.
- `chandelier.webp`: A large sculptural aged-bronze and clear-glass chandelier suspended above a refined walnut dining table, timeless luxury residence with cream stone walls. The chandelier is the unmistakable central hero, glowing champagne light and rich charcoal shadows.
- `kitchen-cabinets.webp`: A refined residential kitchen whose freshly painted deep charcoal shaker cabinets are the hero, beautifully smooth finish, aged-brass pulls, cream stone countertops, walnut island accents and restrained greenery. Wide straight-on composition emphasizing cabinet doors.
- `pantry.webp`: A beautifully built-out walk-in pantry, warm walnut shelving, cream painted cabinetry, stone counter, neatly arranged clear jars and woven baskets, subtle warm task lighting. Architectural editorial photograph, organized believable family pantry, no readable package labels.
- `bathroom-mirrors.webp`: Two generous framed aged-brass bathroom mirrors above a double walnut vanity, cream limestone walls and quiet champagne sconces. The pair of mirrors dominates the composition, realistic reflections of a refined bathroom, no impossible mirror geometry.
- `outdoor-lighting.webp`: A tidy weatherproof covered GFCI outlet on a warm stone exterior wall in the foreground, with softly glowing backyard path lights and refined landscaped garden beyond at blue hour. Outlet covered, no exposed wiring, realistic hardware; visual story is restored backyard lighting.
- `shower.webp`: An elegant fully repaired residential walk-in shower with clean travertine stone, frameless glass, dark bronze rain shower and perfectly finished joints. Warm natural light, minimal luxurious bathroom, no people, clear shower as central subject.
- `trees.webp`: Freshly planted young ornamental trees in a refined residential garden, neat circular mulch beds and healthy olive-green leaves, rich lawn, stone edging and sophisticated cream house softly in background. Healthy established planting, no buckets or tools, golden-hour natural light.
- `garage-exterior.webp`: A refined cream-painted house garage facade, focusing on freshly finished wall and trim directly above dark charcoal garage doors. Warm stone driveway, understated luxury residential architecture, soft afternoon light, no cars.
- `windows.webp`: Pristine clean exterior black-framed windows on a refined cream and stone house, crisp transparent glass reflecting olive-green trees, clean corners and trim. Window washing finished result, close architectural composition, no cobwebs or tools.
- `banisters.webp`: Beautiful freshly painted charcoal exterior banisters and handrails framing warm stone porch steps, with cream facade and restrained greenery. Rails are the central subject, flawless durable finish and realistic joinery, raking late-afternoon light.
- `drainage.webp`: A professionally restored residential drainage ditch shaped as a tasteful shallow stone-lined swale along a landscaped lawn, clear tidy water channel and carefully fitted edging, olive-green plants and a refined cream house in the distance. Beautiful practical drainage landscaping, no construction machinery.
- `brick-exterior.webp`: A refined residential facade with freshly painted warm ivory brick walls, subtle real brick texture, charcoal-framed windows and walnut front door. Wall finish is the hero, soft afternoon shadows and understated olive-green landscaping.

## Layout correction

The project scheduling dialog explicitly centers itself and sizes its checkbox independently of the global form input styles.

## Automatic imagery for new projects

New projects opt into automatic imagery when their reviewed creation is saved. The save receipt starts generation without awaiting it; opening Projects also resumes unfinished jobs. Existing projects retain their curated imagery. The title, project type, room and notes guide a finished-result concept in the shared aesthetic. Costs, contact details and responsibility assignments are excluded from the prompt.

The image uses the same OpenAI image model and credentials as meals (`BREVITY_IMAGE_MODEL`, `OPENAI_API_KEY`). Authenticated queue and background endpoints keep rendering out of the project save request. Conditional job claims prevent duplicate generation, while source hashes reject stale results after edits, uploaded photos, deletion or Undo. Images and jobs are separate from canonical project records, preserving action versions and Undo. Images require a signed-in household session.

Cards show generation progress and a Retry image button on failure. Scheduling remains available throughout. Uploaded project photos take precedence. Generated images illustrate the intended result; they do not establish that work is complete.
