const express = require('express');
const csv = require('csv-parse/sync');
const fs = require('fs');

const app = express();
app.use(express.json());

let records; // Define records in global scope

try {
  // Read and parse CSV data
  const csvData = fs.readFileSync('bourbonlouisville.csv');
  records = csv.parse(csvData, {
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

} catch (error) {
  console.error("Error loading or parsing CSV:", error);
  process.exit(1);
}

// Define routes outside of the try-catch block
app.post('/recommend', (req, res) => {
  try {
    console.log('Recommend endpoint hit with body:', req.body);
    const { bourbonIds } = req.body;

    if (!Array.isArray(bourbonIds)) {
      console.log('Invalid input: bourbonIds is not an array');
      return res.status(400).json({ error: 'Array of bourbon IDs required' });
    }

    console.log('Processing bourbon IDs:', bourbonIds);
    // Get the selected bourbons and explicitly skip row 1 (header)
    const selectedBourbons = records
      .filter((b, index) => bourbonIds.includes(index + 1) && index > 0) // Skip first row and match IDs
      .filter(b => b.Bourbon && b.Bourbon.trim() !== ''); // Additional check for valid bourbon entries

    // Define flavor profile columns
    const flavorColumns = [
      'Cereal', 'Roasted', 'Yeasty', 'Feinty', 'Peaty', 'Charred Oak',
      'Nutty', 'Woody', 'Spicy', 'Winey', 'Citrus', 'Tropical Fruits',
      'Pome Fruits', 'Stone Fruits', 'Red Berries', 'Dried Fruits',
      'Floral', 'Grassy'
    ];

    // Log selected bourbons and their flavor profiles
    console.log('\n=== Selected Bourbons ===');
    selectedBourbons.forEach(bourbon => {
      const flavorProfile = {};
      flavorColumns.forEach(flavor => {
        flavorProfile[flavor] = Number(bourbon[flavor] || 0);
      });
      console.log(`\nBourbon: ${bourbon.Bourbon}`);
      console.log('Flavor Profile:', JSON.stringify(flavorProfile, null, 2));
    });

    // Calculate and log average flavor profile
    const averageProfile = {};
    flavorColumns.forEach(flavor => {
      const validValues = selectedBourbons
        .map(bourbon => Number(bourbon[flavor] || 0))
        .filter(val => !isNaN(val));
        
      averageProfile[flavor] = validValues.length > 0 
        ? validValues.reduce((acc, val) => acc + val, 0) / validValues.length 
        : 0;
    });

    console.log('\n=== Average Flavor Profile ===');
    console.log(JSON.stringify(averageProfile, null, 2));

    // Calculate similarity scores for all distilleries
    const distilleryScores = new Map();

    records.forEach((bourbon, index) => {
      if (bourbonIds.includes(index + 1)) return;

      const distilleryName = bourbon.Distillery?.trim();
      if (!distilleryName || distilleryScores.has(distilleryName)) return;

      let similarityScore = 0;
      let validComparisons = 0;
      const flavorProfile = {};
      
      flavorColumns.forEach(flavor => {
        const bourbonValue = Number(bourbon[flavor] || 0);
        flavorProfile[flavor] = bourbonValue;
        if (!isNaN(bourbonValue) && !isNaN(averageProfile[flavor])) {
          const diff = bourbonValue - averageProfile[flavor];
          similarityScore += diff * diff;
          validComparisons++;
        }
      });

      similarityScore = validComparisons > 0 
        ? 1 / (1 + Math.sqrt(similarityScore / validComparisons))
        : 0;

      distilleryScores.set(distilleryName, {
        name: distilleryName,
        bourbon: bourbon.Bourbon,
        address: bourbon.Adress?.replace(/\n/g, ', ').trim(),
        website: bourbon.WebsiteLink?.trim(),
        amenities: [
          bourbon.Amenitie1,
          bourbon.Amenitie2,
          bourbon.Amenitie3,
          bourbon.Amenitie4,
          bourbon.Amenitie5
        ].filter(a => a && a.trim() !== ''),
        militaryDiscount: (bourbon.ExtraInfo || '').toLowerCase().includes('military discount'),
        similarityScore,
        flavorProfile
      });
    });

    // Get and log top 4 recommendations
    const recommendations = [...distilleryScores.values()]
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, 4);

    console.log('\n=== Recommended Distilleries ===');
    recommendations.forEach(rec => {
      console.log(`\nDistillery: ${rec.name}`);
      console.log(`Bourbon: ${rec.bourbon}`);
      console.log('Similarity Score:', rec.similarityScore.toFixed(4));
      console.log('Flavor Profile:', JSON.stringify(rec.flavorProfile, null, 2));
    });

    res.json(recommendations);

  } catch (error) {
    console.error('Error in recommend endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});