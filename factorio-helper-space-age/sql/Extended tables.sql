-- Extra Space Age source and icon metadata. The public API still reads the shared core tables.
CREATE TABLE sourceItemData (itemID INTEGER PRIMARY KEY, sourceJSON TEXT NOT NULL, FOREIGN KEY (itemID) REFERENCES items(id));
CREATE TABLE sourceRecipeData (recipeID INTEGER PRIMARY KEY, sourceJSON TEXT NOT NULL, FOREIGN KEY (recipeID) REFERENCES recipes(id));
CREATE TABLE datasetMetadata (name TEXT PRIMARY KEY, jsonValue TEXT NOT NULL);
CREATE TABLE locations (id TEXT PRIMARY KEY, displayName TEXT NOT NULL, iconID TEXT, sourceJSON TEXT NOT NULL);
CREATE TABLE iconAtlasIndex (iconID TEXT PRIMARY KEY, x INTEGER NOT NULL, y INTEGER NOT NULL);
