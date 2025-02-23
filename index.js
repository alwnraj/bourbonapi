const express = require('express');
const csv = require('csv-parse/sync');
const fs = require('fs');

const app = express();
app.use(express.json());

try {
  // Read and parse CSV data (error handling added)
  const csvData = fs.readFileSync('bourbonlouisville.csv'); // Make sure this file exists!
  const records = csv.parse(csvData, {
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    columns: [
      'Bourbon', 'Cereal', 'Roasted', 'Yeasty', 'Feinty', 'Peaty', 'Charred Oak',
      'Nutty', 'Woody', 'Spicy', 'Winey', 'Citrus', 'Tropical Fruits', 'Pome Fruits',
      'Stone Fruits', 'Red Berries', 'Dried Fruits', 'Floral', 'Grassy',
      'empty1', 'empty2', 'empty3', 'BourbonName', 'Distillerie', 'empty4',
      'Distillery', 'Adress', 'Amenitie1', 'Amenitie2', 'Amenitie3', 'Amenitie4',
      'Amenitie5', 'ExtraInfo', 'WebsiteLink', 'LogoPNG', 'LogoPNG2'
    ]
  });


  const bourbons = records.map((row, index) => {
    const hasMilitaryDiscount = (row.ExtraInfo || '').toLowerCase().includes('military discount');

    const tagColumns = [
      'Cereal', 'Roasted', 'Yeasty', 'Feinty', 'Peaty', 'Charred Oak',
      'Nutty', 'Woody', 'Spicy', 'Winey', 'Citrus', 'Tropical Fruits',
      'Pome Fruits', 'Stone Fruits', 'Red Berries', 'Dried Fruits',
      'Floral', 'Grassy'
    ];

    const tags = tagColumns.filter(tag => Number(row[tag]) >= 3);

    return {
      id: index + 1,
      distillery: {
        name: (row.Distillery || '').trim(),
        address: (row.Adress || '').replace(/\n/g, ', ').trim(),
        website: (row.WebsiteLink || '').trim(),
        amenities: [row.Amenitie1, row.Amenitie2, row.Amenitie3, row.Amenitie4, row.Amenitie5].filter(a => a && a.trim() !== ''),
        militaryDiscount: hasMilitaryDiscount
      },
      tags: tags
    };
  });


  app.post('/recommend', (req, res) => {
    try {
      const { bourbonIds } = req.body;

      if (!Array.isArray(bourbonIds)) {
        return res.status(400).json({ error: 'Array of bourbon IDs required' });
      }

      const selectedTags = [...new Set(bourbons.filter(b => bourbonIds.includes(b.id)).flatMap(b => b.tags))];

      const distilleryMap = new Map();

      bourbons.forEach(b => {
        const key = b.distillery.name;
        if (!distilleryMap.has(key)) {
          const matches = b.tags.filter(t => selectedTags.includes(t)).length;
          distilleryMap.set(key, { ...b.distillery, matchScore: matches });
        }
      });

      const recommendations = [...distilleryMap.values()]
        .filter(d => d.matchScore > 0)
        .sort((a, b) => b.matchScore - a.matchScore)
        .map(d => ({
          name: d.name,
          address: d.address,
          amenities: d.amenities,
          website: d.website,
          militaryDiscount: d.militaryDiscount
        }));

      res.json(recommendations);

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

} catch (error) {
  console.error("Error loading or parsing CSV:", error);
  process.exit(1); // Exit the process if CSV loading/parsing fails.
}



// Start server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});