# Factorio Calc

Production calculator for Factorio 2.0, with Vanilla and Space Age data modes.

## Run
Requires Node.js 22.13 or newer (no external packages needed).

    node build_db.mjs
    node server.mjs

Then open http://localhost:3000. Choose Vanilla or Space Age with the switch in the top right. The mode choice is saved in the URL hash and local storage.

## Included data

| Mode | Data source | Database | Status |
|---|---|---|---|
| Vanilla | `data/factorio-2.0.json` | `calc-vanilla.db` | included |
| Space Age | `data/factorio-2.0-space-age.json` | `calc-space-age.db` | integrated |

The Space Age set is FactorioLab data for Factorio 2.0.77 (base, Space Age, Quality, Elevated Rails). The database contains 578 items, 902 recipes, 28 producers, and 275 technologies. Source attribution and MIT license are in `data/FACTORIOLAB-LICENSE.txt`.

Space Age adds source-preservation tables to the calculator schema for full item/recipe records, dataset metadata, locations, and icon atlas coordinates. The original sprite atlas is in `public/Graphics/Icons/space-age-icons.webp`; the UI uses it when an individual PNG is missing. Vanilla PNG icons remain as before.

## Pages

- **Calculator** — inventory tabs and production tree.
- **Production technology** — technology costs, effects, prerequisites, downstream technologies, and recipe unlocks.

## Machine selection

The calculator toolbar provides global assembler and furnace defaults. The Technologies toolbar provides a global research lab default. When a recipe or technology supports more than one producer, its production-tree row, Machines table, or technology detail has a local selector. Choosing “Global default” removes the local override. Machine overrides are saved in the URL hash.

Production-tree rows use columns for item, rate, recipe, and machine. Each local machine column shows the rounded count as `×N` immediately before its icon and has its own machine selector where alternatives exist. The Machines table also shows machine counts and output throughput in the selected `/s` or `/min` unit. The Production technology tab and its detail banner stay highlighted; the selected technology name and research details appear inside.

## Current calculator limits

The calculator does not yet model productivity/modules, beacons, by-products as reusable production inputs, power consumption, or planet-specific recipe constraints. Space Age source metadata is preserved in the database for future support.
