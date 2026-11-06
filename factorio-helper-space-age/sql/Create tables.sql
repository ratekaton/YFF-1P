PRAGMA foreign_keys = ON;

CREATE TABLE types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
);

CREATE TABLE items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,          -- slug, e.g. 'iron-plate' (matches icon file name)
    displayName TEXT NOT NULL,          -- e.g. 'Iron plate'
    typeID INTEGER NOT NULL,
    category TEXT NOT NULL,             -- inventory tab: logistics, production, ... or 'technology'
    row INTEGER NOT NULL DEFAULT 0,     -- subgroup (line) inside the tab, like in the Factorio inventory
    iconPath TEXT NOT NULL,
    iconText TEXT,                      -- small label on the icon (e.g. technology level '2')
    effects TEXT,                       -- technologies only: JSON with extra bonuses (mining productivity, ...)

    CONSTRAINT fk_items_to_types FOREIGN KEY (typeID) REFERENCES types(id)
);

-- Machines (assemblers, furnaces, ...). Each one is also an item.
CREATE TABLE producers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    itemID INTEGER NOT NULL,
    producingSpeedMultiplier REAL NOT NULL,

    CONSTRAINT fk_producers_to_items FOREIGN KEY (itemID) REFERENCES items(id)
);

CREATE TABLE recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,          -- slug
    displayName TEXT NOT NULL,
    craftingTime REAL NOT NULL,         -- seconds at speed 1
    iconPath TEXT NOT NULL
);

-- Which machines can craft which recipe (many-to-many).
CREATE TABLE recipeProducers (
    recipeID INTEGER NOT NULL,
    producerID INTEGER NOT NULL,

    PRIMARY KEY (recipeID, producerID),
    CONSTRAINT fk_rp_to_recipes FOREIGN KEY (recipeID) REFERENCES recipes(id),
    CONSTRAINT fk_rp_to_producers FOREIGN KEY (producerID) REFERENCES producers(id)
);

-- A recipe has many inputs and many outputs, so one row per item.
CREATE TABLE recipeInput (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipeID INTEGER NOT NULL,
    itemID INTEGER NOT NULL,
    quantity REAL NOT NULL,

    CONSTRAINT fk_recipeInput_to_recipes FOREIGN KEY (recipeID) REFERENCES recipes(id),
    CONSTRAINT fk_recipeInput_to_items FOREIGN KEY (itemID) REFERENCES items(id)
);

CREATE TABLE recipeOutput (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipeID INTEGER NOT NULL,
    itemID INTEGER NOT NULL,
    quantity REAL NOT NULL,

    CONSTRAINT fk_recipeOutput_to_recipes FOREIGN KEY (recipeID) REFERENCES recipes(id),
    CONSTRAINT fk_recipeOutput_to_items FOREIGN KEY (itemID) REFERENCES items(id)
);

-- Technologies are items with category 'technology'.
-- technologyID -> the technology that must be researched first.
CREATE TABLE techPrerequisites (
    technologyID INTEGER NOT NULL,
    prerequisiteID INTEGER NOT NULL,

    PRIMARY KEY (technologyID, prerequisiteID),
    CONSTRAINT fk_tp_to_items1 FOREIGN KEY (technologyID) REFERENCES items(id),
    CONSTRAINT fk_tp_to_items2 FOREIGN KEY (prerequisiteID) REFERENCES items(id)
);

-- Which recipes a technology unlocks.
CREATE TABLE techUnlocks (
    technologyID INTEGER NOT NULL,
    recipeID INTEGER NOT NULL,

    PRIMARY KEY (technologyID, recipeID),
    CONSTRAINT fk_tu_to_items FOREIGN KEY (technologyID) REFERENCES items(id),
    CONSTRAINT fk_tu_to_recipes FOREIGN KEY (recipeID) REFERENCES recipes(id)
);
