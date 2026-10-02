# Estimation recipes

Recipes are configurable planning templates, not manufacturing BOMs. Admins manage them under Execution -> Materials -> Recipes. Each active component is a material variant or a labour/service/transport/other requirement, with a named quantity basis, decimal factor, optional waste and sort order. A material conversion records consumption per purchase unit and purchase increment; quantities round up only after conversion and waste.

Supported bases are fixed, quantity, finished_area, width, height, length, depth, volume and percentage. SQL validates the allowlist and decimal strings; arbitrary expressions and executable code are rejected. Recipe application is atomic and checks the current draft version. Duplicate application is rejected so users edit or remove existing lines deliberately.

Matching metadata suggests templates; manual selection records a reason. Applying a recipe snapshots its component rules, material labels and conversions. Subsequent master changes do not rewrite saved lines or approved history. Service rates live in a separate cost-protected table. Unknown costs block approval rather than becoming zero.

The repeatable seed includes an illustrative wardrobe recipe and seven material variants. Rates are demo assumptions, not supplier offers. No sheet nesting, optimization, stock deduction or site consumption is implemented.
