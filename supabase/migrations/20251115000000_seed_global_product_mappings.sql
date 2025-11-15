-- Seed global product mappings with common Swedish grocery products
-- This provides a base set of product mappings that all users can benefit from

INSERT INTO public.global_product_mappings (original_name, mapped_name, category, usage_count) VALUES
  -- Dairy Products
  ('Arla Mjölk 3%', 'Mjölk', 'dairy', 50),
  ('Arla Mellanmjölk', 'Mjölk', 'dairy', 45),
  ('Arla Lättmjölk', 'Mjölk', 'dairy', 40),
  ('Skånemejerier Mjölk', 'Mjölk', 'dairy', 35),
  ('Arla Filmjölk', 'Filmjölk', 'dairy', 30),
  ('Arla Yoghurt Naturell', 'Yoghurt', 'dairy', 25),
  ('Arla Yoghurt', 'Yoghurt', 'dairy', 25),
  ('Arla Smör', 'Smör', 'dairy', 20),
  ('Bregott', 'Smör', 'dairy', 30),
  ('Bregott Original', 'Smör', 'dairy', 28),
  ('Arla Ost Grevé', 'Ost', 'dairy', 22),
  ('Arla Ost Herrgård', 'Ost', 'dairy', 20),
  ('Kvibille Ost', 'Ost', 'dairy', 18),

  -- Beverages
  ('Coca-Cola 1.5L', 'Coca-Cola', 'beverages', 60),
  ('Coca-Cola 33cl', 'Coca-Cola', 'beverages', 55),
  ('Coca Cola', 'Coca-Cola', 'beverages', 50),
  ('Pepsi 1.5L', 'Pepsi', 'beverages', 40),
  ('Pepsi Max', 'Pepsi', 'beverages', 38),
  ('Fanta', 'Fanta', 'beverages', 35),
  ('Fanta Orange', 'Fanta', 'beverages', 33),
  ('Zoegas Kaffe', 'Kaffe', 'beverages', 42),
  ('Zoegas Skånerost', 'Kaffe', 'beverages', 40),
  ('Gevalia Kaffe', 'Kaffe', 'beverages', 38),
  ('Lipton Te', 'Te', 'beverages', 25),

  -- Bread & Bakery
  ('Skogaholm Bröd', 'Bröd', 'bread_bakery', 45),
  ('Skogaholm Limpa', 'Bröd', 'bread_bakery', 42),
  ('Pågen Bröd', 'Bröd', 'bread_bakery', 40),
  ('Pågen Levain', 'Bröd', 'bread_bakery', 38),
  ('Pågen Frukostbröd', 'Bröd', 'bread_bakery', 35),
  ('Korvbröd', 'Bröd', 'bread_bakery', 28),
  ('Hamburgerbröd', 'Bröd', 'bread_bakery', 26),

  -- Fruits & Vegetables
  ('Bananer', 'Banan', 'fruits_vegetables', 70),
  ('Banan', 'Banan', 'fruits_vegetables', 65),
  ('Äpplen', 'Äpple', 'fruits_vegetables', 60),
  ('Äpple', 'Äpple', 'fruits_vegetables', 58),
  ('Tomater', 'Tomat', 'fruits_vegetables', 55),
  ('Tomat', 'Tomat', 'fruits_vegetables', 52),
  ('Gurka', 'Gurka', 'fruits_vegetables', 48),
  ('Gurkor', 'Gurka', 'fruits_vegetables', 45),
  ('Potatis', 'Potatis', 'fruits_vegetables', 50),
  ('Potatisar', 'Potatis', 'fruits_vegetables', 48),
  ('Morötter', 'Morot', 'fruits_vegetables', 42),
  ('Morot', 'Morot', 'fruits_vegetables', 40),
  ('Lök', 'Lök', 'fruits_vegetables', 38),
  ('Gul Lök', 'Lök', 'fruits_vegetables', 36),

  -- Meat & Fish
  ('Köttfärs', 'Köttfärs', 'meat_fish', 55),
  ('Nötfärs', 'Köttfärs', 'meat_fish', 52),
  ('Blandfärs', 'Köttfärs', 'meat_fish', 50),
  ('Kycklingfilé', 'Kyckling', 'meat_fish', 48),
  ('Kyckling Filé', 'Kyckling', 'meat_fish', 46),
  ('Korv', 'Korv', 'meat_fish', 40),
  ('Falukorv', 'Korv', 'meat_fish', 38),
  ('Prinskorv', 'Korv', 'meat_fish', 35),
  ('Lax', 'Lax', 'meat_fish', 32),
  ('Laxfilé', 'Lax', 'meat_fish', 30),

  -- Frozen Foods
  ('Findus Fiskpinnar', 'Fiskpinnar', 'frozen', 35),
  ('Fiskpinnar', 'Fiskpinnar', 'frozen', 33),
  ('Pommes Frites', 'Pommes', 'frozen', 38),
  ('Pommes', 'Pommes', 'frozen', 36),
  ('Billys Pan Pizza', 'Pizza', 'frozen', 42),
  ('Billys Pizza', 'Pizza', 'frozen', 40),
  ('Dr. Oetker Pizza', 'Pizza', 'frozen', 38),
  ('Glass', 'Glass', 'frozen', 30),
  ('GB Glass', 'Glass', 'frozen', 28),

  -- Pantry
  ('Barilla Pasta', 'Pasta', 'pantry', 45),
  ('Pasta', 'Pasta', 'pantry', 42),
  ('Spaghetti', 'Pasta', 'pantry', 40),
  ('Ris', 'Ris', 'pantry', 38),
  ('Jasminris', 'Ris', 'pantry', 36),
  ('Basmatiris', 'Ris', 'pantry', 34),
  ('Felix Ketchup', 'Ketchup', 'pantry', 40),
  ('Ketchup', 'Ketchup', 'pantry', 38),
  ('Felix Senap', 'Senap', 'pantry', 35),
  ('Senap', 'Senap', 'pantry', 33),
  ('Mjöl', 'Mjöl', 'pantry', 32),
  ('Vetemjöl', 'Mjöl', 'pantry', 30),
  ('Socker', 'Socker', 'pantry', 35),
  ('Strösocker', 'Socker', 'pantry', 33),

  -- Snacks & Candy
  ('OLW Chips', 'Chips', 'snacks_candy', 45),
  ('Estrella Chips', 'Chips', 'snacks_candy', 43),
  ('Chips', 'Chips', 'snacks_candy', 40),
  ('Marabou Mjölkchoklad', 'Choklad', 'snacks_candy', 48),
  ('Marabou', 'Choklad', 'snacks_candy', 45),
  ('Choklad', 'Choklad', 'snacks_candy', 42),
  ('Godis', 'Godis', 'snacks_candy', 38),
  ('Lösgodis', 'Godis', 'snacks_candy', 35),

  -- Household
  ('Toalettpapper', 'Toalettpapper', 'household', 40),
  ('Lambi Toalettpapper', 'Toalettpapper', 'household', 38),
  ('Diskmedel', 'Diskmedel', 'household', 35),
  ('Yes Diskmedel', 'Diskmedel', 'household', 33),
  ('Tvättmedel', 'Tvättmedel', 'household', 32),
  ('Blanketter', 'Blanketter', 'household', 28)
ON CONFLICT DO NOTHING;
